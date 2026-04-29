"use strict";

const { ENEMY_UNITS, ALLY_UNITS, BLOOD_BY_ALLY_KEY } = window.BattleCore;

const wrongList = document.querySelector("#wrongList");
const wrongCountLabel = document.querySelector("#wrongCountLabel");
const clearWrongBtn = document.querySelector("#clearWrongBtn");
const wrongSearchInput = document.querySelector("#wrongSearchInput");
const wrongSideFilter = document.querySelector("#wrongSideFilter");
const wrongTierFilter = document.querySelector("#wrongTierFilter");
const wrongUsageFilter = document.querySelector("#wrongUsageFilter");
const resetWrongFiltersBtn = document.querySelector("#resetWrongFiltersBtn");
const exportWrongCsvBtn = document.querySelector("#exportWrongCsvBtn");
const exportWrongTxtBtn = document.querySelector("#exportWrongTxtBtn");
const exportWrongAllTxtBtn = document.querySelector("#exportWrongAllTxtBtn");
const wrongStartDateInput = document.querySelector("#wrongStartDateInput");
const wrongEndDateInput = document.querySelector("#wrongEndDateInput");
const wrongFilterMeta = document.querySelector("#wrongFilterMeta");
const wrongPagination = document.querySelector("#wrongPagination");
const wrongPrevPageBtn = document.querySelector("#wrongPrevPageBtn");
const wrongNextPageBtn = document.querySelector("#wrongNextPageBtn");
const wrongPageInfo = document.querySelector("#wrongPageInfo");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
const PAGE_SIZE = 10;
const unitLabelMap = new Map(
  [...ENEMY_UNITS, ...ALLY_UNITS].map((unit) => [unit.key, unit.label])
);
const FILTERABLE_UNITS = [...ENEMY_UNITS, ...ALLY_UNITS].map((unit) => ({
  key: unit.key,
  label: unit.label,
  tier: extractTierLabel(unit.label),
  side: ENEMY_UNITS.some((candidate) => candidate.key === unit.key) ? "enemy" : "ally"
}));

let isAdminSession = false;
let allWrongItems = [];
let filteredWrongItems = [];
let wrongCurrentPage = 0;

syncAdminActions();
bindFilterControls();

void renderWrongReports();
void bindAdminAuth();

clearWrongBtn.addEventListener("click", async () => {
  if (!isAdminSession) {
    return;
  }
  const password = String(adminPasswordInput?.value || "");
  if (!password.trim()) {
    window.alert("Tumunu Sil icin sifreyi tekrar girmen gerekiyor.");
    adminPasswordInput?.focus();
    return;
  }
  const items = await loadWrongReports();
  if (items.length === 0) {
    return;
  }
  if (!window.confirm("Tum yanlis raporlari silinsin mi?")) {
    return;
  }
  clearWrongBtn.disabled = true;
  try {
    await window.BTFirebase.verifyAdminPassword(password);
    await window.BTFirebase.clearWrongReports();
    if (adminPasswordInput) {
      adminPasswordInput.value = "";
    }
    await renderWrongReports();
  } catch (error) {
    if (adminPasswordInput) {
      adminPasswordInput.value = "";
    }
    console.warn("Yanlis raporlari silinemedi.", error);
    window.alert(error?.message || "Yanlis raporlari silinemedi.");
  } finally {
    syncAdminActions();
  }
});

function syncAdminActions() {
  clearWrongBtn.disabled = !isAdminSession;
  clearWrongBtn.title = isAdminSession ? "Bu islem icin sifre tekrar istenir." : "Tum raporlari silmek icin admin girisi gerekli.";
}

async function bindAdminAuth() {
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    return;
  }

  await window.AdminAuthUI.bindAdminControls({
    statusLabel: adminAuthStatus,
    emailInput: adminEmailInput,
    passwordInput: adminPasswordInput,
    loginButton: adminLoginBtn,
    logoutButton: adminLogoutBtn,
    onStateChange: async (isAdmin) => {
      isAdminSession = isAdmin;
      syncAdminActions();
      await renderWrongReports();
    }
  });
}

async function loadWrongReports() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadWrongReports !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadWrongReports();
  } catch (error) {
    console.warn("Yanlis raporlari yuklenemedi.", error);
    return [];
  }
}

async function renderWrongReports() {
  allWrongItems = (await loadWrongReports()).sort((a, b) => (b.reportedAt || "").localeCompare(a.reportedAt || ""));
  syncAdminActions();
  applyWrongFilters();
}

function renderWrongPage(items) {
  wrongList.innerHTML = "";

  if (items.length === 0) {
    wrongList.innerHTML = allWrongItems.length === 0
      ? '<p class="summary-empty">Henuz kaydedilmis yanlis raporu yok.</p>'
      : '<p class="summary-empty">Filtreyle eslesen rapor bulunamadi.</p>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "saved-card";

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    const titleText = item.source === "optimizer" && item.stage
      ? `${item.sourceLabel || "Optimizer"} / ${item.stage}. Kademe`
      : item.sourceLabel || "Simulasyon";
    title.innerHTML = `<strong>${titleText}</strong><span>${formatDate(item.reportedAt)}</span>`;

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";
    if (hasCountsForSimulation(item)) {
      const openBtn = document.createElement("button");
      openBtn.className = "button button-secondary";
      openBtn.type = "button";
      openBtn.textContent = "Rastgele Ac";
      openBtn.addEventListener("click", () => {
        openSimulationForCounts(item.enemyCounts || {}, item.allyCounts || {});
      });
      actions.append(openBtn);

      if (Number.isInteger(item.seed)) {
        const seededOpenBtn = document.createElement("button");
        seededOpenBtn.className = "button button-secondary";
        seededOpenBtn.type = "button";
        seededOpenBtn.textContent = "Ayni Seed ile Ac";
        seededOpenBtn.addEventListener("click", () => {
          openSimulationForCounts(item.enemyCounts || {}, item.allyCounts || {}, item.seed);
        });
        actions.append(seededOpenBtn);
      }
    }
    if (isAdminSession) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button button-ghost";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Sil";
      deleteBtn.addEventListener("click", async () => {
        deleteBtn.disabled = true;
        try {
          await window.BTFirebase.deleteWrongReport(item.id);
          await renderWrongReports();
        } finally {
          deleteBtn.disabled = false;
        }
      });
      actions.append(deleteBtn);
    }
    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    const metaParts = [
      `<span>Kaynak: <strong>${item.sourceLabel || "-"}</strong></span>`,
      item.stage ? `<span>Kademe: <strong>${item.stage}</strong></span>` : "",
      item.modeLabel ? `<span>Mod: <strong>${item.modeLabel}</strong></span>` : "",
      Number.isInteger(item.seed) ? `<span>Seed: <strong>${item.seed}</strong></span>` : "",
      Number.isFinite(item.pointLimit) ? `<span>Limit: <strong>${item.pointLimit}</strong></span>` : "",
      Number.isFinite(item.usedPoints) ? `<span>Kullanilan puan: <strong>${item.usedPoints}</strong></span>` : "",
      Number.isFinite(item.winRate) ? `<span>Kazanma orani: <strong>%${item.winRate}</strong></span>` : "",
      Number.isFinite(item.lostBlood) ? `<span>Kan kaybi: <strong>${item.lostBlood}</strong></span>` : ""
    ].filter(Boolean);
    meta.innerHTML = metaParts.join("");

    const grid = document.createElement("div");
    grid.className = "saved-columns";
    grid.append(renderCountBlock("Rakip Ordu", item.enemyCounts || {}, ENEMY_UNITS));
    grid.append(renderCountBlock(item.source === "optimizer" ? "Bizdeki Ordu" : "Muttefikler", item.allyCounts || {}, ALLY_UNITS));
    if (item.recommendationCounts) {
      grid.append(renderCountBlock("Onerilen Cozum", item.recommendationCounts, ALLY_UNITS));
    }

    const summaryGrid = document.createElement("div");
    summaryGrid.className = "wrong-summary-grid";

    const expectedWrap = document.createElement("section");
    expectedWrap.className = "wrong-summary-block";
    const expectedHeading = document.createElement("h3");
    expectedHeading.textContent = "Beklenen Sonuc";
    const expectedBlock = document.createElement("div");
    expectedBlock.className = "terminal-block";
    renderStyledLines((item.summaryText || "").split("\n"), expectedBlock);
    expectedWrap.append(expectedHeading, expectedBlock);

    const actualWrap = document.createElement("section");
    actualWrap.className = "wrong-summary-block";
    const actualHeading = document.createElement("h3");
    actualHeading.textContent = "Gercek Sonuc";
    const actualBlock = document.createElement("div");
    actualBlock.className = "terminal-block";
    renderStyledLines((item.actualSummaryText || "Gercek sonuc girilmemis.").split("\n"), actualBlock);
    actualWrap.append(actualHeading, actualBlock);
    summaryGrid.append(expectedWrap, actualWrap);

    const logWrap = document.createElement("details");
    logWrap.className = "wrong-log-wrap";
    const logSummary = document.createElement("summary");
    logSummary.textContent = "Savas Gunlugunu Goster";
    const logBlock = document.createElement("div");
    logBlock.className = "terminal-block wrong-log-block";
    renderStyledLines((item.logText || "").split("\n"), logBlock);
    logWrap.append(logSummary, logBlock);

    if (item.actualNote) {
      const note = document.createElement("p");
      note.className = "summary-empty";
      note.textContent = `Not: ${item.actualNote}`;
      card.append(head, meta, grid, summaryGrid, note, logWrap);
    } else {
      card.append(head, meta, grid, summaryGrid, logWrap);
    }
    wrongList.appendChild(card);
  });
}

function hasCountsForSimulation(item) {
  return !!(
    item &&
    item.enemyCounts &&
    item.allyCounts &&
    Object.keys(item.enemyCounts).length > 0 &&
    Object.keys(item.allyCounts).length > 0
  );
}

function bindFilterControls() {
  const rerender = () => {
    wrongCurrentPage = 0;
    applyWrongFilters();
  };

  [wrongSearchInput, wrongSideFilter, wrongTierFilter, wrongUsageFilter, wrongStartDateInput, wrongEndDateInput].forEach((element) => {
    if (!element) {
      return;
    }
    element.addEventListener("input", rerender);
    element.addEventListener("change", rerender);
  });

  resetWrongFiltersBtn?.addEventListener("click", () => {
    if (wrongSearchInput) {
      wrongSearchInput.value = "";
    }
    if (wrongSideFilter) {
      wrongSideFilter.value = "all";
    }
    if (wrongTierFilter) {
      wrongTierFilter.value = "all";
    }
    if (wrongUsageFilter) {
      wrongUsageFilter.value = "all";
    }
    if (wrongStartDateInput) {
      wrongStartDateInput.value = "";
    }
    if (wrongEndDateInput) {
      wrongEndDateInput.value = "";
    }
    wrongCurrentPage = 0;
    applyWrongFilters();
  });

  exportWrongTxtBtn?.addEventListener("click", () => {
    downloadWrongTxt(
      filteredWrongItems,
      "filtered",
      buildDateRangeLabel(wrongStartDateInput?.value || "", wrongEndDateInput?.value || "")
    );
  });

  exportWrongAllTxtBtn?.addEventListener("click", () => {
    downloadWrongTxt(allWrongItems, "all", "Tum tarihler");
  });

  exportWrongCsvBtn?.addEventListener("click", () => {
    downloadCsv(
      filteredWrongItems.map((item) => ({
        id: item.id || "",
        source: item.source || "",
        sourceLabel: item.sourceLabel || "",
        reportedAt: item.reportedAt || "",
        stage: item.stage || "",
        modeLabel: item.modeLabel || "",
        seed: item.seed ?? "",
        pointLimit: item.pointLimit ?? "",
        usedPoints: item.usedPoints ?? "",
        usedCapacity: item.usedCapacity ?? "",
        lostBlood: item.lostBlood ?? "",
        actualLostBlood: item.actualLostBlood ?? "",
        enemyRoster: buildRosterCsv(item.enemyCounts || {}, ENEMY_UNITS),
        allyRoster: buildRosterCsv(item.allyCounts || {}, ALLY_UNITS),
        recommendationRoster: buildRosterCsv(item.recommendationCounts || {}, ALLY_UNITS),
        expectedWinner: item.expectedWinner || "",
        actualWinner: item.actualWinner || "",
        summaryText: item.summaryText || "",
        actualSummaryText: item.actualSummaryText || "",
        actualNote: item.actualNote || ""
      })),
      `wrong-filtered-${new Date().toISOString().slice(0, 10)}.csv`
    );
  });

  wrongPrevPageBtn?.addEventListener("click", () => {
    if (wrongCurrentPage <= 0) {
      return;
    }
    wrongCurrentPage -= 1;
    updateWrongPagination();
    renderWrongPage(getCurrentWrongPageItems());
  });

  wrongNextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredWrongItems.length / PAGE_SIZE));
    if (wrongCurrentPage >= totalPages - 1) {
      return;
    }
    wrongCurrentPage += 1;
    updateWrongPagination();
    renderWrongPage(getCurrentWrongPageItems());
  });
}

function applyWrongFilters() {
  const searchText = (wrongSearchInput?.value || "").trim().toLocaleLowerCase("tr-TR");
  const side = wrongSideFilter?.value || "all";
  const tier = wrongTierFilter?.value || "all";
  const usage = wrongUsageFilter?.value || "all";
  const startDate = wrongStartDateInput?.value || "";
  const endDate = wrongEndDateInput?.value || "";

  filteredWrongItems = allWrongItems.filter((item) => (
    matchesWrongSearch(item, searchText) &&
    matchesTierUsage(item, side, tier, usage) &&
    matchesDateRange(item.reportedAt, startDate, endDate)
  ));
  const totalPages = Math.max(1, Math.ceil(filteredWrongItems.length / PAGE_SIZE));
  wrongCurrentPage = Math.min(wrongCurrentPage, totalPages - 1);

  wrongCountLabel.textContent = filteredWrongItems.length === allWrongItems.length
    ? String(allWrongItems.length)
    : `${filteredWrongItems.length}/${allWrongItems.length}`;

  updateWrongFilterMeta();
  updateWrongPagination();
  renderWrongPage(getCurrentWrongPageItems());
}

function getCurrentWrongPageItems() {
  const start = wrongCurrentPage * PAGE_SIZE;
  return filteredWrongItems.slice(start, start + PAGE_SIZE);
}

function updateWrongFilterMeta() {
  if (!wrongFilterMeta) {
    return;
  }
  const start = filteredWrongItems.length === 0 ? 0 : wrongCurrentPage * PAGE_SIZE + 1;
  const end = Math.min(filteredWrongItems.length, (wrongCurrentPage + 1) * PAGE_SIZE);
  wrongFilterMeta.innerHTML = `
    <span>Filtre sonucu: <strong>${filteredWrongItems.length}</strong></span>
    <span>Toplam rapor: <strong>${allWrongItems.length}</strong></span>
    <span>Sayfa araligi: <strong>${start}-${end}</strong></span>
    <span>Tarih: <strong>${buildDateRangeLabel(wrongStartDateInput?.value || "", wrongEndDateInput?.value || "")}</strong></span>
  `;
}

function updateWrongPagination() {
  if (!wrongPagination || !wrongPrevPageBtn || !wrongNextPageBtn || !wrongPageInfo) {
    return;
  }
  const totalPages = Math.max(1, Math.ceil(filteredWrongItems.length / PAGE_SIZE));
  wrongPagination.hidden = filteredWrongItems.length <= PAGE_SIZE;
  wrongPrevPageBtn.disabled = wrongCurrentPage <= 0;
  wrongNextPageBtn.disabled = wrongCurrentPage >= totalPages - 1;
  wrongPageInfo.textContent = `Sayfa ${Math.min(wrongCurrentPage + 1, totalPages)} / ${totalPages}`;
}

function matchesWrongSearch(item, searchText) {
  if (!searchText) {
    return true;
  }
  const haystack = [
    item.id,
    item.source,
    item.sourceLabel,
    item.modeLabel,
    item.stage,
    item.reportedAt,
    item.summaryText,
    item.actualSummaryText,
    item.actualNote,
    buildRosterCsv(item.enemyCounts || {}, ENEMY_UNITS),
    buildRosterCsv(item.allyCounts || {}, ALLY_UNITS),
    buildRosterCsv(item.recommendationCounts || {}, ALLY_UNITS)
  ].join(" ").toLocaleLowerCase("tr-TR");
  return haystack.includes(searchText);
}

function matchesTierUsage(item, side, tier, usage) {
  if (usage === "all" && tier === "all" && side === "all") {
    return true;
  }

  const relevantUnits = FILTERABLE_UNITS.filter((unit) => {
    if (side !== "all" && unit.side !== side) {
      return false;
    }
    if (tier !== "all" && unit.tier !== tier) {
      return false;
    }
    return true;
  });

  if (relevantUnits.length === 0) {
    return true;
  }

  const enemyCounts = item.enemyCounts || {};
  const allyCounts = item.allyCounts || {};
  const hasMatch = relevantUnits.some((unit) => {
    const counts = unit.side === "enemy" ? enemyCounts : allyCounts;
    return Number(counts?.[unit.key] || 0) > 0;
  });

  if (usage === "used") {
    return hasMatch;
  }
  if (usage === "unused") {
    return !hasMatch;
  }
  return hasMatch;
}

function buildRosterCsv(counts, units) {
  return (units || [])
    .filter((unit) => Number(counts?.[unit.key] || 0) > 0)
    .map((unit) => `${unit.label}:${counts[unit.key]}`)
    .join(" | ");
}

function extractTierLabel(label) {
  const match = String(label || "").match(/\((T\d+)\)/i);
  return match ? match[1].toUpperCase() : "";
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function downloadCsv(rows, filename) {
  if (!rows.length) {
    window.alert("Indirilecek filtre sonucu yok.");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(","))
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadWrongTxt(items, scope, dateLabel) {
  if (!items.length) {
    window.alert("Indirilecek rapor yok.");
    return;
  }
  const lines = [
    "Yanlis Sonuclar Kisa Liste",
    "==========================",
    `Olusturma Tarihi: ${new Date().toISOString()}`,
    `Toplam rapor: ${items.length}`,
    `Kapsam: ${scope === "all" ? "Tum raporlar" : "Filtrelenmis raporlar"}`,
    `Tarih filtresi: ${dateLabel}`,
    "",
    "Liste",
    "-----",
    ""
  ];

  items.forEach((item, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(...buildWrongTxtEntry(item, index));
  });

  downloadTextFile(
    `${lines.join("\n")}\n`,
    `wrong-${scope}-${buildExportTimestamp()}.txt`
  );
}

function buildWrongTxtEntry(item, index) {
  const allyCounts = getWrongExportAllyCounts(item);
  const expectedLosses = getExpectedLosses(item);
  const actualLosses = getActualLosses(item);
  const expectedLostBlood = getExpectedLostBlood(item, expectedLosses);
  const actualLostBlood = getActualLostBlood(item, actualLosses);
  const sourceLabel = item.sourceLabel || (item.source === "optimizer" ? "Optimizer" : "Simulasyon");
  const stageLabel = item.stage ? ` / ${item.stage}. Kademe` : "";

  return [
    `Rapor ${index + 1} [${sourceLabel}${stageLabel}]`,
    `Tarih: ${formatDate(item.reportedAt)}`,
    `Rakip dizilis (T1-T10): ${buildTierLine(item.enemyCounts || {}, ENEMY_UNITS)}`,
    `Bizim dizilis (T1-T8): ${buildTierLine(allyCounts, ALLY_UNITS)}`,
    `Beklenen kayiplar (T1-T8): ${buildTierLine(expectedLosses, ALLY_UNITS)}`,
    `Gercek kayiplar (T1-T8): ${buildTierLine(actualLosses, ALLY_UNITS)}`,
    `Beklenen toplam kan kaybi: ${expectedLostBlood}`,
    `Gercek toplam kan kaybi: ${actualLostBlood}`
  ];
}

function getWrongExportAllyCounts(item) {
  if (hasAnyPositiveCounts(item?.recommendationCounts)) {
    return item.recommendationCounts || {};
  }
  return item?.allyCounts || {};
}

function getExpectedLosses(item) {
  if (hasAnyPositiveCounts(item?.expectedAllyLosses)) {
    return item.expectedAllyLosses || {};
  }
  return extractLossesFromSummary(item?.summaryText || "");
}

function getActualLosses(item) {
  if (hasAnyPositiveCounts(item?.actualLosses)) {
    return item.actualLosses || {};
  }
  return extractLossesFromSummary(item?.actualSummaryText || "");
}

function getExpectedLostBlood(item, losses) {
  const explicitValue = parseFiniteNumber(item?.expectedLostBlood);
  if (explicitValue !== null) {
    return explicitValue;
  }
  const legacyValue = parseFiniteNumber(item?.lostBlood);
  if (legacyValue !== null) {
    return legacyValue;
  }
  return calculateLostBlood(losses);
}

function getActualLostBlood(item, losses) {
  const explicitValue = parseFiniteNumber(item?.actualLostBlood);
  if (explicitValue !== null) {
    return explicitValue;
  }
  return calculateLostBlood(losses);
}

function extractLossesFromSummary(summaryText) {
  const nameMap = Object.fromEntries(
    ALLY_UNITS.map((unit) => [getSummaryUnitName(unit.key), unit.key])
  );
  const losses = {};
  summaryText.split("\n").forEach((line) => {
    const match = line.match(/^-?\s*(\d+)\s+(.+?)\s+\(\s*\d+\s+kan\)$/);
    if (!match) {
      return;
    }
    const count = Number.parseInt(match[1], 10);
    const key = nameMap[match[2].trim()];
    if (key) {
      losses[key] = count;
    }
  });
  return losses;
}

function getSummaryUnitName(key) {
  const names = {
    bats: "Yarasalar (T1)",
    ghouls: "Gulyabaniler (T2)",
    thralls: "Vampir Koleler (T3)",
    banshees: "Bansiler (T4)",
    necromancers: "Nekromantlar (T5)",
    gargoyles: "Gargoyller (T6)",
    witches: "Kan Cadilari (T7)",
    rotmaws: "Curuk Ceneler (T8)"
  };
  return names[key] || key;
}

function hasAnyPositiveCounts(counts) {
  return Object.values(counts || {}).some((value) => Number(value || 0) > 0);
}

function calculateLostBlood(losses) {
  return ALLY_UNITS.reduce((sum, unit) => sum + Number(losses?.[unit.key] || 0) * (BLOOD_BY_ALLY_KEY[unit.key] || 0), 0);
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildTierLine(counts, units) {
  return (units || []).map((unit) => Number(counts?.[unit.key] || 0)).join("-");
}

function matchesDateRange(value, startValue, endValue) {
  if (!startValue && !endValue) {
    return true;
  }
  const itemDate = value ? new Date(value) : null;
  if (!itemDate || Number.isNaN(itemDate.getTime())) {
    return false;
  }
  const start = parseDateBoundary(startValue, "start");
  const end = parseDateBoundary(endValue, "end");
  if (start && itemDate < start) {
    return false;
  }
  if (end && itemDate > end) {
    return false;
  }
  return true;
}

function parseDateBoundary(value, edge) {
  if (!value) {
    return null;
  }
  const stamp = edge === "end" ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateRangeLabel(startValue, endValue) {
  if (startValue && endValue) {
    return `${startValue} - ${endValue}`;
  }
  if (startValue) {
    return `${startValue} ve sonrasi`;
  }
  if (endValue) {
    return `${endValue} ve oncesi`;
  }
  return "Tum tarihler";
}

function buildExportTimestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ];
  return parts.join("");
}

function downloadTextFile(content, filename) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openSimulationForCounts(enemyCounts, allyCounts, seed = null) {
  try {
    window.sessionStorage.setItem(OPTIMIZER_SIMULATION_STORAGE_KEY, JSON.stringify({
      enemyCounts,
      allyCounts,
      seed: Number.isInteger(seed) ? seed : null
    }));
    const opened = window.open("index.html", "_blank");
    if (!opened) {
      window.alert("Simulasyon yeni sekmede acilamadi. Lutfen popup engelleyiciyi kontrol edin.");
      return;
    }
    opened.focus?.();
  } catch (error) {
    window.alert(`Simulasyon ekranina gecilemedi: ${error.message}`);
  }
}

function renderCountBlock(title, counts, units) {
  const wrap = document.createElement("section");
  wrap.className = "saved-mini-block";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "recommend-list";
  const entries = (units || [])
    .map((unit) => [unit.key, counts?.[unit.key] || 0])
    .filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    row.innerHTML = "<span>Kayit yok</span><strong>0</strong>";
    list.appendChild(row);
  } else {
    entries.forEach(([key, value]) => {
      const row = document.createElement("li");
      row.className = "recommend-row";
      row.innerHTML = `<span>${unitLabelMap.get(key) || key}</span><strong>${value}</strong>`;
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function renderStyledLines(lines, target) {
  lines.forEach((line) => {
    const row = document.createElement("span");
    const cssClass = classifyLine(line);
    row.className = `log-line${cssClass ? ` ${cssClass}` : ""}`;
    appendLineWithHighlights(row, line, cssClass);
    target.appendChild(row);
  });
}

const HIGHLIGHTABLE_CLASSES = new Set(["damage", "splash", "buff", "disadv", "status", "event", "ally", "enemy", "formula", "section-total", "matchup"]);

const HIGHLIGHT_PATTERNS = [
  { regex: /\b\d+\s+(?:\S+\s+){0,2}(?:hasar(?:i)?|damage)\b/g, kind: "hl-damage" },
  { regex: /\b\d+\s+(?:toplam\s+|total\s+)?(?:can|hp|birim|units|atk)\b/g, kind: "hl-stat" },
  { regex: /^\s*\d+(?=\s+\S)/g, kind: "hl-stat" },
  { regex: /\+%\d+(?:\.\d+)?/g, kind: "hl-mult" },
  { regex: /-%\d+(?:\.\d+)?/g, kind: "hl-mult-neg" },
  { regex: /(?<!\w)x\d+(?:\.\d+)?(?=\s|$|\])/g, kind: "hl-mult" }
];

function appendLineWithHighlights(row, line, cssClass) {
  if (!HIGHLIGHTABLE_CLASSES.has(cssClass)) {
    row.textContent = line;
    return;
  }
  const matches = [];
  HIGHLIGHT_PATTERNS.forEach((p) => {
    p.regex.lastIndex = 0;
    let m;
    while ((m = p.regex.exec(line)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind: p.kind });
    }
  });
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered = [];
  let lastEnd = 0;
  matches.forEach((m) => {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  });
  if (filtered.length === 0) {
    row.textContent = line;
    return;
  }
  let cursor = 0;
  filtered.forEach((m) => {
    if (m.start > cursor) {
      row.appendChild(document.createTextNode(line.slice(cursor, m.start)));
    }
    const span = document.createElement("span");
    span.className = m.kind;
    span.textContent = m.text;
    row.appendChild(span);
    cursor = m.end;
  });
  if (cursor < line.length) {
    row.appendChild(document.createTextNode(line.slice(cursor)));
  }
}

function classifyLine(line) {
  const stripped = line.trim();
  if (stripped.startsWith("---")) {
    return "sep";
  }
  if (stripped.includes("═")) {
    return "banner";
  }
  if (stripped.startsWith("── Raund") && stripped.endsWith("sonu ──")) {
    return "round-end";
  }
  if (stripped === "DUSMAN SAFLARI" || stripped === "MUTTEFIK SAFLARI" || stripped === "ENEMY RANKS" || stripped === "ALLY RANKS") {
    return "section-head";
  }
  if (
    stripped.startsWith("─ Dusman toplam atak") ||
    stripped.startsWith("─ Muttefik toplam atak") ||
    stripped.startsWith("─ Enemy total attack") ||
    stripped.startsWith("─ Ally total attack")
  ) {
    return "section-total";
  }
  if (stripped.startsWith(">>")) {
    return "win";
  }
  if (/^(?:Hamle|Turn)\s+\d+$/.test(stripped)) {
    return "turn";
  }
  if (stripped.startsWith("Raund") || stripped.startsWith("Round")) {
    return "round";
  }
  if (stripped.startsWith("Hesap:") || stripped.startsWith("Calc:")) {
    return "formula";
  }
  if (stripped.includes(" → ") && !stripped.startsWith("-") && !stripped.startsWith("↳")) {
    return "matchup";
  }
  if (
    stripped.startsWith("Kayip Birlikler") ||
    stripped.startsWith("Lost Units") ||
    stripped.startsWith("Toplam birlik kapasitesi") ||
    stripped.startsWith("Total army capacity") ||
    stripped.includes("SAVAS  SONUCU") ||
    stripped.includes("OPTIMIZER  SONUCU") ||
    stripped.includes("ORNEK  SAVAS") ||
    stripped.includes("TUR  TUR  ANALIZ")
  ) {
    return "header";
  }
  if (stripped.includes("yok edildi") || stripped.includes("completely destroyed")) {
    return "destroy";
  }
  if (
    stripped.startsWith("her raundun") ||
    stripped.startsWith("each round's") ||
    stripped.startsWith("onerilen duzenin") ||
    stripped.startsWith("sample battle log") ||
    stripped.startsWith("Baslangic muharebe duzeni") ||
    stripped.startsWith("Initial battle formation")
  ) {
    return "subhead";
  }
  if (stripped.includes("hasar vurdu") || stripped.includes("damage dealt")) {
    return "damage";
  }
  if (
    stripped.includes("yayilma hasari") ||
    stripped.includes("intikam hasari") ||
    stripped.includes("splash damage") ||
    stripped.includes("revenge damage") ||
    stripped.includes("overkill damage") ||
    stripped.includes("(overkill)")
  ) {
    return "splash";
  }
  if (
    stripped.includes("birim kaybetti") ||
    stripped.includes("units lost") ||
    stripped.includes("birim / ") ||
    stripped.includes("units / ") ||
    stripped.includes("birim kaldi") ||
    stripped.includes("units remaining") ||
    stripped.startsWith("↳")
  ) {
    return "status";
  }
  if (
    stripped.includes("ustunlugune sahip") ||
    stripped.includes("type advantage") ||
    stripped.includes("carpani kazandi") ||
    stripped.includes("damage multiplier") ||
    stripped.includes("guclendirdi") ||
    stripped.includes("empowered") ||
    stripped.includes("biriktirdi") ||
    stripped.includes("stored damage") ||
    stripped.includes("dogurdu") ||
    stripped.includes("spawned") ||
    stripped.includes("geri dirildi") ||
    stripped.includes("revived with") ||
    /\+%\d/.test(stripped)
  ) {
    return "buff";
  }
  if (
    stripped.includes("dezavantajli") ||
    stripped.includes("type-disadvantaged") ||
    stripped.includes("azalmis hasar") ||
    stripped.includes("reduced damage") ||
    stripped.includes("azaltti") ||
    stripped.includes("azaltiyor") ||
    stripped.includes("is reducing") ||
    stripped.includes("hizini") ||
    stripped.includes("speed by") ||
    stripped.includes("hizi artik") ||
    stripped.includes("speed is now") ||
    stripped.includes("sifirlandi") ||
    stripped.includes("was reset") ||
    /-%\d/.test(stripped)
  ) {
    return "disadv";
  }
  if (stripped.startsWith("-") || stripped.startsWith("=")) {
    return "event";
  }
  if (stripped.includes(" can") || stripped.includes(" hp")) {
    return isAllyLine(stripped) ? "ally" : "enemy";
  }
  return "";
}

function isAllyLine(line) {
  const allyNames = [
    "Yarasalar", "Gulyabaniler", "Vampir Koleler", "Bansiler",
    "Nekromantlar", "Gargoyller", "Kan Cadilari", "Curuk Ceneler",
    "Bats", "Ghouls", "Thralls", "Banshees",
    "Necromancers", "Gargoyles", "Blood Witches", "Rotmaws"
  ];
  return allyNames.some((name) => line.includes(name));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("tr-TR");
}
