// ==UserScript==
// @name         Birlik Doldurucu v3
// @namespace    https://bt-analiz.web.app
// @version      1.7
// @description  quick.html sonuclarini Bitefight savasa otomatik doldurur ve arsiv kaydi tutar
// @match        https://bt-analiz.web.app/*
// @match        *://*.bitefight.org/*
// @match        *://*.bitefight.gameforge.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const FIREBASE_API_KEY = 'AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4';
  const FIRESTORE_ARCHIVE_URL = 'https://firestore.googleapis.com/v1/projects/bt-analiz/databases/(default)/documents/overviewArchives';
  const LAST_ARCHIVE_ID_KEY = 'btLastArchiveId';
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

  function getGoldText() {
    const el = document.querySelector('div.gold');
    if (!el) return '';
    const value = [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => cleanText(node.textContent))
      .find(Boolean);
    return value || '';
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

  function buildRosterText(label, counts) {
    if (!Array.isArray(counts) || !counts.length) {
      return '-';
    }
    return `${label} : [${counts.join('-')}]`;
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

    return buildRosterText('Rakip', entries.map((entry) => entry.qty));
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

    return buildRosterText('Biz', counts);
  }

  function getOverviewPayload(sourceType, options = {}) {
    const goldText = getGoldText();
    if (!goldText) {
      throw new Error('Altin bilgisi bulunamadi.');
    }

    const nowIso = new Date().toISOString();
    const enemyRosterText = getEnemyRosterText();
    const allyRosterText = getAllyRosterText(options.targets, Boolean(options.preferTargets));
    return {
      savedAt: nowIso,
      updatedAt: nowIso,
      goldText,
      goldValue: parseDigits(goldText),
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
      goldText: { stringValue: payload.goldText },
      goldValue: { integerValue: String(payload.goldValue) },
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

  async function createArchiveRecord(sourceType, options = {}) {
    const payload = getOverviewPayload(sourceType, options);
    const docId = `overview_${Date.now()}_${Math.random().toString(36).slice(2, 9) || '0'}`;
    const response = await fetch(`${FIRESTORE_ARCHIVE_URL}?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
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

    GM_setValue(LAST_ARCHIVE_ID_KEY, docId);
    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify(payload));
    return { docId, payload };
  }

  async function syncLootResultToLastArchive() {
    const lootGoldText = getLootGoldText();
    const expText = getLootExpText();
    const fallenUnitsText = getFallenUnitsText();
    if (!lootGoldText && !expText && fallenUnitsText === 'Olenler : 0') {
      return false;
    }

    const docId = GM_getValue(LAST_ARCHIVE_ID_KEY, '');
    const rawPayload = GM_getValue(LAST_ARCHIVE_PAYLOAD_KEY, '');
    if (!docId || !rawPayload) {
      return false;
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return false;
    }

    const syncSignature = `${docId}|${location.pathname}|${lootGoldText}|${expText}|${fallenUnitsText}`;
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

    const response = await fetch(`${FIRESTORE_ARCHIVE_URL}/${encodeURIComponent(docId)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
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

    GM_setValue(LAST_ARCHIVE_PAYLOAD_KEY, JSON.stringify(nextPayload));
    GM_setValue(LAST_LOOT_SYNC_KEY, syncSignature);
    return true;
  }

  async function fillUnits(targets) {
    for (const tier in targets) {
      const count = targets[tier];
      const plus10 = document.querySelector(`.stepBtn.btnPlus10[data-id="${tier}"]`);
      const plus1 = document.querySelector(`.stepBtn.btnPlus1[data-id="${tier}"]`);
      const minus1 = document.querySelector(`.stepBtn.btnMinus1[data-id="${tier}"]`);
      if (!plus10 || !plus1) continue;

      let plus10Clicks = Math.floor(count / 10);
      let plus1Clicks = count % 10;
      let minus1Clicks = 0;

      if (plus1Clicks >= 6 && minus1) {
        plus10Clicks += 1;
        const overshoot = 10 - plus1Clicks;
        plus1Clicks = 0;
        minus1Clicks = overshoot;
      }

      for (let i = 0; i < plus10Clicks; i += 1) {
        plus10.click();
        await sleep(290 + Math.random() * 130);
      }

      for (let j = 0; j < plus1Clicks; j += 1) {
        plus1.click();
        await sleep(240 + Math.random() * 100);
      }

      for (let k = 0; k < minus1Clicks; k += 1) {
        minus1.click();
        await sleep(240 + Math.random() * 100);
      }

      await sleep(580 + Math.random() * 180);
    }
  }

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

    const saveBtn = buildActionButton('Kaydet', 'background:#1d3f6b;color:#e7f1ff;border-color:#8cc4ff');
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

    saveBtn.onclick = async () => {
      const defaultText = 'Kaydet';
      saveBtn.disabled = true;
      saveBtn.textContent = 'Kaydediliyor...';

      try {
        const result = await createArchiveRecord('manual');
        saveBtn.textContent = `Kaydedildi: ${result.payload.goldText}`;
        saveBtn.style.background = '#1a6b2a';
        saveBtn.style.borderColor = '#98ffb0';
        saveBtn.style.color = '#f3fff6';
      } catch (error) {
        console.error(error);
        saveBtn.textContent = 'Kayit hatasi';
        saveBtn.style.background = '#6b1d1d';
        saveBtn.style.borderColor = '#ff9a9a';
        saveBtn.style.color = '#fff1f1';
      }

      setTimeout(() => {
        saveBtn.textContent = defaultText;
        saveBtn.style.background = '#1d3f6b';
        saveBtn.style.borderColor = '#8cc4ff';
        saveBtn.style.color = '#e7f1ff';
        saveBtn.disabled = false;
      }, 3000);
    };

    panel.appendChild(saveBtn);
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
