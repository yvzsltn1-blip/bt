'use strict';

// Kat hatirlatma bildirimleri.
//
// otobirlik.user.js, bir bant-basi kati (1/11/21/31) bitirince Firestore'daki
// `floorReminders` koleksiyonuna `dueAt` (epoch ms) iceren bir dokuman yazar.
// Asagidaki zamanlanmis fonksiyon dakikada bir bu koleksiyonu tarar; vakti gelen
// hatirlatmalari Telegram'a yollar ve `sent: true` olarak isaretler. Boylece
// telefon kilitliyken / tarayici kapaliyken bile bildirim gelir (timer'i tutan
// senin cihazin degil, Google'in sunucusu).
//
// Gizli degerler (bot token + chat id) istemciye gomulmez; Firebase secret'ta tutulur:
//   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
//   firebase functions:secrets:set TELEGRAM_CHAT_ID

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

initializeApp();
const db = getFirestore();

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');

// Oyun host'undan sunucu etiketini cikarir (ornek: "s65.bitefight.gameforge.com"
// -> "s65"). Taninmazsa bos string doner; bu durumda mesaja onek eklenmez.
function serverLabel(host) {
  // Ilk etiketteki sunucu numarasini al: "s66-tr.bitefight..." -> "s66".
  const first = String(host || '').split('.')[0].trim();
  const match = first.match(/^s\d+/i);
  return match ? match[0].toLowerCase() : '';
}

// Mesajin basina sunucu etiketini ekler: "s65 | <mesaj>".
function withServerPrefix(host, text) {
  const label = serverLabel(host);
  return label ? `${label} | ${text}` : text;
}

async function sendTelegramMessage(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_notification: false })
  });
  if (!response.ok) {
    throw new Error(`Telegram ${response.status}: ${await response.text()}`);
  }
}

// Kat tamamlanma bildirimi (anlik). Script bant-basi bir kati bitirince
// floorReminders/floorrem_<kat> dokumanini taze createdAt ile yazar; bu tetik
// o anda calisip "tamamlandi" mesajini yollar.
//
// Onemli: zamanlanmis fonksiyon ayni dokumani sent:true yapinca da tetiklenir.
// O guncellemede createdAt degismedigi (ve sent:true oldugu) icin atlariz; boylece
// yalnizca script'in taze yazimi (gercek tamamlanma) bildirilir.
exports.onFloorCompleted = onDocumentWritten(
  {
    document: 'floorReminders/{docId}',
    region: 'europe-west1',
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]
  },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) {
      return; // silinme
    }
    const data = after.data();
    if (data.sent === true) {
      return; // fonksiyonun sent:true guncellemesi -> tamamlanma degil
    }
    const before = event.data && event.data.before;
    if (before && before.exists && before.data().createdAt === data.createdAt) {
      return; // ayni kayit uzerinde createdAt degismemis -> taze tamamlanma degil
    }

    const token = TELEGRAM_BOT_TOKEN.value();
    const chatId = TELEGRAM_CHAT_ID.value();
    if (!token || !chatId) {
      logger.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secret tanimli degil.');
      return;
    }

    const floor = data.floor;
    const bandLabel = data.bandLabel || '';
    let dueText = '';
    if (data.dueAt) {
      dueText = new Date(Number(data.dueAt)).toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Istanbul'
      });
    }
    const text = withServerPrefix(data.host, `✅ ${floor}. kat tamamlandi${bandLabel ? ` (${bandLabel} bandi)` : ''}.${dueText ? ` Yenilenme saati: ${dueText}` : ''}`);
    try {
      await sendTelegramMessage(token, chatId, text);
      logger.info(`Tamamlanma bildirimi gonderildi: kat ${floor}`);
    } catch (error) {
      logger.error(`Kat ${floor} tamamlanma bildirimi gonderilemedi`, error);
    }
  }
);

exports.sendFloorReminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Europe/Istanbul',
    region: 'europe-west1',
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]
  },
  async () => {
    const now = Date.now();

    // Tek esitlik filtresi -> bilesik indeks gerekmez. Koleksiyon kucuk oldugundan
    // dueAt karsilastirmasi istemcide (fonksiyonda) yapilir.
    const snap = await db.collection('floorReminders').where('sent', '==', false).get();
    if (snap.empty) {
      return;
    }

    const due = snap.docs.filter((doc) => Number(doc.get('dueAt') || 0) <= now);
    if (!due.length) {
      return;
    }

    const token = TELEGRAM_BOT_TOKEN.value();
    const chatId = TELEGRAM_CHAT_ID.value();
    if (!token || !chatId) {
      logger.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secret tanimli degil.');
      return;
    }

    for (const doc of due) {
      const floor = doc.get('floor');
      const bandLabel = doc.get('bandLabel') || '';
      const text = withServerPrefix(doc.get('host'), `🔔 ${floor}. kat suresi doldu${bandLabel ? ` — ${bandLabel} bandi yenilendi` : ''}. Artik tekrar girilebilir.`);
      try {
        await sendTelegramMessage(token, chatId, text);
        await doc.ref.update({ sent: true, sentAt: new Date().toISOString() });
        logger.info(`Hatirlatma gonderildi: kat ${floor}`);
      } catch (error) {
        // Gonderilemezse sent:false kalir; sonraki dakikada tekrar denenir.
        logger.error(`Kat ${floor} hatirlatmasi gonderilemedi`, error);
      }
    }
  }
);
