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
  card.className = "report-insight-card";
  card.style.marginBottom = "10px";

  const stageLabel = Number.isInteger(item?.stage) ? `${item.stage}. Kademe` : "Arsiv Kaydi";
  const hostLabel = shortHost(item?.host);
  const resultBadge = item?.result === "pass" ? "DOGRU" : (item?.result === "fail" ? "YANLIS" : "ATLANDI");
  const badgeColor = item?.result === "pass" ? "#22c55e" : (item?.result === "fail" ? "#ef4444" : "#9ca3af");

  const rows = [];
  rows.push(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
    <strong>${escapeHtml(stageLabel)}${hostLabel ? ` / ${escapeHtml(hostLabel)}` : ""}</strong>
    <span style="font-weight:700;color:${badgeColor};">${resultBadge}</span>
  </div>`);
  if (item?.archiveSavedAt) {
    rows.push(`<small>Arsiv tarihi: ${escapeHtml(formatStamp(item.archiveSavedAt))}</small>`);
  }
  rows.push(`<div style="margin-top:6px;">Rakip: ${escapeHtml(item?.enemyRosterText || "-")}</div>`);
  rows.push(`<div>Biz: ${escapeHtml(item?.allyRosterText || "-")}</div>`);

  if (item?.result !== "skipped") {
    rows.push(`<div style="margin-top:6px;">Gerceklesen sonuc: ${escapeHtml(formatWinner(item?.expectedWinner))}</div>`);
    rows.push(`<div>Simulator sonucu: ${escapeHtml(formatWinner(item?.actualWinner))}</div>`);
    rows.push(`<div>Gerceklesen kayip: ${formatNumber(item?.expectedLostBlood)} ; Simulator sonucu: ${formatNumber(item?.actualLostBlood)}</div>`);
    rows.push(`<div>Gerceklesen kayip birlik: ${escapeHtml(formatLosses(item?.expectedAllyLosses))}</div>`);
    rows.push(`<div>Simulator kayip birlik: ${escapeHtml(formatLosses(item?.actualAllyLosses))}</div>`);
  }
  if (item?.differences) {
    rows.push(`<div style="margin-top:6px;color:#f59e0b;">Farklar: ${escapeHtml(item.differences)}</div>`);
  }
  if (item?.note) {
    rows.push(`<div style="margin-top:6px;"><small>${escapeHtml(item.note)}</small></div>`);
  }

  card.innerHTML = rows.join("");
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
      const stageLabel = Number.isInteger(item?.stage) ? `${item.stage}. Kademe` : "Arsiv Kaydi";
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
