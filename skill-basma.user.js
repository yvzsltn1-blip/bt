// ==UserScript==
// @name         BiteFight Skill Basma Paneli
// @namespace    https://bt-analiz.web.app
// @version      1.2.1
// @description  Skill maliyetini hesaplar ve secilen araliklarla otomatik egitim basar.
// @match        https://*.bitefight.gameforge.com/profile/*
// @match        http://*.bitefight.gameforge.com/profile/*
// @downloadURL  https://bt-analiz.web.app/skill-basma.user.js
// @updateURL    https://bt-analiz.web.app/skill-basma.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'bt-skill-trainer';
  const STORAGE_KEY = 'btSkillTrainerConfigV1';
  const RUN_STATE_KEY = 'btSkillTrainerRunV1';
  const TAB_ID_KEY = 'btSkillTrainerTabIdV1';
  const SKILLS = [
    { id: 1, name: 'Güç', keys: ['guc', 'strength', 'starke'] },
    { id: 2, name: 'Savunma', keys: ['savunma', 'defense', 'verteidigung'] },
    { id: 3, name: 'Beceri', keys: ['beceri', 'dexterity', 'geschicklichkeit'] },
    { id: 4, name: 'Dayanıklılık', keys: ['dayaniklilik', 'endurance', 'ausdauer'] },
    { id: 5, name: 'Karizma', keys: ['karizma', 'charisma'] }
  ];
  const DISCOUNTS = {
    none: { label: 'İndirim yok', multiplier: 1 },
    30: { label: '%30 indirim', multiplier: 0.7 },
    60: { label: '%60 indirim', multiplier: 0.4 }
  };
  const DEFAULTS = { skillId: 1, count: 300, minDelay: 1, maxDelay: 3, discount: '60', collapsed: false, panelX: null, panelY: null };

  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  let running = false;
  let cycleTimer = null;
  let completed = 0;
  let spent = 0;

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseNumber(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? Number.parseInt(digits, 10) : 0;
  }

  function parseFirstNumber(value) {
    const match = String(value || '').match(/\d[\d.,]*/);
    return match ? parseNumber(match[0]) : 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('tr-TR').format(Math.max(0, Math.floor(Number(value) || 0)));
  }

  function loadConfig() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function loadRunState() {
    try {
      return JSON.parse(localStorage.getItem(RUN_STATE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function saveRunState(state) {
    localStorage.setItem(RUN_STATE_KEY, JSON.stringify(state));
    return state;
  }

  function saveConfig() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      skillId: Number(panel.querySelector('#bts-skill').value),
      count: Math.max(1, parseNumber(panel.querySelector('#bts-count').value)),
      minDelay: Math.max(0, Number(panel.querySelector('#bts-min').value) || 0),
      maxDelay: Math.max(0, Number(panel.querySelector('#bts-max').value) || 0),
      discount: panel.querySelector('[name="bts-discount"]:checked')?.value || 'none',
      collapsed: panel.classList.contains('bts-collapsed'),
      panelX: Math.round(rect.left),
      panelY: Math.round(rect.top)
    }));
  }

  function getGold(doc = document) {
    const goldBox = doc.querySelector('div.gold, .gold');
    if (goldBox) {
      for (const node of goldBox.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const value = parseFirstNumber(node.textContent);
        if (value) return value;
      }

      const labelled = goldBox.textContent.match(/(?:altın|altin|gold)\D*([\d.,]+)/i);
      const fallbackValue = parseFirstNumber(labelled ? labelled[1] : goldBox.textContent);
      if (fallbackValue) return fallbackValue;
    }

    const direct = doc.querySelector('#gold_value, #gold_amount');
    return direct ? parseFirstNumber(direct.textContent) : 0;
  }

  function findTrainingLink(doc, skillId) {
    return [...doc.querySelectorAll(`a[href*="/profile/training/${skillId}"]`)]
      .find((link) => link.querySelector('img[src*="iconplus" i]')) ||
      doc.querySelector(`a[href*="/profile/training/${skillId}"]`);
  }

  function findRow(doc, skill) {
    const link = findTrainingLink(doc, skill.id);
    if (link?.closest('tr')) return link.closest('tr');
    return [...doc.querySelectorAll('tr')].find((row) => {
      const label = normalize(row.cells?.[0]?.textContent);
      return skill.keys.some((key) => label.includes(key));
    }) || null;
  }

  function getLevel(doc, skill) {
    const row = findRow(doc, skill);
    if (!row) return 0;

    const tooltips = [...row.querySelectorAll('.tooltip')];
    for (const tooltip of tooltips) {
      const match = normalize(tooltip.textContent).match(/(?:temel deger|base value|grundwert)\s*[:：]?\s*(\d[\d.]*)/i);
      if (match) return parseNumber(match[1]);
    }

    const levelCell = row.querySelector('td[nowrap]') || row.cells?.[1];
    if (!levelCell) return 0;

    const ownText = [...levelCell.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(' ');
    const ownNumbers = ownText.match(/\d[\d.]*/g);
    if (ownNumbers?.length) return parseNumber(ownNumbers[0]);

    const numbers = levelCell.textContent.match(/\d[\d.]*/g) || [];
    return numbers.length ? parseNumber(numbers[0]) : 0;
  }

  function getTooltipCost(doc, skillId) {
    const link = findTrainingLink(doc, skillId);
    const cell = link?.closest('td');
    const tooltip = cell?.querySelector('.tooltip') || link?.parentElement?.querySelector('.tooltip');
    if (!tooltip) return 0;
    const text = tooltip.textContent || '';
    const labelled = text.match(/(?:fiyat|price|kosten)\s*[:：]?\s*([\d.,]+)/i);
    return parseNumber(labelled ? labelled[1] : text);
  }

  function skillCost(level, multiplier) {
    return Math.floor(Math.pow(Math.max(5, level) - 4, 2.4) * multiplier);
  }

  function totalCost(level, count, multiplier) {
    let total = 0;
    for (let index = 0; index < count; index += 1) total += skillCost(level + index, multiplier);
    return total;
  }

  function selectedSkill() {
    const id = Number(document.querySelector('#bts-skill')?.value || 1);
    return SKILLS.find((skill) => skill.id === id) || SKILLS[0];
  }

  function readForm() {
    const min = Math.max(0, Number(document.querySelector('#bts-min').value) || 0);
    const max = Math.max(min, Number(document.querySelector('#bts-max').value) || 0);
    return {
      skill: selectedSkill(),
      count: Math.min(50000, Math.max(1, parseNumber(document.querySelector('#bts-count').value))),
      minDelay: min,
      maxDelay: max,
      discount: document.querySelector('[name="bts-discount"]:checked')?.value || 'none'
    };
  }

  function setStatus(text, tone = '') {
    const el = document.querySelector('#bts-status');
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  }

  function updateProgress(total) {
    const percent = total ? Math.min(100, (completed / total) * 100) : 0;
    document.querySelector('#bts-progress-bar').style.width = `${percent}%`;
    document.querySelector('#bts-progress-text').textContent = `${formatNumber(completed)} / ${formatNumber(total)}`;
    document.querySelector('#bts-spent').textContent = `${formatNumber(spent)} altın`;
  }

  function refreshEstimate() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || running) return;
    const form = readForm();
    const level = getLevel(document, form.skill);
    const gold = getGold(document);
    const estimate = level ? totalCost(level, form.count, DISCOUNTS[form.discount].multiplier) : 0;
    const secondsMin = form.count > 1 ? (form.count - 1) * form.minDelay : 0;
    const secondsMax = form.count > 1 ? (form.count - 1) * form.maxDelay : 0;

    panel.querySelector('#bts-current').textContent = level ? formatNumber(level) : 'Bulunamadı';
    panel.querySelector('#bts-gold').textContent = gold ? `${formatNumber(gold)} altın` : 'Bulunamadı';
    panel.querySelector('#bts-cost').textContent = estimate ? `${formatNumber(estimate)} altın` : 'Hesaplanamadı';
    panel.querySelector('#bts-remaining').textContent = estimate && gold
      ? `${formatNumber(Math.max(0, gold - estimate))} altın${estimate > gold ? ' · yetersiz' : ''}`
      : '—';
    panel.querySelector('#bts-duration').textContent = `${formatDuration(secondsMin)} – ${formatDuration(secondsMax)}`;
    setStatus(level ? 'Hazır' : 'Skill tablosu bulunamadı', level ? 'ready' : 'error');
    saveConfig();
  }

  function formatDuration(seconds) {
    const rounded = Math.max(0, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    return [hours ? `${hours} sa` : '', minutes ? `${minutes} dk` : '', `${secs} sn`].filter(Boolean).join(' ');
  }

  function randomDelay(min, max) {
    return (min + Math.random() * (max - min)) * 1000;
  }

  function renderRunState(state) {
    const owned = state?.owner === tabId;
    running = Boolean(state?.active && owned);
    completed = Math.max(0, Number(state?.completed) || 0);
    spent = Math.max(0, Number(state?.spent) || 0);
    updateProgress(Math.max(0, Number(state?.count) || 0));

    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelector('#bts-start').disabled = Boolean(state?.active);
    panel.querySelector('#bts-stop').disabled = !running;
    panel.querySelectorAll('input, select').forEach((input) => {
      input.disabled = running;
    });

    if (state?.active && !owned) setStatus('Basım başka sekmede çalışıyor', 'stopped');
    else if (state?.status) setStatus(state.status, state.tone || '');
  }

  function finishTraining(state, status, tone) {
    clearTimeout(cycleTimer);
    const next = saveRunState({ ...state, active: false, pending: null, status, tone });
    renderRunState(next);
  }

  function performNavigationStep() {
    const state = loadRunState();
    if (!state?.active || state.owner !== tabId || state.pending) return;
    const skill = SKILLS.find((item) => item.id === Number(state.skillId)) || SKILLS[0];
    const link = findTrainingLink(document, skill.id);
    if (!link) {
      finishTraining(state, `${skill.name} basma bağlantısı bulunamadı`, 'error');
      return;
    }

    const actualCost = getTooltipCost(document, skill.id);
    const currentGold = getGold(document);
    const currentLevel = getLevel(document, skill);
    if (actualCost && currentGold && actualCost > currentGold) {
      finishTraining(state, `Altın yetersiz · gereken ${formatNumber(actualCost)}`, 'error');
      return;
    }

    const actionUrl = new URL(link.getAttribute('href'), location.origin);
    if (!actionUrl.searchParams.get('__token')) {
      finishTraining(state, 'Güncel token bulunamadı', 'error');
      return;
    }

    const pendingState = saveRunState({
      ...state,
      pending: { level: currentLevel, gold: currentGold, cost: actualCost },
      status: `${state.completed + 1}. ${skill.name} basılıyor ve sayfa yenileniyor…`,
      tone: 'running'
    });
    renderRunState(pendingState);
    location.assign(actionUrl.href);
  }

  function scheduleNextNavigation(state) {
    clearTimeout(cycleTimer);
    const tick = () => {
      const current = loadRunState();
      if (!current?.active || current.owner !== tabId || current.pending) return;
      const remaining = Math.max(0, (current.nextAt || 0) - Date.now());
      if (remaining <= 0) {
        performNavigationStep();
        return;
      }
      setStatus(`Sonraki basım ${(remaining / 1000).toFixed(1)} sn · ${current.completed + 1}/${current.count}`, 'running');
      cycleTimer = window.setTimeout(tick, 100);
    };
    renderRunState(state);
    tick();
  }

  function resumeTraining() {
    let state = loadRunState();
    if (!state) return;
    renderRunState(state);
    if (!state.active || state.owner !== tabId) return;

    if (state.pending) {
      const skill = SKILLS.find((item) => item.id === Number(state.skillId)) || SKILLS[0];
      const currentLevel = getLevel(document, skill);
      const currentGold = getGold(document);
      const succeeded = (currentLevel > 0 && currentLevel > state.pending.level) ||
        (currentGold > 0 && state.pending.gold > 0 && currentGold < state.pending.gold);
      if (!succeeded) {
        finishTraining(state, 'Basım doğrulanamadı; işlem durduruldu', 'error');
        return;
      }

      state = saveRunState({
        ...state,
        completed: state.completed + 1,
        spent: state.spent + (state.pending.cost || 0),
        pending: null
      });
      if (state.completed >= state.count) {
        finishTraining(state, `Tamamlandı · ${state.completed} basım`, 'success');
        return;
      }
      state = saveRunState({
        ...state,
        nextAt: Date.now() + randomDelay(state.minDelay, state.maxDelay),
        status: 'Sayfa yenilendi · sonraki basım bekleniyor',
        tone: 'running'
      });
    }
    scheduleNextNavigation(state);
  }

  function startTraining() {
    if (running) return;
    const form = readForm();
    if (!findTrainingLink(document, form.skill.id)) {
      setStatus('Önce profil > Özellikler sekmesini aç', 'error');
      return;
    }

    saveConfig();
    const state = saveRunState({
      active: true,
      owner: tabId,
      skillId: form.skill.id,
      count: form.count,
      minDelay: form.minDelay,
      maxDelay: form.maxDelay,
      completed: 0,
      spent: 0,
      pending: null,
      nextAt: Date.now(),
      status: 'Basım başlatılıyor…',
      tone: 'running'
    });
    scheduleNextNavigation(state);
  }

  function stopTraining() {
    const state = loadRunState();
    if (!state?.active || state.owner !== tabId) return;
    finishTraining(state, `Durduruldu · ${state.completed} basım tamamlandı`, 'stopped');
  }

  function clampPanelPosition(panel, x, y) {
    const margin = 6;
    const maxX = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
    panel.style.right = 'auto';
    panel.style.left = `${Math.min(maxX, Math.max(margin, x))}px`;
    panel.style.top = `${Math.min(maxY, Math.max(margin, y))}px`;
  }

  function enablePanelDragging(panel) {
    const handle = panel.querySelector('.bts-head');
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button, input, select')) return;
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      handle.setPointerCapture(event.pointerId);
      panel.classList.add('bts-dragging');
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!panel.classList.contains('bts-dragging')) return;
      clampPanelPosition(panel, event.clientX - offsetX, event.clientY - offsetY);
    });

    const finishDrag = (event) => {
      if (!panel.classList.contains('bts-dragging')) return;
      panel.classList.remove('bts-dragging');
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      saveConfig();
    };
    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);

    window.addEventListener('resize', () => {
      const rect = panel.getBoundingClientRect();
      clampPanelPosition(panel, rect.left, rect.top);
      saveConfig();
    });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:18px;top:76px;z-index:2147483646;width:340px;color:#f4f0e8;background:linear-gradient(155deg,#171718 0%,#0b0b0c 100%);border:1px solid #443b31;border-radius:14px;box-shadow:0 22px 60px #000b;font:13px/1.4 Inter,Arial,sans-serif;overflow:hidden}
      #${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} button,#${PANEL_ID} input,#${PANEL_ID} select{font:inherit}
      #${PANEL_ID} .bts-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #302a24;background:#211d19;cursor:grab;touch-action:none;user-select:none}
      #${PANEL_ID}.bts-dragging .bts-head{cursor:grabbing}
      #${PANEL_ID} .bts-title{font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}#${PANEL_ID} .bts-sub{color:#a99e91;font-size:11px;margin-top:2px}
      #${PANEL_ID} .bts-collapse{width:28px;height:28px;border:1px solid #51483e;border-radius:8px;background:#151412;color:#ddd;cursor:pointer}
      #${PANEL_ID} .bts-body{padding:14px 16px 16px}#${PANEL_ID}.bts-collapsed .bts-body{display:none}#${PANEL_ID}.bts-collapsed{width:260px}
      #${PANEL_ID} .bts-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}#${PANEL_ID} label{display:grid;gap:5px;color:#bdb4aa;font-size:11px}
      #${PANEL_ID} input,#${PANEL_ID} select{width:100%;height:35px;padding:0 10px;color:#fff;background:#111;border:1px solid #3b352f;border-radius:8px;outline:none}
      #${PANEL_ID} input:focus,#${PANEL_ID} select:focus{border-color:#d39b45;box-shadow:0 0 0 2px #d39b4522}
      #${PANEL_ID} .bts-discounts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}#${PANEL_ID} .bts-discounts label{display:block}
      #${PANEL_ID} .bts-discounts input{position:absolute;opacity:0;pointer-events:none}#${PANEL_ID} .bts-discounts span{display:block;padding:8px 4px;text-align:center;border:1px solid #3b352f;border-radius:8px;background:#121212;color:#aaa;cursor:pointer}
      #${PANEL_ID} .bts-discounts input:checked+span{color:#1a1106;background:#dfa447;border-color:#f3c06f;font-weight:800}
      #${PANEL_ID} .bts-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#302a24;border:1px solid #302a24;border-radius:10px;overflow:hidden;margin:12px 0}
      #${PANEL_ID} .bts-metric{padding:9px 10px;background:#141414}#${PANEL_ID} .bts-metric small{display:block;color:#887f75;font-size:10px;text-transform:uppercase;letter-spacing:.06em}#${PANEL_ID} .bts-metric strong{display:block;margin-top:3px;font-size:12px;color:#eee}
      #${PANEL_ID} .bts-progress{height:5px;background:#292522;border-radius:99px;overflow:hidden}#${PANEL_ID} .bts-progress i{display:block;width:0;height:100%;background:linear-gradient(90deg,#bf6c25,#f1bd62);transition:width .2s}
      #${PANEL_ID} .bts-progress-row{display:flex;justify-content:space-between;color:#999;font-size:11px;margin:7px 0 10px}
      #${PANEL_ID} .bts-actions{display:grid;grid-template-columns:1fr 92px;gap:8px}#${PANEL_ID} .bts-actions button{height:38px;border:0;border-radius:9px;font-weight:800;cursor:pointer}
      #${PANEL_ID} #bts-start{color:#1b1105;background:linear-gradient(135deg,#f0bd66,#c77b2d)}#${PANEL_ID} #bts-stop{color:#f2dede;background:#562020;border:1px solid #7d3030}#${PANEL_ID} button:disabled{opacity:.4;cursor:not-allowed}
      #${PANEL_ID} #bts-status{margin-top:10px;padding:9px 10px;color:#c4bbb0;background:#101010;border-left:3px solid #62584d;border-radius:5px}#${PANEL_ID} #bts-status[data-tone=running]{border-color:#d89a3d;color:#efc982}#${PANEL_ID} #bts-status[data-tone=success]{border-color:#4daa72;color:#8ed6aa}#${PANEL_ID} #bts-status[data-tone=error]{border-color:#c94d4d;color:#ef9999}
      @media(max-width:600px){#${PANEL_ID}{right:8px;top:58px;width:calc(100vw - 16px);max-width:340px}}
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const config = loadConfig();
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    if (config.collapsed) panel.classList.add('bts-collapsed');
    panel.innerHTML = `
      <header class="bts-head"><div><div class="bts-title">Skill Basma</div><div class="bts-sub">Canlı maliyet · yenilenen token</div></div><button class="bts-collapse" type="button" title="Küçült">−</button></header>
      <div class="bts-body">
        <div class="bts-grid">
          <label>Skill<select id="bts-skill">${SKILLS.map((skill) => `<option value="${skill.id}" ${skill.id === Number(config.skillId) ? 'selected' : ''}>${skill.id} · ${skill.name}</option>`).join('')}</select></label>
          <label>Basım adedi<input id="bts-count" type="number" min="1" max="50000" value="${config.count}"></label>
          <label>Min. bekleme (sn)<input id="bts-min" type="number" min="0" step="0.1" value="${config.minDelay}"></label>
          <label>Maks. bekleme (sn)<input id="bts-max" type="number" min="0" step="0.1" value="${config.maxDelay}"></label>
        </div>
        <div class="bts-discounts" role="radiogroup" aria-label="Skill indirimi">
          ${Object.entries(DISCOUNTS).map(([value, item]) => `<label><input type="radio" name="bts-discount" value="${value}" ${String(config.discount) === value ? 'checked' : ''}><span>${item.label}</span></label>`).join('')}
        </div>
        <div class="bts-metrics">
          <div class="bts-metric"><small>Mevcut skill</small><strong id="bts-current">—</strong></div><div class="bts-metric"><small>Mevcut altın</small><strong id="bts-gold">—</strong></div>
          <div class="bts-metric"><small>Tahmini maliyet</small><strong id="bts-cost">—</strong></div><div class="bts-metric"><small>Tahmini kalan</small><strong id="bts-remaining">—</strong></div>
          <div class="bts-metric"><small>Süre aralığı</small><strong id="bts-duration">—</strong></div><div class="bts-metric"><small>Gerçek harcama</small><strong id="bts-spent">0 altın</strong></div>
        </div>
        <div class="bts-progress"><i id="bts-progress-bar"></i></div><div class="bts-progress-row"><span>İlerleme</span><strong id="bts-progress-text">0 / 0</strong></div>
        <div class="bts-actions"><button id="bts-start" type="button">Basmayı başlat</button><button id="bts-stop" type="button" disabled>Durdur</button></div>
        <div id="bts-status" data-tone="ready">Hazır</div>
      </div>`;
    document.body.appendChild(panel);

    if (config.panelX !== null && config.panelY !== null && Number.isFinite(Number(config.panelX)) && Number.isFinite(Number(config.panelY))) {
      clampPanelPosition(panel, Number(config.panelX), Number(config.panelY));
    }
    enablePanelDragging(panel);

    panel.querySelectorAll('input, select').forEach((input) => input.addEventListener('input', refreshEstimate));
    panel.querySelector('#bts-start').addEventListener('click', startTraining);
    panel.querySelector('#bts-stop').addEventListener('click', stopTraining);
    panel.querySelector('.bts-collapse').addEventListener('click', () => {
      panel.classList.toggle('bts-collapsed');
      panel.querySelector('.bts-collapse').textContent = panel.classList.contains('bts-collapsed') ? '+' : '−';
      const rect = panel.getBoundingClientRect();
      clampPanelPosition(panel, rect.left, rect.top);
      saveConfig();
    });
    panel.querySelector('.bts-collapse').textContent = config.collapsed ? '+' : '−';
    refreshEstimate();
  }

  // bt-birlik-magara-orb.user.js icinde skill basma sekmesi varsa (Kontrol paneli)
  // bu bagimsiz panel acilmaz: ayni localStorage anahtarlarini paylastiklari icin
  // iki panel birbirinin basimini bozar.
  function integratedTrainerActive() {
    return window.__BFSkillTrainerIntegrated === true || Boolean(document.getElementById('bf-skill-panel'));
  }

  function boot() {
    if (integratedTrainerActive()) return;
    injectStyles();
    createPanel();
    resumeTraining();
  }

  // Script yukleme sirasi garanti degil; birlesik panel biraz sonra kurulursa
  // yakalayabilmek icin kisa bir gecikmeyle baslatilir.
  window.setTimeout(boot, 400);
})();
