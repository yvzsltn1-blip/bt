"use strict";

const ALLY_UNITS = (window.BattleCore && window.BattleCore.ALLY_UNITS) || [];

const PAGE_SIZE = 10;
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";

const testsCountLabel = document.querySelector("#testsCountLabel");
const testsHostFilter = document.querySelector("#testsHostFilter");
const testsExportResultSelect = document.querySelector("#testsExportResultSelect");
const testsExportStageInput = document.querySelector("#testsExportStageInput");
const testsExportLimitInput = document.querySelector("#testsExportLimitInput");
const testsExportBtn = document.querySelector("#testsExportBtn");
const testsRefreshBtn = document.querySelector("#testsRefreshBtn");
const testsTabBar = document.querySelector("#testsTabBar");
const testsPassCount = document.querySelector("#testsPassCount");
const testsFailCount = document.querySelector("#testsFailCount");
const testsSkippedCount = document.querySelector("#testsSkippedCount");
const testsList = document.querySelector("#testsList");
const testsClearBtn = document.querySelector("#testsClearBtn");
const testsAdminAuthStatus = document.querySelector("#testsAdminAuthStatus");
const testsAdminEmailInput = document.querySelector("#testsAdminEmailInput");
const testsAdminPasswordInput = document.querySelector("#testsAdminPasswordInput");
const testsAdminLoginBtn = document.querySelector("#testsAdminLoginBtn");
const testsAdminLogoutBtn = document.querySelector("#testsAdminLogoutBtn");

const TAB_LABELS = { pass: "Dogrular", fail: "Yanlislar", skipped: "Atlananlar" };
const RESULT_LABELS = { pass: "DOGRU", fail: "YANLIS", skipped: "ATLANDI" };

let activeTab = "pass";
let isAdminSession = false;

// Sunucu tarafli sayfalama durumu: yalnizca goruntulenen kayitlar bellekte tutulur.
let loadedItems = [];
let pageCursor = null;
let pageHasMore = false;
let isPageLoading = false;
let counts = { pass: 0, fail: 0, skipped: 0, total: 0 };

initTestsPage();

function initTestsPage() {
  testsTabBar?.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = button.getAttribute("data-tab") || "pass";
      if (nextTab === activeTab) {
        return;
      }
      activeTab = nextTab;
      syncActiveTabButton();
      void loadFirstPage();
    });
  });
  testsHostFilter?.addEventListener("change", () => {
    void refreshAll();
  });
  testsRefreshBtn?.addEventListener("click", () => {
    void refreshAll();
  });
  testsExportBtn?.addEventListener("click", () => {
    void downloadTestsByTypeTxt();
  });
  testsClearBtn?.addEventListener("click", () => {
    void clearAllTests();
  });
  void bindAdminAuth();
  void refreshAll();
}

function getActiveHost() {
  return testsHostFilter?.value || "";
}

function syncActiveTabButton() {
  testsTabBar?.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-tab") === activeTab);
  });
}

// Sunucu/yenile: sayaclari (count aggregation) ve ilk sayfayi birlikte tazeler.
async function refreshAll() {
  syncActiveTabButton();
  await Promise.all([loadCounts(), loadFirstPage()]);
}

async function loadCounts() {
  if (!window.BTFirebase || typeof window.BTFirebase.countArchiveRegressionTests !== "function") {
    return;
  }
  try {
    counts = await window.BTFirebase.countArchiveRegressionTests({ host: getActiveHost() });
  } catch (error) {
    console.warn("Test sayimlari okunamadi.", error);
    counts = { pass: 0, fail: 0, skipped: 0, total: 0 };
  }
  renderCounts();
}

function renderCounts() {
  if (testsPassCount) {
    testsPassCount.textContent = String(counts.pass || 0);
  }
  if (testsFailCount) {
    testsFailCount.textContent = String(counts.fail || 0);
  }
  if (testsSkippedCount) {
    testsSkippedCount.textContent = String(counts.skipped || 0);
  }
  if (testsCountLabel) {
    testsCountLabel.textContent = String(counts.total || 0);
  }
}

async function loadFirstPage() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadArchiveRegressionTestsPage !== "function") {
    testsList.innerHTML = '<p class="summary-empty">Test sonucu servisi hazir degil.</p>';
    return;
  }
  loadedItems = [];
  pageCursor = null;
  pageHasMore = false;
  isPageLoading = true;
  testsList.innerHTML = '<p class="summary-empty">Sonuclar yukleniyor...</p>';
  try {
    const result = await window.BTFirebase.loadArchiveRegressionTestsPage({
      host: getActiveHost(),
      result: activeTab,
      pageSize: PAGE_SIZE,
      cursor: null
    });
    loadedItems = Array.isArray(result?.items) ? result.items : [];
    pageCursor = result?.cursor || null;
    pageHasMore = Boolean(result?.hasMore);
  } catch (error) {
    console.warn("Test sonuclari okunamadi.", error);
    loadedItems = [];
    pageHasMore = false;
  } finally {
    isPageLoading = false;
  }
  renderList();
}

async function loadMore() {
  if (isPageLoading || !pageHasMore) {
    return;
  }
  isPageLoading = true;
  renderList();
  try {
    const result = await window.BTFirebase.loadArchiveRegressionTestsPage({
      host: getActiveHost(),
      result: activeTab,
      pageSize: PAGE_SIZE,
      cursor: pageCursor
    });
    const nextItems = Array.isArray(result?.items) ? result.items : [];
    const seen = new Set(loadedItems.map((item) => item?.id));
    nextItems.forEach((item) => {
      if (!seen.has(item?.id)) {
        loadedItems.push(item);
      }
    });
    pageCursor = result?.cursor || pageCursor;
    pageHasMore = Boolean(result?.hasMore);
  } catch (error) {
    console.warn("Daha fazla test sonucu okunamadi.", error);
    pageHasMore = false;
  } finally {
    isPageLoading = false;
  }
  renderList();
}

function renderList() {
  if (!testsList) {
    return;
  }
  if (!loadedItems.length) {
    testsList.innerHTML = isPageLoading
      ? '<p class="summary-empty">Sonuclar yukleniyor...</p>'
      : `<p class="summary-empty">${TAB_LABELS[activeTab]} sekmesinde kayit yok.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  loadedItems.forEach((item) => fragment.appendChild(buildTestCard(item)));
  testsList.innerHTML = "";
  testsList.appendChild(fragment);

  if (pageHasMore || isPageLoading) {
    const moreWrap = document.createElement("div");
    moreWrap.className = "tests-load-more";

    const moreBtn = document.createElement("button");
    moreBtn.className = "button button-secondary";
    moreBtn.type = "button";
    moreBtn.textContent = isPageLoading ? "Yukleniyor..." : `Daha Fazla Goster (+${PAGE_SIZE})`;
    moreBtn.disabled = isPageLoading || !pageHasMore;
    moreBtn.addEventListener("click", () => {
      void loadMore();
    });

    const totalForTab = Number(counts?.[activeTab] || 0);
    const moreInfo = document.createElement("span");
    moreInfo.className = "tests-load-more-info";
    moreInfo.textContent = totalForTab
      ? `${loadedItems.length} / ${totalForTab} kayit gosteriliyor`
      : `${loadedItems.length} kayit gosteriliyor`;

    moreWrap.appendChild(moreBtn);
    moreWrap.appendChild(moreInfo);
    testsList.appendChild(moreWrap);
  }
}

async function bindAdminAuth() {
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    return;
  }
  await window.AdminAuthUI.bindAdminControls({
    statusLabel: testsAdminAuthStatus,
    emailInput: testsAdminEmailInput,
    passwordInput: testsAdminPasswordInput,
    loginButton: testsAdminLoginBtn,
    logoutButton: testsAdminLogoutBtn,
    onStateChange: (isAdmin) => {
      isAdminSession = isAdmin;
      if (testsClearBtn) {
        testsClearBtn.hidden = !isAdmin;
      }
    }
  });
}

async function clearAllTests() {
  if (!isAdminSession) {
    window.alert("Bu islem icin admin oturumu gerekli.");
    return;
  }
  if (!window.BTFirebase || typeof window.BTFirebase.clearArchiveRegressionTests !== "function") {
    window.alert("Temizleme servisi hazir degil.");
    return;
  }
  if (!window.confirm("Tum arsiv test sonuclari kalici olarak silinecek. Devam edilsin mi?")) {
    return;
  }
  testsClearBtn.disabled = true;
  try {
    await window.BTFirebase.clearArchiveRegressionTests();
    await refreshAll();
  } catch (error) {
    console.warn("Test sonuclari temizlenemedi.", error);
    window.alert(`Temizleme basarisiz: ${String(error?.message || error || "Bilinmeyen hata")}`);
  } finally {
    testsClearBtn.disabled = false;
  }
}

function buildTestCard(item) {
  const card = document.createElement("article");
  card.className = `test-result-card ${item?.result || "skipped"}`;

  const stageLabel = Number.isInteger(item?.stage) ? `${item.stage}. Kat` : "Arsiv Kaydi";
  const hostLabel = shortHost(item?.host);
  const resultBadgeText = RESULT_LABELS[item?.result] || "ATLANDI";
  const canSim = hasSimCounts(item);

  let headerHtml = `
    <div class="trc-header">
      <div class="trc-info">
        <div class="trc-title-row">
          <span class="trc-stage-badge">${escapeHtml(stageLabel)}</span>
          ${hostLabel ? `<span class="trc-host-tag">${escapeHtml(hostLabel)}</span>` : ""}
        </div>
        ${item?.archiveSavedAt ? `
          <span class="trc-date">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Arsiv tarihi: ${escapeHtml(formatStamp(item.archiveSavedAt))}
          </span>
        ` : ""}
      </div>
      <div class="trc-header-actions">
        <span class="trc-status-badge">${resultBadgeText}</span>
        ${canSim ? `<button class="trc-sim-btn" type="button" title="Simulatorde Gor" aria-label="Simulatorde Gor"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>` : ""}
      </div>
    </div>
  `;

  let rostersHtml = `
    <div class="trc-rosters">
      <div class="trc-roster-box">
        <span class="trc-roster-label ally">
          <span class="trc-roster-dot"></span> Biz
        </span>
        <code class="trc-roster-code">${escapeHtml(item?.allyRosterText || "-")}</code>
      </div>
      <div class="trc-roster-box">
        <span class="trc-roster-label enemy">
          <span class="trc-roster-dot"></span> Rakip
        </span>
        <code class="trc-roster-code">${escapeHtml(item?.enemyRosterText || "-")}</code>
      </div>
    </div>
  `;

  let comparisonHtml = "";
  if (item?.result !== "skipped") {
    const expWinner = item?.expectedWinner;
    const actWinner = item?.actualWinner;
    const expWinnerStr = formatWinner(expWinner);
    const actWinnerStr = formatWinner(actWinner);
    
    const expBlood = item?.expectedLostBlood;
    const actBlood = item?.actualLostBlood;
    const expBloodStr = formatNumber(expBlood);
    const actBloodStr = formatNumber(actBlood);
    
    const expLossStr = formatLosses(item?.expectedAllyLosses);
    const actLossStr = formatLosses(item?.actualAllyLosses);

    const winnerMatch = expWinner === actWinner;
    const bloodMatch = expBlood === actBlood;
    const lossMatch = expLossStr === actLossStr;

    comparisonHtml = `
      <div class="trc-metrics-table">
        <div class="trc-grid-row header">
          <div class="trc-cell">Metrik</div>
          <div class="trc-cell">Gerceklesen (Arsiv)</div>
          <div class="trc-cell">Simulator</div>
        </div>
        <div class="trc-grid-row">
          <div class="trc-cell metric-name">Sonuc</div>
          <div class="trc-cell val expected">
            <span class="trc-match-pill ${winnerMatch ? 'match' : 'mismatch'}">${escapeHtml(expWinnerStr)}</span>
          </div>
          <div class="trc-cell val actual">
            <span class="trc-match-pill ${winnerMatch ? 'match' : 'mismatch'}">${escapeHtml(actWinnerStr)}</span>
          </div>
        </div>
        <div class="trc-grid-row">
          <div class="trc-cell metric-name">Kayip Saglik</div>
          <div class="trc-cell val expected">
            <span class="trc-match-pill ${bloodMatch ? 'match' : 'mismatch'}">${escapeHtml(expBloodStr)}</span>
          </div>
          <div class="trc-cell val actual">
            <span class="trc-match-pill ${bloodMatch ? 'match' : 'mismatch'}">${escapeHtml(actBloodStr)}</span>
          </div>
        </div>
        <div class="trc-grid-row">
          <div class="trc-cell metric-name">Kayip Birlik</div>
          <div class="trc-cell val expected">
            <span class="trc-match-pill ${lossMatch ? 'match' : 'mismatch'}">${escapeHtml(expLossStr)}</span>
          </div>
          <div class="trc-cell val actual">
            <span class="trc-match-pill ${lossMatch ? 'match' : 'mismatch'}">${escapeHtml(actLossStr)}</span>
          </div>
        </div>
      </div>
    `;
  }

  let differencesHtml = "";
  if (item?.differences) {
    const parts = item.differences.split("|").map(p => p.trim()).filter(Boolean);
    const partsHtml = parts.map(part => `<span class="trc-diff-pill">${escapeHtml(part)}</span>`).join("");
    
    differencesHtml = `
      <div class="trc-diff-banner">
        <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
        <div class="trc-diff-parts">
          <strong>Farklar:</strong>
          <div class="trc-diff-pills-container">
            ${partsHtml}
          </div>
        </div>
      </div>
    `;
  }

  let noteHtml = "";
  if (item?.note) {
    noteHtml = `
      <div class="trc-note-box">
        <strong>Not:</strong> ${escapeHtml(item.note)}
      </div>
    `;
  }

  card.innerHTML = [headerHtml, rostersHtml, comparisonHtml, differencesHtml, noteHtml].filter(Boolean).join("");

  if (canSim) {
    const simBtn = card.querySelector(".trc-sim-btn");
    simBtn?.addEventListener("click", () => {
      openSimulationForCounts(item.enemyCounts || {}, item.allyCounts || {});
    });
  }

  return card;
}

function hasSimCounts(item) {
  const enemyHas = Object.values(item?.enemyCounts || {}).some((value) => Number(value) > 0);
  const allyHas = Object.values(item?.allyCounts || {}).some((value) => Number(value) > 0);
  return enemyHas && allyHas;
}

function openSimulationForCounts(enemyCounts, allyCounts) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts,
      seed: null,
      roundingMode: null
    }));
    const opened = window.open("index.html", "_blank");
    if (!opened) {
      window.alert("Simulasyon yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol edin.");
      return;
    }
    opened.focus?.();
  } catch (error) {
    window.alert(`Simulasyon ekranina gecilemedi: ${String(error?.message || error || "Bilinmeyen hata")}`);
  }
}

// "Kat" girisini ayristirir: "" -> [] (tum katlar), "5" -> [5], "1-10" -> [1..10].
// Gecersiz format icin null doner (cagiran taraf uyari verir).
function parseStageInput(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return [];
  }
  const rangeMatch = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    let a = Number.parseInt(rangeMatch[1], 10);
    let b = Number.parseInt(rangeMatch[2], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    if (a > b) {
      const tmp = a; a = b; b = tmp;
    }
    const out = [];
    for (let s = a; s <= b; s += 1) {
      out.push(s);
    }
    return out;
  }
  if (/^\d+$/.test(text)) {
    return [Number.parseInt(text, 10)];
  }
  return null;
}

async function downloadTestsByTypeTxt() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadArchiveRegressionTestsForExport !== "function") {
    window.alert("Indirme servisi hazir degil.");
    return;
  }

  const host = getActiveHost();
  const result = ["pass", "fail", "skipped"].includes(testsExportResultSelect?.value)
    ? testsExportResultSelect.value
    : "pass";
  const rawLimit = Number.parseInt(testsExportLimitInput?.value || "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 0;
  const typeLabel = TAB_LABELS[result] || "Dogrular";

  const stages = parseStageInput(testsExportStageInput?.value || "");
  if (stages === null) {
    window.alert("Kat formati gecersiz. Ornek: 1  veya  1-10");
    return;
  }
  if (stages.length > 300) {
    window.alert("Kat araligi cok genis (en fazla 300 kat). Lutfen daralt.");
    return;
  }
  const stageLabel = stages.length === 0
    ? "Tum katlar"
    : (stages.length === 1 ? `Kat ${stages[0]}` : `Kat ${Math.min(...stages)}-${Math.max(...stages)}`);

  // Kat secilmemis + limit yok + o turde cok kayit varsa onay iste (tek seferlik okuma).
  const knownForType = Number(counts?.[result] || 0);
  if (!limit && stages.length === 0 && knownForType > 500
    && !window.confirm(`${knownForType} ${typeLabel.toLowerCase()} kaydi indirilecek (tek seferlik okuma). Devam edilsin mi?`)) {
    return;
  }

  const originalLabel = testsExportBtn ? testsExportBtn.textContent : "";
  if (testsExportBtn) {
    testsExportBtn.disabled = true;
    testsExportBtn.textContent = "Hazirlaniyor...";
  }

  let filtered = [];
  try {
    filtered = await window.BTFirebase.loadArchiveRegressionTestsForExport({ host, result, limit, stages });
  } catch (error) {
    console.warn("Kayitlar indirilemedi.", error);
    window.alert(`Indirme basarisiz: ${String(error?.message || error || "Bilinmeyen hata")}`);
    return;
  } finally {
    if (testsExportBtn) {
      testsExportBtn.disabled = false;
      testsExportBtn.textContent = originalLabel;
    }
  }

  if (!filtered.length) {
    window.alert("Indirilecek kayit yok.");
    return;
  }

  const scopeText = limit ? `Son ${filtered.length}` : `Tumu (${filtered.length})`;
  const lines = [
    "Arsiv Toplu Test Sonuclari",
    `Sunucu: ${host ? shortHost(host) : "Tumu"}`,
    `Tur: ${typeLabel} | Kat: ${stageLabel} | Kapsam: ${scopeText} | Siralama: Kat (kucukten buyuge)`,
    ""
  ];

  // Secim en yeniye gore yapildi; cikti KAT artan, esitlikte en yeni ustte.
  filtered
    .slice()
    .sort((a, b) => {
      const stageA = Number.isInteger(a?.stage) ? a.stage : Number.MAX_SAFE_INTEGER;
      const stageB = Number.isInteger(b?.stage) ? b.stage : Number.MAX_SAFE_INTEGER;
      if (stageA !== stageB) {
        return stageA - stageB;
      }
      return String(b?.testedAt || "").localeCompare(String(a?.testedAt || ""));
    })
    .forEach((item, index) => {
      const stageLabel = Number.isInteger(item?.stage) ? `${item.stage}. Kat` : "Arsiv Kaydi";
      const resultLabel = RESULT_LABELS[item?.result] || "ATLANDI";
      lines.push(`#${index + 1} [${resultLabel}] ${stageLabel}${item?.host ? ` / ${shortHost(item.host)}` : ""}`);
      if (item?.archiveSavedAt) {
        lines.push(`Tarih: ${formatStamp(item.archiveSavedAt)}`);
      }
      lines.push(`Rakip: ${item?.enemyRosterText || "-"}`);
      lines.push(`Biz: ${item?.allyRosterText || "-"}`);
      if (item?.result !== "skipped") {
        lines.push(`Gerceklesen sonuc: ${formatWinner(item?.expectedWinner)}`);
        lines.push(`Simulator sonucu: ${formatWinner(item?.actualWinner)}`);
        lines.push(`Gerceklesen kayip: ${formatNumber(item?.expectedLostBlood)} ; Simulator sonucu: ${formatNumber(item?.actualLostBlood)}`);
        lines.push(`Gerceklesen kayip birlik: ${formatLosses(item?.expectedAllyLosses)}`);
        lines.push(`Simulator kayip birlik: ${formatLosses(item?.actualAllyLosses)}`);
      }
      if (item?.differences) {
        lines.push(`Farklar: ${item.differences}`);
      }
      if (item?.note) {
        lines.push(`Not: ${item.note}`);
      }
      lines.push("");
    });

  const scopeSlug = limit ? `son${filtered.length}` : `tumu${filtered.length}`;
  const stageSlug = stages.length === 0
    ? "tumkat"
    : (stages.length === 1 ? `kat${stages[0]}` : `kat${Math.min(...stages)}-${Math.max(...stages)}`);
  downloadTextFile(lines.join("\n"), `test-sonuclari-${result}-${stageSlug}-${scopeSlug}-${buildTimestampForFile()}.txt`);
}

function formatWinner(winner) {
  if (winner === "ally") {
    return "Galibiyet (dusman yenildi)";
  }
  if (winner === "enemy") {
    return "Maglubiyet (muttefikler yenildi)";
  }
  return "Belirsiz";
}

function formatLosses(lossMap) {
  const parts = ALLY_UNITS
    .map((unit) => ({ label: unit.label, count: Number(lossMap?.[unit.key] || 0) }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.label} x${entry.count}`);
  return parts.length ? parts.join(", ") : "-";
}

function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("tr-TR") : "-";
}

function shortHost(host) {
  const text = String(host || "");
  const match = text.match(/^(s\d+)/i);
  return match ? match[1] : text;
}

function formatStamp(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }
  return date.toLocaleString("tr-TR");
}

function buildTimestampForFile() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function downloadTextFile(text, fileName) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
