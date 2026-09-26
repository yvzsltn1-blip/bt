// ==UserScript==
// @name         BT Savas Raporu Istatistik
// @namespace    https://bt-analiz.web.app
// @version      1.2.1
// @description  Tarih Oncesi Harabeler savas raporlari: kat ve tarih filtreli birim kaybi, altin, tecrube ve parca toplami
// @match        *://*.bitefight.gameforge.com/ancestral/battlereport*
// @run-at       document-idle
// @grant        none
// @updateURL    https://bt-analiz.web.app/stats.user.js
// @downloadURL  https://bt-analiz.web.app/stats.user.js
// ==/UserScript==

// Veri kaynagi: savas raporu LISTE sayfalari (/ancestral/battlereport?page=N).
// Her satirda kat, tarih, bizim birimlerin gonderilen/kalan sayilari ve oduller var.
// Kayip = gonderilen - kalan (rapor anindaki deger; tasla diriltme bunu degistirmez).

(function () {
  'use strict';

  const PAGE_DELAY_MIN_MS = 800;
  const PAGE_DELAY_MAX_MS = 2500;
  const KEEP_DAYS = 7;
  const BLOOD_BY_TIER = { 1: 10, 2: 15, 3: 20, 4: 35, 5: 50, 6: 75, 7: 90, 8: 150 };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseNum = (text) => Number(String(text || '').replace(/[^\d]/g, '')) || 0;
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

  async function getDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // "2026-09-2503:32:33" veya "2026-09-25 03:32:33" -> yerel zaman damgasi
  function parseTime(text) {
    const m = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})\D*(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  }

  function parseRow(row) {
    const stage = parseNum((row.querySelector('.clLayerTitle') || {}).textContent);
    const ts = parseTime((row.querySelector('.clTime') || {}).textContent);
    const side = row.querySelector('.clSide');
    const units = [];
    if (side) {
      side.querySelectorAll('.unit-chip').forEach((chip) => {
        const img = (chip.querySelector('img') || {}).src || '';
        const tier = Number((img.match(/Tier(\d)/) || [])[1]) || 0;
        const sent = parseNum((chip.querySelector('.badge-ini') || {}).textContent);
        const left = parseNum((chip.querySelector('.badge-rem') || {}).textContent);
        const lost = Math.max(0, sent - left);
        if (!sent && !lost) return;
        units.push({ name: chip.getAttribute('title') || `Tier ${tier}`, tier, sent, lost, blood: lost * (BLOOD_BY_TIER[tier] || 0) });
      });
    }
    let gold = 0;
    let exp = 0;
    let fragments = 0;
    row.querySelectorAll('.clRewards .reward-chip').forEach((chip) => {
      const value = (chip.querySelector('.val') || {}).textContent || '';
      if (/seviye/i.test(value)) return;
      const img = (chip.querySelector('img') || {}).src || '';
      if (chip.classList.contains('exp')) exp += parseNum(value);
      else if (/gold/i.test(img)) gold += parseNum(value);
      else if (/fragment|splinter|parca/i.test(img)) fragments += parseNum(value);
    });
    return {
      id: ((row.getAttribute('href') || '').match(/battlereport\/(\d+)/) || [])[1] || '',
      stage,
      ts,
      won: row.classList.contains('won'),
      units,
      gold,
      exp,
      fragments,
      blood: units.reduce((sum, u) => sum + u.blood, 0)
    };
  }

  // Onbellek: coveredFrom ve sonrasindaki TUM raporlar reports icinde (eksiksiz aralik).
  const CACHE_KEY = 'btStatsCacheV1:' + location.host;
  function loadCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cache && cache.reports) {
        // Eski kayitlarda units string olarak yazilmis olabilir.
        Object.values(cache.reports).forEach((r) => {
          if (typeof r.units === 'string') { try { r.units = JSON.parse(r.units); } catch (error) { r.units = []; } }
          if (!Array.isArray(r.units)) r.units = [];
        });
        return cache;
      }
    } catch (error) { /* bos onbellekle devam */ }
    return { reports: {}, coveredFrom: null };
  }
  // Oyun sayfasi (Prototype.js) Array.prototype.toJSON ekliyor; diziler string'e
  // donusmesin diye yazarken gecici olarak kaldir.
  function saveCache(cache) {
    const own = Object.prototype.hasOwnProperty.call(Array.prototype, 'toJSON');
    const toJSON = Array.prototype.toJSON;
    try {
      if (own) delete Array.prototype.toJSON;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) { /* kota/erisim */ } finally {
      if (own) Array.prototype.toJSON = toJSON; // eslint-disable-line no-extend-native
    }
  }
  let coveredFrom = (() => { const c = loadCache().coveredFrom; return c == null ? Infinity : c; })();

  // Acik sekme zaten liste 1. sayfasiysa ekstra istek atma.
  function isOnFirstListPage() {
    const page = new URLSearchParams(location.search).get('page');
    return /\/ancestral\/battlereport\/?$/.test(location.pathname) && (!page || page === '1');
  }
  const getListPage = (page) => (page === 1 && isOnFirstListPage()
    ? Promise.resolve(document)
    : getDoc(page === 1 ? '/ancestral/battlereport' : '/ancestral/battlereport?page=' + page));

  // Yeniden eskiye tarar; bilinen rapora (onbellek aralik yeterliyse) veya
  // istenen tarihten eskiye ulasinca durur.
  async function collectReports(neededFrom, onProgress) {
    const cache = loadCache();
    const known = cache.reports;
    const oldCovered = cache.coveredFrom == null ? Infinity : cache.coveredFrom;
    let newCovered = Infinity;
    let maxPage = 1;
    let added = 0;
    for (let page = 1; ; page += 1) {
      if (page > 1) await sleep(PAGE_DELAY_MIN_MS + Math.random() * (PAGE_DELAY_MAX_MS - PAGE_DELAY_MIN_MS));
      const doc = await getListPage(page);
      if (page === 1) {
        maxPage = Math.max(1, ...[...doc.querySelectorAll('a[href*="battlereport?page="]')]
          .map((a) => Number((a.getAttribute('href').match(/page=(\d+)/) || [0, 1])[1])));
      }
      const rows = [...doc.querySelectorAll('a.clRow')].map(parseRow).filter((r) => r.id);
      let hitKnown = false;
      let oldest = Infinity;
      rows.forEach((r) => {
        const prev = known[r.id];
        if (prev && prev.ts >= oldCovered) hitKnown = true;
        if (!prev) added += 1;
        known[r.id] = r;
        if (r.ts) oldest = Math.min(oldest, r.ts);
      });
      onProgress(`Sayfa ${page}/${maxPage} (${added} yeni savas)`);
      if (page >= maxPage || !rows.length) { newCovered = 0; break; }
      if (hitKnown && oldCovered <= neededFrom) { newCovered = oldCovered; break; }
      if (oldest < neededFrom) { newCovered = oldest; break; }
    }
    // Diske sadece son KEEP_DAYS gun yazilir; daha eskisi bu oturumda bellekte kalir.
    const all = Object.values(known);
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).setHours(0, 0, 0, 0);
    const kept = {};
    all.forEach((r) => { if (r.ts >= cutoff) kept[r.id] = r; });
    saveCache({ reports: kept, coveredFrom: Math.max(newCovered, cutoff) });
    coveredFrom = newCovered;
    return { reports: all, added };
  }

  function summarize(reports) {
    const totals = { count: 0, wins: 0, gold: 0, exp: 0, fragments: 0, blood: 0, units: new Map() };
    reports.forEach((report) => {
      totals.count += 1;
      if (report.won) totals.wins += 1;
      totals.gold += report.gold;
      totals.exp += report.exp;
      totals.fragments += report.fragments;
      totals.blood += report.blood;
      report.units.forEach((unit) => {
        if (!unit.lost) return;
        const entry = totals.units.get(unit.name) || { name: unit.name, tier: unit.tier, lost: 0, blood: 0 };
        entry.lost += unit.lost;
        entry.blood += unit.blood;
        totals.units.set(unit.name, entry);
      });
    });
    return totals;
  }

  // ---------------------------------------------------------------- arayuz
  const style = document.createElement('style');
  style.textContent = `
    #btStatsPanel { position: fixed; top: 70px; right: 12px; width: 320px; max-height: 86vh; overflow: auto;
      background: #17110d; color: #f0e2c8; border: 1px solid rgba(210,168,108,.45); border-radius: 10px;
      font: 12px/1.45 Arial, sans-serif; z-index: 99999; box-shadow: 0 6px 24px rgba(0,0,0,.55); }
    #btStatsPanel header { display: flex; align-items: center; justify-content: space-between; gap: 6px;
      padding: 8px 10px; background: rgba(210,168,108,.14); cursor: move; }
    #btStatsPanel h3 { margin: 0; font-size: 13px; color: #e8c98b; }
    #btStatsPanel .btBody { padding: 8px 10px 12px; }
    #btStatsPanel button { cursor: pointer; background: #241a13; color: #f0e2c8; border: 1px solid rgba(210,168,108,.4);
      border-radius: 6px; padding: 4px 7px; font-size: 11px; }
    #btStatsPanel button:hover { background: #31241a; }
    #btStatsPanel button.btActive { background: #5a3c1d; border-color: #d2a86c; }
    #btStatsPanel input { background: #120d0a; color: #f0e2c8; border: 1px solid rgba(210,168,108,.35);
      border-radius: 5px; padding: 3px 5px; font-size: 11px; width: 100%; box-sizing: border-box; }
    #btStatsPanel .btRow { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; }
    #btStatsPanel .btRow > * { flex: 1 1 auto; }
    #btStatsPanel table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    #btStatsPanel td, #btStatsPanel th { padding: 3px 4px; border-bottom: 1px solid rgba(210,168,108,.15); text-align: right; }
    #btStatsPanel th:first-child, #btStatsPanel td:first-child { text-align: left; }
    #btStatsPanel .btTotals { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; margin: 8px 0 4px; }
    #btStatsPanel .btTotals span { color: #c3ae90; }
    #btStatsPanel .btTotals b { text-align: right; }
    #btStatsPanel .btStatus { color: #c3ae90; min-height: 16px; margin-top: 8px; }
    #btStatsPanel label { display: block; color: #c3ae90; margin-bottom: 2px; font-size: 10.5px; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'btStatsPanel';
  panel.innerHTML = `
    <header>
      <h3>Savas Istatistigi <small>v1.2.1</small></h3>
      <div>
        <button id="btStatsRefresh" title="Raporlari yeniden tara">Yenile</button>
        <button id="btStatsToggle" title="Kucult">_</button>
      </div>
    </header>
    <div class="btBody">
      <div class="btRow">
        <button class="btStage" data-min="1" data-max="9999">Tum katlar</button>
        <button class="btStage" data-min="1" data-max="10">1-10</button>
        <button class="btStage" data-min="11" data-max="20">11-20</button>
        <button class="btStage" data-min="21" data-max="30">21-30</button>
        <button class="btStage" data-min="31" data-max="40">31-40</button>
        <button class="btStage" data-min="41" data-max="9999">41+</button>
      </div>
      <div class="btRow">
        <div><label>Kat min</label><input id="btStageMin" type="number" min="0" value="1"></div>
        <div><label>Kat max</label><input id="btStageMax" type="number" min="0" value="9999"></div>
      </div>
      <div class="btRow">
        <button class="btDate" data-range="today">Bugun</button>
        <button class="btDate" data-range="7">Son 7 gun</button>
        <button class="btDate" data-range="all">Tum zaman</button>
      </div>
      <div class="btRow">
        <div><label>Baslangic</label><input id="btFrom" type="datetime-local"></div>
        <div><label>Bitis</label><input id="btTo" type="datetime-local"></div>
      </div>
      <div class="btTotals">
        <span>Savas</span><b id="btCount">-</b>
        <span>Zafer</span><b id="btWins">-</b>
        <span>Altin</span><b id="btGold">-</b>
        <span>Tecrube</span><b id="btExp">-</b>
        <span>Parca</span><b id="btFragments">-</b>
        <span>Kan kaybi</span><b id="btBlood">-</b>
        <span>Olen birim</span><b id="btUnitsTotal">-</b>
      </div>
      <table>
        <thead><tr><th>Birim</th><th>Olen</th><th>Kan</th></tr></thead>
        <tbody id="btUnitRows"><tr><td colspan="3">Veri yok</td></tr></tbody>
      </table>
      <div class="btStatus" id="btStatus">Hazir</div>
    </div>`;
  document.body.appendChild(panel);

  const $ = (id) => panel.querySelector('#' + id);
  const status = (text) => { $('btStatus').textContent = text; };

  (function enableDrag() {
    const header = panel.querySelector('header');
    let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;
    header.addEventListener('mousedown', (event) => {
      if (event.target.tagName === 'BUTTON') return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      startX = event.clientX; startY = event.clientY; startLeft = rect.left; startTop = rect.top;
      event.preventDefault();
    });
    document.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      panel.style.left = `${startLeft + event.clientX - startX}px`;
      panel.style.top = `${startTop + event.clientY - startY}px`;
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  })();

  $('btStatsToggle').onclick = () => {
    const body = panel.querySelector('.btBody');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    $('btStatsToggle').textContent = hidden ? '_' : '+';
  };

  let allReports = [];

  function render() {
    const min = Number($('btStageMin').value) || 0;
    const max = Number($('btStageMax').value) || 9999;
    const from = $('btFrom').value ? new Date($('btFrom').value).getTime() : 0;
    const to = $('btTo').value ? new Date($('btTo').value).getTime() : Infinity;
    const filtered = allReports.filter((r) => r.stage >= min && r.stage <= max && r.ts >= from && r.ts <= to);
    const totals = summarize(filtered);
    $('btCount').textContent = fmt(totals.count);
    $('btWins').textContent = `${fmt(totals.wins)} / ${fmt(totals.count)}`;
    $('btGold').textContent = fmt(totals.gold);
    $('btExp').textContent = fmt(totals.exp);
    $('btFragments').textContent = fmt(totals.fragments);
    $('btBlood').textContent = fmt(totals.blood);
    const units = [...totals.units.values()].sort((a, b) => (a.tier - b.tier) || (b.lost - a.lost));
    $('btUnitsTotal').textContent = fmt(units.reduce((sum, u) => sum + u.lost, 0));
    $('btUnitRows').innerHTML = units.length
      ? units.map((u) => `<tr><td>${u.name}</td><td>${fmt(u.lost)}</td><td>${fmt(u.blood)}</td></tr>`).join('')
      : '<tr><td colspan="3">Kayip yok</td></tr>';
  }

  const toLocalInput = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  panel.querySelectorAll('.btStage').forEach((button) => {
    button.onclick = () => {
      panel.querySelectorAll('.btStage').forEach((b) => b.classList.remove('btActive'));
      button.classList.add('btActive');
      $('btStageMin').value = button.dataset.min;
      $('btStageMax').value = button.dataset.max;
      render();
    };
  });

  panel.querySelectorAll('.btDate').forEach((button) => {
    button.onclick = () => {
      panel.querySelectorAll('.btDate').forEach((b) => b.classList.remove('btActive'));
      button.classList.add('btActive');
      const range = button.dataset.range;
      if (range === 'all') {
        $('btFrom').value = '';
        $('btTo').value = '';
      } else {
        const start = range === 'today' ? new Date() : new Date(Date.now() - Number(range) * 86400000);
        start.setHours(0, 0, 0, 0);
        $('btFrom').value = toLocalInput(start);
        $('btTo').value = '';
      }
      renderAndWiden();
    };
  });

  ['btStageMin', 'btStageMax', 'btTo'].forEach((id) => { $(id).oninput = render; });
  $('btFrom').oninput = renderAndWiden;

  const neededFrom = () => ($('btFrom').value ? new Date($('btFrom').value).getTime() : 0);
  let busy = false;
  let pending = false;

  async function refresh() {
    if (busy) { pending = true; return; }
    busy = true;
    $('btStatsRefresh').disabled = true;
    try {
      const result = await collectReports(neededFrom(), status);
      allReports = result.reports;
      status(`${result.added} yeni savas, onbellekte ${allReports.length}`);
      render();
    } catch (error) {
      status('Hata: ' + ((error && error.message) || error));
    } finally {
      busy = false;
      $('btStatsRefresh').disabled = false;
    }
    if (pending) { pending = false; refresh(); }
  }

  // Filtre onbellegin kapsamadigi eski tarihe genislerse eksik sayfalari cek.
  let widenTimer = 0;
  function renderAndWiden() {
    render();
    if (neededFrom() >= coveredFrom) return;
    clearTimeout(widenTimer);
    widenTimer = setTimeout(refresh, 700);
  }

  $('btStatsRefresh').onclick = refresh;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  $('btFrom').value = toLocalInput(todayStart);
  panel.querySelector('.btDate[data-range="today"]').classList.add('btActive');
  panel.querySelector('.btStage[data-min="1"][data-max="9999"]').classList.add('btActive');
  allReports = Object.values(loadCache().reports);
  render();
  refresh();
})();
