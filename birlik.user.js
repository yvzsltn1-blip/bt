// ==UserScript==
// @name         Birlik Doldurucu v3
// @namespace    https://bt-analiz.web.app
// @version      3.0
// @description  quick.html sonuclarini Bitefight savasa otomatik doldurur, arsiv kaydi tutar ve kat botu ile katlari otomatik gecer
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
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
  // Onerilen cozumun kazanma orani bunun altindaysa bot durur (quick popup %100 esdegeri).
  const BOT_MIN_WIN_RATE = 0.995;
  // Dengeli cozumun beklenen kan kaybi bu esigi asarsa hizli ve derin modlar da
  // taranir; en dusuk kayipli guvenli cozum hangi moddaysa onunla savasilir.
  const BOT_LOSS_ESCALATION_THRESHOLD = 90;
  const BOT_MODE_LABELS = { fast: 'hizli', balanced: 'dengeli', deep: 'derin' };
  // Sonuc sayfasinda olen birimleri hayata dondurme tercihi (varsayilan: acik).
  const BOT_REVIVE_KEY = 'btBotReviveEnabled';
  const BATTLE_CORE_URL = 'https://bt-analiz.web.app/battle-core.js';

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
        const code = await gmFetchText(`${BATTLE_CORE_URL}?bot=${Date.now()}`);
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

  // Kat sayfasi URL'i: layerId secimi sunucu tarafinda yapilir (page = 10'luk dilim).
  function buildFloorUrl(stage) {
    return `${location.origin}/ancestral/index?layerId=${stage}&page=${Math.ceil(stage / 10)}`;
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

  // Secili kat: aktif kat butonu (#layerN.activeLayerBtn) ya da URL'deki layerId.
  function detectSelectedStage() {
    const activeBtn = document.querySelector('.layerButtons .activeLayerBtn');
    if (activeBtn) {
      const match = String(activeBtn.id || '').match(/^layer(\d+)$/);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    }
    return getLayerIdFromHref(location.href) || null;
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

  function setBotStatus(text) {
    GM_setValue('btBotStatus', text);
    const statusEl = document.querySelector('#bt-bot-status');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function stopBot(reason) {
    GM_setValue(BOT_ENABLED_KEY, false);
    releaseWakeLock();
    setBotStatus(`Durdu: ${reason}`);
    renderBotPanel();
  }

  function startBot(startStage, stopStage) {
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(BOT_NEXT_STAGE_KEY, startStage);
    GM_setValue(BOT_STOP_STAGE_KEY, stopStage || 0);
    GM_setValue(BOT_DONE_KEY, 0);
    void acquireWakeLock();
    setBotStatus(`Bot basladi: Kat ${startStage}`);
    renderBotPanel();
    botTickStarted = false;
    void runBotTick();
  }

  async function handleBattlePage() {
    // Savas sayfasindaki "Geri" linkinin layerId'si o anki kati soyler; GM'deki
    // hedefle uyusmazsa sayfadaki gercek kat esastir.
    const backLinkStage = getLayerIdFromHref(document.querySelector('a.combatBackBtn')?.href);
    const stage = backLinkStage || GM_getValue(BOT_NEXT_STAGE_KEY, 0);
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
      minWinRate: 0.75,
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
    return !!entry && entry.possible && !!entry.counts && Number(entry.winRate || 0) >= BOT_MIN_WIN_RATE;
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
    // tas varsa kurtarmaya calis). Akis: #showReviveBtn popup'i acar -> #reviveBtn
    // onaylar -> #revivedResult'ta basari mesaji belirir ve #showReviveBtn kaybolur.
    // Diriltme kapaliysa buton hic tiklanmaz, bot dogrudan sonraki kata gecer.
    const reviveOpener = isReviveEnabled() ? document.querySelector('#showReviveBtn') : null;
    if (reviveOpener) {
      // Diriltme maliyeti butonda gosterilir (or. "-1"). Yarista bir aksilik olursa
      // bakiye farkina dusulur. Senkron yarisini onlemek icin tasi diriltmeden once yaz.
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
        // Bakiye guncellendiyse gercek harcamayi yaz (buton maliyetiyle uyusmazsa onu esas al).
        const balanceAfter = parseDigits(document.querySelector('#devil_stone_balance')?.textContent);
        const spentByBalance = balanceBefore && balanceAfter ? Math.max(0, balanceBefore - balanceAfter) : 0;
        if (spentByBalance > 0) {
          GM_setValue(LAST_REVIVE_STONES_KEY, String(spentByBalance));
        }
      }
    }

    if (!victory) {
      stopBot(`Kat ${stage}: zafer goremedim, sonucu kontrol et`);
      return;
    }

    const done = GM_getValue(BOT_DONE_KEY, 0) + 1;
    GM_setValue(BOT_DONE_KEY, done);
    GM_setValue(BOT_NEXT_STAGE_KEY, stage + 1);

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
    location.assign(buildFloorUrl(stage + 1));
  }

  async function handleFloorPage() {
    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    if (!target) {
      stopBot('Hedef kat yok');
      return;
    }

    const selected = detectSelectedStage();
    if (selected !== target) {
      // Hedef kat secili degil; secimi sunucuya URL ile yaptir.
      setBotStatus(`Kat ${target} aciliyor...`);
      await timedSleep('button');
      location.assign(buildFloorUrl(target));
      return;
    }

    const enterLink = document.querySelector(`#layerInfoContainer${target} a.layerEntryBtn`)
      || document.querySelector('.layerInfoContainer[style*="block"] a.layerEntryBtn');
    if (!enterLink || !enterLink.classList.contains('entryAvailable')) {
      stopBot(`Kat ${target}: giris kapali (acma sarti dolmus olabilir)`);
      return;
    }
    setBotStatus(`Kat ${target}: giriliyor...`);
    await timedSleep('button');
    enterLink.click();
  }

  async function runBotTick() {
    if (botTickStarted || !isBotEnabled()) {
      return;
    }
    botTickStarted = true;
    void acquireWakeLock();
    try {
      if (isBattleSetupPage()) {
        await handleBattlePage();
      } else if (isResultPage()) {
        await handleResultPage();
      } else if (isFloorPage()) {
        await handleFloorPage();
      }
      // Taninmayan sayfalarda dokunma; kullanici gezinmeye devam edebilir.
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

  function renderBotPanel() {
    const existing = document.querySelector('#bt-bot-panel');
    if (existing) {
      existing.remove();
    }
    if (!isBattleSetupPage() && !isResultPage() && !isFloorPage() && !isBotEnabled()) {
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

    const status = document.createElement('div');
    status.id = 'bt-bot-status';
    status.style.cssText = 'color:#f3e2b3;font-size:12px;max-width:230px';
    status.textContent = GM_getValue('btBotStatus', 'Kat botu hazir');
    panel.appendChild(status);

    if (isBotEnabled()) {
      const stopBtn = buildActionButton('Botu Durdur', 'padding:8px 14px;font-size:13px');
      stopBtn.onclick = () => {
        stopBot('kullanici durdurdu');
      };
      panel.appendChild(stopBtn);
    } else {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center';

      const startInput = document.createElement('input');
      startInput.type = 'number';
      startInput.min = '1';
      startInput.placeholder = 'Kat';
      startInput.style.cssText = 'width:62px;padding:6px;border-radius:6px;border:1px solid #ffd700;background:#2a0a0a;color:#ffd700';
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
    }

    const reviveRow = document.createElement('label');
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

    appendTimingSettings(panel);
    document.body.appendChild(panel);
  }

  // Panele acilip kapanan "Bekleme Ayarlari" bolumu: her parametre icin min-max (sn).
  function appendTimingSettings(panel) {
    const timing = loadBotTiming();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border-top:1px solid rgba(255,215,0,0.25);padding-top:8px;margin-top:2px;display:flex;flex-direction:column;gap:8px';

    const isOpen = () => GM_getValue(BOT_SETTINGS_OPEN_KEY, false) === true;

    const header = document.createElement('button');
    header.type = 'button';
    header.style.cssText = 'background:transparent;border:none;color:#ffd700;font-size:12px;font-weight:bold;cursor:pointer;padding:0;display:flex;align-items:center;gap:6px;width:100%;text-align:left';

    const body = document.createElement('div');
    body.style.cssText = 'flex-direction:column;gap:8px';

    const inputStyle = 'width:52px;padding:5px;border-radius:6px;border:1px solid #ffd700;background:#2a0a0a;color:#ffd700;font-size:12px';
    const fieldInputs = {};
    BOT_TIMING_FIELDS.forEach((field) => {
      const fieldRow = document.createElement('div');
      fieldRow.style.cssText = 'display:flex;flex-direction:column;gap:3px';

      const label = document.createElement('span');
      label.textContent = `${field.label} (sn)`;
      label.style.cssText = 'color:#f3e2b3;font-size:11px';

      const inputs = document.createElement('div');
      inputs.style.cssText = 'display:flex;gap:6px;align-items:center';

      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.min = '0';
      minInput.step = '0.1';
      minInput.style.cssText = inputStyle;
      minInput.value = String(timing[field.key].min);

      const sep = document.createElement('span');
      sep.textContent = '-';
      sep.style.cssText = 'color:#ffd700';

      const maxInput = document.createElement('input');
      maxInput.type = 'number';
      maxInput.min = '0';
      maxInput.step = '0.1';
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
      fillBtn.style.background = '#1a6b2a';
      setTimeout(() => {
        fillBtn.textContent = 'BT Doldur';
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
