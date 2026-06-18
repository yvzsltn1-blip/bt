// ==UserScript==
// @name         Oto Birlik Doldurucu v3
// @namespace    https://bt-analiz.web.app
// @version      4.1
// @description  Birlik Doldurucu'nun oto-kat surumu: secilen araliktaki katlari sirayla tarar, girilebilenleri tamamlar ve tur sonunda ayarlanan sure kadar bekler
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
// @updateURL    https://bt-analiz.web.app/otobirlik.user.js
// @downloadURL  https://bt-analiz.web.app/otobirlik.user.js
// @require      https://bt-analiz.web.app/battle-core.js?v=2.2
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
    'cehennem ucurumu': 'T8'
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

  function readReviveStoneText() {
    const raw = GM_getValue(LAST_REVIVE_STONES_KEY, '');
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

  async function syncLootResultToLastArchive() {
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
  // Panel simge durumuna kucululdu mu (kullanici tercihi, GM'de saklanir).
  const BOT_PANEL_MINIMIZED_KEY = 'btBotPanelMinimized';
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
  const AUTO_DEFAULT_INTERVAL_SEC = 180;
  const AUTO_MIN_INTERVAL_SEC = 10;
  const AUTO_MIN_FLOOR = 1;
  const AUTO_MAX_FLOOR = 40;

  function isAutoEnabled() {
    return GM_getValue(AUTO_ENABLED_KEY, false) === true;
  }

  function autoIntervalRange() {
    const legacy = Number(GM_getValue(AUTO_INTERVAL_KEY, AUTO_DEFAULT_INTERVAL_SEC));
    const fallback = Number.isFinite(legacy) && legacy >= AUTO_MIN_INTERVAL_SEC
      ? Math.round(legacy)
      : AUTO_DEFAULT_INTERVAL_SEC;
    const savedMin = Number(GM_getValue(AUTO_INTERVAL_MIN_KEY, fallback));
    const savedMax = Number(GM_getValue(AUTO_INTERVAL_MAX_KEY, fallback));
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

  function autoFloorRange() {
    const savedStart = Number(GM_getValue(AUTO_START_FLOOR_KEY, AUTO_MIN_FLOOR));
    const savedEnd = Number(GM_getValue(AUTO_END_FLOOR_KEY, AUTO_MAX_FLOOR));
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
    location.assign(buildFloorUrl(start));
  }

  function startAuto(startFloor, endFloor) {
    GM_setValue(AUTO_START_FLOOR_KEY, startFloor);
    GM_setValue(AUTO_END_FLOOR_KEY, endFloor);
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
    const reviveOpener = isReviveEnabled() ? document.querySelector('#showReviveBtn') : null;
    if (!reviveOpener) {
      return;
    }
    // Diriltme maliyeti butonda gosterilir (or. "-1"). Senkron yarisini onlemek icin
    // tasi diriltmeden once yaz; bakiye degisirse gercek harcama sonra guncellenir.
    const reviveCost = Math.abs(parseQtyValue(reviveOpener.querySelector('span')?.textContent) || 0);
    const balanceBefore = parseDigits(document.querySelector('#devil_stone_balance')?.textContent);
    GM_setValue(LAST_REVIVE_STONES_KEY, String(reviveCost));

    setBotStatus(`Kat ${stage}: olen birimler hayata donduruluyor...`);
    await timedSleep('button');
    reviveOpener.click();
    const confirmBtn = await waitForElement('.revivePopUpActivated #reviveBtn', 5000)
      || document.querySelector('#reviveBtn');
    if (confirmBtn) {
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
    const waitUntil = GM_getValue(AUTO_WAIT_UNTIL_KEY, 0);
    if (waitUntil && Date.now() < waitUntil) {
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
      GM_setValue(BOT_NEXT_STAGE_KEY, start);
      if (!(await ensureOnline('Yeniden deneme'))) {
        return;
      }
      // Guncel girilebilirlik icin secilen ilk kati tazele.
      location.assign(buildFloorUrl(start));
      return;
    }

    const savedTarget = Number(GM_getValue(BOT_NEXT_STAGE_KEY, start));
    const target = savedTarget >= start && savedTarget <= end ? savedTarget : start;
    const targetPage = Math.ceil(target / 10);
    // Dogru 10'luk dilimde miyiz? (Kart numaralarina gore.) Degilse o dilime git.
    if (currentFloorPage() !== targetPage) {
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

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);

    if (stage >= end) {
      const waitSeconds = randomAutoIntervalSeconds();
      setBotStatus(`Kat ${stage} tamam (${done} kat). Kat ${start}-${end} taramasi bitti, ${waitSeconds} sn sonra Kat ${start}'den tekrar`);
      beginAutoWait(waitSeconds);
      return;
    }

    const next = stage + 1;
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
    location.assign(buildFloorUrl(next));
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

  function loadBotTiming() {
    let stored = {};
    try {
      stored = JSON.parse(GM_getValue(BOT_TIMING_KEY, '') || '{}') || {};
    } catch {
      stored = {};
    }
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
      lossValue
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
    return Object.fromEntries(BOT_ALLY_KEYS.map((key, index) => {
      const tier = index + 1;
      if (!openTiers.has(tier)) {
        return [key, 0];
      }
      return [key, tier === 8 ? 1 : 99];
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
    releaseWakeLock();
    setBotStatus(`Durdu: ${reason}`);
    renderBotPanel();
  }

  function startBot(startStage, stopStage) {
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
    if (isSafeBotOutcome(outcome) && Number.isFinite(outcome.lossValue) && outcome.lossValue > BOT_LOSS_ESCALATION_THRESHOLD) {
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
        if (!isSafeBotOutcome(entry.outcome) || !Number.isFinite(entry.outcome.lossValue)) {
          return;
        }
        if (!bestEntry || entry.outcome.lossValue < bestEntry.outcome.lossValue) {
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

    const lossNote = Number.isFinite(outcome.lossValue) ? `, kayip ${Math.round(outcome.lossValue)}` : '';
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
      roundingMode: 'legacy',
      stoneMode: false,
      diversityMode: false,
      tekilMode: false,
      tekilV2Mode: true,
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
      lossValue: extractBotLossValue(result, source)
    };
  }

  async function handleResultPage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    const victory = !!document.querySelector('h1.combatResultHeader.resultVictory');

    // Olen birim varsa ve panelde diriltme acik ise hayata dondur (yenilgide de
    // tas varsa kurtarmaya calis). Diriltme kapaliysa buton hic tiklanmaz.
    await reviveFallenIfNeeded(stage);

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_NEXT_STAGE_KEY, stage + 1);
    // Zafer = ilerleme; girise kapali kat atlama sayacini sifirla.
    GM_setValue(BOT_SKIP_COUNT_KEY, 0);

    const stopStage = GM_getValue(BOT_STOP_STAGE_KEY, 0);
    if (stopStage && stage >= stopStage) {
      stopBot(`Hedef kat (${stopStage}) tamamlandi, ${done} kat gecildi`);
      return;
    }

    // Ileri linki ayni kata doner; bot sonraki katin sayfasina dogrudan gider.
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
    location.assign(buildFloorUrl(stage + 1));
  }

  async function handleFloorPage() {
    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    if (!target) {
      stopBot('Hedef kat yok');
      return;
    }

    const targetPage = Math.ceil(target / 10);
    if (currentFloorPage() !== targetPage) {
      // Hedef kat baska bir 10'luk dilimde; o dilime git.
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

  async function runBotTick() {
    if (botTickStarted || !isBotEnabled()) {
      return;
    }
    botTickStarted = true;
    void acquireWakeLock();
    try {
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
        width: min(300px, calc(100vw - 28px)) !important;
        min-width: 0 !important;
        padding: 18px 18px 16px !important;
        gap: 13px !important;
        overflow: hidden;
        border: 1px solid rgba(212, 175, 110, .35) !important;
        border-radius: 20px !important;
        background:
          linear-gradient(152deg, rgba(18, 11, 9, .97), rgba(11, 7, 5, .97)),
          radial-gradient(115% 70% at 92% 12%, rgba(198, 140, 72, .13), transparent 60%) !important;
        box-shadow:
          0 28px 75px -18px rgba(0, 0, 0, .78),
          0 12px 28px rgba(0, 0, 0, .5),
          inset 0 1px 0 rgba(255, 255, 255, .07),
          inset 0 -1px 0 rgba(0, 0, 0, .35) !important;
        color: #f5e9d2 !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      #bt-bot-panel::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3.5px;
        background: linear-gradient(180deg, #d4af77, #8a3c28 68%, transparent);
        border-radius: 3px 0 0 3px;
      }

      #bt-bot-panel .bt-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #bt-bot-panel .bt-panel-kicker {
        color: #a38b68;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .2em;
        text-transform: uppercase;
        opacity: .9;
      }

      #bt-bot-panel .bt-panel-title {
        margin-top: 1px;
        color: #f8f0d8;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 21px;
        font-weight: 700;
        letter-spacing: .005em;
        line-height: 1;
      }

      #bt-bot-panel .bt-panel-dot {
        width: 10px;
        height: 10px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #7c6350;
        box-shadow: 0 0 0 4px rgba(124, 99, 80, .18);
        border: 1px solid rgba(212, 175, 110, .25);
      }

      #bt-bot-panel .bt-panel-dot.is-active {
        background: #5fc89a;
        border-color: rgba(95, 200, 154, .4);
        box-shadow: 0 0 0 4px rgba(95, 200, 154, .14), 0 0 18px rgba(95, 200, 154, .5);
      }

      #bt-bot-status {
        max-width: none !important;
        padding: 12px 14px !important;
        border: 1px solid rgba(255, 255, 255, .055);
        border-radius: 14px;
        background: rgba(255, 255, 255, .028);
        color: #d8c7a6 !important;
        font-size: 11.5px !important;
        line-height: 1.48;
      }

      #bt-bot-panel input[type="number"] {
        appearance: textfield;
        -moz-appearance: textfield;
        min-width: 0;
        height: 38px;
        box-sizing: border-box;
        padding: 0 13px !important;
        border: 1px solid rgba(198, 160, 90, .32) !important;
        border-radius: 10px !important;
        outline: none;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .035), transparent),
          #211a13 !important;
        color: #fff6dc !important;
        caret-color: #f1c46d;
        font: 800 13px/1 ui-monospace, SFMono-Regular, Consolas, monospace !important;
        text-align: left;
        letter-spacing: 0;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.055), inset 0 -1px 0 rgba(0,0,0,.28);
        transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
      }

      #bt-bot-panel input[type="number"]::-webkit-outer-spin-button,
      #bt-bot-panel input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      #bt-bot-panel input[type="number"]::placeholder {
        color: rgba(245, 233, 210, .55);
        font-weight: 650;
      }

      #bt-bot-panel input[type="number"]:focus {
        border-color: #d4af77 !important;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .045), transparent),
          #2a2118 !important;
        box-shadow: 0 0 0 4px rgba(212, 175, 110, .12), inset 0 1px 0 rgba(255,255,255,.07);
      }

      #bt-bot-panel button,
      #bt-filler-actions button {
        min-height: 40px;
        border: 1px solid rgba(212, 175, 110, .5) !important;
        border-radius: 12px !important;
        background: linear-gradient(152deg, #5c211c, #3a1210) !important;
        color: #f4e6c3 !important;
        font-family: inherit !important;
        font-weight: 800 !important;
        letter-spacing: .01em;
        box-shadow: 0 10px 26px rgba(0, 0, 0, .48), inset 0 1px 0 rgba(255, 255, 255, .08) !important;
        transition: transform .17s cubic-bezier(.2,.0,.1,1), filter .17s ease, border-color .17s ease, box-shadow .17s ease;
      }

      #bt-bot-panel button:hover,
      #bt-filler-actions button:hover {
        filter: brightness(1.08) saturate(1.03);
        border-color: #d4af77 !important;
        transform: translateY(-1.5px);
        box-shadow: 0 14px 32px rgba(0, 0, 0, .52), inset 0 1px 0 rgba(255, 255, 255, .1) !important;
      }

      #bt-bot-panel button:active,
      #bt-filler-actions button:active {
        transform: translateY(0) scale(.982);
        filter: brightness(.96);
      }

      #bt-bot-panel button:focus-visible,
      #bt-filler-actions button:focus-visible {
        outline: 3px solid rgba(212, 175, 110, .22);
        outline-offset: 2px;
      }

      #bt-bot-panel .bt-auto-button {
        border-color: rgba(90, 170, 120, .52) !important;
        background: linear-gradient(152deg, #1e4633, #122a20) !important;
        box-shadow: 0 10px 26px rgba(0, 0, 0, .48), inset 0 1px 0 rgba(255, 255, 255, .09) !important;
      }

      #bt-bot-panel .bt-settings-header {
        min-height: 26px;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: #d2b57f !important;
        font-weight: 700 !important;
      }

      #bt-bot-panel .bt-settings-header:hover {
        filter: none;
        transform: none;
        color: #e6ca96 !important;
      }

      #bt-bot-panel .bt-secondary-button {
        border-color: rgba(255, 255, 255, .11) !important;
        background: rgba(255, 255, 255, .04) !important;
        color: #c8b49a !important;
        box-shadow: none !important;
      }

      #bt-bot-panel .bt-panel-mode {
        color: #d4af77 !important;
        font-size: 11px !important;
        letter-spacing: .03em;
        font-weight: 600;
      }

      #bt-bot-panel .bt-panel-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        gap: 8px !important;
      }

      #bt-bot-panel .bt-panel-row input {
        width: 100% !important;
      }

      #bt-bot-panel .bt-panel-section {
        margin-top: 0 !important;
        padding: 13px !important;
        gap: 10px !important;
        border: 1px solid rgba(255, 255, 255, .05) !important;
        border-radius: 14px;
        background: rgba(255, 255, 255, .018);
      }

      #bt-bot-panel .bt-panel-section label {
        justify-content: space-between;
        color: #c8b49a !important;
        line-height: 1.35;
        font-size: 12px;
      }

      #bt-bot-panel .bt-panel-section label span:first-child {
        flex: 1;
      }

      #bt-bot-panel .bt-inline-field {
        display: grid !important;
        grid-template-columns: minmax(76px, 1fr) 62px 62px;
        align-items: center;
        gap: 9px !important;
      }

      #bt-bot-panel .bt-small-number {
        width: 62px !important;
      }

      #bt-bot-panel .bt-timing-inputs {
        display: grid !important;
        grid-template-columns: 62px auto 62px;
        align-items: center;
        gap: 8px !important;
      }

      #bt-bot-panel .bt-panel-section .bt-timing-label {
        color: #d8c6a6 !important;
        font-size: 11.5px !important;
      }

      #bt-bot-panel .bt-panel-toggle {
        padding: 3px 1px;
        color: #c8b49a !important;
        font-size: 12px !important;
      }

      #bt-bot-panel input[type="checkbox"] {
        width: 17px;
        height: 17px;
        accent-color: #c9a36a !important;
        border-radius: 4px;
      }

      #bt-filler-actions {
        padding: 8px;
        border: 1px solid rgba(212, 175, 110, .22);
        border-radius: 18px;
        background: rgba(18, 10, 8, .92);
        box-shadow: 0 22px 55px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255,255,255,.04);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      #bt-filler-actions button {
        padding: 11px 18px !important;
        font-size: 12.5px !important;
      }

      #bt-filler-actions button.is-loading {
        background: linear-gradient(152deg, #7a4a1f, #4f2d13) !important;
      }

      #bt-filler-actions button.is-success {
        border-color: rgba(90, 175, 125, .55) !important;
        background: linear-gradient(152deg, #1e4a30, #0f2a1c) !important;
      }

      @media (max-width: 520px) {
        #bt-bot-panel {
          left: 12px !important;
          bottom: 12px !important;
          width: min(288px, calc(100vw - 24px)) !important;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
        }

        #bt-filler-actions {
          right: 12px !important;
          bottom: 12px !important;
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
      'bottom:24px',
      'left:24px',
      'z-index:99999',
      'width:44px',
      'height:44px',
      'border-radius:50%',
      'background:#1a0505',
      `border:2px solid ${isBotEnabled() ? '#5fc89a' : '#ffd700'}`,
      'color:#ffd700',
      'font-size:20px',
      'cursor:pointer',
      'box-shadow:0 2px 12px rgba(0,0,0,0.8)',
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

  function renderBotPanel() {
    injectBotPanelStyles();
    const existing = document.querySelector('#bt-bot-panel');
    if (existing) {
      existing.remove();
    }
    const existingMini = document.querySelector('#bt-bot-panel-mini');
    if (existingMini) {
      existingMini.remove();
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
      'bottom:24px',
      'left:24px',
      'z-index:99999',
      'background:#1a0505',
      'border:2px solid #ffd700',
      'border-radius:10px',
      'padding:10px 12px',
      'min-width:190px',
      'box-shadow:0 2px 12px rgba(0,0,0,0.8)',
      'color:#ffd700',
      'font-size:13px',
      'display:flex',
      'flex-direction:column',
      'gap:8px'
    ].join(';');

    const panelHead = document.createElement('div');
    panelHead.className = 'bt-panel-head';
    const panelHeading = document.createElement('div');
    const panelKicker = document.createElement('div');
    panelKicker.className = 'bt-panel-kicker';
    panelKicker.textContent = 'BiteFight otomasyon';
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
    minimizeBtn.style.cssText = 'background:transparent;border:none;color:#ffd700;font-size:22px;line-height:1;cursor:pointer;padding:0 4px;box-shadow:none';
    minimizeBtn.onclick = () => {
      setBotPanelMinimized(true);
      renderBotPanel();
    };
    headControls.append(panelDot, minimizeBtn);
    panelHead.append(panelHeading, headControls);
    panel.appendChild(panelHead);

    const status = document.createElement('div');
    status.id = 'bt-bot-status';
    status.style.cssText = 'color:#f3e2b3;font-size:12px;max-width:230px';
    status.textContent = GM_getValue('btBotStatus', 'Kat botu hazir');
    panel.appendChild(status);

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
      panel.appendChild(row);

      const startBtn = buildActionButton('Botu Baslat', 'padding:8px 14px;font-size:13px');
      startBtn.onclick = () => {
        const startStage = Number.parseInt(startInput.value, 10);
        if (!Number.isInteger(startStage) || startStage < 1) {
          setBotStatus('Gecerli bir baslangic kati gir');
          return;
        }
        const stopStage = Number.parseInt(stopInput.value, 10);
        startBot(startStage, Number.isInteger(stopStage) && stopStage > 0 ? stopStage : 0);
      };
      panel.appendChild(startBtn);

      // --- Oto kat modu ---
      const autoWrap = document.createElement('div');
      autoWrap.className = 'bt-panel-section';
      autoWrap.style.cssText = 'border-top:1px solid rgba(255,215,0,0.25);padding-top:8px;margin-top:2px;display:flex;flex-direction:column;gap:6px';

      const savedAutoRange = autoFloorRange();
      const autoFloorRow = document.createElement('label');
      autoFloorRow.className = 'bt-inline-field';
      autoFloorRow.style.cssText = 'display:flex;gap:6px;align-items:center;color:#f3e2b3;font-size:11px';
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

      const autoIntervalRow = document.createElement('label');
      autoIntervalRow.className = 'bt-inline-field';
      autoIntervalRow.style.cssText = 'display:flex;gap:6px;align-items:center;color:#f3e2b3;font-size:11px';
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

      const autoBtn = buildActionButton('Oto Kat Modu Baslat', 'padding:8px 14px;font-size:13px;background:#0a3a1a');
      autoBtn.classList.add('bt-auto-button');
      autoBtn.title = 'Secilen kat araligini sirayla tarar; girilebilen katlari tamamlar, tur bitince bekleyip ilk kattan tekrar dener';
      autoBtn.onclick = () => {
        const autoStart = Number.parseInt(autoStartInput.value, 10);
        const autoEnd = Number.parseInt(autoEndInput.value, 10);
        if (!Number.isInteger(autoStart) || !Number.isInteger(autoEnd)
          || autoStart < AUTO_MIN_FLOOR || autoEnd > AUTO_MAX_FLOOR || autoStart > autoEnd) {
          setBotStatus(`Oto kat araligi ${AUTO_MIN_FLOOR}-${AUTO_MAX_FLOOR} icinde ve baslangic bitisten kucuk olmali`);
          return;
        }
        const intervalMin = Number.parseInt(autoIntervalMinInput.value, 10);
        const intervalMax = Number.parseInt(autoIntervalMaxInput.value, 10);
        if (!Number.isInteger(intervalMin) || !Number.isInteger(intervalMax)
          || intervalMin < AUTO_MIN_INTERVAL_SEC || intervalMin > intervalMax) {
          setBotStatus(`Yeniden deneme araligi en az ${AUTO_MIN_INTERVAL_SEC} sn olmali ve minimum maksimumdan buyuk olmamali`);
          return;
        }
        GM_setValue(AUTO_INTERVAL_MIN_KEY, intervalMin);
        GM_setValue(AUTO_INTERVAL_MAX_KEY, intervalMax);
        startAuto(autoStart, autoEnd);
      };
      autoWrap.appendChild(autoBtn);
      panel.appendChild(autoWrap);
    }

    const reviveRow = document.createElement('label');
    reviveRow.className = 'bt-panel-toggle';
    reviveRow.style.cssText = 'display:flex;gap:6px;align-items:center;color:#f3e2b3;font-size:12px;cursor:pointer';
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

    appendWinRateSetting(panel);
    appendTimingSettings(panel);
    document.body.appendChild(panel);
  }

  // Panele "Kazanma orani" secimi ekler: bot yalnizca bu oranin uzerindeki
  // (guvenli) cozumleri doldurur. Hazir kademeler + elle giris.
  function appendWinRateSetting(panel) {
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(255,215,0,0.25);padding-top:8px;margin-top:2px;display:flex;flex-direction:column;gap:6px';

    const label = document.createElement('span');
    label.textContent = 'Kazanma orani (min)';
    label.style.cssText = 'color:#f3e2b3;font-size:11px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center';

    const select = document.createElement('select');
    select.style.cssText = 'flex:1;height:38px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,215,0,0.5);background:#2a0a0a;color:#ffd700;font-size:12px';
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
    customInput.style.cssText = 'width:70px';

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

  // Panele acilip kapanan "Bekleme Ayarlari" bolumu: her parametre icin min-max (sn).
  function appendTimingSettings(panel) {
    const timing = loadBotTiming();
    const wrap = document.createElement('div');
    wrap.className = 'bt-panel-section';
    wrap.style.cssText = 'border-top:1px solid rgba(255,215,0,0.25);padding-top:8px;margin-top:2px;display:flex;flex-direction:column;gap:8px';

    const isOpen = () => GM_getValue(BOT_SETTINGS_OPEN_KEY, false) === true;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'bt-settings-header';
    header.style.cssText = 'background:transparent;border:none;color:#ffd700;font-size:12px;font-weight:bold;cursor:pointer;padding:0;display:flex;align-items:center;gap:6px;width:100%;text-align:left';

    const body = document.createElement('div');
    body.style.cssText = 'flex-direction:column;gap:8px';

    const inputStyle = '';
    const fieldInputs = {};
    BOT_TIMING_FIELDS.forEach((field) => {
      const fieldRow = document.createElement('div');
      fieldRow.style.cssText = 'display:flex;flex-direction:column;gap:3px';

      const label = document.createElement('span');
      label.textContent = `${field.label} (sn)`;
      label.className = 'bt-timing-label';
      label.style.cssText = 'color:#f3e2b3;font-size:11px';

      const inputs = document.createElement('div');
      inputs.className = 'bt-timing-inputs';
      inputs.style.cssText = 'display:flex;gap:6px;align-items:center';

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

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px';
    const saveBtn = buildActionButton('Kaydet', 'padding:7px 12px;font-size:12px');
    const resetBtn = buildActionButton('Varsayilan', 'padding:7px 12px;font-size:12px;background:#3a0a0a');
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
      GM_setValue(BOT_SETTINGS_OPEN_KEY, false);
      setBotStatus('Bekleme ayarlari kaydedildi');
      renderBotPanel();
    };

    resetBtn.onclick = () => {
      BOT_TIMING_FIELDS.forEach((field) => {
        fieldInputs[field.key].minInput.value = String(field.min);
        fieldInputs[field.key].maxInput.value = String(field.max);
      });
    };

    wrap.append(header, body);
    panel.appendChild(wrap);
  }
  // ====================== /KAT BOTU ======================

  function buildActionButton(label, extraStyle) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = [
      'background:#6b0000',
      'color:#ffd700',
      'border:2px solid #ffd700',
      'padding:12px 20px',
      'border-radius:8px',
      'font-size:15px',
      'font-weight:bold',
      'cursor:pointer',
      'box-shadow:0 2px 10px rgba(0,0,0,0.7)',
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
    const attemptSync = async () => {
      try {
        await syncLootResultToLastArchive();
      } catch (error) {
        console.error(error);
      }
    };

    if (document.querySelector('.lootItemsDiv')) {
      void attemptSync();
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector('.lootItemsDiv')) {
        return;
      }
      void attemptSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  injectButtons();
  watchLootPage();
  new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });

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
