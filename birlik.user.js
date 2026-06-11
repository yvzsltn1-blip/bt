// ==UserScript==
// @name         Birlik Doldurucu v3
// @namespace    https://bt-analiz.web.app
// @version      2.0
// @description  quick.html sonuclarini Bitefight savasa otomatik doldurur, arsiv kaydi tutar ve kat botu ile katlari otomatik gecer
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      bt-analiz.web.app
// ==/UserScript==

(function () {
  'use strict';

  const FIREBASE_API_KEY = 'AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4';
  const FIRESTORE_ARCHIVE_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/overviewArchives';
  const FIRESTORE_ARCHIVE_HOSTS_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/archiveHosts';
  const LAST_ARCHIVE_ID_KEY = 'btLastArchiveId';
  const REGISTERED_HOST_KEY = 'btArchiveRegisteredHost';
  const LAST_ARCHIVE_PAYLOAD_KEY = 'btLastArchivePayload';
  const LAST_LOOT_SYNC_KEY = 'btLastLootSyncSignature';
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
    const items = collapseRepeatedEntries(
      [...document.querySelectorAll('.allFallenUnits .fallenUnit')]
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

    const pendingDocId = GM_getValue(LAST_ARCHIVE_ID_KEY, '');
    const syncSignature = `${pendingDocId || 'queued'}|${location.pathname}|${lootGoldText}|${expText}|${fallenUnitsText}`;
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
        await sleep(290 + Math.random() * 130);
      }

      for (let j = 0; j < plus1Clicks; j += 1) {
        plus1.click();
        await sleep(240 + Math.random() * 100);
      }

      await sleep(580 + Math.random() * 180);
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
  const BATTLE_CORE_URL = 'https://bt-analiz.web.app/battle-core.js';
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

  // Motoru her oturumda canli siteden ceker; boylece motor guncellemeleri botu da gunceller.
  function loadBattleCore() {
    if (!battleCorePromise) {
      battleCorePromise = (async () => {
        const code = await gmFetchText(`${BATTLE_CORE_URL}?bot=${Date.now()}`);
        (0, eval)(code);
        const core = (typeof window !== 'undefined' && window.BattleCore) || globalThis.BattleCore;
        if (!core || typeof core.optimizeArmyUsage !== 'function') {
          throw new Error('BattleCore yuklenemedi');
        }
        return core;
      })();
      battleCorePromise.catch(() => {
        battleCorePromise = null;
      });
    }
    return battleCorePromise;
  }

  // optimizer.js getRunConfig'in "balanced" preseti, runIndex=1 (quick.html varsayilani).
  // optimizer.js'te preset degisirse burayi da guncelle.
  function getQuickRunConfig(stage) {
    const seedOffsets = { fast: 1301, balanced: 2603, deep: 5209, ultra: 9203 };
    const seedBase = 41017 + stage * 31 + 7919;
    return {
      trialCount: 6,
      fullArmyTrials: 10,
      beamWidth: 10,
      maxIterations: 4,
      eliteCount: 6,
      stabilityTrials: 18,
      exploratoryCandidateCount: 100,
      exhaustiveCandidateLimit: 6000,
      diversityCandidateCount: 0,
      tekilCandidateCount: 0,
      baseSeed: seedBase + seedOffsets.balanced,
      timeBudgetMs: 0,
      alternateBaseSeeds: [seedOffsets.fast, seedOffsets.deep, seedOffsets.ultra].map((offset) => seedBase + offset)
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

  function getClickableText(el) {
    if (el.tagName === 'INPUT') {
      return normalizeTurkishText(el.value);
    }
    return normalizeTurkishText(el.textContent);
  }

  function isElementVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // Metne gore tiklanabilir eleman arar; ic ice eslesmelerde en icteki elemani dondurur.
  function findClickableByText(predicate) {
    const candidates = [...document.querySelectorAll('a, button, input[type="submit"], input[type="button"], div, span, p, td, li, h2, h3')]
      .filter((el) => isElementVisible(el) && predicate(getClickableText(el), el));
    const innermost = candidates.filter((el) => !candidates.some((other) => other !== el && el.contains(other)));
    return innermost[0] || null;
  }

  function pageHasNormalizedText(snippet) {
    return normalizeTurkishText(document.body?.textContent || '').includes(snippet);
  }

  async function waitForClickable(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const el = findClickableByText(predicate);
      if (el) {
        return el;
      }
      await sleep(250);
    }
    return null;
  }

  function findKatElements() {
    return [...document.querySelectorAll('a, button, div, span, p, td, li, h2, h3')]
      .filter((el) => isElementVisible(el) && /^kat \d+$/.test(getClickableText(el)))
      .filter((el, _i, list) => !list.some((other) => other !== el && el.contains(other)));
  }

  // Onizleme basligindaki "Kat N" degerini bulur (ZORLUK FAKTORU metnine yakin olan).
  function detectSelectedStage() {
    const katElements = findKatElements();
    for (const el of katElements) {
      let node = el.parentElement;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const text = normalizeTurkishText(node.textContent);
        if (text.includes('zorluk fakt')) {
          const match = getClickableText(el).match(/^kat (\d+)$/);
          return match ? Number.parseInt(match[1], 10) : null;
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function isBattleSetupPage() {
    return !!document.querySelector('.stepBtn') && !!document.querySelector('.enemySlot');
  }

  function isResultPage() {
    return !isBattleSetupPage() && (
      !!document.querySelector('.lootItemsDiv') ||
      !!findClickableByText((text) => text.includes('olen birimleri hayata dondur'))
    );
  }

  function isFloorPage() {
    return !isBattleSetupPage() && !isResultPage() && findKatElements().length >= 3;
  }

  function isBotEnabled() {
    return GM_getValue(BOT_ENABLED_KEY, false) === true;
  }

  function setBotStatus(text) {
    GM_setValue('btBotStatus', text);
    const statusEl = document.querySelector('#bt-bot-status');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function stopBot(reason) {
    GM_setValue(BOT_ENABLED_KEY, false);
    setBotStatus(`Durdu: ${reason}`);
    renderBotPanel();
  }

  function startBot(startStage, stopStage) {
    GM_setValue(BOT_ENABLED_KEY, true);
    GM_setValue(BOT_NEXT_STAGE_KEY, startStage);
    GM_setValue(BOT_STOP_STAGE_KEY, stopStage || 0);
    GM_setValue(BOT_DONE_KEY, 0);
    setBotStatus(`Bot basladi: Kat ${startStage}`);
    renderBotPanel();
    botTickStarted = false;
    void runBotTick();
  }

  async function handleBattlePage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    if (!stage) {
      stopBot('Kat bilgisi yok; bota kat sayfasindan basla');
      return;
    }

    setBotStatus(`Kat ${stage}: rakip okunuyor...`);
    const enemy = parseEnemyCountsForBot();
    if (!enemy.total) {
      stopBot(`Kat ${stage}: rakip dizilisi okunamadi`);
      return;
    }

    let core;
    try {
      setBotStatus(`Kat ${stage}: motor yukleniyor...`);
      core = await loadBattleCore();
    } catch (error) {
      stopBot(`Motor yuklenemedi: ${error.message}`);
      return;
    }

    const pool = buildBotAllyPool();
    const maxPoints = parseBotMaxPoints() || core.getStagePointLimit(stage);
    if (!maxPoints) {
      stopBot(`Kat ${stage}: puan limiti okunamadi`);
      return;
    }

    setBotStatus(`Kat ${stage}: cozum araniyor (puan ${maxPoints})...`);
    await sleep(150);

    const runConfig = getQuickRunConfig(stage);
    let result;
    try {
      result = core.optimizeArmyUsage(pool, enemy.counts, {
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
      });
    } catch (error) {
      stopBot(`Kat ${stage}: hesap hatasi (${error.message})`);
      return;
    }

    const source = result.possible ? result.recommendation : null;
    const winRate = source ? Number(source.winRate || 0) : 0;
    if (!source || winRate < BOT_MIN_WIN_RATE) {
      stopBot(`Kat ${stage}: guvenli cozum yok (kazanma %${Math.round(winRate * 100)})`);
      return;
    }

    const targets = {};
    BOT_ALLY_KEYS.forEach((key, index) => {
      const count = Number(source.counts?.[key] || 0);
      if (count > 0) {
        targets[index + 1] = count;
      }
    });

    setBotStatus(`Kat ${stage}: %${Math.round(winRate * 100)} cozum dolduruluyor...`);
    try {
      await createArchiveRecord('fill', { targets, preferTargets: true });
    } catch (error) {
      console.error('Otomatik arsiv kaydi olusturulamadi.', error);
    }

    await fillUnits(targets);
    if (!isBotEnabled()) {
      return;
    }

    const startBtn = findClickableByText((text) => text === 'basla');
    if (!startBtn) {
      stopBot(`Kat ${stage}: BASLA butonu bulunamadi`);
      return;
    }
    setBotStatus(`Kat ${stage}: savas baslatiliyor...`);
    await sleep(900 + Math.random() * 600);
    startBtn.click();
  }

  async function handleResultPage() {
    const stage = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    const victory = pageHasNormalizedText('zafer');

    // Olen birim varsa hayata dondur (yenilgide de tas varsa kurtarmaya calis).
    const reviveOpener = findClickableByText((text) => text.includes('olen birimleri hayata dondur'));
    if (reviveOpener) {
      setBotStatus(`Kat ${stage}: olen birimler hayata donduruluyor...`);
      await sleep(900 + Math.random() * 500);
      reviveOpener.click();
      const confirmBtn = await waitForClickable(
        (text) => text.endsWith('hayata dondur') && !text.includes('olen birimleri'),
        6000
      );
      if (confirmBtn) {
        await sleep(700 + Math.random() * 400);
        confirmBtn.click();
        await sleep(1400 + Math.random() * 500);
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

    const nextBtn = await waitForClickable((text) => text === 'ileri', 5000);
    if (!nextBtn) {
      stopBot(`Kat ${stage}: ILERI butonu bulunamadi`);
      return;
    }
    setBotStatus(`Kat ${stage} tamam (${done} kat). Sonraki: Kat ${stage + 1}`);
    await sleep(1100 + Math.random() * 700);
    nextBtn.click();
  }

  async function handleFloorPage(attempt = 0) {
    const target = GM_getValue(BOT_NEXT_STAGE_KEY, 0);
    if (!target) {
      stopBot('Hedef kat yok');
      return;
    }

    const selected = detectSelectedStage();
    if (selected === target) {
      const enterBtn = findClickableByText((text) => text === 'gir');
      if (!enterBtn) {
        stopBot(`Kat ${target}: GIR bulunamadi (acma sarti dolmus olabilir)`);
        return;
      }
      setBotStatus(`Kat ${target}: giriliyor...`);
      await sleep(1000 + Math.random() * 600);
      enterBtn.click();
      return;
    }

    const katEl = findKatElements().find((el) => getClickableText(el) === `kat ${target}`);
    if (!katEl) {
      stopBot(`Kat ${target} listede bulunamadi`);
      return;
    }
    setBotStatus(`Kat ${target} seciliyor...`);
    await sleep(900 + Math.random() * 500);
    katEl.click();

    // Secim sayfa yenilemeden (AJAX) gerceklesirse ayni yuklemede tekrar dene.
    if (attempt < 4) {
      await sleep(2200);
      if (isBotEnabled() && isFloorPage()) {
        await handleFloorPage(attempt + 1);
      }
    }
  }

  async function runBotTick() {
    if (botTickStarted || !isBotEnabled()) {
      return;
    }
    botTickStarted = true;
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
      stopInput.title = 'Bos birakirsan durdurulana/yenilgiye kadar devam eder';
      stopInput.style.cssText = startInput.style.cssText;
      const storedStop = GM_getValue(BOT_STOP_STAGE_KEY, 0);
      if (storedStop) {
        stopInput.value = String(storedStop);
      }

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

    document.body.appendChild(panel);
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
})();
