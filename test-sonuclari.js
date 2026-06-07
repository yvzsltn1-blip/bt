"use strict";

const ALLY_UNITS = (window.BattleCore && window.BattleCore.ALLY_UNITS) || [];

const testsCountLabel = document.querySelector("#testsCountLabel");
const testsHostFilter = document.querySelector("#testsHostFilter");
const testsDownloadTxtBtn = document.querySelector("#testsDownloadTxtBtn");
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

let allTests = [];
let activeTab = "pass";
let isAdminSession = false;

initTestsPage();

function initTestsPage() {
  testsTabBar?.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.getAttribute("data-tab") || "pass";
      renderTests();
    });
  });
  testsHostFilter?.addEventListener("change", renderTests);
  testsRefreshBtn?.addEventListener("click", () => {
    void loadTests();
  });
  testsDownloadTxtBtn?.addEventListener("click", downloadActiveTabTxt);
  testsClearBtn?.addEventListener("click", () => {
    void clearAllTests();
  });
  void bindAdminAuth();
  void loadTests();
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
    await loadTests();
  } catch (error) {
    console.warn("Test sonuclari temizlenemedi.", error);
    window.alert(`Temizleme basarisiz: ${String(error?.message || error || "Bilinmeyen hata")}`);
  } finally {
    testsClearBtn.disabled = false;
  }
}

async function loadTests() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadArchiveRegressionTests !== "function") {
    testsList.innerHTML = '<p class="summary-empty">Test sonucu servisi hazir degil.</p>';
    return;
  }
  testsList.innerHTML = '<p class="summary-empty">Sonuclar yukleniyor...</p>';
  try {
    allTests = await window.BTFirebase.loadArchiveRegressionTests();
  } catch (error) {
    console.warn("Test sonuclari okunamadi.", error);
    allTests = [];
  }
  renderTests();
}

function getHostFilteredTests() {
  const host = testsHostFilter?.value || "";
  return (allTests || []).filter((item) => !host || String(item?.host || "") === host);
}

function renderTests() {
  const filtered = getHostFilteredTests();
  const pass = filtered.filter((item) => item?.result === "pass");
  const fail = filtered.filter((item) => item?.result === "fail");
  const skipped = filtered.filter((item) => item?.result === "skipped");

  if (testsPassCount) {
    testsPassCount.textContent = String(pass.length);
  }
  if (testsFailCount) {
    testsFailCount.textContent = String(fail.length);
  }
  if (testsSkippedCount) {
    testsSkippedCount.textContent = String(skipped.length);
  }
  if (testsCountLabel) {
    testsCountLabel.textContent = String(filtered.length);
  }

  testsTabBar?.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-tab") === activeTab);
  });

  const active = activeTab === "fail" ? fail : (activeTab === "skipped" ? skipped : pass);
  renderTestsList(active);
}

function renderTestsList(items) {
  if (!testsList) {
    return;
  }
  if (!items.length) {
    testsList.innerHTML = `<p class="summary-empty">${TAB_LABELS[activeTab]} sekmesinde kayit yok.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  items
    .slice()
    .sort((a, b) => String(b?.testedAt || "").localeCompare(String(a?.testedAt || "")))
    .forEach((item) => fragment.appendChild(buildTestCard(item)));
  testsList.innerHTML = "";
  testsList.appendChild(fragment);
}

function buildTestCard(item) {
  const card = document.createElement("article");
  card.className = `test-result-card ${item?.result || "skipped"}`;

  const stageLabel = Number.isInteger(item?.stage) ? `${item.stage}. Kat` : "Arsiv Kaydi";
  const hostLabel = shortHost(item?.host);
  const resultBadgeText = item?.result === "pass" ? "DOGRU" : (item?.result === "fail" ? "YANLIS" : "ATLANDI");

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
      <span class="trc-status-badge">${resultBadgeText}</span>
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

    const winnerClass = expWinner === actWinner ? "status-match" : "status-mismatch";
    const bloodClass = expBlood === actBlood ? "status-match" : "status-mismatch";
    const lossClass = expLossStr === actLossStr ? "status-match" : "status-mismatch";

    const expWinnerBadgeClass = expWinner === "ally" ? "ally-win" : (expWinner === "enemy" ? "enemy-win" : "");
    const actWinnerBadgeClass = actWinner === "ally" ? "ally-win" : (actWinner === "enemy" ? "enemy-win" : "");

    comparisonHtml = `
      <div class="trc-metrics-table">
        <div class="trc-grid-row header">
          <div class="trc-cell">Metrik</div>
          <div class="trc-cell">Gerceklesen (Arsiv)</div>
          <div class="trc-cell">Simulator</div>
        </div>
        <div class="trc-grid-row">
          <div class="trc-cell metric-name">Sonuc</div>
          <div class="trc-cell val expected ${winnerClass}">
            <span class="trc-winner-badge ${expWinnerBadgeClass}">${escapeHtml(expWinnerStr)}</span>
          </div>
          <div class="trc-cell val actual ${winnerClass}">
            <span class="trc-winner-badge ${actWinnerBadgeClass}">${escapeHtml(actWinnerStr)}</span>
          </div>
        </div>
        <div class="trc-grid-row">
          <div class="trc-cell metric-name">Kayip Saglik</div>
          <div class="trc-cell val expected ${bloodClass}">${escapeHtml(expBloodStr)}</div>
          <div class="trc-cell val actual ${bloodClass}">${escapeHtml(actBloodStr)}</div>
        </div>
        <div class="trc-grid-row">
          <div class="trc-cell metric-name">Kayip Birlik</div>
          <div class="trc-cell val expected ${lossClass}">${escapeHtml(expLossStr)}</div>
          <div class="trc-cell val actual ${lossClass}">${escapeHtml(actLossStr)}</div>
        </div>
      </div>
    `;
  }

  let differencesHtml = "";
  if (item?.differences) {
    differencesHtml = `
      <div class="trc-diff-banner">
        <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
        <div><strong>Farklar:</strong> ${escapeHtml(item.differences)}</div>
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
  return card;
}

function downloadActiveTabTxt() {
  const filtered = getHostFilteredTests().filter((item) => item?.result === activeTab);
  if (!filtered.length) {
    window.alert("Indirilecek kayit yok.");
    return;
  }

  const host = testsHostFilter?.value || "";
  const lines = [
    "Arsiv Toplu Test Sonuclari",
    `Sekme: ${TAB_LABELS[activeTab]}`,
    `Sunucu: ${host ? shortHost(host) : "Tumu"}`,
    `Kayit: ${filtered.length}`,
    ""
  ];

  filtered
    .slice()
    .sort((a, b) => String(b?.testedAt || "").localeCompare(String(a?.testedAt || "")))
    .forEach((item, index) => {
      const stageLabel = Number.isInteger(item?.stage) ? `${item.stage}. Kat` : "Arsiv Kaydi";
      lines.push(`#${index + 1} ${stageLabel}${item?.host ? ` / ${shortHost(item.host)}` : ""}`);
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

  downloadTextFile(lines.join("\n"), `test-${activeTab}-${buildTimestampForFile()}.txt`);
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
