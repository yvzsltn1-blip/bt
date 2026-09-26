// ==UserScript==
// @name         Oto Birlik Doldurucu v3
// @namespace    https://bt-analiz.web.app
// @version      9.5
// @description  Birlik Doldurucu'nun oto-kat surumu: secilen araliktaki katlari sirayla tarar, girilebilenleri tamamlar ve tur sonunda ayarlanan sure kadar bekler
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
// @updateURL    https://bt-analiz.web.app/otobirlik.user.js
// @downloadURL  https://bt-analiz.web.app/otobirlik.user.js
// @require      https://bt-analiz.web.app/battle-core.js?v=20260927-1
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      bt-analiz.web.app
// ==/UserScript==
// NOT: Savas motoru @require ile kurulumda gomulur. Motor (battle-core.js) guncellenirse
// bu scriptin surumunu artir ki Tampermonkey @require kopyasini yenilesin.

(function () {
  'use strict';

  const FIREBASE_API_KEY = 'AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4';
  const FIRESTORE_ARCHIVE_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/overviewArchives';
  const FIRESTORE_ARCHIVE_HOSTS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/archiveHosts';
  const FIRESTORE_REMINDERS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/floorReminders';
  // Kat hatirlatmalari: bu katlar bitince ilgili bant suresi kadar sonra Telegram
  // bildirimi planlanir (timer'i sunucu tutar -> telefon kilitliyken de gelir).
  const REMINDER_ENABLED_KEY = 'btReminderEnabled';
  const FLOOR_REMINDERS = [
    { floor: 1, bandLabel: '1-10', intervalSec: 60 * 60 },    // 1 saat
    { floor: 11, bandLabel: '11-20', intervalSec: 90 * 60 },  // 1.5 saat
    { floor: 21, bandLabel: '21-30', intervalSec: 120 * 60 }, // 2 saat
    { floor: 31, bandLabel: '31-40', intervalSec: 150 * 60 }  // 2.5 saat
  ];
  const LAST_ARCHIVE_ID_KEY = 'btLastArchiveId';
  const REGISTERED_HOST_KEY = 'btArchiveRegisteredHost';
  const LAST_ARCHIVE_PAYLOAD_KEY = 'btLastArchivePayload';
  const LAST_LOOT_SYNC_KEY = 'btLastLootSyncSignature';
  // Bu savasta hayata dondurme icin harcanan cehennem tasi sayisi (arsiv sutunu).
  // '' = bilinmiyor (manuel) -> arsiv "-"; '0' = harcanmadi; sayi = harcanan.
  const LAST_REVIVE_STONES_KEY = 'btLastReviveStones';
  const ALLY_TIER_LABELS = {
    'dehset kurdu': 'T1',
    'yikici': 'T2',
    'gece avcisi': 'T3',
    'fantom dehseti': 'T4',
    'kurt saman': 'T5',
    'mezar pencesi': 'T6',
    'kanli ay kahini': 'T7',
    'cehennem ucurumu': 'T8',
    // Oyunda kullanilan guncel birim adlari (battle-core ALLY_UNITS ile ayni).
    'yarasa surusu': 'T1',
    'gulyabani': 'T2',
    'vampir kolu': 'T3',
    'banshee': 'T4',
    'olu cagirici': 'T5',
    'gargoyle': 'T6',
    'kan cadisi': 'T7',
    'curuk girtlak': 'T8'
  };
  const ENEMY_SLOT_LABELS = {
    1: 'R1',
    2: 'R2',
    3: 'R3',
    4: 'R4',
    5: 'R5',
    6: 'R6',
    7: 'R7',
    8: 'R8',
    9: 'R9',
    10: 'R10'
  };

  if (location.hostname === 'bt-analiz.web.app') {
    const observer = new MutationObserver(() => {
      const popup = document.querySelector('#quickResultPopup');
      if (!popup || !popup.classList.contains('is-visible')) return;

      const units = {};
      popup.querySelectorAll('.quick-popup-unit-item').forEach((item) => {
        const nameEl = item.querySelector('.quick-popup-unit-name');
        const countEl = item.querySelector('.quick-popup-unit-count');
        if (!nameEl || !countEl) return;
        const match = nameEl.textContent.match(/T(\d+)/);
        const count = parseInt(countEl.textContent.split('/')[0].trim(), 10);
        if (match && !Number.isNaN(count) && count > 0) {
          units[match[1]] = count;
        }
      });

      if (Object.keys(units).length === 0) return;

      GM_setValue('btUnits', JSON.stringify(units));

      const btn = document.querySelector('#mobilSaveBtn');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Bitefight icin kaydedildi!';
        btn.style.background = '#1a6b2a';
        setTimeout(() => {
          btn.textContent = prev;
          btn.style.background = '';
        }, 2500);
      }
    });

    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    return;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeTurkishText(value) {
    return cleanText(value)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');
  }

  function parseDigits(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (!digits) return 0;
    return Number.parseInt(digits, 10) || 0;
  }

  function hasRecordedOutcome(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    if (Number(payload.lootGoldValue || 0) > 0 || Number(payload.expValue || 0) > 0) {
      return true;
    }
    const lootGoldText = cleanText(payload.lootGoldText || '');
    const expText = cleanText(payload.expText || '');
    const fallenUnitsText = cleanText(payload.fallenUnitsText || '');
    return (
      (lootGoldText && lootGoldText !== '-') ||
      (expText && expText !== '-') ||
      (fallenUnitsText && fallenUnitsText !== '-' && fallenUnitsText !== 'Olenler : 0')
    );
  }

  function clearPendingArchiveSync() {
    GM_setValue(LAST_ARCHIVE_ID_KEY, '');
    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    GM_setValue(LAST_LOOT_SYNC_KEY, '');
    GM_setValue(LAST_REVIVE_STONES_KEY, '');
  }

  function getReviveStoneCostFromElement(root) {
    if (!root) {
      return 0;
    }
    const value = Math.abs(parseQtyValue(root.querySelector('span')?.textContent) || 0);
    return value > 0 ? value : 0;
  }

  function getReviveStoneCostFromDom() {
    return getReviveStoneCostFromElement(document.querySelector('#showReviveBtn'))
      || getReviveStoneCostFromElement(document.querySelector('#reviveBtn'));
  }

  function hasReviveSuccessMessage() {
    return !!document.querySelector('#revivedResult .success-message, #revivedResult .revived-banner');
  }

  function readReviveStoneText() {
    const raw = GM_getValue(LAST_REVIVE_STONES_KEY, '');
    const domCost = getReviveStoneCostFromDom();
    if ((raw === '' || raw === null || raw === undefined) && hasReviveSuccessMessage() && domCost > 0) {
      GM_setValue(LAST_REVIVE_STONES_KEY, String(domCost));
      return String(domCost);
    }
    if (String(raw) === '0' && hasReviveSuccessMessage() && domCost > 0) {
      GM_setValue(LAST_REVIVE_STONES_KEY, String(domCost));
      return String(domCost);
    }
    return raw === '' || raw === null || raw === undefined ? '-' : String(raw);
  }

  function savePendingArchivePayload(payload) {
    GM_setValue(LAST_ARCHIVE_ID_KEY, '');
    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify(payload));
    GM_setValue(LAST_LOOT_SYNC_KEY, '');
  }

  function getArmyPowerText() {
    const el = document.querySelector('h2.armyPower');
    if (!el) return '';
    const text = cleanText(el.textContent);
    const match = text.match(/(\d+\s*\/\s*\d+)/);
    return match ? match[1].replace(/\s+/g, '') : '';
  }

  function getLevelText() {
    const goldEl = document.querySelector('div.gold');
    if (!goldEl) return '';
    const levelIcon = goldEl.querySelector('img[alt="Seviye"]');
    if (!levelIcon) return '';
    let node = levelIcon.nextSibling;
    while (node) {
      const text = cleanText(node.textContent);
      const match = text.match(/\d+/);
      if (match) {
        return match[0];
      }
      node = node.nextSibling;
    }
    return '';
  }

  function getLootGoldText() {
    const el = document.querySelector('.lootItems.lootGold p');
    return el ? cleanText(el.textContent) : '';
  }

  function getLootExpText() {
    const el = document.querySelector('.lootItems.lootEXP p');
    return el ? cleanText(el.textContent) : '';
  }

  function collapseRepeatedEntries(items) {
    if (!Array.isArray(items) || items.length < 2) {
      return items;
    }
    for (let chunkSize = 1; chunkSize <= Math.floor(items.length / 2); chunkSize += 1) {
      if (items.length % chunkSize !== 0) {
        continue;
      }
      const firstChunk = items.slice(0, chunkSize);
      let repeated = true;
      for (let index = chunkSize; index < items.length; index += chunkSize) {
        const chunk = items.slice(index, index + chunkSize);
        if (chunk.length !== firstChunk.length || chunk.some((entry, entryIndex) => entry !== firstChunk[entryIndex])) {
          repeated = false;
          break;
        }
      }
      if (repeated) {
        return firstChunk;
      }
    }
    return items;
  }

  function getFallenUnitsText() {
    // Sonuc sayfasinda olen birimler iki yerde listelenir: ana "Olen birimler"
    // bolumu ve hayata dondurme popup'i (.revivePopUp). Popup'taki adetler
    // farkli olabildiginden (or. diriltilebilir sayi) yalnizca ana liste okunur;
    // aksi halde olenler mukerrer yazilir.
    const items = collapseRepeatedEntries(
      [...document.querySelectorAll('.allFallenUnits .fallenUnit')]
      .filter((item) => !item.closest('.revivePopUp'))
      .map((item) => {
        const name = cleanText(item.querySelector('.fallenUnitName')?.textContent || '');
        const qty = parseQtyValue(item.querySelector('.fallenUnitQty')?.textContent || '');
        if (!name || qty === null) {
          return null;
        }
        const tier = ALLY_TIER_LABELS[normalizeTurkishText(name)];
        const displayName = tier ? `${name}(${tier})` : name;
        return `${displayName} x${qty}`;
      })
      .filter(Boolean)
    );
    return items.length ? `Olenler : [${items.join(', ')}]` : 'Olenler : 0';
  }

  function parseQtyValue(value) {
    const match = cleanText(value).match(/-?\d+/);
    return match ? Number.parseInt(match[0], 10) : null;
  }

  function buildRosterText(label, counts, formatter) {
    if (!Array.isArray(counts) || !counts.length) {
      return '-';
    }
    const entries = typeof formatter === 'function'
      ? counts.map((count, index) => formatter(count, index)).filter(Boolean)
      : counts.filter((count) => count !== null && count !== undefined).map((count) => String(count));
    return entries.length ? `${label} : [${entries.join('-')}]` : '-';
  }

  function getEnemyRosterText() {
    const entries = [...document.querySelectorAll('.enemySlot')]
      .map((slot, index) => {
        const styleText = slot.getAttribute('style') || '';
        const match = styleText.match(/enemyUnit_(\d+)\.jpg/i);
        const qtyEl = slot.querySelector('.qtyValue');
        const qty = parseQtyValue(qtyEl ? qtyEl.textContent : '');
        if (!match || qty === null) {
          return null;
        }
        return {
          order: Number.parseInt(match[1], 10),
          qty,
          index
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.order === right.order) {
          return left.index - right.index;
        }
        return left.order - right.order;
      });

    return buildRosterText('Rakip', entries, (entry) => {
      const tier = ENEMY_SLOT_LABELS[entry.order] || `R${entry.order}`;
      return `${tier}:${entry.qty}`;
    });
  }

  function getOpenAllyTiers() {
    return [...new Set(
      [...document.querySelectorAll('.stepBtn[data-id]')]
        .map((button) => Number.parseInt(button.getAttribute('data-id') || '', 10))
        .filter((tier) => Number.isInteger(tier) && tier > 0)
    )].sort((left, right) => left - right);
  }

  function findAllyCardRoot(tier) {
    const button = document.querySelector(`.stepBtn[data-id="${tier}"]`);
    let node = button;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (node.querySelector('.qtyValue')) {
        return node;
      }
      node = node.parentElement;
    }
    return button ? button.parentElement : null;
  }

  function getAllyRosterText(targets, preferTargets) {
    const tiers = getOpenAllyTiers();
    if (!tiers.length) {
      return '-';
    }

    const counts = tiers.map((tier) => {
      const explicitCount = targets && Object.prototype.hasOwnProperty.call(targets, tier)
        ? Number.parseInt(targets[tier], 10)
        : null;
      if (preferTargets && Number.isInteger(explicitCount)) {
        return explicitCount;
      }

      const root = findAllyCardRoot(tier);
      const qtyEl = root ? root.querySelector('.qtyValue') : null;
      const qty = parseQtyValue(qtyEl ? qtyEl.textContent : '');
      if (qty !== null) {
        return qty;
      }
      return Number.isInteger(explicitCount) ? explicitCount : 0;
    });

    return buildRosterText('Biz', counts, (count, index) => `T${index + 1}:${count}`);
  }

  function getOverviewPayload(sourceType, options = {}) {
    const nowIso = new Date().toISOString();
    const enemyRosterText = getEnemyRosterText();
    const allyRosterText = getAllyRosterText(options.targets, Boolean(options.preferTargets));
    return {
      savedAt: nowIso,
      updatedAt: nowIso,
      lootGoldText: '-',
      lootGoldValue: 0,
      expText: '-',
      expValue: 0,
      armyPowerText: getArmyPowerText() || '-',
      levelText: getLevelText() || '-',
      enemyRosterText,
      allyRosterText,
      fallenUnitsText: 'Olenler : 0',
      reviveStoneText: '-',
      sourceType: sourceType === 'fill' ? 'fill' : 'manual',
      host: location.host,
      pageUrl: location.href,
      pageTitle: document.title || ''
    };
  }

  function toFirestoreFieldMap(payload) {
    return {
      savedAt: { stringValue: payload.savedAt },
      updatedAt: { stringValue: payload.updatedAt },
      lootGoldText: { stringValue: payload.lootGoldText },
      lootGoldValue: { integerValue: String(payload.lootGoldValue) },
      expText: { stringValue: payload.expText },
      expValue: { integerValue: String(payload.expValue) },
      armyPowerText: { stringValue: payload.armyPowerText },
      levelText: { stringValue: payload.levelText },
      enemyRosterText: { stringValue: payload.enemyRosterText || '-' },
      allyRosterText: { stringValue: payload.allyRosterText || '-' },
      fallenUnitsText: { stringValue: payload.fallenUnitsText || 'Olenler : 0' },
      reviveStoneText: { stringValue: payload.reviveStoneText || '-' },
      sourceType: { stringValue: payload.sourceType },
      host: { stringValue: payload.host },
      pageUrl: { stringValue: payload.pageUrl },
      pageTitle: { stringValue: payload.pageTitle }
    };
  }

  // Host'u archiveHosts meta koleksiyonuna upsert eder; arsiv sayfasindaki sunucu
  // dropdown'u bu listeden beslenir. Ayni host icin tekrar yazmamak adina GM'de tutulur.
  async function registerArchiveHost(host) {
    const normalized = String(host || '').trim();
    if (!normalized || GM_getValue(REGISTERED_HOST_KEY, '') === normalized) {
      return;
    }
    try {
      const response = await fetch(`${FIRESTORE_ARCHIVE_HOSTS_URL}/${encodeURIComponent(normalized)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            host: { stringValue: normalized },
            updatedAt: { stringValue: new Date().toISOString() }
          }
        })
      });
      if (response.ok) {
        GM_setValue(REGISTERED_HOST_KEY, normalized);
      }
    } catch {
      // best-effort; arsiv kaydini engellemesin
    }
  }

  async function postArchiveRecord(payload, docId = '') {
    const finalDocId = docId || `overview_${Date.now()}_${Math.random().toString(36).slice(2, 9) || '0'}`;
    const response = await fetch(`${FIRESTORE_ARCHIVE_URL}?documentId=${encodeURIComponent(finalDocId)}&key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: toFirestoreFieldMap(payload)
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Kayit basarisiz: ${response.status} ${response.statusText} ${message}`);
    }

    void registerArchiveHost(payload.host);
    return finalDocId;
  }

  async function createArchiveRecord(sourceType, options = {}) {
    const payload = getOverviewPayload(sourceType, options);
    if (sourceType === 'fill' && !hasRecordedOutcome(payload)) {
      savePendingArchivePayload(payload);
      return { docId: '', payload, queued: true };
    }

    const docId = await postArchiveRecord(payload);

    if (hasRecordedOutcome(payload)) {
      clearPendingArchiveSync();
    } else {
      GM_setValue(LAST_ARCHIVE_ID_KEY, docId);
      GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify(payload));
      GM_setValue(LAST_LOOT_SYNC_KEY, '');
    }
    return { docId, payload };
  }

  function syncPendingArchiveRosterBeforeFight() {
    const rawPayload = GM_getValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    let payload = null;
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = null;
      }
    }

    if (!payload || hasRecordedOutcome(payload)) {
      GM_setValue(LAST_REVIVE_STONES_KEY, '');
      savePendingArchivePayload(getOverviewPayload('manual'));
      return;
    }

    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify({
      ...payload,
      updatedAt: new Date().toISOString(),
      allyRosterText: getAllyRosterText(null, false),
      armyPowerText: getArmyPowerText() || payload.armyPowerText || '-'
    }));
  }

  function watchFightSubmission() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#fightBtn')) {
        syncPendingArchiveRosterBeforeFight();
      }
    }, true);
  }

  // Sonuc sayfasinda hem watchLootPage gozlemcisi hem de runBotTick (handleResultPage/
  // handleAutoResultPage) bu fonksiyonu cagirir ve sayfa kademeli yuklendiginden ayni
  // anda birden cok kez tetiklenebilir. Mukerrer kaydi onleyen imza ancak POST bittikten
  // sonra yazildigi icin, kilit olmadan es zamanli cagrilarin hepsi ayri doküman olusturup
  // arsive ayni saniyeli 2-4 mukerrer kayit dusururdu. Bu kilit es zamanli cagrilari tek
  // calisan isleme baglar; islem bitince imza/temizlik yazildigindan sonraki cagrilar erken cikar.
  let lootSyncInFlight = null;

  function syncLootResultToLastArchive() {
    if (lootSyncInFlight) {
      return lootSyncInFlight;
    }
    lootSyncInFlight = (async () => {
      try {
        return await runLootResultSync();
      } finally {
        lootSyncInFlight = null;
      }
    })();
    return lootSyncInFlight;
  }

  async function runLootResultSync() {
    const lootGoldText = getLootGoldText();
    const expText = getLootExpText();
    const fallenUnitsText = getFallenUnitsText();
    if (!lootGoldText && !expText && fallenUnitsText === 'Olenler : 0') {
      return false;
    }

    const rawPayload = GM_getValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    if (!rawPayload) {
      return false;
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return false;
    }
    if (hasRecordedOutcome(payload)) {
      clearPendingArchiveSync();
      return false;
    }

    // Bot aktifken, diriltme acikken ve henuz diriltilmemis olen birim varsa,
    // harcanan cehennem tasi sayisi netlesene kadar (diriltme butonu kaybolana
    // kadar) kaydi beklet. Diriltme kapaliyken buton kalici oldugundan beklenmez.
    if (isBotEnabled() && isReviveEnabled() && document.querySelector('#showReviveBtn')) {
      return false;
    }

    const reviveStoneText = readReviveStoneText();
    const pendingDocId = GM_getValue(LAST_ARCHIVE_ID_KEY, '');
    const syncSignature = `${pendingDocId || 'queued'}|${location.pathname}|${lootGoldText}|${expText}|${fallenUnitsText}|${reviveStoneText}`;
    if (GM_getValue(LAST_LOOT_SYNC_KEY, '') === syncSignature) {
      return true;
    }

    const nextPayload = {
      ...payload,
      updatedAt: new Date().toISOString(),
      lootGoldText: lootGoldText || payload.lootGoldText || '-',
      lootGoldValue: lootGoldText ? parseDigits(lootGoldText) : (payload.lootGoldValue || 0),
      expText: expText || payload.expText || '-',
      expValue: expText ? parseDigits(expText) : (payload.expValue || 0),
      fallenUnitsText,
      reviveStoneText,
      host: location.host,
      pageUrl: location.href,
      pageTitle: document.title || payload.pageTitle || ''
    };

    if (pendingDocId) {
      const response = await fetch(`${FIRESTORE_ARCHIVE_URL}/${encodeURIComponent(pendingDocId)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: toFirestoreFieldMap(nextPayload)
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Ganimet kaydi guncellenemedi: ${response.status} ${response.statusText} ${message}`);
      }
    } else {
      await postArchiveRecord(nextPayload);
    }

    GM_setValue(LAST_LOOT_SYNC_KEY, syncSignature);
    clearPendingArchiveSync();
    return true;
  }

  async function fillUnits(targets) {
    for (const tier in targets) {
      const count = targets[tier];
      const plus10 = document.querySelector(`.stepBtn.btnPlus10[data-id="${tier}"]`);
      const plus1 = document.querySelector(`.stepBtn.btnPlus1[data-id="${tier}"]`);
      if (!plus10 || !plus1) continue;

      const plus10Clicks = Math.floor(count / 10);
      const plus1Clicks = count % 10;

      for (let i = 0; i < plus10Clicks; i += 1) {
        plus10.click();
        await timedSleep('fill');
      }

      for (let j = 0; j < plus1Clicks; j += 1) {
        plus1.click();
        await timedSleep('fill');
      }

      await timedSleep('fill');
    }
  }

  // ====================== KAT BOTU ======================
  // Akis: kat sayfasinda GIR -> savas sayfasinda rakibi oku, BattleCore ile lokalde
  // quick.html varsayilanlariyla cozum ara, doldur, BASLA -> sonuc sayfasinda hayata
  // dondur + ILERI -> kat sayfasinda bir sonraki kati sec -> tekrar GIR.
  // Hesap tamamen bu sekmede yapilir; quick.html sekmesine gerek yoktur.

  const BOT_ENABLED_KEY = 'btBotEnabled';
  const BOT_NEXT_STAGE_KEY = 'btBotNextStage';
  const BOT_STOP_STAGE_KEY = 'btBotStopStage';
  const BOT_DONE_KEY = 'btBotDone';
  // Girise kapali (bekleme suresi olan) katlari atlarken art arda kac kat atlandigini
  // tutar; sonsuz atlamayi onlemek icin kullanilir. Basarili giris/zaferde sifirlanir.
  const BOT_SKIP_COUNT_KEY = 'btBotSkipCount';
  // Sayfa taninmayinca (yarim yuklenmis sayfa, gecici hata) yapilan toparlanma denemesi
  // sayacini ve zaman damgasini tutar; surekli basarisiz toparlanmada bot durur.
  const BOT_RECOVER_KEY = 'btBotRecoverState';
  // Onerilen cozumun kazanma orani bunun altindaysa bot durur (quick popup %100 esdegeri).
  // Panelden secilebilir; GM'de saklanir. Varsayilan: %99.5.
  const BOT_MIN_WIN_RATE_DEFAULT = 0.995;
  const BOT_MIN_WIN_RATE_KEY = 'btBotMinWinRate';
  // Tekil v2 (kayip deseni onceligi): varsayilan acik, panelden kapatilabilir.
  const BOT_TEKIL_V2_KEY = 'btBotTekilV2Mode';
  const BOT_UNIT_LIMITS_KEY = 'btBotUnitLimits';
  const BOT_UNIT_LIMIT_DEFAULTS = [99, 99, 99, 99, 99, 99, 99, 1];
  // Panel simge durumuna kucululdu mu (kullanici tercihi, GM'de saklanir).
  const BOT_PANEL_MINIMIZED_KEY = 'btBotPanelMinimized';
  // Kenardan tutup boyutlandirilan panelin son genisligi/yuksekligi (px).
  const BOT_PANEL_WIDTH_KEY = 'btBotPanelWidth';
  const BOT_PANEL_HEIGHT_KEY = 'btBotPanelHeight';
  const BOT_PANEL_MAX_DESKTOP_WIDTH = 860;
  // Genislik bu degere kadar (varsayilan ~760px'in %80 kadarini) kisilabilir.
  const BOT_PANEL_MIN_WIDTH = 170;
  const BOT_PANEL_MIN_HEIGHT = 140;
  const BOT_PANEL_TOUCH_MIN_WIDTH = 240;
  // Panel kendi genisligi bu esigin altina inince tek sutuna gecer (kompakt mod).
  const BOT_PANEL_NARROW_WIDTH = 380;
  // Panele konacak kazanma orani secenekleri (yuzde). 'custom' -> elle giris.
  const BOT_WIN_RATE_PRESETS = [90, 95, 99.5, 100];
  // Dengeli cozumun beklenen kan kaybi bu esigi asarsa hizli ve derin modlar da
  // taranir; en dusuk kayipli guvenli cozum hangi moddaysa onunla savasilir.
  const BOT_LOSS_ESCALATION_THRESHOLD = 90;
  const BOT_MODE_LABELS = { fast: 'hizli', balanced: 'dengeli', deep: 'derin' };
  // Sonuc sayfasinda olen birimleri hayata dondurme tercihi (varsayilan: acik).
  const BOT_REVIVE_KEY = 'btBotReviveEnabled';
  const BATTLE_CORE_URL = 'https://bt-analiz.web.app/battle-core.js';

  // ====================== OTO KAT MODU ======================
  // Manuel kat botunun ustune oturan otomatik zamanlayici. Secilen kat araligini
  // sirayla kontrol eder, girilebilen katlari tamamlar. Son kat kontrol edilince
  // ayarlanan sure kadar bekleyip secilen ilk kattan yeniden baslar.
  const AUTO_ENABLED_KEY = 'btAutoEnabled';
  const AUTO_WAIT_UNTIL_KEY = 'btAutoWaitUntil';
  const AUTO_INTERVAL_KEY = 'btAutoIntervalSec';
  const AUTO_INTERVAL_MIN_KEY = 'btAutoIntervalMinSec';
  const AUTO_INTERVAL_MAX_KEY = 'btAutoIntervalMaxSec';
  const AUTO_START_FLOOR_KEY = 'btAutoStartFloor';
  const AUTO_END_FLOOR_KEY = 'btAutoEndFloor';
  const AUTO_ACTIVE_START_KEY = 'btAutoActiveStart';
  const AUTO_ACTIVE_END_KEY = 'btAutoActiveEnd';
  // Baslama/bitis saatine eklenecek rastgele surenin ust siniri (dk). 0 = kapali.
  const AUTO_ACTIVE_EXTRA_KEY = 'btAutoActiveExtraMin';
  // Gunun rastgele kaymasi ({date, extra, start, end}); gun boyunca sabit kalir.
  const AUTO_ACTIVE_OFFSETS_KEY = 'btAutoActiveOffsetsV1';
  const AUTO_BAND_RANGES_KEY = 'btAutoBandExtraRangesV2';
  const AUTO_BAND_DUE_KEY = 'btAutoBandDueV2';
  // Oto ayarlar tek kayit halinde de tutulur. Boylece panel yeniden cizilirken
  // ayarlarin bir kismi eski anahtarlardan/varsayilanlardan okunup ezilmez.
  const AUTO_SETTINGS_KEY = 'btAutoSettingsV1';
  const ORB_COORDINATION_KEY = 'BFOrbFloorCoordinator';
  const AUTO_DEFAULT_INTERVAL_SEC = 180;
  const AUTO_MIN_INTERVAL_SEC = 10;
  const AUTO_MIN_FLOOR = 1;
  const AUTO_MAX_FLOOR = 40;
  const AUTO_DEFAULT_ACTIVE_START = '07:02';
  const AUTO_DEFAULT_ACTIVE_END = '23:44';
  const AUTO_DEFAULT_BAND_RANGES = [
    { min: 2, max: 5 },
    { min: 2, max: 6 },
    { min: 2, max: 7 },
    { min: 5, max: 15 }
  ];

  function isAutoEnabled() {
    return GM_getValue(AUTO_ENABLED_KEY, false) === true;
  }

  // Kilit kalp atisi: bot aktifken busy kilidinin updatedAt'ini tazele. Orb botu
  // 10 dk tazelenmeyen kilidi bayat sayip yok sayar; boylece sekme coker/kapanirsa
  // orb sonsuza dek "kat botu calisiyor" diye beklemez.
  window.setInterval(() => {
    try {
      if (GM_getValue(AUTO_ENABLED_KEY, false) !== true && GM_getValue(BOT_ENABLED_KEY, false) !== true) return;
      const coordinator = JSON.parse(localStorage.getItem(ORB_COORDINATION_KEY) || '{}');
      if (coordinator.busy !== true) return;
      coordinator.updatedAt = Date.now();
      localStorage.setItem(ORB_COORDINATION_KEY, JSON.stringify(coordinator));
    } catch { /* localStorage kapaliysa eski bagimsiz davranis surer */ }
  }, 60 * 1000);

  function setOrbFloorBusy(busy, resumeAt = 0, orbPriority = false, floorUrl = '') {
    try {
      localStorage.setItem(ORB_COORDINATION_KEY, JSON.stringify({
        busy: Boolean(busy),
        resumeAt: Number(resumeAt) || 0,
        orbPriority: Boolean(orbPriority),
        floorUrl: String(floorUrl || ''),
        updatedAt: Date.now()
      }));
    } catch {
      // localStorage kapaliysa botlar eski bagimsiz davranislarini surdurur.
    }
  }

  function orbHasPriority() {
    try {
      return JSON.parse(localStorage.getItem(ORB_COORDINATION_KEY) || '{}').orbPriority === true;
    } catch {
      return false;
    }
  }

  function isOrbHuntEnabled() {
    try {
      return JSON.parse(localStorage.getItem('BFOrbSettings') || '{}').running === true;
    } catch {
      return false;
    }
  }

  function orbCollectionIsDue() {
    try {
      const orb = JSON.parse(localStorage.getItem('BFOrbSettings') || '{}');
      if (orb.running !== true) return false;
      const collectAt = Number(orb.orbCollectAt || 0);
      return collectAt <= 0 || collectAt <= Date.now();
    } catch {
      return false;
    }
  }

  function startOrbPriorityTurn(floor) {
    const target = Number(floor) || autoFloorRange().start;
    GM_setValue(BOT_NEXT_STAGE_KEY, target);
    setOrbFloorBusy(false, 0, true, buildFloorUrl(target));
    setBotStatus(`Orb oncelikli: Kat ${target} baslamadan once orb turu tamamlanacak`);
    location.assign(robberyIndexUrl());
  }

  function robberyIndexUrl() {
    return `${location.origin}/robbery/index`;
  }

  function autoIntervalRange() {
    const snapshot = autoSettingsSnapshot();
    const legacy = Number(GM_getValue(AUTO_INTERVAL_KEY, AUTO_DEFAULT_INTERVAL_SEC));
    const fallback = Number.isFinite(legacy) && legacy >= AUTO_MIN_INTERVAL_SEC
      ? Math.round(legacy)
      : AUTO_DEFAULT_INTERVAL_SEC;
    const savedMin = Number(snapshot.intervalMin ?? GM_getValue(AUTO_INTERVAL_MIN_KEY, fallback));
    const savedMax = Number(snapshot.intervalMax ?? GM_getValue(AUTO_INTERVAL_MAX_KEY, fallback));
    const min = Number.isFinite(savedMin) && savedMin >= AUTO_MIN_INTERVAL_SEC
      ? Math.round(savedMin)
      : fallback;
    const max = Number.isFinite(savedMax) && savedMax >= min ? Math.round(savedMax) : min;
    return { min, max };
  }

  function randomAutoIntervalSeconds() {
    const { min, max } = autoIntervalRange();
    return Math.round(min + Math.random() * (max - min));
  }

  function parseStoredJson(key, fallback) {
    try {
      const parsed = JSON.parse(GM_getValue(key, ''));
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function autoSettingsSnapshot() {
    const gmSettings = parseStoredJson(AUTO_SETTINGS_KEY, {});
    let localSettings = {};
    try {
      localSettings = JSON.parse(localStorage.getItem(AUTO_SETTINGS_KEY) || '{}') || {};
    } catch (_) { /* localStorage kullanilamiyorsa GM kaydi yeterlidir */ }
    return Number(localSettings.savedAt || 0) > Number(gmSettings.savedAt || 0)
      ? localSettings
      : gmSettings;
  }

  function saveAutoSettingsSnapshot(settings) {
    const snapshot = { ...settings, savedAt: Date.now() };
    GM_setValue(AUTO_SETTINGS_KEY, JSON.stringify(snapshot));
    try {
      localStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(snapshot));
    } catch (_) { /* localStorage kullanilamiyorsa GM kaydi yeterlidir */ }
    return snapshot;
  }

  function autoActiveHours() {
    const snapshot = autoSettingsSnapshot();
    const valid = (value, fallback) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback;
    return {
      start: valid(snapshot.activeStart ?? GM_getValue(AUTO_ACTIVE_START_KEY, AUTO_DEFAULT_ACTIVE_START), AUTO_DEFAULT_ACTIVE_START),
      end: valid(snapshot.activeEnd ?? GM_getValue(AUTO_ACTIVE_END_KEY, AUTO_DEFAULT_ACTIVE_END), AUTO_DEFAULT_ACTIVE_END)
    };
  }

  function istanbulMinuteOfDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
  }

  function timeTextToMinutes(value) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  function autoActiveExtraMinutes() {
    const snapshot = autoSettingsSnapshot();
    const value = Number(snapshot.activeExtra ?? GM_getValue(AUTO_ACTIVE_EXTRA_KEY, 0));
    return Number.isFinite(value) && value > 0 ? Math.min(180, Math.round(value)) : 0;
  }

  function istanbulDateText(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  }

  // Gunluk rastgele kayma: baslama ve bitis saatine ayri ayri 0..extra dk eklenir.
  // Kayma gun icinde sabit kalsin diye tarihiyle birlikte GM'de saklanir; her
  // kontrolde yeni rastgele deger uretilse pencere sinirinda gel-git yasanirdi.
  // Gun degisince veya +dk ayari degisince yeni kayma cekilir.
  function autoActiveOffsets(now = new Date()) {
    const extra = autoActiveExtraMinutes();
    if (extra <= 0) return { start: 0, end: 0 };
    const today = istanbulDateText(now);
    const saved = parseStoredJson(AUTO_ACTIVE_OFFSETS_KEY, {});
    if (saved.date === today && saved.extra === extra
      && Number.isInteger(saved.start) && saved.start >= 0 && saved.start <= extra
      && Number.isInteger(saved.end) && saved.end >= 0 && saved.end <= extra) {
      return { start: saved.start, end: saved.end };
    }
    const offsets = {
      date: today,
      extra,
      start: Math.floor(Math.random() * (extra + 1)),
      end: Math.floor(Math.random() * (extra + 1))
    };
    GM_setValue(AUTO_ACTIVE_OFFSETS_KEY, JSON.stringify(offsets));
    return { start: offsets.start, end: offsets.end };
  }

  function minutesToTimeText(totalMinutes) {
    const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }

  // Gunun rastgele kaymasi eklenmis fiili baslama/bitis saatleri (durum mesaji icin).
  function effectiveActiveHoursText(now = new Date()) {
    const { start, end } = autoActiveHours();
    const offsets = autoActiveOffsets(now);
    return {
      start: minutesToTimeText(timeTextToMinutes(start) + offsets.start),
      end: minutesToTimeText(timeTextToMinutes(end) + offsets.end)
    };
  }

  function isInsideAutoActiveHours(now = new Date()) {
    const { start, end } = autoActiveHours();
    const offsets = autoActiveOffsets(now);
    const current = istanbulMinuteOfDay(now);
    const startMinute = (timeTextToMinutes(start) + offsets.start) % 1440;
    const endMinute = (timeTextToMinutes(end) + offsets.end) % 1440;
    if (startMinute === endMinute) return true;
    return startMinute < endMinute
      ? current >= startMinute && current <= endMinute
      : current >= startMinute || current <= endMinute;
  }

  function autoBandRanges() {
    const snapshot = autoSettingsSnapshot();
    const saved = Array.isArray(snapshot.bandRanges)
      ? snapshot.bandRanges
      : parseStoredJson(AUTO_BAND_RANGES_KEY, AUTO_DEFAULT_BAND_RANGES);
    return AUTO_DEFAULT_BAND_RANGES.map((fallback, index) => {
      const item = Array.isArray(saved) ? saved[index] : null;
      const min = Number.isInteger(item?.min) && item.min >= 1 ? item.min : fallback.min;
      const max = Number.isInteger(item?.max) && item.max >= min ? item.max : Math.max(min, fallback.max);
      return { min, max };
    });
  }

  function floorBandIndex(floor) {
    return Math.min(3, Math.max(0, Math.floor((floor - 1) / 10)));
  }

  function autoBandDueTimes() {
    const saved = parseStoredJson(AUTO_BAND_DUE_KEY, {});
    return saved && !Array.isArray(saved) ? saved : {};
  }

  function markAutoBandCompleted(floor) {
    const band = floorBandIndex(floor);
    const ranges = autoBandRanges();
    const range = ranges[band];
    const extraMinutes = Math.round(range.min + Math.random() * (range.max - range.min));
    const renewalSeconds = FLOOR_REMINDERS[band]?.intervalSec || 0;
    const due = autoBandDueTimes();
    due[band] = Date.now() + renewalSeconds * 1000 + extraMinutes * 60 * 1000;
    GM_setValue(AUTO_BAND_DUE_KEY, JSON.stringify(due));
    return extraMinutes;
  }

  function scheduleBandFromRemaining(floor, remainingSeconds) {
    const band = floorBandIndex(floor);
    const range = autoBandRanges()[band];
    const extraMinutes = Math.round(range.min + Math.random() * (range.max - range.min));
    const due = autoBandDueTimes();
    due[band] = Date.now() + Math.max(0, remainingSeconds) * 1000 + extraMinutes * 60 * 1000;
    GM_setValue(AUTO_BAND_DUE_KEY, JSON.stringify(due));
    return { extraMinutes, dueAt: due[band] };
  }

  function nextDueFloor(fromFloor, endFloor) {
    const due = autoBandDueTimes();
    let floor = fromFloor;
    while (floor <= endFloor) {
      const band = floorBandIndex(floor);
      // Grubun ilk kati gecildiyse ayni turdaki kalan katlari zaman kilidine takma.
      if (floor % 10 !== 1) return floor;
      if (Number(due[band] || 0) <= Date.now()) return floor;
      floor = Math.min(endFloor + 1, (band + 1) * 10 + 1);
    }
    return 0;
  }

  function autoFloorRange() {
    const snapshot = autoSettingsSnapshot();
    const savedStart = Number(snapshot.start ?? GM_getValue(AUTO_START_FLOOR_KEY, AUTO_MIN_FLOOR));
    const savedEnd = Number(snapshot.end ?? GM_getValue(AUTO_END_FLOOR_KEY, AUTO_MAX_FLOOR));
    const start = Math.min(AUTO_MAX_FLOOR, Math.max(AUTO_MIN_FLOOR,
      Number.isInteger(savedStart) ? savedStart : AUTO_MIN_FLOOR));
    const end = Math.min(AUTO_MAX_FLOOR, Math.max(start,
      Number.isInteger(savedEnd) ? savedEnd : AUTO_MAX_FLOOR));
    return { start, end };
  }

  // Bekleme penceresini baslatir ve secilen ilk kata doner; gerceklesecek geri sayim
  // handleAutoFloorPage icinde yapilir.
  function beginAutoWait(waitSeconds) {
    const { start } = autoFloorRange();
    GM_setValue(AUTO_WAIT_UNTIL_KEY, Date.now() + waitSeconds * 1000);
    GM_setValue(BOT_NEXT_STAGE_KEY, start);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    const resumeAt = Date.now() + waitSeconds * 1000;
    setOrbFloorBusy(false, resumeAt, false, buildFloorUrl(start));
    location.assign(isOrbHuntEnabled() ? robberyIndexUrl() : buildFloorUrl(start));
  }

  function startAuto(startFloor, endFloor) {
    GM_setValue(AUTO_START_FLOOR_KEY, startFloor);
    GM_setValue(AUTO_END_FLOOR_KEY, endFloor);
    saveAutoSettingsSnapshot({ ...autoSettingsSnapshot(), start: startFloor, end: endFloor });
    GM_setValue(AUTO_ENABLED_KEY, true);
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(BOT_NEXT_STAGE_KEY, startFloor);
    GM_setValue(BOT_STOP_STAGE_KEY, 0);
    GM_setValue(BOT_DONE_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    GM_setValue(BOT_RECOVER_KEY, '');
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    void acquireWakeLock();
    setBotStatus(`Oto kat modu basladi: Kat ${startFloor}-${endFloor} taraniyor`);
    renderBotPanel();
    botTickStarted = false;
    if (orbCollectionIsDue()) {
      startOrbPriorityTurn(startFloor);
      return;
    }
    setOrbFloorBusy(true);
    // Kat sayfasinda degilsek tarama secilen ilk kattan baslasin diye oraya git.
    if (!isFloorPage()) {
      location.assign(buildFloorUrl(startFloor));
      return;
    }
    void runBotTick();
  }

  // Sonuc sayfasindaki olen birimleri (panelde aciksa) hayata dondurur. Manuel ve
  // oto sonuc isleyicilerinin ortak yardimcisi.
  async function reviveFallenIfNeeded(stage) {
    const reviveOpener = isReviveEnabled()
      ? (document.querySelector('#showReviveBtn') || await waitForElement('#showReviveBtn', 2500))
      : null;
    if (!reviveOpener) {
      return;
    }
    // Diriltme maliyeti butonda gosterilir (or. "-1"). Senkron yarisini onlemek icin
    // tasi diriltmeden once yaz; bakiye degisirse gercek harcama sonra guncellenir.
    const reviveCost = getReviveStoneCostFromElement(reviveOpener);
    const balanceBefore = parseDigits(document.querySelector('#devil_stone_balance')?.textContent);
    GM_setValue(LAST_REVIVE_STONES_KEY, String(reviveCost));

    setBotStatus(`Kat ${stage}: olen birimler hayata donduruluyor...`);
    await timedSleep('button');
    reviveOpener.click();
    const confirmBtn = await waitForElement('.revivePopUpActivated #reviveBtn', 5000)
      || document.querySelector('#reviveBtn');
    if (confirmBtn) {
      const confirmCost = getReviveStoneCostFromElement(confirmBtn);
      if (confirmCost > 0) {
        GM_setValue(LAST_REVIVE_STONES_KEY, String(confirmCost));
      }
      await timedSleep('button');
      confirmBtn.click();
      await waitForElement('#revivedResult .success-message, #revivedResult .revived-banner', 7000);
      await timedSleep('button');
      const balanceAfter = parseDigits(document.querySelector('#devil_stone_balance')?.textContent);
      const spentByBalance = balanceBefore && balanceAfter ? Math.max(0, balanceBefore - balanceAfter) : 0;
      if (spentByBalance > 0) {
        GM_setValue(LAST_REVIVE_STONES_KEY, String(spentByBalance));
      }
    }
  }

  // Oto mod kat sayfasi: once bekleme penceresi, sonra hedef kati ac/atla/gir.
  async function handleAutoFloorPage() {
    const { start, end } = autoFloorRange();
    if (!isInsideAutoActiveHours()) {
      const effective = effectiveActiveHoursText();
      setBotStatus(`Oto mod saat penceresi disinda. Istanbul ${effective.start}-${effective.end} bekleniyor (bugunun rastgele kaymasi dahil)`);
      await sleep(30000);
      if (isAutoEnabled()) location.reload();
      return;
    }
    const waitUntil = GM_getValue(AUTO_WAIT_UNTIL_KEY, 0);
    if (waitUntil && Date.now() < waitUntil) {
      setOrbFloorBusy(false, waitUntil);
      if (isOrbHuntEnabled()) {
        location.assign(robberyIndexUrl());
        return;
      }
      while (Date.now() < waitUntil) {
        if (!isAutoEnabled()) {
          return;
        }
        const remaining = Math.ceil((waitUntil - Date.now()) / 1000);
        setBotStatus(`Kat ${start}-${end} taramasi tamamlandi. Yeniden deneme: ${remaining} sn`);
        await sleep(1000);
      }
      if (!isAutoEnabled()) {
        return;
      }
      GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
      setOrbFloorBusy(true);
      GM_setValue(BOT_NEXT_STAGE_KEY, start);
      if (!(await ensureOnline('Yeniden deneme'))) {
        return;
      }
      // Guncel girilebilirlik icin secilen ilk kati tazele.
      location.assign(buildFloorUrl(start));
      return;
    }

    const savedTarget = Number(GM_getValue(BOT_NEXT_STAGE_KEY, start));
    const candidate = savedTarget >= start && savedTarget <= end ? savedTarget : start;
    const target = nextDueFloor(candidate, end) || nextDueFloor(start, Math.min(end, candidate - 1));
    if (!target) {
      const dueValues = Object.values(autoBandDueTimes()).map(Number).filter((value) => value > Date.now());
      const waitSeconds = dueValues.length ? Math.max(10, Math.ceil((Math.min(...dueValues) - Date.now()) / 1000)) : randomAutoIntervalSeconds();
      setBotStatus(`Tum kat gruplari beklemede. ${waitSeconds} sn sonra tekrar kontrol edilecek`);
      beginAutoWait(waitSeconds);
      return;
    }
    if (target !== candidate) GM_setValue(BOT_NEXT_STAGE_KEY, target);
    // Dogru 10'luk dilimde ve URL hedef kati mi gosteriyor? Degilse hedef kata git.
    if (floorUrlNeedsNavigation(target)) {
      setBotStatus(`Kat ${target} aciliyor...`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${target}`))) {
        return;
      }
      location.assign(buildFloorUrl(target));
      return;
    }

    // Hedef kati aktif et, sonra gercek "Kat N" kartindan girilebilirligini oku.
    await activateFloor(target);
    let entryBtn = floorEntryButton(target);
    let available = !!entryBtn && entryBtn.classList.contains('entryAvailable');
    if (!available) {
      // Yeni temizlenen kat icin durum gec yansiyabilir; kisa bekleyip tekrar dene.
      await sleep(1200);
      await activateFloor(target);
      entryBtn = floorEntryButton(target);
      available = !!entryBtn && entryBtn.classList.contains('entryAvailable');
    }

    if (!available) {
      // Grup basindaki kat kapaliysa oyunun gosterdigi gercek kalan sureyi oku.
      // Grup, sayaç bittikten sonra paneldeki rastgele ek gecikme kadar daha bekler.
      if (target % 10 === 1) {
        const remainingSeconds = floorCooldownSeconds(target);
        if (remainingSeconds != null && remainingSeconds > 0) {
          const scheduled = scheduleBandFromRemaining(target, remainingSeconds);
          const totalMinutes = Math.ceil((remainingSeconds + scheduled.extraMinutes * 60) / 60);
          const nextBandStart = target + 10;
          if (nextBandStart <= end) {
            GM_setValue(BOT_NEXT_STAGE_KEY, nextBandStart);
            setBotStatus(`Kat ${target}: ${Math.ceil(remainingSeconds / 60)} dk kaldi; +${scheduled.extraMinutes} dk gecikme. Kat ${nextBandStart} kontrol ediliyor`);
            location.assign(buildFloorUrl(nextBandStart));
            return;
          }
          setBotStatus(`Kat ${target}: yenilenme + ek gecikme sonrasi yaklasik ${totalMinutes} dk sonra tekrar kontrol edilecek`);
          beginAutoWait(Math.max(10, Math.ceil((scheduled.dueAt - Date.now()) / 1000)));
          return;
        }
      }
      // Hedef kat girise kapali: siradaki kati kontrol et. Secilen son kat da kapaliysa
      // turun tamaminda girilebilen baska kat kalmadigindan beklemeye gir.
      if (target >= end) {
        const waitSeconds = randomAutoIntervalSeconds();
        setBotStatus(`Kat ${target} kapali. ${waitSeconds} sn sonra Kat ${start}'den bastan denenecek`);
        beginAutoWait(waitSeconds);
        return;
      }
      const next = target + 1;
      GM_setValue(BOT_NEXT_STAGE_KEY, next);
      setBotStatus(`Kat ${target} kapali -> Kat ${next} kontrol ediliyor`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${next}`))) {
        return;
      }
      location.assign(buildFloorUrl(next));
      return;
    }

    setBotStatus(`Kat ${target}: giriliyor...`);
    await timedSleep('button');
    if (!(await ensureOnline(`Kat ${target}`))) {
      return;
    }
    await clickFloorEntry(target);
  }

  // Oto mod sonuc sayfasi: olenleri dondur, zaferde bir sonraki kata gec;
  // Secilen son kat bitince beklemeye girilir.
  async function handleAutoResultPage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    const { start, end } = autoFloorRange();
    const victory = !!document.querySelector('h1.combatResultHeader.resultVictory');

    await reviveFallenIfNeeded(stage);
    try {
      await syncLootResultToLastArchive();
    } catch (error) {
      console.error('Diriltme sonrasi arsiv kaydi guncellenemedi.', error);
    }

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);

    // Bant-basi kat (1/11/21/31) ise bant suresi kadar sonrasi icin Telegram
    // hatirlatmasini planla. (Diger katlar icin kayit yazilmaz.)
    await scheduleFloorReminder(stage);

    // Her grubun ilk kati referanstir. Rastgele sonraki tur zamani kalici olarak saklanir.
    if (stage % 10 === 1) {
      markAutoBandCompleted(stage);
    }

    // Baslamis 10'lu kat serisini asla bolme. Orb ancak 10/20/30/40 sinirinda
    // devralabilir; hem sonraki kat grubu hem orb hazirsa oncelik orbundur.
    if (stage % 10 === 0 && orbCollectionIsDue()) {
      const nextAfterBlock = nextDueFloor(stage + 1, end)
        || nextDueFloor(start, Math.min(end, stage));
      startOrbPriorityTurn(nextAfterBlock || start);
      return;
    }

    if (stage >= end) {
      // Aktif 10'lu grup tamamen bitti. Bu sirada suresi dolan daha onceki bir grup
      // varsa genel beklemeye girmeden ona don; grup ortasinda asla gecis yapilmaz.
      const readyFloor = nextDueFloor(start, end);
      if (readyFloor) {
        GM_setValue(BOT_NEXT_STAGE_KEY, readyFloor);
        setBotStatus(`Kat ${stage} tamam (${done} kat). Hazir bekleyen Kat ${readyFloor}-${Math.min(end, Math.ceil(readyFloor / 10) * 10)} grubuna geciliyor`);
        await timedSleep('button');
        location.assign(buildFloorUrl(readyFloor));
        return;
      }
      const dueValues = Object.values(autoBandDueTimes()).map(Number).filter((value) => value > Date.now());
      const waitSeconds = dueValues.length ? Math.max(10, Math.ceil((Math.min(...dueValues) - Date.now()) / 1000)) : randomAutoIntervalSeconds();
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${start}-${end} taramasi bitti, ${waitSeconds} sn sonra Kat ${start}'den tekrar`);
      beginAutoWait(waitSeconds);
      return;
    }

    const next = nextDueFloor(stage + 1, end) || nextDueFloor(start, Math.min(end, stage));
    if (!next) {
      const dueValues = Object.values(autoBandDueTimes()).map(Number).filter((value) => value > Date.now());
      const waitSeconds = dueValues.length ? Math.max(10, Math.ceil((Math.min(...dueValues) - Date.now()) / 1000)) : randomAutoIntervalSeconds();
      beginAutoWait(waitSeconds);
      return;
    }
    GM_setValue(BOT_NEXT_STAGE_KEY, next);

    // Katlar arasi bekleme: saniyelik geri sayim; Durdur bu sirada da calisir.
    const floorRange = loadBotTiming().floor;
    const waitSeconds = Math.max(0, Math.round(floorRange.min + Math.random() * (floorRange.max - floorRange.min)));
    for (let remaining = waitSeconds; remaining > 0; remaining -= 1) {
      if (!isAutoEnabled()) {
        return;
      }
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${next} icin bekleme: ${remaining} sn`);
      await sleep(1000);
    }
    if (!isAutoEnabled()) {
      return;
    }
    if (!(await ensureOnline(`Kat ${next}`))) {
      return;
    }
    goToNextFloorViaForward(next);
  }
  // ====================== /OTO KAT MODU ======================

  // Panelden ayarlanabilen bekleme sureleri (saniye). Her parametre min-max araligi;
  // bot her seferinde bu araliktan rastgele bir sure secer. GM'de saklanir.
  const BOT_TIMING_KEY = 'btBotTimingSettings';
  const BOT_SETTINGS_OPEN_KEY = 'btBotSettingsOpen';
  const BOT_TIMING_FIELDS = [
    { key: 'button', label: 'Buton basma (GIR/BASLA/dondur)', min: 0.7, max: 1.6 },
    { key: 'fill', label: 'Birim doldurma tiklamasi', min: 0.25, max: 0.42 },
    { key: 'floor', label: 'Katlar arasi gecis', min: 5, max: 11 }
  ];
  const BOT_TIMING_DEFAULTS = Object.fromEntries(
    BOT_TIMING_FIELDS.map((field) => [field.key, { min: field.min, max: field.max }])
  );

  // Kabul edilen minimum kazanma orani (kesir). Panelden secilir, GM'de saklanir.
  function getBotMinWinRate() {
    const stored = Number(GM_getValue(BOT_MIN_WIN_RATE_KEY, BOT_MIN_WIN_RATE_DEFAULT));
    if (!Number.isFinite(stored) || stored <= 0 || stored > 1) {
      return BOT_MIN_WIN_RATE_DEFAULT;
    }
    return stored;
  }

  function setBotMinWinRate(rate) {
    const clamped = Math.min(1, Math.max(0.01, Number(rate)));
    GM_setValue(BOT_MIN_WIN_RATE_KEY, Number.isFinite(clamped) ? clamped : BOT_MIN_WIN_RATE_DEFAULT);
  }

  function isBotTekilV2Enabled() {
    return GM_getValue(BOT_TEKIL_V2_KEY, true) !== false;
  }

  function setBotTekilV2Enabled(enabled) {
    GM_setValue(BOT_TEKIL_V2_KEY, enabled === true);
    return enabled === true;
  }

  // Nihai dogrulamada kullanilacak minimum deneme sayisi: yuksek esiklerde kucuk
  // orneklemde sansla "%100" gorunen adaylari gercek oranina ceker (battle-core
  // minVerifyTrials). Esik ne kadar yuksekse o kadar cok dogrulama denemesi.
  function getBotMinVerifyTrials() {
    const rate = getBotMinWinRate();
    if (rate >= 0.99) {
      return 480;
    }
    if (rate >= 0.95) {
      return 360;
    }
    return 240;
  }

  function isBotPanelMinimized() {
    return GM_getValue(BOT_PANEL_MINIMIZED_KEY, false) === true;
  }

  function setBotPanelMinimized(minimized) {
    GM_setValue(BOT_PANEL_MINIMIZED_KEY, minimized === true);
  }

  // Kullanicinin kenardan tutup ayarladigi panel boyutu (0 = otomatik/varsayilan).
  function getBotPanelSize() {
    const width = Number(GM_getValue(BOT_PANEL_WIDTH_KEY, 0)) || 0;
    const height = Number(GM_getValue(BOT_PANEL_HEIGHT_KEY, 0)) || 0;
    return { width, height };
  }

  function setBotPanelSize(width, height) {
    GM_setValue(BOT_PANEL_WIDTH_KEY, Math.round(width) || 0);
    if (height !== undefined) {
      GM_setValue(BOT_PANEL_HEIGHT_KEY, Math.round(height) || 0);
    }
  }

  // Bazi yonetici/surum kombinasyonlarinda GM degeri yanlislikla iki kez JSON'lanip
  // string olarak geri gelebiliyor (or. '"[99,99,...]"'). Bu durumda dizi/nesne elde
  // edene kadar cozeriz; asla bir string'i karakter karakter indekslemeyiz (aksi halde
  // '[' ve ',' konumlari sayiya donmeyip limitler bozuk okunur).
  function parseStoredValue(raw) {
    let value = raw;
    for (let depth = 0; depth < 4 && typeof value === 'string'; depth += 1) {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      try {
        value = JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
    return value;
  }

  function loadBotTiming() {
    const parsed = parseStoredValue(GM_getValue(BOT_TIMING_KEY, ''));
    const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const result = {};
    BOT_TIMING_FIELDS.forEach((field) => {
      const entry = stored[field.key] || {};
      let min = Number(entry.min);
      let max = Number(entry.max);
      if (!Number.isFinite(min) || min < 0) {
        min = field.min;
      }
      if (!Number.isFinite(max) || max < 0) {
        max = field.max;
      }
      if (min > max) {
        [min, max] = [max, min];
      }
      result[field.key] = { min, max };
    });
    return result;
  }

  function saveBotTiming(timing) {
    GM_setValue(BOT_TIMING_KEY, JSON.stringify(timing));
  }

  function loadBotUnitLimits() {
    const parsed = parseStoredValue(GM_getValue(BOT_UNIT_LIMITS_KEY, ''));
    // Yalnizca gercek bir dizi indekslenir; string ise (bozuk/cift JSON) yok sayilir.
    const stored = Array.isArray(parsed) ? parsed : [];
    return BOT_UNIT_LIMIT_DEFAULTS.map((fallback, index) => {
      const value = Number(stored[index]);
      return Number.isInteger(value) && value >= 0 ? value : fallback;
    });
  }

  function saveBotUnitLimits(limits) {
    const normalized = BOT_UNIT_LIMIT_DEFAULTS.map((fallback, index) => {
      const value = Number(limits[index]);
      return Number.isInteger(value) && value >= 0 ? value : fallback;
    });
    GM_setValue(BOT_UNIT_LIMITS_KEY, JSON.stringify(normalized));
  }

  // Verilen parametrenin araligindan rastgele bekleme (ms). Parametre yoksa sabit ms'e duser.
  function timedSleep(categoryOrMs) {
    if (typeof categoryOrMs === 'number') {
      return sleep(categoryOrMs);
    }
    const timing = loadBotTiming();
    const range = timing[categoryOrMs] || BOT_TIMING_DEFAULTS[categoryOrMs] || { min: 0.7, max: 1.6 };
    const ms = (range.min + Math.random() * (range.max - range.min)) * 1000;
    return sleep(Math.max(0, Math.round(ms)));
  }
  // battle-core.js'teki ENEMY_UNITS / ALLY_UNITS sirasiyla ayni olmali.
  const BOT_ENEMY_KEYS = ['skeletons', 'zombies', 'cultists', 'bonewings', 'corpses', 'wraiths', 'revenants', 'giants', 'broodmothers', 'liches'];
  const BOT_ALLY_KEYS = ['bats', 'ghouls', 'thralls', 'banshees', 'necromancers', 'gargoyles', 'witches', 'rotmaws'];

  let battleCorePromise = null;
  let botTickStarted = false;

  function gmFetchText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error('istek basarisiz'))
      });
    });
  }

  // Anlik internet kesintilerinde botu durdurmak yerine baglanti geri gelene kadar
  // bekletir. navigator.onLine cevrimdisi oldugunda kesin false doner; cevrimici
  // gorunup istekler patladiginda ise gmFetchTextWithRetry devreye girer.
  // Donus: true = cevrimici ve bot hala acik; false = bot durduruldu (cagiran cikmali).
  async function ensureOnline(contextLabel) {
    if (navigator.onLine !== false) {
      return true;
    }
    let waited = 0;
    while (isBotEnabled() && navigator.onLine === false) {
      setBotStatus(`${contextLabel || 'Bot'}: internet bekleniyor... (${waited} sn)`);
      await sleep(2000);
      waited += 2;
      void acquireWakeLock();
    }
    return isBotEnabled() && navigator.onLine !== false;
  }

  // gmFetchText'i gecici ag hatalarinda yeniden dener; her denemeden once baglantinin
  // geri gelmesini bekler. Tum denemeler basarisiz olursa son hatayi firlatir.
  async function gmFetchTextWithRetry(url, options = {}) {
    const attempts = options.attempts || 5;
    const label = options.label || 'Indirme';
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (isBotEnabled() && !(await ensureOnline(label))) {
        throw new Error('bot durduruldu');
      }
      try {
        return await gmFetchText(url);
      } catch (error) {
        lastError = error;
        const backoff = Math.min(8000, 1500 * attempt);
        setBotStatus(`${label}: baglanti hatasi, ${Math.round(backoff / 1000)} sn sonra tekrar (${attempt}/${attempts})`);
        await sleep(backoff);
      }
    }
    throw lastError || new Error('indirme basarisiz');
  }

  // Tampermonkey korumali alani saf hesap donglerini ciddi yavaslatir (with-proxy
  // sarmalayici). Bu yuzden asil hesap, motor kaynagindan kurulan bir Web Worker'da
  // native hizda yapilir; worker kurulamazsa @require ile gomulu motora dusulur.
  const BOT_CORE_SOURCE_CACHE_KEY = 'btBotCoreSource';

  async function getBattleCoreSource() {
    try {
      const code = await gmFetchText(`${BATTLE_CORE_URL}?bot=${Date.now()}`);
      if (code && code.includes('BattleCore')) {
        try {
          GM_setValue(BOT_CORE_SOURCE_CACHE_KEY, JSON.stringify({ code, fetchedAt: Date.now() }));
        } catch {
          // kaynak cache'i best-effort
        }
        return code;
      }
    } catch {
      // indirme basarisiz; cache'e dus
    }
    try {
      const cached = JSON.parse(GM_getValue(BOT_CORE_SOURCE_CACHE_KEY, '') || 'null');
      if (cached && typeof cached.code === 'string' && cached.code) {
        return cached.code;
      }
    } catch {
      // cache bozuk
    }
    return '';
  }

  // Worker icinde optimizeArmyUsage kosar; sonucun yalnizca botun kullandigi alanlari doner.
  async function computeViaWorker(pool, enemyCounts, options, onTick) {
    if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined') {
      throw new Error('Worker destegi yok');
    }
    const coreSource = await getBattleCoreSource();
    if (!coreSource) {
      throw new Error('motor kaynagi indirilemedi');
    }

    const workerSource = `${coreSource}
self.onmessage = (event) => {
  const message = event.data || {};
  try {
    const result = self.BattleCore.optimizeArmyUsage(message.pool, message.enemy, message.options);
    const source = result.possible ? result.recommendation : null;
    const sample = result.sampleBattle;
    const lossValue = sample && Number.isFinite(Number(sample.lostBloodTotal))
      ? Number(sample.lostBloodTotal)
      : (source && Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null);
    self.postMessage({
      ok: true,
      possible: !!result.possible,
      counts: source ? source.counts : null,
      winRate: source ? source.winRate : 0,
      avgUsedPoints: source ? source.avgUsedPoints : 0,
      lossValue,
      expectedLoss: source && Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null
    });
  } catch (error) {
    self.postMessage({ ok: false, message: String((error && error.message) || error) });
  }
};`;

    const blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(blobUrl);
    const startedAt = Date.now();
    const ticker = typeof onTick === 'function'
      ? setInterval(() => onTick(Math.round((Date.now() - startedAt) / 1000)), 1000)
      : 0;

    try {
      return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('hesap zaman asimina ugradi')), 180000);
        worker.onmessage = (event) => {
          clearTimeout(timeoutId);
          const data = event.data || {};
          if (data.ok) {
            resolve(data);
          } else {
            reject(new Error(data.message || 'worker hatasi'));
          }
        };
        worker.onerror = (event) => {
          clearTimeout(timeoutId);
          reject(new Error(event.message || 'worker baslatilamadi'));
        };
        worker.postMessage({ pool, enemy: enemyCounts, options });
      });
    } finally {
      if (ticker) {
        clearInterval(ticker);
      }
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    }
  }

  function getEmbeddedBattleCore() {
    const candidates = [
      typeof window !== 'undefined' ? window.BattleCore : null,
      typeof globalThis !== 'undefined' ? globalThis.BattleCore : null,
      typeof unsafeWindow !== 'undefined' ? unsafeWindow.BattleCore : null
    ];
    return candidates.find((core) => core && typeof core.optimizeArmyUsage === 'function') || null;
  }

  // Motor @require ile kurulumda gomulur; o yoksa son care canli siteden cekip eval dener.
  function loadBattleCore() {
    const embedded = getEmbeddedBattleCore();
    if (embedded) {
      return Promise.resolve(embedded);
    }
    if (!battleCorePromise) {
      battleCorePromise = (async () => {
        const code = await gmFetchTextWithRetry(`${BATTLE_CORE_URL}?bot=${Date.now()}`, { label: 'Motor yukleme' });
        (0, eval)(code);
        const core = getEmbeddedBattleCore();
        if (!core) {
          throw new Error('BattleCore yuklenemedi (scripti Tampermonkey\'de yeniden kur: @require motoru gomer)');
        }
        return core;
      })();
      battleCorePromise.catch(() => {
        battleCorePromise = null;
      });
    }
    return battleCorePromise;
  }

  // optimizer.js getRunConfig presetlerinin runIndex=1 karsiliklari (quick.html varsayilani).
  // optimizer.js'te preset degisirse burayi da guncelle.
  function getQuickRunConfig(stage, mode = 'balanced') {
    const seedOffsets = { fast: 1301, balanced: 2603, deep: 5209, ultra: 9203 };
    const presets = {
      fast: {
        trialCount: 4,
        fullArmyTrials: 6,
        beamWidth: 7,
        maxIterations: 3,
        eliteCount: 4,
        stabilityTrials: 8,
        exploratoryCandidateCount: 60,
        exhaustiveCandidateLimit: 1500
      },
      balanced: {
        trialCount: 6,
        fullArmyTrials: 10,
        beamWidth: 10,
        maxIterations: 4,
        eliteCount: 6,
        stabilityTrials: 18,
        exploratoryCandidateCount: 100,
        exhaustiveCandidateLimit: 6000
      },
      deep: {
        trialCount: 10,
        fullArmyTrials: 16,
        beamWidth: 14,
        maxIterations: 5,
        eliteCount: 8,
        stabilityTrials: 40,
        exploratoryCandidateCount: 224,
        exhaustiveCandidateLimit: 20000
      }
    };
    const preset = presets[mode] || presets.balanced;
    const seedOffset = Object.prototype.hasOwnProperty.call(seedOffsets, mode) ? seedOffsets[mode] : seedOffsets.balanced;
    const seedBase = 41017 + stage * 31 + 7919;
    return {
      ...preset,
      diversityCandidateCount: 0,
      tekilCandidateCount: 0,
      baseSeed: seedBase + seedOffset,
      timeBudgetMs: 0,
      alternateBaseSeeds: Object.entries(seedOffsets)
        .filter(([offsetMode]) => offsetMode !== mode)
        .map(([, offset]) => seedBase + offset)
    };
  }

  function parseEnemyCountsForBot() {
    const counts = Object.fromEntries(BOT_ENEMY_KEYS.map((key) => [key, 0]));
    let total = 0;
    document.querySelectorAll('.enemySlot').forEach((slot) => {
      const styleText = slot.getAttribute('style') || '';
      const match = styleText.match(/enemyUnit_(\d+)\.jpg/i);
      const qty = parseQtyValue(slot.querySelector('.qtyValue')?.textContent || '');
      if (!match || qty === null) {
        return;
      }
      const key = BOT_ENEMY_KEYS[Number.parseInt(match[1], 10) - 1];
      if (key) {
        counts[key] += qty;
        total += qty;
      }
    });
    return { counts, total };
  }

  // quick.html varsayilan havuzu: acik kademelerde 99 (T8 icin 1), kapali kademelerde 0.
  function buildBotAllyPool() {
    const openTiers = new Set(getOpenAllyTiers());
    const limits = loadBotUnitLimits();
    return Object.fromEntries(BOT_ALLY_KEYS.map((key, index) => {
      const tier = index + 1;
      if (!openTiers.has(tier)) {
        return [key, 0];
      }
      return [key, limits[index]];
    }));
  }

  function parseBotMaxPoints() {
    const text = getArmyPowerText();
    const match = text.match(/\/(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  function getLayerIdFromHref(href) {
    const match = String(href || '').match(/[?&]layerId=(\d+)/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }

  // Kat sayfasi URL'i: page = 10'luk dilim (1-10 -> page 1, 11-20 -> page 2 ...),
  // layerId = mutlak kat numarasi. Ornek: kat 12 -> page=2&layerId=12,
  // kat 22 -> page=3&layerId=22. Sayfa-ici kat dugmeleri yine 1-10 indekslidir.
  function buildFloorUrl(stage) {
    const page = Math.ceil(stage / 10);
    return `${location.origin}/ancestral/index?page=${page}&layerId=${stage}`;
  }

  // Bir href'teki mutlak layerId'den kat numarasi. (Geri/teshis amacli.)
  function getFloorFromHref(href) {
    const text = String(href || '');
    const layerMatch = text.match(/[?&]layerId=(\d+)/);
    if (layerMatch) {
      return Number.parseInt(layerMatch[1], 10);
    }
    return 0;
  }

  // Kat kartindaki "Kat N" yazisindan mutlak kat numarasi.
  function floorNumberOfContainer(container) {
    if (!container) return 0;
    const text = container.querySelector('.layer-number')?.textContent || '';
    return Number.parseInt(text.replace(/[^\d]/g, ''), 10) || 0;
  }

  // Sayfada gosterilen 10'luk dilim (kart numaralarina gore; yoksa URL page'i).
  function currentFloorPage() {
    const nums = [...document.querySelectorAll('.layerInfoContainer')]
      .map(floorNumberOfContainer)
      .filter((n) => n > 0);
    if (nums.length) {
      return Math.ceil(Math.min(...nums) / 10);
    }
    const page = Number.parseInt(new URLSearchParams(location.search).get('page') || '', 10);
    return page > 0 ? page : 1;
  }

  // Mutlak kata ait kat karti (icindeki "Kat N" ile eslesir).
  function findFloorContainer(stage) {
    return [...document.querySelectorAll('.layerInfoContainer')]
      .find((container) => floorNumberOfContainer(container) === stage) || null;
  }

  // Mutlak kata ait giris butonu; kart bulunamazsa gorunur kartin butonu.
  function findFloorEntryButton(stage) {
    const container = findFloorContainer(stage);
    if (container) {
      return container.querySelector('a.layerEntryBtn');
    }
    return document.querySelector('.layerInfoContainer[style*="block"] a.layerEntryBtn');
  }

  // Hedef katin kat butonuna (#layerN, sayfa-ici 1-10 indeks) basarak oyunun kendi
  // secim mantigini (onclick="setLayerActive(page, indeks)") calistirir. Tum giris
  // butonlari ayni href'i tasidigindan ve girilebilirlik bayragi cogu zaman ancak
  // kat aktif edilince guncellendiginden, okuma/giristen once bu sart.
  async function activateFloor(stage) {
    const within = ((stage - 1) % 10) + 1;
    const layerBtn = document.querySelector(`#layer${within}`);
    if (layerBtn && !layerBtn.classList.contains('activeLayerBtn')) {
      layerBtn.click();
      await sleep(450);
    }
  }

  // O an aktif/gorunur kat kartinin giris butonu (hedef kart bulunabiliyorsa onunki).
  function floorEntryButton(stage) {
    const container = findFloorContainer(stage) || document.querySelector('.layerInfoContainer[style*="block"]');
    return container ? container.querySelector('a.layerEntryBtn') : null;
  }

  // Kapali kat kartindaki oyun sayacini saniyeye cevirir. Ornekler: "40m 24s",
  // "1h 20m 5s" veya "01:20:05". Sayac bulunamazsa null doner.
  function floorCooldownSeconds(stage) {
    const container = findFloorContainer(stage) || document.querySelector('.layerInfoContainer[style*="block"]');
    const text = cleanText(container?.textContent || '').toLowerCase();
    const clock = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
    if (clock) {
      return clock[3]
        ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
        : Number(clock[1]) * 60 + Number(clock[2]);
    }
    const hours = text.match(/(\d+)\s*(?:h|sa(?:at)?)/)?.[1];
    const minutes = text.match(/(\d+)\s*(?:m|dk|dak(?:ika)?)/)?.[1];
    const seconds = text.match(/(\d+)\s*(?:s|sn|san(?:iye)?)/)?.[1];
    if (hours == null && minutes == null && seconds == null) return null;
    return Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
  }

  // GIR linkleri kattan bagimsizdir (/ancestral/show/1); sunucu girilecek kati
  // URL'deki layerId'den bilir. Kat butonuna tiklamak bunu degistirmez; bu yuzden
  // GIR'den once URL hedef kati gostermeli. (ILERI ayni kata doner.)
  function floorUrlNeedsNavigation(target) {
    const layerId = getLayerIdFromHref(location.href);
    return currentFloorPage() !== Math.ceil(target / 10) || (layerId > 0 && layerId !== target);
  }

  // Sonuc sayfasindaki ILERI ile kat sayfasina doner; kat isleyicisi orada hedef
  // kati secip GIR'e basar. ILERI bulunamazsa hedef katin URL'sine dogrudan gider.
  function goToNextFloorViaForward(next) {
    const forward = document.querySelector('a.combatBtn.combatLink[href*="ancestral/index"]');
    if (forward) {
      forward.click();
      return;
    }
    location.assign(buildFloorUrl(next));
  }

  // Hedef kati aktif edip giris butonuna tiklar.
  async function clickFloorEntry(stage) {
    await activateFloor(stage);
    const entry = floorEntryButton(stage);
    if (entry) {
      entry.click();
      return true;
    }
    return false;
  }

  async function waitForElement(selector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const el = document.querySelector(selector);
      if (el) {
        return el;
      }
      await sleep(250);
    }
    return null;
  }

  // Secili kat: gorunur (display:block) kat kartindaki gercek "Kat N" numarasi;
  // o yoksa URL'deki mutlak layerId.
  function detectSelectedStage() {
    const activeNum = floorNumberOfContainer(document.querySelector('.layerInfoContainer[style*="block"]'));
    if (activeNum) {
      return activeNum;
    }
    return getFloorFromHref(location.href) || null;
  }

  function isBattleSetupPage() {
    return !!document.querySelector('form[action*="ancestral/fight"]')
      && !!document.querySelector('.stepBtn')
      && !!document.querySelector('.enemySlot');
  }

  function isResultPage() {
    return !!document.querySelector('h1.combatResultHeader');
  }

  function isFloorPage() {
    return !isResultPage() && !!document.querySelector('.layerButtons');
  }

  function isBotEnabled() {
    return GM_getValue(BOT_ENABLED_KEY, false) === true;
  }

  function isReviveEnabled() {
    return GM_getValue(BOT_REVIVE_KEY, true) !== false;
  }

  function isReminderEnabled() {
    return GM_getValue(REMINDER_ENABLED_KEY, true) !== false;
  }

  // ---------------------------------------------------------------------------
  // Otomatik klan bagisi
  // Altin esigi asinca bot kat sayfasindan klan sayfasina gider, kutuya miktari
  // tusla tusla yazar, "Hibe et"e basar ve ayrildigi kat sayfasina geri doner.
  // Adimlar arasinda rastgele beklemeler var; akis GM'de tutulan durumla surer.
  // Esik 10-13 milyon arasindan rastgele secilir ve bagisa kadar sabit kalir;
  // esige ulasinca altinin TAMAMI bagislanir. Her bagistan sonra yeni esik cekilir.
  // ---------------------------------------------------------------------------
  const CLAN_DONATE_ENABLED_KEY = 'btClanDonateEnabled';
  const CLAN_DONATE_LAST_KEY = 'btClanDonateLastAt';
  const CLAN_DONATE_STATE_KEY = 'btClanDonateStateV1';
  const CLAN_DONATE_TARGET_KEY = 'btClanDonateTargetGold';
  const CLAN_DONATE_TRIGGER_MIN = 10000000; // esik alt siniri
  const CLAN_DONATE_TRIGGER_MAX = 13000000; // esik ust siniri
  const CLAN_DONATE_COOLDOWN_MS = 60 * 1000; // ard arda denemeleri sinirlar
  const CLAN_DONATE_STATE_TTL_MS = 5 * 60 * 1000; // yarim kalan akis bu surede iptal
  let clanDonateBusy = false;

  function isClanDonateEnabled() {
    return GM_getValue(CLAN_DONATE_ENABLED_KEY, false) === true;
  }

  // "4.483.273" / "4,483,273" -> 4483273. Okunamazsa null doner.
  function parseGoldNumber(text) {
    const digits = String(text || '').replace(/[^\d]/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) ? value : null;
  }

  // Infobar'daki div.gold icindeki ilk metin dugumu altin miktaridir.
  function getCurrentGold(root = document) {
    const goldEl = root.querySelector('div.gold');
    if (!goldEl) return null;
    for (const node of goldEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = parseGoldNumber(node.textContent);
        if (value !== null) return value;
      }
    }
    return null;
  }

  function clanIndexUrl() {
    return `${location.origin}/clan/index`;
  }

  function isClanPage() {
    return /^\/clan\//.test(location.pathname);
  }

  // Insan gibi davranmak icin adimlar arasi rastgele bekleme.
  function humanPause(minMs, maxMs) {
    return sleep(Math.round(minMs + Math.random() * (maxMs - minMs)));
  }

  function loadClanDonateState() {
    try {
      const state = JSON.parse(GM_getValue(CLAN_DONATE_STATE_KEY, '') || 'null');
      if (!state || typeof state !== 'object') return null;
      if (Date.now() - Number(state.startedAt || 0) > CLAN_DONATE_STATE_TTL_MS) {
        clearClanDonateState();
        return null;
      }
      return state;
    } catch {
      return null;
    }
  }

  function saveClanDonateState(state) {
    GM_setValue(CLAN_DONATE_STATE_KEY, JSON.stringify(state));
  }

  function clearClanDonateState() {
    GM_setValue(CLAN_DONATE_STATE_KEY, '');
  }

  // Kutuya rakamlari tek tek, degisken hizla yazar; oyunun dinledigi olaylari da
  // uretir ki elle yazilmis gibi gorunsun.
  async function typeLikeHuman(input, text) {
    input.focus();
    input.click();
    await humanPause(500, 1400);
    input.value = '';
    for (const char of String(text)) {
      input.value += char;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      // Arada bir daha uzun duraksama: tempoyu duzenli olmaktan cikarir.
      const pause = Math.random() < 0.18
        ? 700 + Math.random() * 900
        : 220 + Math.random() * 400;
      await sleep(pause);
    }
    await humanPause(300, 900);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Butonun uzerine gelip tiklama; hover olaylari da gonderilir.
  async function clickLikeHuman(el) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await humanPause(200, 600);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(40 + Math.random() * 110);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  }

  // Bagis esigi: 10-13 milyon arasi rastgele bir hedef. Bir kere secilir ve
  // bagis yapilana kadar GM'de saklanir (her turda yeniden cekilseydi esik
  // pratikte hep alt sinira yapisirdi).
  function getClanDonateTarget() {
    const stored = Number(GM_getValue(CLAN_DONATE_TARGET_KEY, 0)) || 0;
    if (stored >= CLAN_DONATE_TRIGGER_MIN && stored <= CLAN_DONATE_TRIGGER_MAX) {
      return stored;
    }
    return rollClanDonateTarget();
  }

  function rollClanDonateTarget() {
    const span = CLAN_DONATE_TRIGGER_MAX - CLAN_DONATE_TRIGGER_MIN;
    const target = Math.floor(CLAN_DONATE_TRIGGER_MIN + Math.random() * (span + 1));
    GM_setValue(CLAN_DONATE_TARGET_KEY, target);
    return target;
  }

  // Bagis akisinin sayfa basina tek adimi. Donus true ise sayfa devralindi
  // (yonlendirme yapiliyor) ve normal bot akisi bu turda calismamali.
  // Akis: kat sayfasi -> /clan/index -> kutuya yaz + Hibe et -> kat sayfasina don.
  async function handleClanDonationFlow() {
    if (clanDonateBusy) {
      return true;
    }
    const state = loadClanDonateState();

    if (isClanPage()) {
      if (!state) {
        // Kullanici klan sayfasini kendi actiysa dokunma.
        return false;
      }
      clanDonateBusy = true;
      try {
        if (state.phase === 'done') {
          // Bagis gonderildi, kat sayfasina geri donuluyor.
          clearClanDonateState();
          setBotStatus('Klan bagisi tamam, kata geri donuluyor');
          await humanPause(1500, 4000);
          location.assign(state.returnUrl);
          return true;
        }
        const input = document.querySelector('input[name="donation"]')
          || await waitForElement('input[name="donation"]', 4000);
        const button = document.querySelector('input[type="submit"][name="donate"]')
          || document.querySelector('.btn-right input[type="submit"]');
        if (!input || !button) {
          clearClanDonateState();
          setBotStatus('Klan bagisi: bagis formu bulunamadi, kata donuluyor');
          await humanPause(1000, 2500);
          location.assign(state.returnUrl);
          return true;
        }
        // Sayfayi "okuyormus" gibi kisa bir duraklama.
        await humanPause(1200, 3500);
        // Altinin tamami bagislanir; klan sayfasindaki guncel deger varsa o esas alinir.
        const pageGold = getCurrentGold();
        const amount = pageGold !== null && pageGold > 0
          ? pageGold
          : Number(state.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          clearClanDonateState();
          location.assign(state.returnUrl);
          return true;
        }
        setBotStatus(`Klan bagisi yaziliyor: ${amount.toLocaleString('tr-TR')} altin`);
        await typeLikeHuman(input, amount);
        await humanPause(600, 2200);
        saveClanDonateState({ ...state, phase: 'done', amount });
        await clickLikeHuman(button);
        // Form gonderimi sayfayi yeniden yukler; sonraki turda 'done' dalina girilir.
        return true;
      } finally {
        clanDonateBusy = false;
      }
    }

    if (state) {
      // Klan disinda beklenmedik bir sayfadayiz (yonlendirme sasmis olabilir).
      clearClanDonateState();
      if (state.returnUrl && state.returnUrl !== location.href) {
        setBotStatus('Klan bagisi akisi yarim kaldi, kata geri donuluyor');
        await humanPause(800, 2000);
        location.assign(state.returnUrl);
        return true;
      }
      return false;
    }

    if (!isClanDonateEnabled() || !isFloorPage()) {
      return false;
    }
    const gold = getCurrentGold();
    const target = getClanDonateTarget();
    if (gold === null || gold < target) {
      return false;
    }
    const lastAt = Number(GM_getValue(CLAN_DONATE_LAST_KEY, 0)) || 0;
    if (Date.now() - lastAt < CLAN_DONATE_COOLDOWN_MS) {
      return false;
    }
    GM_setValue(CLAN_DONATE_LAST_KEY, Date.now());
    // Sonraki tur icin yeni bir esik cekilir.
    rollClanDonateTarget();
    saveClanDonateState({
      phase: 'form',
      returnUrl: location.href,
      amount: gold,
      startedAt: Date.now()
    });
    setBotStatus(`Klan bagisi: altin ${gold.toLocaleString('tr-TR')} (esik ${target.toLocaleString('tr-TR')}), klan sayfasina gidiliyor`);
    await humanPause(900, 2800);
    location.assign(clanIndexUrl());
    return true;
  }

  // Oyun host'undan sunucu etiketini cikarir (ornek: "s65.bitefight.gameforge.com"
  // -> "s65"). Taninmazsa dokuman id'sinde guvenli kullanilacak sekilde host'u
  // sadelestirir.
  function reminderServerLabel() {
    // Ilk etiketteki sunucu numarasini al: "s66-tr.bitefight..." -> "s66".
    const first = String(location.host || '').split('.')[0].trim();
    const match = first.match(/^s\d+/i);
    if (match) {
      return match[0].toLowerCase();
    }
    return String(location.host || 'unknown').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'unknown';
  }

  // Bant-basi bir kat (1/11/21/31) bitince Firestore'a hatirlatma kaydi yazar.
  // Kayit dueAt (epoch ms) tasir; sunucudaki sendFloorReminders fonksiyonu vakti
  // gelince Telegram'a yollar. Dokuman id'si kat basina sabittir (floorrem_<kat>),
  // boylece ayni kat yeniden temizlenince timer bastan kurulur (oyun mantigiyla ayni).
  async function scheduleFloorReminder(floor) {
    if (!isReminderEnabled()) {
      return;
    }
    const config = FLOOR_REMINDERS.find((entry) => entry.floor === floor);
    if (!config) {
      return;
    }
    const dueAt = Date.now() + config.intervalSec * 1000;
    // Sunucu basina ayri dokuman: paralel oynanan her sunucu (s65/s66/s62...) icin
    // ayri hatirlatma tutulur; boylece biri digerinin kaydini ezmez.
    const server = reminderServerLabel();
    const docId = `floorrem_${server}_${floor}`;
    try {
      const response = await fetch(`${FIRESTORE_REMINDERS_URL}/${docId}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            floor: { integerValue: String(floor) },
            bandLabel: { stringValue: config.bandLabel },
            dueAt: { integerValue: String(dueAt) },
            intervalSec: { integerValue: String(config.intervalSec) },
            host: { stringValue: location.host },
            server: { stringValue: server },
            createdAt: { stringValue: new Date().toISOString() },
            sent: { booleanValue: false }
          }
        })
      });
      if (!response.ok) {
        console.error('Kat hatirlatmasi kaydedilemedi.', floor, await response.text());
        return;
      }
      const dueText = new Date(dueAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      setBotStatus(`Kat ${floor} tamam. Hatirlatma kuruldu: ${dueText} (${config.bandLabel} bandi)`);
    } catch (error) {
      console.error('Kat hatirlatmasi kaydedilemedi.', floor, error);
    }
  }

  // Bot calisirken ekranin kararip kapanmasini onler (Wake Lock API). Kilit sayfa
  // gecislerinde ve sekme arkaya alininca duser; bu yuzden her bot tetiginde ve
  // sayfa tekrar gorunur oldugunda yeniden alinir.
  let wakeLockSentinel = null;

  async function acquireWakeLock() {
    if (!isBotEnabled() || document.visibilityState !== 'visible') {
      return;
    }
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
      return;
    }
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return;
    }
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (error) {
      console.warn('Ekran uyanik tutulamadi.', error);
    }
  }

  function releaseWakeLock() {
    try {
      wakeLockSentinel?.release();
    } catch {
      // zaten birakilmis olabilir
    }
    wakeLockSentinel = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void acquireWakeLock();
    }
  });

  // Internet geri geldiginde ekran kilidini tekrar al. ensureOnline'in bekleme
  // donguleri zaten 2 sn'de bir baglantiyi kontrol edip kaldigi yerden devam eder.
  window.addEventListener('online', () => {
    if (isBotEnabled()) {
      void acquireWakeLock();
    }
  });

  function setBotStatus(text) {
    GM_setValue('btBotStatus', text);
    const statusEl = document.querySelector('#bt-bot-status');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function stopBot(reason) {
    GM_setValue(BOT_ENABLED_KEY, false);
    GM_setValue(AUTO_ENABLED_KEY, false);
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    setOrbFloorBusy(false);
    releaseWakeLock();
    setBotStatus(`Durdu: ${reason}`);
    renderBotPanel();
  }

  function startBot(startStage, stopStage) {
    setOrbFloorBusy(true);
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(AUTO_ENABLED_KEY, false);
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    GM_setValue(BOT_NEXT_STAGE_KEY, startStage);
    GM_setValue(BOT_STOP_STAGE_KEY, stopStage || 0);
    GM_setValue(BOT_DONE_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    GM_setValue(BOT_RECOVER_KEY, '');
    void acquireWakeLock();
    setBotStatus(`Bot basladi: Kat ${startStage}`);
    renderBotPanel();
    botTickStarted = false;
    void runBotTick();
  }

  // Sureleri yeniden kontrol et: GM'de saklanan bekleme sayaclari (bant yenilenme,
  // tur bekleme) sunucular arasinda ortak oldugundan sunucu degisince eski sunucunun
  // sureleri gecerli sanilir. Bu fonksiyon sayaclari sifirlar; oto mod acikken secilen
  // ilk kata gidip gercek sureleri bu sunucunun sayfasindan yeniden okutur ve kat
  // musaitse girer, degilse yeni sureleri kaydedip beklemeye gecer.
  function recheckFloorTimers() {
    GM_setValue(AUTO_BAND_DUE_KEY, '');
    GM_setValue(AUTO_WAIT_UNTIL_KEY, 0);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    if (isAutoEnabled()) {
      const { start } = autoFloorRange();
      GM_setValue(BOT_NEXT_STAGE_KEY, start);
      if (orbCollectionIsDue()) {
        startOrbPriorityTurn(start);
        return;
      }
      setOrbFloorBusy(true);
      setBotStatus(`Sureler sifirlandi; Kat ${start}'den bu sunucunun guncel sureleri okunuyor...`);
      location.assign(buildFloorUrl(start));
      return;
    }
    setBotStatus('Kat sureleri sifirlandi; bot baslatilinca bu sunucudaki guncel surelerle taranacak.');
    renderBotPanel();
  }

  async function handleBattlePage() {
    // Hedef kat, kat sayfasinda girilmeden hemen once GM'ye yazilir; esas o.
    // Geri linkindeki mutlak layerId, GM bos oldugunda yedek olarak kullanilir.
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0)
      || getFloorFromHref(document.querySelector('a.combatBackBtn')?.href);
    if (!stage) {
      stopBot('Kat bilgisi yok; bota kat sayfasindan basla');
      return;
    }
    GM_setValue(BOT_NEXT_STAGE_KEY, stage);

    setBotStatus(`Kat ${stage}: rakip okunuyor...`);
    const enemy = parseEnemyCountsForBot();
    if (!enemy.total) {
      stopBot(`Kat ${stage}: rakip dizilisi okunamadi`);
      return;
    }

    const pool = buildBotAllyPool();
    const maxPoints = parseBotMaxPoints() || getEmbeddedBattleCore()?.getStagePointLimit(stage) || 0;
    if (!maxPoints) {
      stopBot(`Kat ${stage}: puan limiti okunamadi`);
      return;
    }

    setBotStatus(`Kat ${stage}: cozum araniyor (puan ${maxPoints})...`);
    await sleep(150);

    let chosenMode = 'balanced';
    let outcome;
    try {
      outcome = await computeBotOutcome(stage, 'balanced', pool, enemy.counts, maxPoints);
    } catch (error) {
      stopBot(`Kat ${stage}: hesap hatasi (${error.message})`);
      return;
    }

    // Dengeli cozumun beklenen kan kaybi esigi asiyorsa hizli ve derin modlari da
    // tara; guvenli cozum veren modlar arasinda en dusuk kayipli olanla savas.
    if (isSafeBotOutcome(outcome) && Number.isFinite(getBotDecisionLoss(outcome)) && getBotDecisionLoss(outcome) > BOT_LOSS_ESCALATION_THRESHOLD) {
      const candidates = [{ mode: 'balanced', outcome }];
      for (const mode of ['fast', 'deep']) {
        if (!isBotEnabled()) {
          return;
        }
        try {
          candidates.push({ mode, outcome: await computeBotOutcome(stage, mode, pool, enemy.counts, maxPoints) });
        } catch (error) {
          console.warn(`Kat ${stage}: ${BOT_MODE_LABELS[mode] || mode} mod hesabi basarisiz, atlandi.`, error);
        }
      }
      let bestEntry = null;
      candidates.forEach((entry) => {
        if (!isSafeBotOutcome(entry.outcome) || !Number.isFinite(getBotDecisionLoss(entry.outcome))) {
          return;
        }
        if (!bestEntry || getBotDecisionLoss(entry.outcome) < getBotDecisionLoss(bestEntry.outcome)) {
          bestEntry = entry;
        }
      });
      if (bestEntry) {
        chosenMode = bestEntry.mode;
        outcome = bestEntry.outcome;
      }
    }

    const winRate = Number(outcome.winRate || 0);
    if (!isSafeBotOutcome(outcome)) {
      stopBot(`Kat ${stage}: guvenli cozum yok (kazanma %${Math.round(winRate * 100)})`);
      return;
    }

    const targets = {};
    BOT_ALLY_KEYS.forEach((key, index) => {
      const count = Number(outcome.counts?.[key] || 0);
      if (count > 0) {
        targets[index + 1] = count;
      }
    });

    const decisionLoss = getBotDecisionLoss(outcome);
    const lossNote = Number.isFinite(decisionLoss) ? `, beklenen kayip ${Math.round(decisionLoss)}` : '';
    setBotStatus(`Kat ${stage}: %${Math.round(winRate * 100)} cozum dolduruluyor (${BOT_MODE_LABELS[chosenMode] || chosenMode}${lossNote})...`);
    try {
      await createArchiveRecord('fill', { targets, preferTargets: true });
    } catch (error) {
      console.error('Otomatik arsiv kaydi olusturulamadi.', error);
    }

    await fillUnits(targets);
    if (!isBotEnabled()) {
      return;
    }

    const startBtn = document.querySelector('#fightBtn');
    if (!startBtn) {
      stopBot(`Kat ${stage}: BASLA (#fightBtn) bulunamadi`);
      return;
    }
    // Bu savas icin tas sayacini sifirla; diriltme olursa sonuc sayfasinda guncellenir.
    GM_setValue(LAST_REVIVE_STONES_KEY, '0');
    setBotStatus(`Kat ${stage}: savas baslatiliyor...`);
    await timedSleep('button');
    if (!(await ensureOnline(`Kat ${stage}`))) {
      return;
    }
    startBtn.click();
  }

  function buildBotSearchOptions(runConfig, maxPoints) {
    return {
      maxPoints,
      minimumUsedPoints: Math.max(0, Math.ceil(maxPoints * 0.75)),
      maximumUsedPoints: maxPoints,
      minimumRequiredCounts: {},
      requiredLossCounts: {},
      requiredLossExactFlags: {},
      minWinRate: getBotMinWinRate(),
      minVerifyTrials: getBotMinVerifyTrials(),
      trialCount: runConfig.trialCount,
      fullArmyTrials: runConfig.fullArmyTrials,
      beamWidth: runConfig.beamWidth,
      maxIterations: runConfig.maxIterations,
      eliteCount: runConfig.eliteCount,
      stabilityTrials: runConfig.stabilityTrials,
      baseSeed: runConfig.baseSeed,
      objective: 'min_loss',
      stoneMode: false,
      diversityMode: false,
      tekilMode: false,
      tekilV2Mode: isBotTekilV2Enabled(),
      exploratoryCandidateCount: runConfig.exploratoryCandidateCount,
      exhaustiveCandidateLimit: runConfig.exhaustiveCandidateLimit,
      timeBudgetMs: runConfig.timeBudgetMs,
      alternateBaseSeeds: runConfig.alternateBaseSeeds,
      diversityCandidateCount: runConfig.diversityCandidateCount,
      tekilCandidateCount: runConfig.tekilCandidateCount,
      knownSignatures: [],
      seedCandidates: []
    };
  }

  // Quick popup'taki "Kan Kaybi" esdegeri: temsilci savasin toplam kan kaybi,
  // o yoksa onerinin beklenen kan kaybi (optimizer.js getDisplayedRepresentativeLossValue).
  function extractBotLossValue(result, source) {
    const sample = result ? result.sampleBattle : null;
    if (sample && Number.isFinite(Number(sample.lostBloodTotal))) {
      return Number(sample.lostBloodTotal);
    }
    return source && Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null;
  }

  function isSafeBotOutcome(entry) {
    return !!entry && entry.possible && !!entry.counts && Number(entry.winRate || 0) >= getBotMinWinRate();
  }

  // Verilen modda cozum arar: once Web Worker (native hiz, UI donmaz), olmazsa
  // korumali alandaki gomulu motor. Hata durumunda throw eder.
  async function computeBotOutcome(stage, mode, pool, enemyCounts, maxPoints) {
    const searchOptions = buildBotSearchOptions(getQuickRunConfig(stage, mode), maxPoints);
    const modeLabel = BOT_MODE_LABELS[mode] || mode;
    try {
      return await computeViaWorker(pool, enemyCounts, searchOptions, (seconds) => {
        setBotStatus(`Kat ${stage}: cozum araniyor (${modeLabel})... ${seconds} sn`);
      });
    } catch (error) {
      console.warn(`Worker hesabi basarisiz (${modeLabel}), gomulu motora dusuluyor.`, error);
    }

    setBotStatus(`Kat ${stage}: cozum araniyor (${modeLabel}, yedek motor)...`);
    await sleep(150);
    const core = await loadBattleCore();
    const result = core.optimizeArmyUsage(pool, enemyCounts, searchOptions);
    const source = result.possible ? result.recommendation : null;
    return {
      possible: !!result.possible,
      counts: source ? source.counts : null,
      winRate: source ? source.winRate : 0,
      lossValue: extractBotLossValue(result, source),
      expectedLoss: source && Number.isFinite(source.expectedLostBlood) ? source.expectedLostBlood : null
    };
  }

  // Karar icin kullanilacak kayip: optimizer'in yuksek trial'li final dogrulamasindaki
  // BEKLENEN kan kaybi. lossValue tek bir ornek savastir; nadir ama agir kayiplari
  // (orn. %25 ihtimalle 365 kan) gostermez ve riskli orduyu ucuz gosterir (rapor 2251).
  function getBotDecisionLoss(outcome) {
    if (outcome && Number.isFinite(outcome.expectedLoss)) {
      return outcome.expectedLoss;
    }
    return outcome ? outcome.lossValue : null;
  }

  async function handleResultPage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    const victory = !!document.querySelector('h1.combatResultHeader.resultVictory');

    // Olen birim varsa ve panelde diriltme acik ise hayata dondur (yenilgide de
    // tas varsa kurtarmaya calis). Diriltme kapaliysa buton hic tiklanmaz.
    await reviveFallenIfNeeded(stage);
    try {
      await syncLootResultToLastArchive();
    } catch (error) {
      console.error('Diriltme sonrasi arsiv kaydi guncellenemedi.', error);
    }

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_NEXT_STAGE_KEY, stage + 1);
    // Zafer = ilerleme; girise kapali kat atlama sayacini sifirla.
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);

    // Bant-basi kat (1/11/21/31) ise bant suresi kadar sonrasi icin Telegram
    // hatirlatmasini planla (oto kat modundaki ile ayni davranis).
    await scheduleFloorReminder(stage);

    const stopStage = GM_getValue(BOT_STOP_STAGE_KEY, 0);
    if (stopStage && stage >= stopStage) {
      stopBot(`Hedef kat (${stopStage}) tamamlandi, ${done} kat gecildi`);
      return;
    }

    // ILERI kat sayfasina doner; handleFloorPage sonraki kati secip GIR'e basar.
    // Katlar arasi bekleme: saniyelik geri sayim, Durdur butonu bu sirada da calisir.
    const floorRange = loadBotTiming().floor;
    const waitSeconds = Math.max(0, Math.round(floorRange.min + Math.random() * (floorRange.max - floorRange.min)));
    for (let remaining = waitSeconds; remaining > 0; remaining -= 1) {
      if (!isBotEnabled()) {
        return;
      }
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${stage + 1} icin bekleme: ${remaining} sn`);
      await sleep(1000);
    }
    if (!isBotEnabled()) {
      return;
    }
    if (!(await ensureOnline(`Kat ${stage + 1}`))) {
      return;
    }
    goToNextFloorViaForward(stage + 1);
  }

  async function handleFloorPage() {
    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    if (!target) {
      stopBot('Hedef kat yok');
      return;
    }

    if (floorUrlNeedsNavigation(target)) {
      // Hedef kat baska dilimde ya da URL baska kati gosteriyor; hedef kata git.
      setBotStatus(`Kat ${target} aciliyor...`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${target}`))) {
        return;
      }
      location.assign(buildFloorUrl(target));
      return;
    }

    await activateFloor(target);
    const enterLink = floorEntryButton(target);
    if (!enterLink || !enterLink.classList.contains('entryAvailable')) {
      // Kat girise kapali (bekleme suresi / cooldown / acma sarti). Bota gore: durma,
      // bir sonraki kata atla ve oradan devam et. Sonsuz atlamayi onlemek icin Son kat
      // sinirina gelince ya da Son kat girilmemisken art arda 50 kat atlaninca dur.
      const stopStage = GM_getValue(BOT_STOP_STAGE_KEY, 0);
      if (stopStage && target >= stopStage) {
        stopBot(`Kat ${target}: giris kapali ve hedef kat (${stopStage}) sinirina gelindi`);
        return;
      }
      const skipCount = (GM_getValue(BOT_SKIP_COUNT_KEY, 0) || 0) + 1;
      if (!stopStage && skipCount > 50) {
        stopBot(`Kat ${target}: giris kapali; art arda 50 kat atlandi, durduruldu`);
        return;
      }
      GM_setValue(BOT_SKIP_COUNT_KEY, skipCount);
      const next = target + 1;
      GM_setValue(BOT_NEXT_STAGE_KEY, next);
      setBotStatus(`Kat ${target}: giris kapali, atlaniyor -> Kat ${next}`);
      await timedSleep('button');
      if (!(await ensureOnline(`Kat ${next}`))) {
        return;
      }
      location.assign(buildFloorUrl(next));
      return;
    }
    // Basarili giris: atlama sayacini sifirla.
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);
    setBotStatus(`Kat ${target}: giriliyor...`);
    await timedSleep('button');
    if (!(await ensureOnline(`Kat ${target}`))) {
      return;
    }
    await clickFloorEntry(target);
  }

  // Sayfa taninmayinca cagrilir: beklenen kata geri donerek toparlanir. 2 dk'lik
  // pencerede 8'den fazla toparlanma denenirse (genelde kalici bir sorun: oturum
  // kapanmis, captcha, bakim) botu durdurur ki sonsuz reload olmasin.
  async function recoverFromUnknownPage() {
    let recover = {};
    try {
      recover = JSON.parse(GM_getValue(BOT_RECOVER_KEY, '') || '{}') || {};
    } catch {
      recover = {};
    }
    const now = Date.now();
    if (!recover.ts || now - recover.ts > 120000) {
      recover = { count: 0, ts: now };
    }
    recover.count = (recover.count || 0) + 1;
    recover.ts = now;
    GM_setValue(BOT_RECOVER_KEY, JSON.stringify(recover));

    if (recover.count > 8) {
      stopBot('Sayfa surekli taninmiyor; toparlanamadi (oturum kapanmis / captcha / bakim olabilir)');
      return;
    }

    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    setBotStatus(`Sayfa taninmadi, toparlaniyor... (${recover.count}/8)`);
    await sleep(4000);
    if (!isBotEnabled()) {
      return;
    }
    if (!(await ensureOnline('Toparlanma'))) {
      return;
    }
    if (target) {
      location.assign(buildFloorUrl(target));
    } else {
      location.reload();
    }
  }

  // Oto mod beklerken kullanicinin magara, sehir, market vb. sayfalarda kalmasina
  // izin verir. Kayitli kontrol zamani gelince hedef kata otomatik doner.
  function scheduleAutoReturnFromOtherPage() {
    if (orbHasPriority()) {
      setBotStatus('Orb oncelikli calisiyor; kat botu teslimi bekliyor');
      return;
    }
    const now = Date.now();
    const waitUntil = Number(GM_getValue(AUTO_WAIT_UNTIL_KEY, 0));
    const futureDueTimes = Object.values(autoBandDueTimes())
      .map(Number)
      .filter((value) => value > now);
    const target = Number(GM_getValue(BOT_NEXT_STAGE_KEY, autoFloorRange().start));
    const nextCheckAt = waitUntil > now
      ? waitUntil
      : (target % 10 !== 1 ? now : (futureDueTimes.length ? Math.min(...futureDueTimes) : now));
    const delay = Math.max(500, Math.min(2147480000, nextCheckAt - now));
    const remaining = Math.max(0, Math.ceil((nextCheckAt - now) / 1000));
    setOrbFloorBusy(remaining <= 0, nextCheckAt);
    setBotStatus(remaining > 0
      ? `Oto mod arka planda bekliyor. Kat kontrolune ${remaining} sn kaldi`
      : 'Oto mod: kat kontrolu baslatiliyor');
    window.setTimeout(() => {
      if (!isAutoEnabled()) return;
      setOrbFloorBusy(true);
      location.assign(buildFloorUrl(target || autoFloorRange().start));
    }, delay);
  }

  async function runBotTick() {
    if (botTickStarted || !isBotEnabled()) {
      return;
    }
    botTickStarted = true;
    void acquireWakeLock();
    try {
      // Klan bagisi akisi (esik asimi / klan sayfasindaki adimlar / geri donus)
      // sayfayi devraldiysa bu turda kat isleyicilerine girme.
      if (await handleClanDonationFlow()) {
        return;
      }
      const recognized = isBattleSetupPage() || isResultPage() || isFloorPage();
      if (recognized) {
        // Bilinen bir sayfaya ulasildi; toparlanma sayacini sifirla.
        GM_setValue(BOT_RECOVER_KEY, '');
      }
      if (isBattleSetupPage()) {
        await handleBattlePage();
      } else if (isResultPage()) {
        await (isAutoEnabled() ? handleAutoResultPage() : handleResultPage());
      } else if (isFloorPage()) {
        await (isAutoEnabled() ? handleAutoFloorPage() : handleFloorPage());
      } else if (isAutoEnabled()) {
        // Normal oyun sayfasi kullanici gezintisidir; bekleme bitene kadar dokunma.
        scheduleAutoReturnFromOtherPage();
      } else if (isBotEnabled()) {
        // Bot acik ama sayfa taninmiyor: yarim yuklenmis sayfa, gecici sunucu hatasi
        // veya kisa internet kesintisinin ardindan gelen bos/hata sayfasi olabilir.
        // Kisa bekleyip beklenen kata geri donerek toparlanmayi dene. Surekli
        // basarisiz olursa (or. cikis yapilmis / captcha) durdur.
        await recoverFromUnknownPage();
      }
      // Diger durumlarda (bot kapali) dokunma; kullanici gezinmeye devam edebilir.
    } catch (error) {
      console.error('Kat botu hatasi', error);
      stopBot(`Beklenmeyen hata: ${error.message}`);
    }
  }

  // Gecici: sayfanin temizlenmis HTML'ini botDumps koleksiyonuna yollar ki buton
  // seciciler gercek DOM'a gore yazilabilsin. Oturum/sifre benzeri degerler maskelenir.
  const FIRESTORE_BOT_DUMPS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/botDumps';

  function buildPageDumpHtml() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, style, link, noscript, iframe, svg').forEach((el) => el.remove());
    let html = clone.outerHTML;
    // Olasi oturum degerlerini maskele.
    html = html.replace(/((?:sh|sid|session|sessionid|hash|token|key)=)[^&"'\s]+/gi, '$1X');
    if (html.length > 700000) {
      html = html.slice(0, 700000);
    }
    return html;
  }

  async function sendPageDump(statusEl) {
    const docId = `dump_${Date.now()}_${Math.random().toString(36).slice(2, 9) || '0'}`;
    const body = {
      fields: {
        savedAt: { stringValue: new Date().toISOString() },
        pageUrl: { stringValue: String(location.href).slice(0, 400) },
        pageTitle: { stringValue: String(document.title || '').slice(0, 160) },
        kind: { stringValue: 'bitefight-page' },
        html: { stringValue: buildPageDumpHtml() }
      }
    };
    const response = await fetch(`${FIRESTORE_BOT_DUMPS_URL}?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (statusEl) {
      statusEl.textContent = `Gonderildi: ${docId}`;
    }
    return docId;
  }

  function injectBotPanelStyles() {
    if (document.querySelector('#bt-bot-panel-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'bt-bot-panel-styles';
    style.textContent = `
      #bt-bot-panel {
        /* Boyutlandirma buyuk, dokunmatik uyumlu ozel kose tutamaciyla yapilir. */
        box-sizing: border-box;
        width: min(760px, calc(100vw - 36px));
        padding: 12px 14px 11px !important;
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        align-content: start;
        column-gap: 12px !important;
        row-gap: 8px !important;
        resize: none;
        overflow-x: hidden;
        overflow-y: auto;
        min-width: ${BOT_PANEL_MIN_WIDTH}px !important;
        min-height: ${BOT_PANEL_MIN_HEIGHT}px;
        max-width: min(${BOT_PANEL_MAX_DESKTOP_WIDTH}px, calc(100vw - 36px));
        max-height: min(720px, calc(100dvh - 44px));
        scrollbar-width: thin;
        scrollbar-color: rgba(201, 164, 109, .45) transparent;
        border: 1px solid rgba(210, 170, 115, .28) !important;
        border-radius: 16px !important;
        background:
          linear-gradient(158deg, #100a08 0%, #080604 100%),
          radial-gradient(120% 55% at 88% 8%, rgba(212, 170, 100, .10), transparent 68%) !important;
        box-shadow:
          0 22px 60px -16px rgba(0, 0, 0, .88),
          0 8px 22px rgba(0, 0, 0, .55),
          inset 0 1px 0 rgba(255, 255, 255, .06),
          inset 0 -1px 0 rgba(0, 0, 0, .4) !important;
        color: #f5e9d2 !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
      }

      .bt-panel-resize-handle {
        position: fixed;
        width: 40px;
        height: 40px;
        z-index: 100000;
        cursor: nwse-resize;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        border-radius: 14px 0 14px 0;
        background: radial-gradient(circle at 100% 100%, rgba(210, 168, 108, .18), transparent 68%);
        opacity: .72;
        transition: opacity .16s ease, background-color .16s ease;
      }

      .bt-panel-resize-handle::before,
      .bt-panel-resize-handle::after {
        content: "";
        position: absolute;
        right: 8px;
        bottom: 10px;
        width: 18px;
        height: 2px;
        border-radius: 999px;
        background: rgba(225, 190, 137, .9);
        box-shadow: 0 1px 3px rgba(0, 0, 0, .55);
        transform: rotate(-45deg);
        transform-origin: right center;
      }

      .bt-panel-resize-handle::after {
        bottom: 7px;
        width: 10px;
        opacity: .72;
      }

      .bt-panel-resize-handle:hover,
      .bt-panel-resize-handle:focus-visible,
      .bt-panel-resize-handle.is-active {
        opacity: 1;
        outline: none;
        background-color: rgba(210, 168, 108, .08);
      }

      #bt-bot-panel.is-resizing {
        border-color: rgba(225, 190, 137, .58) !important;
        box-shadow: 0 24px 68px -16px rgba(0, 0, 0, .92), 0 0 0 1px rgba(210, 168, 108, .12) !important;
      }

      #bt-bot-panel::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 2.5px;
        background: linear-gradient(180deg, #d4af77, #7a3725 72%, transparent);
        border-radius: 2px 0 0 2px;
      }

      #bt-bot-panel::-webkit-scrollbar {
        width: 7px;
      }

      #bt-bot-panel::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 999px;
        background: rgba(201, 164, 109, .42);
        background-clip: padding-box;
      }

      #bt-bot-panel .bt-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 2px 2px;
      }

      /* Bu ogeler iki sutunu da kaplar; geri kalan bolumler 2 sutuna dagilir. */
      #bt-bot-panel .bt-panel-head,
      #bt-bot-status,
      #bt-bot-panel .bt-floor-shortcuts,
      #bt-bot-panel .bt-panel-mode,
      #bt-bot-panel .bt-auto-countdowns {
        grid-column: 1 / -1 !important;
      }

      #bt-bot-panel .bt-auto-countdowns {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        padding: 7px;
        border: 1px solid rgba(210, 168, 108, .12);
        border-radius: 12px;
        background: linear-gradient(145deg, rgba(212, 168, 108, .055), rgba(255, 255, 255, .012));
      }

      #bt-bot-panel .bt-auto-countdown-card {
        min-width: 0;
        padding: 7px 8px;
        border-left: 2px solid rgba(212, 168, 108, .38);
        border-radius: 7px;
        background: rgba(0, 0, 0, .22);
      }

      #bt-bot-panel .bt-auto-countdown-card.is-ready {
        border-left-color: #5fc89a;
        background: rgba(55, 125, 91, .10);
      }

      #bt-bot-panel .bt-auto-countdown-card.bt-orb-countdown-card {
        grid-column: 1 / -1;
        border-left-color: #dca52f;
      }

      #bt-bot-panel .bt-auto-countdown-floor {
        color: #a99373;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .09em;
        text-transform: uppercase;
      }

      #bt-bot-panel .bt-auto-countdown-value {
        margin-top: 3px;
        color: #f5e9d2;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.25;
      }

      #bt-bot-panel .bt-floor-shortcuts > div:last-child {
        display: flex;
        gap: 6px;
      }

      #bt-bot-panel .bt-panel-kicker {
        color: #a38b68;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .22em;
        text-transform: uppercase;
        opacity: .85;
      }

      #bt-bot-panel .bt-panel-title {
        margin-top: 0;
        color: #f8f0d8;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: .01em;
        line-height: 1;
      }

      #bt-bot-panel .bt-panel-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #7c6350;
        box-shadow: 0 0 0 3px rgba(124, 99, 80, .16);
        border: 1px solid rgba(212, 175, 110, .22);
      }

      #bt-bot-panel .bt-panel-dot.is-active {
        background: #5fc89a;
        border-color: rgba(95, 200, 154, .35);
        box-shadow: 0 0 0 3px rgba(95, 200, 154, .12), 0 0 12px rgba(95, 200, 154, .45);
      }

      #bt-bot-status {
        max-width: none !important;
        padding: 8px 10px !important;
        border: 1px solid rgba(255, 255, 255, .045);
        border-radius: 10px;
        background: rgba(255, 255, 255, .022);
        color: #d8c7a6 !important;
        font-size: 11px !important;
        line-height: 1.38;
      }

      #bt-bot-panel input[type="number"],
      #bt-bot-panel select {
        appearance: textfield;
        -moz-appearance: textfield;
        min-width: 0;
        height: 31px;
        box-sizing: border-box;
        padding: 0 10px !important;
        border: 1px solid rgba(198, 160, 90, .28) !important;
        border-radius: 8px !important;
        outline: none;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .03), transparent),
          #18120e !important;
        color: #fff6dc !important;
        caret-color: #f1c46d;
        font: 700 12.5px/1 ui-monospace, SFMono-Regular, Consolas, monospace !important;
        text-align: left;
        letter-spacing: 0;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.04), inset 0 -1px 0 rgba(0,0,0,.32);
        transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
      }

      #bt-bot-panel input[type="number"]::-webkit-outer-spin-button,
      #bt-bot-panel input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      #bt-bot-panel input[type="number"]::placeholder {
        color: rgba(245, 233, 210, .5);
        font-weight: 600;
      }

      #bt-bot-panel input[type="number"]:focus,
      #bt-bot-panel select:focus {
        border-color: #d4af77 !important;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .04), transparent),
          #221b15 !important;
        box-shadow: 0 0 0 3px rgba(212, 175, 110, .10), inset 0 1px 0 rgba(255,255,255,.05);
      }

      #bt-bot-panel select {
        height: 31px;
        font-size: 12.5px !important;
        color: #f5e9d2 !important;
      }

      #bt-bot-panel button,
      #bt-filler-actions button {
        min-height: 33px;
        border: 1px solid rgba(210, 168, 108, .42) !important;
        border-radius: 9px !important;
        background: linear-gradient(155deg, #4f1c18, #2f100d) !important;
        color: #f4e6c3 !important;
        font-family: inherit !important;
        font-weight: 700 !important;
        letter-spacing: .008em;
        box-shadow: 0 8px 18px rgba(0, 0, 0, .52), inset 0 1px 0 rgba(255, 255, 255, .06) !important;
        transition: transform .14s cubic-bezier(.2,.0,.1,1), filter .14s ease, border-color .14s ease;
      }

      #bt-bot-panel button:hover,
      #bt-filler-actions button:hover {
        filter: brightness(1.1) saturate(1.02);
        border-color: #d4af77 !important;
        transform: translateY(-1px);
        box-shadow: 0 11px 24px rgba(0, 0, 0, .56), inset 0 1px 0 rgba(255, 255, 255, .08) !important;
      }

      #bt-bot-panel button:active,
      #bt-filler-actions button:active {
        transform: translateY(0) scale(.985);
        filter: brightness(.95);
      }

      #bt-bot-panel button:focus-visible,
      #bt-filler-actions button:focus-visible {
        outline: 2px solid rgba(212, 175, 110, .2);
        outline-offset: 1px;
      }

      #bt-bot-panel .bt-auto-button {
        border-color: rgba(82, 158, 112, .48) !important;
        background: linear-gradient(155deg, #1a3f2e, #0f241a) !important;
        box-shadow: 0 8px 18px rgba(0, 0, 0, .52), inset 0 1px 0 rgba(255, 255, 255, .07) !important;
      }

      #bt-bot-panel .bt-settings-header {
        min-height: 22px;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #c9a46d !important;
        font-weight: 700 !important;
        font-size: 11px !important;
      }

      #bt-bot-panel .bt-settings-header:hover {
        filter: none;
        transform: none;
        color: #ddb97e !important;
      }

      #bt-bot-panel .bt-secondary-button {
        border-color: rgba(255, 255, 255, .09) !important;
        background: rgba(255, 255, 255, .035) !important;
        color: #c8b49a !important;
        box-shadow: none !important;
      }

      #bt-bot-panel .bt-panel-mode {
        color: #d4af77 !important;
        font-size: 10.5px !important;
        letter-spacing: .025em;
        font-weight: 600;
      }

      #bt-bot-panel .bt-panel-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        gap: 5px !important;
      }

      #bt-bot-panel .bt-panel-row input {
        width: 100% !important;
      }

      #bt-bot-panel .bt-panel-section {
        margin-top: 0 !important;
        padding: 8px !important;
        gap: 6px !important;
        border: 1px solid rgba(255, 255, 255, .04) !important;
        border-radius: 10px;
        background: linear-gradient(145deg, rgba(255, 255, 255, .022), rgba(255, 255, 255, .008));
      }

      #bt-bot-panel .bt-panel-section label {
        justify-content: space-between;
        color: #c8b49a !important;
        line-height: 1.25;
        font-size: 11px;
      }

      #bt-bot-panel .bt-panel-section label span:first-child {
        flex: 1;
      }

      #bt-bot-panel .bt-inline-field {
        display: grid !important;
        grid-template-columns: minmax(68px, 1fr) 56px 56px;
        align-items: center;
        gap: 6px !important;
      }

      #bt-bot-panel .bt-small-number {
        width: 56px !important;
      }

      #bt-bot-panel .bt-unit-limit-grid {
        display: grid !important;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px !important;
      }

      #bt-bot-panel .bt-unit-limit-grid > label {
        min-width: 0;
      }

      #bt-bot-panel .bt-unit-limit-input {
        width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box;
        padding: 0 4px !important;
        text-align: center;
      }

      #bt-bot-panel .bt-timing-inputs {
        display: grid !important;
        grid-template-columns: 56px auto 56px;
        align-items: center;
        gap: 5px !important;
      }

      #bt-bot-panel .bt-panel-section .bt-timing-label {
        color: #d8c6a6 !important;
        font-size: 10.5px !important;
      }

      #bt-bot-panel .bt-panel-toggle {
        padding: 2px 1px;
        color: #c8b49a !important;
        font-size: 11px !important;
      }

      #bt-bot-panel input[type="checkbox"] {
        width: 15px;
        height: 15px;
        accent-color: #c9a36a !important;
        border-radius: 3px;
      }

      #bt-filler-actions {
        padding: 6px;
        border: 1px solid rgba(210, 168, 108, .18);
        border-radius: 12px;
        background: rgba(16, 10, 7, .94);
        box-shadow: 0 16px 42px rgba(0, 0, 0, .6), inset 0 1px 0 rgba(255,255,255,.035);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      #bt-filler-actions button {
        padding: 8px 14px !important;
        font-size: 11.5px !important;
        min-height: 30px;
      }

      #bt-filler-actions button.is-loading {
        background: linear-gradient(155deg, #6c421a, #3f2a12) !important;
      }

      #bt-filler-actions button.is-success {
        border-color: rgba(82, 158, 112, .48) !important;
        background: linear-gradient(155deg, #1a3f2e, #0f241a) !important;
      }

      /* Panel kendi genisligine gore yeniden dizilir (ekran degil, panel olcusu).
         Kullanici kenardan daralttikca JS bu sinifi ekler -> tek sutun + kompakt. */
      #bt-bot-panel.is-narrow {
        grid-template-columns: 1fr !important;
        column-gap: 0 !important;
        row-gap: 6px !important;
        padding: 9px 11px 8px !important;
      }

      #bt-bot-panel.is-narrow .bt-panel-title {
        font-size: 16px;
      }

      #bt-bot-panel.is-narrow input[type="number"],
      #bt-bot-panel.is-narrow select {
        height: 29px !important;
        font-size: 11.5px !important;
      }

      #bt-bot-panel.is-narrow button,
      #bt-bot-panel.is-narrow #bt-filler-actions button {
        min-height: 30px;
      }

      #bt-bot-panel.is-narrow .bt-panel-section {
        padding: 7px !important;
        gap: 4px !important;
      }

      #bt-bot-panel.is-narrow .bt-floor-shortcuts > div:last-child {
        flex-wrap: wrap;
      }

      #bt-bot-panel.is-narrow .bt-auto-countdowns {
        grid-template-columns: 1fr 1fr;
      }

      @media (max-width: 720px) {
        #bt-bot-panel {
          grid-template-columns: 1fr 1fr !important;
          width: min(560px, calc(100vw - 16px)) !important;
          max-width: calc(100vw - 16px);
        }
      }

      @media (max-width: 520px) {
        #bt-bot-panel {
          left: 8px !important;
          bottom: 8px !important;
          width: min(340px, calc(100vw - 16px)) !important;
          grid-template-columns: 1fr !important;
          max-height: 54vh;
          max-height: min(440px, 54dvh);
          padding: 8px 10px 7px !important;
          row-gap: 5px !important;
          overflow-y: auto;
          overscroll-behavior: contain;
          border-radius: 12px !important;
        }

        .bt-panel-resize-handle {
          width: 48px;
          height: 48px;
        }

        #bt-bot-panel.has-custom-size {
          max-height: min(720px, calc(100dvh - 16px));
        }

        #bt-bot-panel .bt-panel-kicker {
          font-size: 8px;
          letter-spacing: .18em;
        }

        #bt-bot-panel .bt-panel-title {
          font-size: 16px;
        }

        #bt-bot-status {
          padding: 6px 8px !important;
          font-size: 10px !important;
          line-height: 1.3;
        }

        #bt-bot-panel input[type="number"],
        #bt-bot-panel select {
          height: 28px !important;
          padding: 0 8px !important;
          font-size: 11.5px !important;
          border-radius: 7px !important;
        }

        #bt-bot-panel button,
        #bt-filler-actions button {
          min-height: 30px;
        }

        #bt-bot-panel .bt-panel-section {
          padding: 6px !important;
          gap: 4px !important;
          border-radius: 8px;
        }

        #bt-bot-panel .bt-inline-field {
          grid-template-columns: minmax(64px, 1fr) 52px 52px;
          gap: 5px !important;
        }

        #bt-bot-panel .bt-small-number {
          width: 52px !important;
        }

        #bt-bot-panel .bt-auto-countdowns {
          grid-template-columns: 1fr 1fr;
          padding: 5px;
        }

        #bt-bot-panel .bt-timing-inputs {
          grid-template-columns: 52px auto 52px;
          gap: 4px !important;
        }

        #bt-bot-panel .bt-settings-header {
          min-height: 20px;
          font-size: 10.5px !important;
        }

        #bt-filler-actions {
          right: 8px !important;
          bottom: 8px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Panel simge durumundayken gosterilen kucuk yuvarlak buton.
  function renderBotPanelMinimized() {
    const icon = document.createElement('button');
    icon.id = 'bt-bot-panel-mini';
    icon.type = 'button';
    icon.title = 'Kat botu panelini ac';
    icon.textContent = '⚔';
    icon.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'left:20px',
      'z-index:99999',
      'width:38px',
      'height:38px',
      'border-radius:50%',
      'background:#100a08',
      `border:1.5px solid ${isBotEnabled() ? '#5fc89a' : '#d4af77'}`,
      'color:#d4af77',
      'font-size:17px',
      'cursor:pointer',
      'box-shadow:0 6px 16px rgba(0,0,0,0.7)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:0'
    ].join(';');
    icon.onclick = () => {
      setBotPanelMinimized(false);
      renderBotPanel();
    };
    document.body.appendChild(icon);
  }

  let autoCountdownTimer = 0;

  // Oto ayar girdilerini depodaki guncel degerlerle esitleyen kanca. Panel her
  // cizimde yeniden atanir; bot calisirken veya panel yokken null kalir. Amac:
  // bfcache'ten donen ya da arka planda beklemis bir panelin bayat degerleri
  // gostermesini (ve sonraki kayitta depoyu bu bayat degerlerle ezmesini) onlemek.
  let refreshAutoPanelInputs = null;

  function formatAutoCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} dk ${String(seconds).padStart(2, '0')} sn sonra girilecek`;
  }

  function formatOrbCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }

  function appendAutoCountdowns(panel) {
    if (!isAutoEnabled()) return;
    const selectedRange = autoFloorRange();
    const wrap = document.createElement('section');
    wrap.className = 'bt-auto-countdowns';
    wrap.setAttribute('aria-label', 'Kat grubu giris zamanlari');
    const cards = [];

    for (let band = 0; band < 4; band += 1) {
      const floorStart = band * 10 + 1;
      const floorEnd = floorStart + 9;
      if (floorEnd < selectedRange.start || floorStart > selectedRange.end) continue;
      const card = document.createElement('div');
      card.className = 'bt-auto-countdown-card';
      const floor = document.createElement('div');
      floor.className = 'bt-auto-countdown-floor';
      floor.textContent = `Kat ${Math.max(floorStart, selectedRange.start)}-${Math.min(floorEnd, selectedRange.end)}`;
      const value = document.createElement('div');
      value.className = 'bt-auto-countdown-value';
      card.append(floor, value);
      wrap.appendChild(card);
      cards.push({ card, value, band });
    }

    const orbCard = document.createElement('div');
    orbCard.className = 'bt-auto-countdown-card bt-orb-countdown-card';
    const orbLabel = document.createElement('div');
    orbLabel.className = 'bt-auto-countdown-floor';
    orbLabel.textContent = 'Kure toplamaya';
    const orbValue = document.createElement('div');
    orbValue.className = 'bt-auto-countdown-value';
    orbCard.append(orbLabel, orbValue);
    wrap.appendChild(orbCard);

    const update = () => {
      const due = autoBandDueTimes();
      cards.forEach(({ card, value, band }) => {
        const dueAt = Number(due[band] || 0);
        const remaining = dueAt - Date.now();
        card.classList.toggle('is-ready', dueAt > 0 && remaining <= 0);
        if (!dueAt) {
          value.textContent = 'Ilk kontrol bekleniyor';
        } else if (remaining <= 0) {
          value.textContent = 'Simdi kontrol ediliyor';
        } else {
          value.textContent = formatAutoCountdown(remaining);
        }
      });
      try {
        const orb = JSON.parse(localStorage.getItem('BFOrbSettings') || '{}');
        const collectAt = Number(orb.orbCollectAt || 0);
        if (orb.running !== true) {
          orbValue.textContent = 'Orb botu kapali';
          orbCard.classList.remove('is-ready');
        } else if (collectAt > Date.now()) {
          orbValue.textContent = formatOrbCountdown(collectAt - Date.now());
          orbCard.classList.remove('is-ready');
        } else {
          orbValue.textContent = 'Hazir - ilk uygun anda kontrol edilecek';
          orbCard.classList.add('is-ready');
        }
      } catch {
        orbValue.textContent = 'Orb zamani okunamadi';
        orbCard.classList.remove('is-ready');
      }
    };

    update();
    panel.appendChild(wrap);
    autoCountdownTimer = window.setInterval(update, 1000);
  }

  function renderBotPanel() {
    injectBotPanelStyles();
    refreshAutoPanelInputs = null;
    if (autoCountdownTimer) {
      window.clearInterval(autoCountdownTimer);
      autoCountdownTimer = 0;
    }
    const existing = document.querySelector('#bt-bot-panel');
    if (existing) {
      existing.remove();
    }
    const existingMini = document.querySelector('#bt-bot-panel-mini');
    if (existingMini) {
      existingMini.remove();
    }
    const existingResizeHandle = document.querySelector('#bt-bot-panel-resize-handle');
    if (existingResizeHandle) {
      existingResizeHandle.remove();
    }
    if (!isBattleSetupPage() && !isResultPage() && !isFloorPage() && !isBotEnabled()) {
      return;
    }
    if (isBotPanelMinimized()) {
      renderBotPanelMinimized();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'bt-bot-panel';
    panel.style.cssText = [
      'position:fixed',
      'bottom:22px',
      'left:22px',
      'z-index:99999'
    ].join(';');

    const panelHead = document.createElement('div');
    panelHead.className = 'bt-panel-head';
    const panelHeading = document.createElement('div');
    const panelKicker = document.createElement('div');
    panelKicker.className = 'bt-panel-kicker';
    panelKicker.textContent = `BiteFight otomasyon v${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || '?'}`;
    const panelTitle = document.createElement('div');
    panelTitle.className = 'bt-panel-title';
    panelTitle.textContent = 'Kat Kontrolü';
    panelHeading.append(panelKicker, panelTitle);
    const panelDot = document.createElement('span');
    panelDot.className = `bt-panel-dot${isBotEnabled() ? ' is-active' : ''}`;
    panelDot.title = isBotEnabled() ? 'Bot aktif' : 'Bot beklemede';
    const headControls = document.createElement('div');
    headControls.style.cssText = 'display:flex;align-items:center;gap:8px';
    const minimizeBtn = document.createElement('button');
    minimizeBtn.type = 'button';
    minimizeBtn.title = 'Simge durumuna kucult';
    minimizeBtn.textContent = '–';
    minimizeBtn.style.cssText = 'background:transparent;border:none;color:#c9a46d;font-size:18px;line-height:1;cursor:pointer;padding:0 3px;box-shadow:none';
    minimizeBtn.onclick = () => {
      setBotPanelMinimized(true);
      renderBotPanel();
    };
    headControls.append(panelDot, minimizeBtn);
    panelHead.append(panelHeading, headControls);
    panel.appendChild(panelHead);

    const status = document.createElement('div');
    status.id = 'bt-bot-status';
    status.style.cssText = 'color:#d8c7a6;font-size:11px';
    status.textContent = GM_getValue('btBotStatus', 'Kat botu hazir');
    panel.appendChild(status);

    appendAutoCountdowns(panel);

    appendFloorShortcuts(panel);

    const recheckBtn = buildActionButton('Sureleri yeniden kontrol et', 'padding:6px 12px;font-size:12px;background:#1a2f4f');
    recheckBtn.title = 'Kayitli bekleme sayaclarini sifirlar ve kat surelerini bu sunucudan yeniden okur (sunucu degistirince kullan)';
    recheckBtn.onclick = () => {
      recheckFloorTimers();
    };
    panel.appendChild(recheckBtn);

    if (isBotEnabled()) {
      const modeLabel = document.createElement('div');
      modeLabel.className = 'bt-panel-mode';
      modeLabel.style.cssText = 'color:#ffd700;font-size:12px;font-weight:bold';
      modeLabel.textContent = isAutoEnabled() ? '⟳ Oto kat modu aktif' : '▶ Manuel kat botu aktif';
      panel.appendChild(modeLabel);

      const stopBtn = buildActionButton(isAutoEnabled() ? 'Oto Modu Durdur' : 'Botu Durdur', 'padding:8px 14px;font-size:13px');
      stopBtn.onclick = () => {
        stopBot('kullanici durdurdu');
      };
      panel.appendChild(stopBtn);
    } else {
      const startWrap = document.createElement('div');
      startWrap.className = 'bt-panel-section bt-start-section';
      startWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

      const row = document.createElement('div');
      row.className = 'bt-panel-row';
      row.style.cssText = 'display:flex;gap:6px;align-items:center';

      const startInput = document.createElement('input');
      startInput.type = 'number';
      startInput.min = '1';
      startInput.placeholder = 'Kat';
      startInput.style.cssText = 'width:100%';
      const detected = detectSelectedStage() || GM_getValue(BOT_NEXT_STAGE_KEY, 0);
      if (detected) {
        startInput.value = String(detected);
      }

      const stopInput = document.createElement('input');
      stopInput.type = 'number';
      stopInput.min = '0';
      stopInput.placeholder = 'Son kat';
      stopInput.title = 'Varsayilan: icinde bulunulan onluk dilimin sonu (or. 23 -> 30)';
      stopInput.style.cssText = startInput.style.cssText;

      // Son kat varsayilani: baslangic katinin onluk dilim sonu (23->30, 31->40, 1->10).
      // Baslangic degistikce otomatik guncellenir; kullanici sonradan elle degistirebilir.
      const blockEndOf = (stage) => Math.ceil(stage / 10) * 10;
      const syncStopToStart = () => {
        const startStage = Number.parseInt(startInput.value, 10);
        stopInput.value = Number.isInteger(startStage) && startStage > 0 ? String(blockEndOf(startStage)) : '';
      };
      syncStopToStart();
      startInput.addEventListener('input', syncStopToStart);

      row.appendChild(startInput);
      row.appendChild(stopInput);
      startWrap.appendChild(row);

      const startBtn = buildActionButton('Botu Baslat', 'padding:6px 12px;font-size:12px');
      startBtn.onclick = () => {
        const startStage = Number.parseInt(startInput.value, 10);
        if (!Number.isInteger(startStage) || startStage < 1) {
          setBotStatus('Gecerli bir baslangic kati gir');
          return;
        }
        const stopStage = Number.parseInt(stopInput.value, 10);
        startBot(startStage, Number.isInteger(stopStage) && stopStage > 0 ? stopStage : 0);
      };
      startWrap.appendChild(startBtn);
      panel.appendChild(startWrap);

      // --- Oto kat modu ---
      const autoWrap = document.createElement('div');
      autoWrap.className = 'bt-panel-section';
      autoWrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:4px';

      const savedAutoRange = autoFloorRange();
      const autoFloorRow = document.createElement('label');
      autoFloorRow.className = 'bt-inline-field';
      autoFloorRow.style.cssText = 'display:flex;gap:4px;align-items:center;color:#c8b49a;font-size:10.5px';
      const autoFloorText = document.createElement('span');
      autoFloorText.textContent = 'Kat araligi:';
      const autoStartInput = document.createElement('input');
      autoStartInput.type = 'number';
      autoStartInput.min = String(AUTO_MIN_FLOOR);
      autoStartInput.max = String(AUTO_MAX_FLOOR);
      autoStartInput.value = String(savedAutoRange.start);
      autoStartInput.title = 'Oto taramanin baslayacagi kat';
      autoStartInput.className = 'bt-small-number';
      autoStartInput.style.cssText = '';
      const autoEndInput = document.createElement('input');
      autoEndInput.type = 'number';
      autoEndInput.min = String(AUTO_MIN_FLOOR);
      autoEndInput.max = String(AUTO_MAX_FLOOR);
      autoEndInput.value = String(savedAutoRange.end);
      autoEndInput.title = 'Oto taramanin bitecegi kat';
      autoEndInput.style.cssText = autoStartInput.style.cssText;
      autoEndInput.className = autoStartInput.className;
      autoFloorRow.append(autoFloorText, autoStartInput, autoEndInput);
      autoWrap.appendChild(autoFloorRow);

      const activeHours = autoActiveHours();
      const autoHoursRow = document.createElement('label');
      autoHoursRow.className = 'bt-inline-field';
      autoHoursRow.style.cssText = autoFloorRow.style.cssText;
      const autoHoursText = document.createElement('span');
      autoHoursText.textContent = 'Istanbul saati:';
      const autoHoursStartInput = document.createElement('input');
      autoHoursStartInput.type = 'time';
      autoHoursStartInput.value = activeHours.start;
      autoHoursStartInput.style.cssText = 'width:76px';
      const autoHoursEndInput = document.createElement('input');
      autoHoursEndInput.type = 'time';
      autoHoursEndInput.value = activeHours.end;
      autoHoursEndInput.style.cssText = autoHoursStartInput.style.cssText;
      const autoHoursExtraText = document.createElement('span');
      autoHoursExtraText.textContent = '+dk:';
      const autoHoursExtraInput = document.createElement('input');
      autoHoursExtraInput.type = 'number';
      autoHoursExtraInput.min = '0';
      autoHoursExtraInput.max = '180';
      autoHoursExtraInput.step = '1';
      autoHoursExtraInput.className = 'bt-small-number';
      autoHoursExtraInput.value = String(autoActiveExtraMinutes());
      autoHoursExtraInput.title = 'Baslama ve bitis saatine gunluk 0-bu deger dk arasi rastgele sure eklenir (or. 10 -> 07:02 yerine 07:02-07:12 arasi baslar). 0 = kapali';
      autoHoursRow.append(autoHoursText, autoHoursStartInput, autoHoursEndInput, autoHoursExtraText, autoHoursExtraInput);
      autoWrap.appendChild(autoHoursRow);

      const savedBandRanges = autoBandRanges();
      const bandInputs = [];
      savedBandRanges.forEach((range, index) => {
        const bandStart = index * 10 + 1;
        const bandRow = document.createElement('label');
        bandRow.className = 'bt-inline-field';
        bandRow.style.cssText = autoFloorRow.style.cssText;
        const bandText = document.createElement('span');
        bandText.textContent = `${bandStart}-${bandStart + 9} yenilenme sonrasi (dk):`;
        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.min = '1';
        minInput.value = String(range.min);
        minInput.className = 'bt-small-number';
        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.min = '1';
        maxInput.value = String(range.max);
        maxInput.className = 'bt-small-number';
        bandInputs.push({ minInput, maxInput });
        bandRow.append(bandText, minInput, maxInput);
        autoWrap.appendChild(bandRow);
      });

      const autoIntervalRow = document.createElement('label');
      autoIntervalRow.className = 'bt-inline-field';
      autoIntervalRow.style.cssText = 'display:flex;gap:4px;align-items:center;color:#c8b49a;font-size:10.5px';
      const autoIntervalText = document.createElement('span');
      autoIntervalText.textContent = 'Yeniden deneme (sn):';
      const savedAutoInterval = autoIntervalRange();
      const autoIntervalMinInput = document.createElement('input');
      autoIntervalMinInput.type = 'number';
      autoIntervalMinInput.min = String(AUTO_MIN_INTERVAL_SEC);
      autoIntervalMinInput.step = '1';
      autoIntervalMinInput.className = 'bt-small-number';
      autoIntervalMinInput.style.cssText = '';
      autoIntervalMinInput.value = String(savedAutoInterval.min);
      autoIntervalMinInput.title = 'En az beklenecek saniye';
      const autoIntervalMaxInput = document.createElement('input');
      autoIntervalMaxInput.type = 'number';
      autoIntervalMaxInput.min = String(AUTO_MIN_INTERVAL_SEC);
      autoIntervalMaxInput.step = '1';
      autoIntervalMaxInput.style.cssText = autoIntervalMinInput.style.cssText;
      autoIntervalMaxInput.className = autoIntervalMinInput.className;
      autoIntervalMaxInput.value = String(savedAutoInterval.max);
      autoIntervalMaxInput.title = 'En fazla beklenecek saniye';
      autoIntervalRow.append(autoIntervalText, autoIntervalMinInput, autoIntervalMaxInput);
      autoWrap.appendChild(autoIntervalRow);

      // Oto ayarlarini degisiklik aninda ALAN BAZINDA kaydet. Eski surum her tus
      // vurusunda TUM alanlari girdilerden okuyup yaziyordu; panel bayatsa
      // (bfcache'ten geri donus, ikinci sekme, yeniden cizim) diger alanlarin
      // eski degerleri depoyu eziyordu. Ayrica yalnizca eski tekil anahtarlara
      // yazip snapshot'i guncellemedigi icin panel yeniden cizilince yazilanlar
      // geri donuyordu (okuma snapshot'i tercih eder). Simdi her dinleyici
      // sadece kendi alanini dogrular ve guncel snapshot'in ustune isler.
      const persistAutoField = (field) => {
        const patch = {};
        if (field === 'floors') {
          const autoStart = Number.parseInt(autoStartInput.value, 10);
          const autoEnd = Number.parseInt(autoEndInput.value, 10);
          if (!Number.isInteger(autoStart) || !Number.isInteger(autoEnd)
            || autoStart < AUTO_MIN_FLOOR || autoEnd > AUTO_MAX_FLOOR || autoStart > autoEnd) return;
          GM_setValue(AUTO_START_FLOOR_KEY, autoStart);
          GM_setValue(AUTO_END_FLOOR_KEY, autoEnd);
          patch.start = autoStart;
          patch.end = autoEnd;
        } else if (field === 'hours') {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursStartInput.value)
            || !/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursEndInput.value)) return;
          GM_setValue(AUTO_ACTIVE_START_KEY, autoHoursStartInput.value);
          GM_setValue(AUTO_ACTIVE_END_KEY, autoHoursEndInput.value);
          patch.activeStart = autoHoursStartInput.value;
          patch.activeEnd = autoHoursEndInput.value;
        } else if (field === 'extra') {
          const extraMinutes = Number.parseInt(autoHoursExtraInput.value, 10);
          if (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 180) return;
          GM_setValue(AUTO_ACTIVE_EXTRA_KEY, extraMinutes);
          patch.activeExtra = extraMinutes;
        } else if (field === 'interval') {
          const intervalMin = Number.parseInt(autoIntervalMinInput.value, 10);
          const intervalMax = Number.parseInt(autoIntervalMaxInput.value, 10);
          if (!Number.isInteger(intervalMin) || !Number.isInteger(intervalMax)
            || intervalMin < AUTO_MIN_INTERVAL_SEC || intervalMin > intervalMax) return;
          GM_setValue(AUTO_INTERVAL_MIN_KEY, intervalMin);
          GM_setValue(AUTO_INTERVAL_MAX_KEY, intervalMax);
          patch.intervalMin = intervalMin;
          patch.intervalMax = intervalMax;
        } else if (typeof field === 'number') {
          const { minInput, maxInput } = bandInputs[field];
          const min = Number.parseInt(minInput.value, 10);
          const max = Number.parseInt(maxInput.value, 10);
          if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) return;
          // Diger bantlari depodaki guncel degerlerinden al; yalnizca duzenlenen
          // banti degistir. Boylece bayat girdiler diger bantlari ezemez.
          const merged = autoBandRanges();
          merged[field] = { min, max };
          GM_setValue(AUTO_BAND_RANGES_KEY, JSON.stringify(merged));
          patch.bandRanges = merged;
        }
        saveAutoSettingsSnapshot({ ...autoSettingsSnapshot(), ...patch });
      };
      const bindPersist = (input, field) => {
        // 'change' blur bekler; panel bot akisinda her an yeniden cizilebildigi
        // icin yazilan deger blur'dan once kaybolabiliyordu. 'input' ile her tus
        // vurusunda kaydet (gecersiz ara degerler persistAutoField'da elenir).
        input.addEventListener('change', () => persistAutoField(field));
        input.addEventListener('input', () => persistAutoField(field));
      };
      bindPersist(autoStartInput, 'floors');
      bindPersist(autoEndInput, 'floors');
      bindPersist(autoHoursStartInput, 'hours');
      bindPersist(autoHoursEndInput, 'hours');
      bindPersist(autoHoursExtraInput, 'extra');
      bindPersist(autoIntervalMinInput, 'interval');
      bindPersist(autoIntervalMaxInput, 'interval');
      bandInputs.forEach(({ minInput, maxInput }, index) => {
        bindPersist(minInput, index);
        bindPersist(maxInput, index);
      });

      // Panel gorunur olunca girdileri depodaki guncel degerlerle esitle.
      // Kullanici panel icinde yaziyorsa dokunma; yazilani ezmeyelim.
      refreshAutoPanelInputs = () => {
        const active = document.activeElement;
        if (active && panel.contains(active)) return;
        const range = autoFloorRange();
        autoStartInput.value = String(range.start);
        autoEndInput.value = String(range.end);
        const hours = autoActiveHours();
        autoHoursStartInput.value = hours.start;
        autoHoursEndInput.value = hours.end;
        autoHoursExtraInput.value = String(autoActiveExtraMinutes());
        autoBandRanges().forEach((band, index) => {
          bandInputs[index].minInput.value = String(band.min);
          bandInputs[index].maxInput.value = String(band.max);
        });
        const interval = autoIntervalRange();
        autoIntervalMinInput.value = String(interval.min);
        autoIntervalMaxInput.value = String(interval.max);
      };

      // Tum oto ayarlarini dogrulayip GM'e yazar. Gecersiz alan varsa durum
      // mesajiyla bildirir ve null doner; gecerliyse {start, end} doner.
      const saveAutoSettingsFromInputs = () => {
        const autoStart = Number.parseInt(autoStartInput.value, 10);
        const autoEnd = Number.parseInt(autoEndInput.value, 10);
        if (!Number.isInteger(autoStart) || !Number.isInteger(autoEnd)
          || autoStart < AUTO_MIN_FLOOR || autoEnd > AUTO_MAX_FLOOR || autoStart > autoEnd) {
          setBotStatus(`Oto kat araligi ${AUTO_MIN_FLOOR}-${AUTO_MAX_FLOOR} icinde ve baslangic bitisten kucuk olmali`);
          return null;
        }
        const intervalMin = Number.parseInt(autoIntervalMinInput.value, 10);
        const intervalMax = Number.parseInt(autoIntervalMaxInput.value, 10);
        if (!Number.isInteger(intervalMin) || !Number.isInteger(intervalMax)
          || intervalMin < AUTO_MIN_INTERVAL_SEC || intervalMin > intervalMax) {
          setBotStatus(`Yeniden deneme araligi en az ${AUTO_MIN_INTERVAL_SEC} sn olmali ve minimum maksimumdan buyuk olmamali`);
          return null;
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursStartInput.value)
          || !/^([01]\d|2[0-3]):[0-5]\d$/.test(autoHoursEndInput.value)) {
          setBotStatus('Gecerli Istanbul baslangic ve bitis saati gir');
          return null;
        }
        const bandRanges = bandInputs.map(({ minInput, maxInput }) => ({
          min: Number.parseInt(minInput.value, 10), max: Number.parseInt(maxInput.value, 10)
        }));
        if (bandRanges.some((range) => !Number.isInteger(range.min) || !Number.isInteger(range.max)
          || range.min < 1 || range.min > range.max)) {
          setBotStatus('Kat grubu beklemelerinde minimum 1 dk olmali ve maksimum minimumdan kucuk olmamali');
          return null;
        }
        const extraMinutes = Number.parseInt(autoHoursExtraInput.value, 10);
        GM_setValue(AUTO_START_FLOOR_KEY, autoStart);
        GM_setValue(AUTO_END_FLOOR_KEY, autoEnd);
        GM_setValue(AUTO_INTERVAL_MIN_KEY, intervalMin);
        GM_setValue(AUTO_INTERVAL_MAX_KEY, intervalMax);
        GM_setValue(AUTO_ACTIVE_START_KEY, autoHoursStartInput.value);
        GM_setValue(AUTO_ACTIVE_END_KEY, autoHoursEndInput.value);
        GM_setValue(AUTO_ACTIVE_EXTRA_KEY, Number.isInteger(extraMinutes) && extraMinutes >= 0 && extraMinutes <= 180 ? extraMinutes : 0);
        GM_setValue(AUTO_BAND_RANGES_KEY, JSON.stringify(bandRanges));
        // Guncel snapshot'in ustune isle: formda olmayan/ileride eklenecek
        // alanlar kaybolmasin, baska sekmenin yazdiklari silinmesin.
        saveAutoSettingsSnapshot({
          ...autoSettingsSnapshot(),
          start: autoStart,
          end: autoEnd,
          intervalMin,
          intervalMax,
          activeStart: autoHoursStartInput.value,
          activeEnd: autoHoursEndInput.value,
          activeExtra: Number.isInteger(extraMinutes) && extraMinutes >= 0 && extraMinutes <= 180 ? extraMinutes : 0,
          bandRanges
        });
        return { start: autoStart, end: autoEnd };
      };

      const saveBtn = buildActionButton('Ayarlari Kaydet', 'padding:6px 12px;font-size:12px');
      saveBtn.title = 'Yukaridaki oto kat ayarlarini botu baslatmadan kaydeder';
      saveBtn.onclick = () => {
        const saved = saveAutoSettingsFromInputs();
        if (saved) {
          setBotStatus(`Oto kat ayarlari kaydedildi (kat ${saved.start}-${saved.end})`);
        }
      };
      autoWrap.appendChild(saveBtn);

      const autoBtn = buildActionButton('Oto Kat Modu Baslat', 'padding:6px 12px;font-size:12px;background:#0a3a1a');
      autoBtn.classList.add('bt-auto-button');
      autoBtn.title = 'Secilen kat araligini sirayla tarar; girilebilen katlari tamamlar, tur bitince bekleyip ilk kattan tekrar dener';
      autoBtn.onclick = () => {
        const saved = saveAutoSettingsFromInputs();
        if (!saved) {
          return;
        }
        startAuto(saved.start, saved.end);
      };
      autoWrap.appendChild(autoBtn);
      panel.appendChild(autoWrap);
    }

    const reviveRow = document.createElement('label');
    reviveRow.className = 'bt-panel-toggle';
    reviveRow.style.cssText = 'display:flex;gap:5px;align-items:center;color:#c8b49a;font-size:11px;cursor:pointer';
    const reviveCheckbox = document.createElement('input');
    reviveCheckbox.type = 'checkbox';
    reviveCheckbox.checked = isReviveEnabled();
    reviveCheckbox.style.cssText = 'accent-color:#ffd700;margin:0';
    reviveCheckbox.onchange = () => {
      GM_setValue(BOT_REVIVE_KEY, reviveCheckbox.checked);
      setBotStatus(reviveCheckbox.checked
        ? 'Olen birimler hayata dondurulecek'
        : 'Diriltme kapali: olenler dondurulmeden devam edilecek');
    };
    const reviveLabel = document.createElement('span');
    reviveLabel.textContent = 'Olen birimleri hayata dondur';
    reviveRow.append(reviveCheckbox, reviveLabel);
    panel.appendChild(reviveRow);

    const reminderRow = document.createElement('label');
    reminderRow.className = 'bt-panel-toggle';
    reminderRow.style.cssText = 'display:flex;gap:5px;align-items:center;color:#c8b49a;font-size:11px;cursor:pointer';
    const reminderCheckbox = document.createElement('input');
    reminderCheckbox.type = 'checkbox';
    reminderCheckbox.checked = isReminderEnabled();
    reminderCheckbox.style.cssText = 'accent-color:#ffd700;margin:0';
    reminderCheckbox.onchange = () => {
      GM_setValue(REMINDER_ENABLED_KEY, reminderCheckbox.checked);
      setBotStatus(reminderCheckbox.checked
        ? 'Kat suresi dolunca Telegram bildirimi gonderilecek (kat 1/11/21/31)'
        : 'Kat suresi bildirimi kapali');
    };
    const reminderLabel = document.createElement('span');
    reminderLabel.textContent = 'Kat suresi dolunca Telegram bildirimi';
    reminderRow.append(reminderCheckbox, reminderLabel);
    panel.appendChild(reminderRow);

    const donateRow = document.createElement('label');
    donateRow.className = 'bt-panel-toggle';
    donateRow.style.cssText = 'display:flex;gap:5px;align-items:center;color:#c8b49a;font-size:11px;cursor:pointer';
    donateRow.title = 'Altin 10-13 milyon arasindan secilen rastgele esige ulasinca altinin tamamini klan kasasina bagislar; bot durmadan devam eder';
    const donateCheckbox = document.createElement('input');
    donateCheckbox.type = 'checkbox';
    donateCheckbox.checked = isClanDonateEnabled();
    donateCheckbox.style.cssText = 'accent-color:#ffd700;margin:0';
    donateCheckbox.onchange = () => {
      GM_setValue(CLAN_DONATE_ENABLED_KEY, donateCheckbox.checked);
      setBotStatus(donateCheckbox.checked
        ? 'Oto klan bagisi acik: 10-13M arasi esige ulasinca altinin tamami bagislanacak'
        : 'Oto klan bagisi kapali');
      if (!donateCheckbox.checked) {
        clearClanDonateState();
      }
    };
    const donateLabel = document.createElement('span');
    donateLabel.textContent = 'Oto klan bagisi (10-13M esik, tamami)';
    donateRow.append(donateCheckbox, donateLabel);
    panel.appendChild(donateRow);

    appendWinRateSetting(panel);
    appendTekilV2Setting(panel);
    appendTimingSettings(panel);

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'bt-bot-panel-resize-handle';
    resizeHandle.className = 'bt-panel-resize-handle';
    resizeHandle.tabIndex = 0;
    resizeHandle.setAttribute('role', 'button');
    resizeHandle.setAttribute('aria-label', 'Paneli yeniden boyutlandir');
    resizeHandle.title = 'Surukleyerek paneli boyutlandir';

    document.body.appendChild(panel);
    document.body.appendChild(resizeHandle);
    applyAndTrackPanelSize(panel);
    enableBotPanelResize(panel, resizeHandle);
  }

  // Panelin kendi genisligine gore tek/cift sutun yerlesimini ayarlar.
  function updateBotPanelDensity(panel, width) {
    panel.classList.toggle('is-narrow', width > 0 && width < BOT_PANEL_NARROW_WIDTH);
  }

  function enableBotPanelResize(panel, handle) {
    let dragState = null;
    let animationFrame = 0;
    let pendingSize = null;

    const updateHandlePosition = () => {
      const rect = panel.getBoundingClientRect();
      handle.style.left = `${Math.round(rect.right - handle.offsetWidth)}px`;
      handle.style.top = `${Math.round(rect.bottom - handle.offsetHeight)}px`;
    };

    const limits = () => {
      const rect = panel.getBoundingClientRect();
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 520;
      const maxWidth = Math.max(1, Math.min(BOT_PANEL_MAX_DESKTOP_WIDTH, window.innerWidth - rect.left - 8));
      const maxHeight = Math.max(1, Math.min(720, rect.bottom - 8));
      return {
        minWidth: Math.min(coarsePointer ? BOT_PANEL_TOUCH_MIN_WIDTH : BOT_PANEL_MIN_WIDTH, maxWidth),
        minHeight: Math.min(BOT_PANEL_MIN_HEIGHT, maxHeight),
        maxWidth,
        maxHeight
      };
    };

    const applySize = (size) => {
      panel.classList.add('has-custom-size');
      panel.style.setProperty('width', `${Math.round(size.width)}px`, 'important');
      panel.style.height = `${Math.round(size.height)}px`;
      updateBotPanelDensity(panel, size.width);
      updateHandlePosition();
    };

    const scheduleSize = (size) => {
      pendingSize = size;
      if (animationFrame) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        if (pendingSize) {
          applySize(pendingSize);
          pendingSize = null;
        }
      });
    };

    const finishResize = (event) => {
      if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) {
        return;
      }
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      if (pendingSize) {
        applySize(pendingSize);
        pendingSize = null;
      }
      try {
        if (typeof handle.releasePointerCapture === 'function') {
          handle.releasePointerCapture(dragState.pointerId);
        }
      } catch {
        // Pointer yakalama tarayici tarafindan zaten sonlandirilmis olabilir.
      }
      dragState = null;
      panel.classList.remove('is-resizing');
      handle.classList.remove('is-active');
      const rect = panel.getBoundingClientRect();
      setBotPanelSize(rect.width, rect.height);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
        height: rect.height
      };
      if (typeof handle.setPointerCapture === 'function') {
        handle.setPointerCapture(event.pointerId);
      }
      panel.classList.add('is-resizing');
      handle.classList.add('is-active');
    });

    handle.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      event.preventDefault();
      const currentLimits = limits();
      scheduleSize({
        width: Math.min(currentLimits.maxWidth, Math.max(currentLimits.minWidth, dragState.width + event.clientX - dragState.startX)),
        height: Math.min(currentLimits.maxHeight, Math.max(currentLimits.minHeight, dragState.height - event.clientY + dragState.startY))
      });
    });

    handle.addEventListener('pointerup', finishResize);
    handle.addEventListener('pointercancel', finishResize);

    handle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const currentLimits = limits();
      const step = event.shiftKey ? 32 : 12;
      const widthDelta = event.key === 'ArrowLeft' ? -step : (event.key === 'ArrowRight' ? step : 0);
      const heightDelta = event.key === 'ArrowUp' ? step : (event.key === 'ArrowDown' ? -step : 0);
      applySize({
        width: Math.min(currentLimits.maxWidth, Math.max(currentLimits.minWidth, rect.width + widthDelta)),
        height: Math.min(currentLimits.maxHeight, Math.max(currentLimits.minHeight, rect.height + heightDelta))
      });
      const finalRect = panel.getBoundingClientRect();
      setBotPanelSize(finalRect.width, finalRect.height);
    });

    updateHandlePosition();
    if (typeof ResizeObserver === 'function') {
      const positionObserver = new ResizeObserver(updateHandlePosition);
      positionObserver.observe(panel);
    }
  }

  // Kayitli genislik+yuksekligi uygular ve kullanicinin kenardan yaptigi
  // yeniden boyutlandirmayi (iki yonde de) saklar. Sayfa gecislerinde son
  // boyut korunur; boylece her seferinde yeniden ayarlamak gerekmez.
  function applyAndTrackPanelSize(panel) {
    const saved = getBotPanelSize();
    const viewportWidthLimit = Math.max(BOT_PANEL_MIN_WIDTH, window.innerWidth - 36);
    if (saved.width >= BOT_PANEL_MIN_WIDTH) {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 520;
      const minimumWidth = Math.min(coarsePointer ? BOT_PANEL_TOUCH_MIN_WIDTH : BOT_PANEL_MIN_WIDTH, viewportWidthLimit);
      const width = Math.max(minimumWidth, Math.min(saved.width, BOT_PANEL_MAX_DESKTOP_WIDTH, viewportWidthLimit));
      panel.style.setProperty('width', `${width}px`, 'important');
      updateBotPanelDensity(panel, width);
    }
    if (saved.height >= BOT_PANEL_MIN_HEIGHT) {
      const viewportHeightLimit = Math.max(BOT_PANEL_MIN_HEIGHT, window.innerHeight - 44);
      const height = Math.min(saved.height, viewportHeightLimit);
      panel.classList.add('has-custom-size');
      panel.style.height = `${height}px`;
    }
    if (typeof ResizeObserver !== 'function') {
      return;
    }
    let saveTimer = 0;
    // Acilis sirasindaki yerlesim oturana kadarki olcumleri kaydetme; yalnizca
    // kullanicinin kenardan cekmesiyle olusan gercek boyut degisimlerini sakla.
    const mountedAt = Date.now();
    const observer = new ResizeObserver(() => {
      const rect = panel.getBoundingClientRect();
      // Sutun yerlesimini aninda guncelle (kaydetmeden bagimsiz).
      updateBotPanelDensity(panel, rect.width);
      if (Date.now() - mountedAt < 800) {
        return;
      }
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      // Kullanici tutup birakana kadar bekle, sonra son boyutu kaydet.
      saveTimer = setTimeout(() => {
        const finalRect = panel.getBoundingClientRect();
        if (finalRect.width >= BOT_PANEL_MIN_WIDTH) {
          const width = Math.min(finalRect.width, BOT_PANEL_MAX_DESKTOP_WIDTH);
          // Yukseklik yalnizca kullanici elle ayarlamissa (inline stil varsa) kaydedilir;
          // aksi halde icerige gore degisen yukseklik sabitlenmesin diye 0 saklanir.
          const userSetHeight = panel.style.height ? finalRect.height : 0;
          setBotPanelSize(width, userSetHeight);
        }
      }, 320);
    });
    observer.observe(panel);
  }

  // Panele "Kazanma orani" secimi ekler: bot yalnizca bu oranin uzerindeki
  // (guvenli) cozumleri doldurur. Hazir kademeler + elle giris.
  function appendWinRateSetting(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:4px';

    const label = document.createElement('span');
    label.textContent = 'Kazanma orani (min)';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:center';

    const select = document.createElement('select');
    select.style.cssText = 'flex:1;height:31px;padding:0 8px;border-radius:8px;border:1px solid rgba(210,168,108,.35);background:#18120e;color:#f5e9d2;font-size:11.5px';
    BOT_WIN_RATE_PRESETS.forEach((percent) => {
      const option = document.createElement('option');
      option.value = String(percent);
      option.textContent = percent === 99.5 ? '%99.5 (varsayilan)' : `%${percent}`;
      select.appendChild(option);
    });
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Ozel';
    select.appendChild(customOption);

    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = '1';
    customInput.max = '100';
    customInput.step = '0.1';
    customInput.className = 'bt-small-number';
    customInput.style.cssText = 'width:52px';

    const currentPercent = Math.round(getBotMinWinRate() * 1000) / 10;
    const matchedPreset = BOT_WIN_RATE_PRESETS.find((percent) => Math.abs(percent - currentPercent) < 1e-6);
    if (matchedPreset !== undefined) {
      select.value = String(matchedPreset);
      customInput.value = String(matchedPreset);
      customInput.style.display = 'none';
    } else {
      select.value = 'custom';
      customInput.value = String(currentPercent);
      customInput.style.display = '';
    }

    const applyPercent = (percent) => {
      if (!Number.isFinite(percent)) {
        return;
      }
      const clamped = Math.min(100, Math.max(1, percent));
      setBotMinWinRate(clamped / 100);
      setBotStatus(`Kazanma orani esigi %${clamped} olarak ayarlandi`);
    };

    select.onchange = () => {
      if (select.value === 'custom') {
        customInput.style.display = '';
        applyPercent(Number(customInput.value));
      } else {
        customInput.style.display = 'none';
        customInput.value = select.value;
        applyPercent(Number(select.value));
      }
    };
    customInput.onchange = () => {
      applyPercent(Number(customInput.value));
    };

    row.append(select, customInput);
    wrap.append(label, row);
    panel.appendChild(wrap);
  }

  function appendTekilV2Setting(panel) {
    const wrap = document.createElement('label');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;align-items:center;gap:6px;cursor:pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isBotTekilV2Enabled();
    checkbox.style.cssText = 'width:14px;height:14px;accent-color:#c9a46d;cursor:pointer';

    const label = document.createElement('span');
    label.textContent = 'Tekil v2 modu';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';
    label.title = 'Acikken arama, kayip desenini oncelikli kiyaslar (quick.html Tekil v2 esdegeri). Kapatirsan duz en-az-kayip aramasi yapilir.';

    checkbox.onchange = () => {
      const enabled = setBotTekilV2Enabled(checkbox.checked);
      setBotStatus(`Tekil v2 modu ${enabled ? 'acildi' : 'kapatildi'}`);
    };

    wrap.append(checkbox, label);
    panel.appendChild(wrap);
  }

  // Panele acilip kapanan "Bekleme Ayarlari" bolumu: her parametre icin min-max (sn).
  function appendTimingSettings(panel) {
    const timing = loadBotTiming();
    const unitLimits = loadBotUnitLimits();
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(210,168,108,.18);padding-top:5px;margin-top:1px;display:flex;flex-direction:column;gap:5px';

    const isOpen = () => GM_getValue(BOT_SETTINGS_OPEN_KEY, false) === true;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'bt-settings-header';
    header.style.cssText = 'background:transparent;border:none;color:#c9a46d;font-size:11px;font-weight:700;cursor:pointer;padding:0;display:flex;align-items:center;gap:4px;width:100%;text-align:left';

    const body = document.createElement('div');
    body.style.cssText = 'flex-direction:column;gap:5px';

    const inputStyle = '';
    const fieldInputs = {};
    BOT_TIMING_FIELDS.forEach((field) => {
      const fieldRow = document.createElement('div');
      fieldRow.style.cssText = 'display:flex;flex-direction:column;gap:2px';

      const label = document.createElement('span');
      label.textContent = `${field.label} (sn)`;
      label.className = 'bt-timing-label';
      label.style.cssText = 'color:#d8c6a6;font-size:10px';

      const inputs = document.createElement('div');
      inputs.className = 'bt-timing-inputs';
      inputs.style.cssText = 'display:flex;gap:4px;align-items:center';

      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.min = '0';
      minInput.step = '0.1';
      minInput.className = 'bt-small-number';
      minInput.style.cssText = inputStyle;
      minInput.value = String(timing[field.key].min);

      const sep = document.createElement('span');
      sep.textContent = '-';
      sep.style.cssText = 'color:#ffd700';

      const maxInput = document.createElement('input');
      maxInput.type = 'number';
      maxInput.min = '0';
      maxInput.step = '0.1';
      maxInput.className = 'bt-small-number';
      maxInput.style.cssText = inputStyle;
      maxInput.value = String(timing[field.key].max);

      inputs.append(minInput, sep, maxInput);
      fieldRow.append(label, inputs);
      body.appendChild(fieldRow);
      fieldInputs[field.key] = { minInput, maxInput };
    });

    const unitLimitsLabel = document.createElement('span');
    unitLimitsLabel.textContent = 'Kullanilabilecek birlik limiti';
    unitLimitsLabel.style.cssText = 'color:#d8c6a6;font-size:10px;margin-top:3px';
    body.appendChild(unitLimitsLabel);

    const unitLimitGrid = document.createElement('div');
    unitLimitGrid.className = 'bt-unit-limit-grid';
    const unitLimitInputs = [];
    BOT_UNIT_LIMIT_DEFAULTS.forEach((fallback, index) => {
      const field = document.createElement('label');
      field.style.cssText = 'display:flex;flex-direction:column;gap:2px;color:#c8b49a;font-size:9.5px';
      const caption = document.createElement('span');
      caption.textContent = `T${index + 1}`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.className = 'bt-unit-limit-input';
      input.value = String(unitLimits[index] ?? fallback);
      input.title = `Bot T${index + 1} biriminden en fazla bu kadar kullanabilir`;
      field.append(caption, input);
      unitLimitGrid.appendChild(field);
      unitLimitInputs.push(input);
    });
    body.appendChild(unitLimitGrid);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px';
    const saveBtn = buildActionButton('Kaydet', 'padding:5px 10px;font-size:11px');
    const resetBtn = buildActionButton('Varsayilan', 'padding:5px 10px;font-size:11px;background:#3a0a0a');
    resetBtn.classList.add('bt-secondary-button');
    actions.append(saveBtn, resetBtn);
    body.appendChild(actions);

    const syncHeader = () => {
      header.textContent = `${isOpen() ? '▾' : '▸'} Bekleme Ayarlari`;
      body.style.display = isOpen() ? 'flex' : 'none';
    };
    syncHeader();

    header.onclick = () => {
      GM_setValue(BOT_SETTINGS_OPEN_KEY, !isOpen());
      syncHeader();
    };

    saveBtn.onclick = () => {
      const next = {};
      BOT_TIMING_FIELDS.forEach((field) => {
        let min = Number(fieldInputs[field.key].minInput.value);
        let max = Number(fieldInputs[field.key].maxInput.value);
        if (!Number.isFinite(min) || min < 0) {
          min = field.min;
        }
        if (!Number.isFinite(max) || max < 0) {
          max = field.max;
        }
        if (min > max) {
          [min, max] = [max, min];
        }
        next[field.key] = { min, max };
      });
      saveBotTiming(next);
      saveBotUnitLimits(unitLimitInputs.map((input, index) => {
        const value = Number(input.value);
        return Number.isInteger(value) && value >= 0 ? value : BOT_UNIT_LIMIT_DEFAULTS[index];
      }));
      GM_setValue(BOT_SETTINGS_OPEN_KEY, false);
      setBotStatus('Bekleme ayarlari ve birlik limitleri kaydedildi');
      renderBotPanel();
    };

    resetBtn.onclick = () => {
      BOT_TIMING_FIELDS.forEach((field) => {
        fieldInputs[field.key].minInput.value = String(field.min);
        fieldInputs[field.key].maxInput.value = String(field.max);
      });
      BOT_UNIT_LIMIT_DEFAULTS.forEach((value, index) => {
        unitLimitInputs[index].value = String(value);
      });
    };

    wrap.append(header, body);
    panel.appendChild(wrap);
  }
  // ====================== /KAT BOTU ======================

  // Panele kat 1 / 11 / 21 / 31'e hizli gecis baglantilari ekler (yan yana).
  // Tiklayinca ilgili katin sayfasina gider (buildFloorUrl ile dogru page+layerId).
  function appendFloorShortcuts(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section bt-floor-shortcuts';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    const label = document.createElement('span');
    label.textContent = 'Katlara git';
    label.style.cssText = 'color:#c8b49a;font-size:10.5px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';

    [1, 11, 21, 31].forEach((stage) => {
      const link = document.createElement('a');
      link.href = buildFloorUrl(stage);
      link.textContent = `Kat ${stage}`;
      link.title = `Kat ${stage} sayfasina git`;
      link.style.cssText = [
        'flex:1',
        'text-align:center',
        'background:#18120e',
        'color:#f4e6c3',
        'border:1px solid rgba(210,168,108,.42)',
        'padding:6px 4px',
        'border-radius:9px',
        'font-size:11.5px',
        'font-weight:700',
        'cursor:pointer',
        'text-decoration:none',
        'white-space:nowrap'
      ].join(';');
      row.appendChild(link);
    });

    wrap.append(label, row);
    panel.appendChild(wrap);
  }

  function buildActionButton(label, extraStyle) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = [
      'background:#4f1c18',
      'color:#f4e6c3',
      'border:1px solid rgba(210,168,108,.42)',
      'padding:6px 12px',
      'border-radius:9px',
      'font-size:12px',
      'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 6px 14px rgba(0,0,0,.5)',
      extraStyle || ''
    ].join(';');
    return button;
  }

  function injectButtons() {
    if (document.querySelector('#bt-filler-actions')) return;
    if (!document.querySelector('.stepBtn')) return;
    injectBotPanelStyles();

    const panel = document.createElement('div');
    panel.id = 'bt-filler-actions';
    panel.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:99999',
      'display:flex',
      'gap:10px',
      'align-items:center'
    ].join(';');

    const fillBtn = buildActionButton('BT Doldur', '');
    fillBtn.id = 'bt-filler-btn';

    fillBtn.onclick = async () => {
      const raw = GM_getValue('btUnits', null);
      if (!raw) {
        fillBtn.textContent = 'Veri yok! bt-analiz ac';
        setTimeout(() => {
          fillBtn.textContent = 'BT Doldur';
        }, 2500);
        return;
      }

      const targets = JSON.parse(raw);
      fillBtn.textContent = 'Dolduruluyor...';
      fillBtn.classList.add('is-loading');
      fillBtn.style.background = '#8a4b00';
      fillBtn.style.borderColor = '#ffd27a';
      fillBtn.style.color = '#fff4db';
      fillBtn.disabled = true;

      // Manuel doldurmada harcanan tas otomatik takip edilmez; arsivde "-" gosterilsin.
      GM_setValue(LAST_REVIVE_STONES_KEY, '');

      try {
        await createArchiveRecord('fill', { targets, preferTargets: true });
      } catch (error) {
        console.error('Otomatik arsiv kaydi olusturulamadi.', error);
      }

      await fillUnits(targets);

      fillBtn.textContent = 'Tamamlandi!';
      fillBtn.classList.remove('is-loading');
      fillBtn.classList.add('is-success');
      fillBtn.style.background = '#1a6b2a';
      setTimeout(() => {
        fillBtn.textContent = 'BT Doldur';
        fillBtn.classList.remove('is-success');
        fillBtn.style.background = '#6b0000';
        fillBtn.disabled = false;
      }, 3000);
    };

    panel.appendChild(fillBtn);
    document.body.appendChild(panel);
  }

  function watchLootPage() {
    let syncTimer = 0;
    const attemptSync = async () => {
      try {
        await syncLootResultToLastArchive();
      } catch (error) {
        console.error(error);
      }
    };
    const scheduleSync = () => {
      window.clearTimeout(syncTimer);
      // Sonuc sayfasi kademeli yuklenebiliyor; botun #showReviveBtn'i gorup
      // harcanan tasi yazmasina firsat vermeden arsivi "0" ile kapatma.
      syncTimer = window.setTimeout(attemptSync, 1200);
    };

    if (document.querySelector('.lootItemsDiv')) {
      scheduleSync();
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector('.lootItemsDiv')) {
        return;
      }
      scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  injectButtons();
  watchFightSubmission();
  watchLootPage();
  new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });

  // Sekme one gelince / bfcache'ten geri donunce oto ayar girdilerini depoyla
  // esitle: bot gezinirken ya da baska sekmede kaydedilen degerler, bayat
  // girdiler uzerinden bir sonraki kayitta ezilmesin.
  window.addEventListener('pageshow', () => { refreshAutoPanelInputs?.(); });
  window.addEventListener('focus', () => { refreshAutoPanelInputs?.(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAutoPanelInputs?.();
  });

  // Kat botu: panel + sayfa yerlestikten sonra tek tetik.
  window.setTimeout(() => {
    try {
      renderBotPanel();
    } catch (error) {
      console.error('Kat botu paneli kurulamadi', error);
    }
    void runBotTick();
  }, 700);
})();
