"use strict";

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  BLOOD_BY_ALLY_KEY
} = window.BattleCore;

const savedList = document.querySelector("#savedList");
const savedCountLabel = document.querySelector("#savedCountLabel");
const clearSavedBtn = document.querySelector("#clearSavedBtn");
const savedSearchInput = document.querySelector("#savedSearchInput");
const savedSideFilter = document.querySelector("#savedSideFilter");
const savedTierFilter = document.querySelector("#savedTierFilter");
const savedUsageFilter = document.querySelector("#savedUsageFilter");
const resetSavedFiltersBtn = document.querySelector("#resetSavedFiltersBtn");
const exportSavedCsvBtn = document.querySelector("#exportSavedCsvBtn");
const exportSavedTxtBtn = document.querySelector("#exportSavedTxtBtn");
const exportSavedAllTxtBtn = document.querySelector("#exportSavedAllTxtBtn");
const bulkSavedRegressionBtn = document.querySelector("#bulkSavedRegressionBtn");
const savedStartDateInput = document.querySelector("#savedStartDateInput");
const savedEndDateInput = document.querySelector("#savedEndDateInput");
const savedFilterMeta = document.querySelector("#savedFilterMeta");
const savedPagination = document.querySelector("#savedPagination");
const savedPrevPageBtn = document.querySelector("#savedPrevPageBtn");
const savedNextPageBtn = document.querySelector("#savedNextPageBtn");
const savedPageInfo = document.querySelector("#savedPageInfo");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const OPTIMIZER_SIMULATION_STORAGE_KEY = "bt-analiz.optimizer-to-simulation.v1";
const LOSS_REDUCTION_ICON_URL = "https://s66-tr.bitefight.gameforge.com/img/voodoo/res3_rotation.gif";
const PAGE_SIZE = 10;
const UNIT_DEFS = [...ENEMY_UNITS, ...ALLY_UNITS];
const FILTERABLE_UNITS = UNIT_DEFS.map((unit) => ({
  key: unit.key,
  label: unit.label,
  tier: extractTierLabel(unit.label),
  side: ENEMY_UNITS.some((candidate) => candidate.key === unit.key) ? "enemy" : "ally"
}));

let isAdminSession = false;
let allSavedItems = [];
let filteredSavedItems = [];
let savedCurrentPage = 0;

syncAdminActions();
bindFilterControls();

void renderSavedStrategies();
void bindAdminAuth();

clearSavedBtn.addEventListener("click", async () => {
  if (!isAdminSession) {
    return;
  }
  const password = String(adminPasswordInput?.value || "");
  if (!password.trim()) {
    window.alert("Tumunu Sil icin sifreyi tekrar girmen gerekiyor.");
    adminPasswordInput?.focus();
    return;
  }
  const items = await loadSavedStrategies();
  if (items.length === 0) {
    return;
  }
  if (!window.confirm("Tum onaylanan kayitlar silinsin mi?")) {
    return;
  }
  clearSavedBtn.disabled = true;
  try {
    await window.BTFirebase.verifyAdminPassword(password);
    await window.BTFirebase.clearApprovedStrategies();
    if (adminPasswordInput) {
      adminPasswordInput.value = "";
    }
    await renderSavedStrategies();
  } catch (error) {
    if (adminPasswordInput) {
      adminPasswordInput.value = "";
    }
    console.warn("Kayitlar silinemedi.", error);
    window.alert(error?.message || "Kayitlar silinemedi.");
  } finally {
    syncAdminActions();
  }
});

function syncAdminActions() {
  clearSavedBtn.disabled = !isAdminSession;
  clearSavedBtn.title = isAdminSession ? "Bu islem icin sifre tekrar istenir." : "Tum kayitlari silmek icin admin girisi gerekli.";
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
      await renderSavedStrategies();
    }
  });
}

async function loadSavedStrategies() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadApprovedStrategies !== "function") {
    return [];
  }
  try {
    return await window.BTFirebase.loadApprovedStrategies();
  } catch (error) {
    console.warn("Kayitli cozumler yuklenemedi.", error);
    return [];
  }
}

async function renderSavedStrategies() {
  allSavedItems = (await loadSavedStrategies()).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  syncAdminActions();
  applySavedFilters();
}

function normalizeLossCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function hasPositiveLosses(losses = {}) {
  return Object.values(losses || {}).some((value) => normalizeLossCount(value) > 0);
}

function getReducedLossCount(value) {
  const count = normalizeLossCount(value);
  if (count <= 0) {
    return 0;
  }
  return Math.max(0, count - Math.ceil(count / 5));
}

function applyLossReductionToLosses(losses = {}) {
  const reduced = {};
  ALLY_UNITS.forEach((unit) => {
    const nextCount = getReducedLossCount(losses?.[unit.key] || 0);
    if (nextCount > 0) {
      reduced[unit.key] = nextCount;
    }
  });
  return reduced;
}

function buildLossSummaryText(summaryText, losses = {}) {
  const lines = String(summaryText || "").split("\n");
  const lossHeaderIndex = lines.findIndex((line) => line.trim() === "Kayip Birlikler");
  if (lossHeaderIndex < 0) {
    return String(summaryText || "");
  }

  const capacityIndex = lines.findIndex((line, index) =>
    index > lossHeaderIndex && line.trim().startsWith("Toplam birlik kapasitesi"));
  const before = lines.slice(0, lossHeaderIndex + 1);
  const after = capacityIndex >= 0 ? lines.slice(capacityIndex) : [];

  const unitLines = [];
  let totalUnits = 0;
  let totalBlood = 0;
  ALLY_UNITS.forEach((unit) => {
    const count = normalizeLossCount(losses?.[unit.key] || 0);
    if (count <= 0) {
      return;
    }
    const blood = count * (BLOOD_BY_ALLY_KEY[unit.key] || 0);
    totalUnits += count;
    totalBlood += blood;
    unitLines.push(`- ${String(count).padStart(3)} ${getSummaryUnitName(unit.key).padEnd(28)} (${blood} kan)`);
  });

  return [
    ...before,
    ...unitLines,
    "",
    `= ${String(totalUnits).padStart(3)} toplam ${"".padEnd(21)} (${totalBlood} kan)`,
    "--------------------------------------------------",
    ...after
  ].join("\n");
}

function createMetaField(label, value) {
  const field = document.createElement("span");
  field.innerHTML = `${label}: <strong>${value}</strong>`;
  return field;
}

function createSavedOriginBadge(label) {
  const badge = document.createElement("span");
  badge.className = "saved-origin-badge";
  badge.textContent = label;
  return badge;
}

function isPromotedFromWrong(item) {
  return item?.promotedFromWrong === true;
}

function createLossReductionToggleButton(isActive, onToggle) {
  const button = document.createElement("button");
  button.className = `loss-toggle-button${isActive ? " is-active" : ""}`;
  button.type = "button";
  button.setAttribute("aria-pressed", isActive ? "true" : "false");
  button.title = isActive
    ? "Azaltilmis kayiplari gosteriyorsun. Tekrar basarsan normal sonuc doner."
    : "Kayiplari birlik bazinda 5'te 1 azaltip goster.";
  button.innerHTML = `
    <img src="${LOSS_REDUCTION_ICON_URL}" alt="" loading="lazy">
  `;
  button.addEventListener("click", onToggle);
  return button;
}

function getDisplayedSavedLosses(item, isLossReductionActive) {
  const baseLosses = extractSavedLosses(item);
  return isLossReductionActive ? applyLossReductionToLosses(baseLosses) : baseLosses;
}

function getDisplayedSavedLostBlood(item, displayedLosses, isLossReductionActive) {
  const storedLostBlood = parseFiniteNumber(item?.lostBlood);
  if (isLossReductionActive && hasPositiveLosses(displayedLosses)) {
    return calculateLostBlood(displayedLosses);
  }
  return storedLostBlood !== null ? storedLostBlood : calculateLostBlood(displayedLosses);
}

function renderSavedPage(items) {
  savedList.innerHTML = "";

  if (items.length === 0) {
    savedList.innerHTML = allSavedItems.length === 0
      ? '<p class="summary-empty">Henuz onaylanmis bir kayit yok.</p>'
      : '<p class="summary-empty">Filtreyle eslesen kayit bulunamadi.</p>';
    return;
  }

  items.forEach((item) => {
    const source = getApprovedSource(item);
    const card = document.createElement("article");
    card.className = "saved-card";
    let isLossReductionActive = false;

    const head = document.createElement("div");
    head.className = "saved-card-head";

    const title = document.createElement("div");
    if (source === "simulation") {
      title.innerHTML = `<strong>${item.variantTitle || "Onayli Dovus"} / ${item.enemyTitle || "Versus"}</strong><span>${item.stage ? `${item.stage}. Kademe / ` : ""}${item.sourceLabel || "Simulasyon"} / ${formatDate(item.savedAt)}</span>`;
    } else {
      title.innerHTML = `<strong>${item.stage}. Kademe / ${item.enemyTitle || "Versus"}</strong><span>${formatDate(item.savedAt)}</span>`;
    }

    const actions = document.createElement("div");
    actions.className = "actions actions-inline";

    if (source === "simulation") {
      const openBtn = document.createElement("button");
      openBtn.className = "button button-secondary";
      openBtn.type = "button";
      openBtn.textContent = "Rastgele Ac";
      openBtn.addEventListener("click", () => {
        openSimulationForCounts(item.enemyCounts || {}, getSavedAllyCounts(item));
      });
      actions.append(openBtn);

      if (Number.isInteger(item.representativeSeed)) {
        const seededOpenBtn = document.createElement("button");
        seededOpenBtn.className = "button button-secondary";
        seededOpenBtn.type = "button";
        seededOpenBtn.textContent = "Ayni Seed ile Ac";
        seededOpenBtn.addEventListener("click", () => {
          openSimulationForCounts(item.enemyCounts || {}, getSavedAllyCounts(item), item.representativeSeed);
        });
        actions.append(seededOpenBtn);
      }
    } else {
      const openBtn = document.createElement("a");
      openBtn.className = "button button-secondary";
      const optimizerPage = hasMinimumRequiredCounts(item.minimumRequiredCounts) ? "optimizer-minimum.html" : "optimizer.html";
      openBtn.href = `${optimizerPage}?stage=${encodeURIComponent(item.stage)}&saved=${encodeURIComponent(item.id)}`;
      openBtn.textContent = "Optimizer'da Ac";
      actions.append(openBtn);
    }

    if (isAdminSession) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "button button-ghost";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Sil";
      deleteBtn.addEventListener("click", async () => {
        deleteBtn.disabled = true;
        try {
          await window.BTFirebase.deleteApprovedStrategy(item.id);
          await renderSavedStrategies();
        } finally {
          deleteBtn.disabled = false;
        }
      });
      actions.append(deleteBtn);
    }
    head.append(title, actions);

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    const simulationDetails = source === "simulation" ? renderSimulationSavedDetails(item) : null;
    simulationDetails?.bindToggle(() => {
      isLossReductionActive = !isLossReductionActive;
      renderMeta();
      simulationDetails?.setLossReduction(isLossReductionActive);
    });

    const renderMeta = () => {
      meta.innerHTML = "";
      if (isPromotedFromWrong(item)) {
        meta.appendChild(createSavedOriginBadge("Once yanlisti"));
      }
      if (source === "simulation") {
        const displayedLosses = getDisplayedSavedLosses(item, isLossReductionActive);
        meta.appendChild(createMetaField("Sonuc", item.winner === "enemy" ? "Maglubiyet" : "Zafer"));
        meta.appendChild(createMetaField("Olasilik", `%${formatStoredProbability(item.probabilityBasisPoints)}`));
        meta.appendChild(createMetaField("Kan kaybi", getDisplayedSavedLostBlood(item, displayedLosses, isLossReductionActive)));
        meta.appendChild(createMetaField("Kullanilan puan", item.usedPoints ?? 0));

        if (Number.isInteger(item.representativeSeed)) {
          meta.appendChild(createMetaField("Seed", item.representativeSeed));
        }
      } else {
        meta.appendChild(createMetaField("Kullanilan puan", item.usedPoints ?? 0));
        meta.appendChild(createMetaField("Kan kaybi", item.lostBlood ?? 0));
        meta.appendChild(createMetaField("Kazanma orani", `%${item.winRate ?? 0}`));
        meta.appendChild(createMetaField("Mod", item.modeLabel || "-"));
        if (Number.isInteger(item.representativeSeed)) {
          meta.appendChild(createMetaField("Seed", item.representativeSeed));
        }
      }
    };
    renderMeta();

    const grid = document.createElement("div");
    grid.className = "saved-columns";
    if (source === "simulation") {
      grid.append(
        renderCountBlock("Rakip Ordu", item.enemyCounts, ENEMY_UNITS),
        renderCountBlock("Onaylanan Dovus", getSavedAllyCounts(item), ALLY_UNITS)
      );
    } else {
      grid.append(
        renderCountBlock("Rakip Ordu", item.enemyCounts, ENEMY_UNITS),
        renderCountBlock("Onaylanan Cozum", getSavedAllyCounts(item), ALLY_UNITS)
      );
    }

    card.append(head, meta, grid);

    if (source === "simulation") {
      if (isAdminSession) {
        card.appendChild(renderSimulationStageEditor(item));
      }
      card.appendChild(simulationDetails.element);
    }

    savedList.appendChild(card);
  });
}

function getApprovedSource(item) {
  return item?.source === "simulation" ? "simulation" : "optimizer";
}

function hasMinimumRequiredCounts(counts) {
  return ALLY_UNITS.some((unit) => (counts?.[unit.key] || 0) > 0);
}

function getSavedAllyCounts(item) {
  return getApprovedSource(item) === "simulation" ? (item.allyCounts || {}) : (item.recommendationCounts || {});
}

function bindFilterControls() {
  const rerender = () => {
    savedCurrentPage = 0;
    applySavedFilters();
  };

  [savedSearchInput, savedSideFilter, savedTierFilter, savedUsageFilter, savedStartDateInput, savedEndDateInput].forEach((element) => {
    if (!element) {
      return;
    }
    element.addEventListener("input", rerender);
    element.addEventListener("change", rerender);
  });

  resetSavedFiltersBtn?.addEventListener("click", () => {
    if (savedSearchInput) {
      savedSearchInput.value = "";
    }
    if (savedSideFilter) {
      savedSideFilter.value = "all";
    }
    if (savedTierFilter) {
      savedTierFilter.value = "all";
    }
    if (savedUsageFilter) {
      savedUsageFilter.value = "all";
    }
    if (savedStartDateInput) {
      savedStartDateInput.value = "";
    }
    if (savedEndDateInput) {
      savedEndDateInput.value = "";
    }
    savedCurrentPage = 0;
    applySavedFilters();
  });

  exportSavedTxtBtn?.addEventListener("click", () => {
    downloadSavedTxt(
      filteredSavedItems,
      "filtered",
      buildDateRangeLabel(savedStartDateInput?.value || "", savedEndDateInput?.value || "")
    );
  });

  exportSavedAllTxtBtn?.addEventListener("click", () => {
    downloadSavedTxt(allSavedItems, "all", "Tum tarihler");
  });

  exportSavedCsvBtn?.addEventListener("click", () => {
    downloadCsv(
      filteredSavedItems.map((item) => ({
        id: item.id || "",
        source: getApprovedSource(item),
        savedAt: item.savedAt || "",
        stage: item.stage || "",
        enemyTitle: item.enemyTitle || "",
        result: getApprovedSource(item) === "simulation" ? (item.winner === "enemy" ? "Maglubiyet" : "Zafer") : "",
        modeLabel: item.modeLabel || "",
        representativeSeed: item.representativeSeed ?? "",
        usedPoints: item.usedPoints ?? "",
        lostBlood: item.lostBlood ?? "",
        winRate: item.winRate ?? "",
        probability: item.probabilityBasisPoints ?? "",
        enemyRoster: buildRosterCsv(item.enemyCounts || {}, ENEMY_UNITS),
        allyRoster: buildRosterCsv(getSavedAllyCounts(item), ALLY_UNITS),
        summaryText: item.summaryText || "",
        logText: item.logText || ""
      })),
      `saved-filtered-${new Date().toISOString().slice(0, 10)}.csv`
    );
  });

  bulkSavedRegressionBtn?.addEventListener("click", () => {
    if (!window.BulkBattleRegression || typeof window.BulkBattleRegression.openReportPage !== "function") {
      window.alert("Toplu test araci henuz hazir degil.");
      return;
    }
    const simulationItems = filteredSavedItems.filter((item) => getApprovedSource(item) === "simulation");
    if (!simulationItems.length) {
      window.alert("Toplu test icin secili simulation kaydi yok.");
      return;
    }

    window.BulkBattleRegression.openReportPage({
      kind: "approved",
      title: "Onaylanan Versuslar Toplu Test",
      scopeLabel: buildSavedRegressionScopeLabel(simulationItems.length),
      selectedCount: simulationItems.length,
      totalCount: allSavedItems.length,
      backHref: "saved.html",
      backLabel: "Onaylananlar",
      items: window.BulkBattleRegression.prepareApprovedItems(simulationItems)
    });
  });

  savedPrevPageBtn?.addEventListener("click", () => {
    if (savedCurrentPage <= 0) {
      return;
    }
    savedCurrentPage -= 1;
    updateSavedPagination();
    renderSavedPage(getCurrentSavedPageItems());
  });

  savedNextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredSavedItems.length / PAGE_SIZE));
    if (savedCurrentPage >= totalPages - 1) {
      return;
    }
    savedCurrentPage += 1;
    updateSavedPagination();
    renderSavedPage(getCurrentSavedPageItems());
  });
}

function applySavedFilters() {
  const searchText = (savedSearchInput?.value || "").trim().toLocaleLowerCase("tr-TR");
  const side = savedSideFilter?.value || "all";
  const tier = savedTierFilter?.value || "all";
  const usage = savedUsageFilter?.value || "all";
  const startDate = savedStartDateInput?.value || "";
  const endDate = savedEndDateInput?.value || "";

  filteredSavedItems = allSavedItems.filter((item) => (
    matchesSavedSearch(item, searchText) &&
    matchesTierUsage(item, side, tier, usage) &&
    matchesDateRange(item.savedAt, startDate, endDate)
  ));
  const totalPages = Math.max(1, Math.ceil(filteredSavedItems.length / PAGE_SIZE));
  savedCurrentPage = Math.min(savedCurrentPage, totalPages - 1);

  savedCountLabel.textContent = filteredSavedItems.length === allSavedItems.length
    ? String(allSavedItems.length)
    : `${filteredSavedItems.length}/${allSavedItems.length}`;

  updateSavedFilterMeta();
  updateSavedPagination();
  renderSavedPage(getCurrentSavedPageItems());
}

function getCurrentSavedPageItems() {
  const start = savedCurrentPage * PAGE_SIZE;
  return filteredSavedItems.slice(start, start + PAGE_SIZE);
}

function updateSavedFilterMeta() {
  if (!savedFilterMeta) {
    return;
  }
  const start = filteredSavedItems.length === 0 ? 0 : savedCurrentPage * PAGE_SIZE + 1;
  const end = Math.min(filteredSavedItems.length, (savedCurrentPage + 1) * PAGE_SIZE);
  savedFilterMeta.innerHTML = `
    <span>Filtre sonucu: <strong>${filteredSavedItems.length}</strong></span>
    <span>Toplam kayit: <strong>${allSavedItems.length}</strong></span>
    <span>Sayfa araligi: <strong>${start}-${end}</strong></span>
    <span>Tarih: <strong>${buildDateRangeLabel(savedStartDateInput?.value || "", savedEndDateInput?.value || "")}</strong></span>
  `;
}

function updateSavedPagination() {
  if (!savedPagination || !savedPrevPageBtn || !savedNextPageBtn || !savedPageInfo) {
    return;
  }
  const totalPages = Math.max(1, Math.ceil(filteredSavedItems.length / PAGE_SIZE));
  savedPagination.hidden = filteredSavedItems.length <= PAGE_SIZE;
  savedPrevPageBtn.disabled = savedCurrentPage <= 0;
  savedNextPageBtn.disabled = savedCurrentPage >= totalPages - 1;
  savedPageInfo.textContent = `Sayfa ${Math.min(savedCurrentPage + 1, totalPages)} / ${totalPages}`;
}

function matchesSavedSearch(item, searchText) {
  if (!searchText) {
    return true;
  }
  const haystack = [
    item.id,
    item.source,
    item.sourceLabel,
    item.promotedFromWrong ? "yanlistan dogrulandi once yanlisti" : "",
    item.enemyTitle,
    item.variantTitle,
    item.modeLabel,
    item.stage,
    item.savedAt,
    item.summaryText,
    item.logText,
    buildRosterCsv(item.enemyCounts || {}, ENEMY_UNITS),
    buildRosterCsv(getSavedAllyCounts(item), ALLY_UNITS)
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
  const allyCounts = getSavedAllyCounts(item);
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

function downloadSavedTxt(items, scope, dateLabel) {
  if (!items.length) {
    window.alert("Indirilecek kayit yok.");
    return;
  }
  const lines = [
    "Onaylanan Versuslar Kisa Liste",
    "================================",
    `Olusturma Tarihi: ${new Date().toISOString()}`,
    `Toplam kayit: ${items.length}`,
    `Kapsam: ${scope === "all" ? "Tum kayitlar" : "Filtrelenmis kayitlar"}`,
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
    lines.push(...buildSavedTxtEntry(item, index));
  });

  downloadTextFile(
    `${lines.join("\n")}\n`,
    `saved-${scope}-${buildExportTimestamp()}.txt`
  );
}

function buildSavedTxtEntry(item, index) {
  const allyCounts = getSavedAllyCounts(item);
  const lossCounts = extractSavedLosses(item);
  const storedLostBlood = parseFiniteNumber(item?.lostBlood);
  const totalLostBlood = storedLostBlood !== null
    ? storedLostBlood
    : calculateLostBlood(lossCounts);
  const stageLabel = item.stage ? ` / ${item.stage}. Kademe` : "";
  const sourceLabel = getApprovedSource(item) === "simulation" ? "Simulasyon" : "Optimizer";

  return [
    `Kayit ${index + 1} [${sourceLabel}${stageLabel}]`,
    `Tarih: ${formatDate(item.savedAt)}`,
    `Rakip dizilis (T1-T10): ${buildTierLine(item.enemyCounts || {}, ENEMY_UNITS)}`,
    `Bizim dizilis (T1-T8): ${buildTierLine(allyCounts, ALLY_UNITS)}`,
    `Beklenen kayiplar (T1-T8): ${buildTierLine(lossCounts, ALLY_UNITS)}`,
    `Gercek kayiplar (T1-T8): ${buildTierLine(lossCounts, ALLY_UNITS)}`,
    `Beklenen toplam kan kaybi: ${totalLostBlood}`,
    `Gercek toplam kan kaybi: ${totalLostBlood}`
  ];
}

function extractSavedLosses(item) {
  const summaryLosses = extractLossesFromSummary(item?.summaryText || "");
  if (hasAnyPositiveCounts(summaryLosses)) {
    return summaryLosses;
  }
  try {
    const variant = JSON.parse(item?.variantSignature || "{}");
    if (variant && typeof variant === "object") {
      return variant.allyLosses || {};
    }
  } catch (error) {
    console.warn("variantSignature parse edilemedi.", error);
  }
  return {};
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

function buildSavedRegressionScopeLabel(simulationCount = filteredSavedItems.filter((item) => getApprovedSource(item) === "simulation").length) {
  return [
    `${simulationCount}/${allSavedItems.length} simulation kaydi secili`,
    `Tarih: ${buildDateRangeLabel(savedStartDateInput?.value || "", savedEndDateInput?.value || "")}`
  ].join(" / ");
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

function renderSimulationSavedDetails(item) {
  const wrap = document.createElement("div");
  wrap.className = "saved-simulation-details";
  let summaryBlock = null;
  let summaryToggle = null;
  let toggleHandler = () => {};

  if (item.summaryText) {
    const summaryShell = document.createElement("div");
    summaryShell.className = "loss-summary-shell";
    const summaryHead = document.createElement("div");
    summaryHead.className = "loss-summary-head";
    const summaryLabel = document.createElement("span");
    summaryLabel.className = "loss-summary-label";
    summaryLabel.textContent = "Kayip Ozeti";
    summaryToggle = createLossReductionToggleButton(false, toggleHandler);
    summaryHead.append(summaryLabel, summaryToggle);
    summaryBlock = document.createElement("div");
    summaryBlock.className = "terminal-block saved-text-block";
    summaryBlock.textContent = item.summaryText;
    summaryShell.append(summaryHead, summaryBlock);
    wrap.appendChild(summaryShell);
  }

  if (item.logText) {
    const logWrap = document.createElement("details");
    logWrap.className = "wrong-log-wrap";

    const summary = document.createElement("summary");
    summary.textContent = "Savas gunlugunu goster";

    const logBlock = document.createElement("div");
    logBlock.className = "terminal-block wrong-log-block saved-text-block";
    logBlock.textContent = item.logText;

    logWrap.append(summary, logBlock);
    wrap.appendChild(logWrap);
  }

  return {
    element: wrap,
    setLossReduction(isLossReductionActive) {
      if (!summaryBlock) {
        return;
      }
      if (summaryToggle) {
        const nextToggle = createLossReductionToggleButton(isLossReductionActive, toggleHandler);
        summaryToggle.replaceWith(nextToggle);
        summaryToggle = nextToggle;
      }
      const displayedLosses = getDisplayedSavedLosses(item, isLossReductionActive);
      summaryBlock.textContent = isLossReductionActive
        ? buildLossSummaryText(item.summaryText || "", displayedLosses)
        : (item.summaryText || "");
    },
    bindToggle(handler) {
      toggleHandler = handler;
      if (!summaryToggle) {
        return;
      }
      const nextToggle = createLossReductionToggleButton(false, toggleHandler);
      summaryToggle.replaceWith(nextToggle);
      summaryToggle = nextToggle;
    }
  };
}

function renderSimulationStageEditor(item) {
  const wrap = document.createElement("div");
  wrap.className = "saved-stage-editor";

  const label = document.createElement("span");
  label.className = "saved-stage-editor-label";
  label.textContent = "Admin kademe girisi";

  const input = document.createElement("input");
  input.className = "admin-auth-input saved-stage-input";
  input.type = "text";
  input.inputMode = "numeric";
  input.pattern = "[0-9]*";
  input.placeholder = "Kademe";
  input.value = item.stage ? String(item.stage) : "";
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D+/g, "");
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "button button-ghost";
  saveBtn.type = "button";
  saveBtn.textContent = "Kademe Kaydet";
  saveBtn.addEventListener("click", async () => {
    const rawValue = input.value.trim();
    const nextStage = rawValue === "" ? undefined : Number.parseInt(rawValue, 10);
    if (rawValue !== "" && (!Number.isInteger(nextStage) || nextStage < 1 || nextStage > 9999)) {
      window.alert("Kademe 1 ile 9999 arasinda olmali.");
      return;
    }
    saveBtn.disabled = true;
    try {
      await window.BTFirebase.saveApprovedStrategy({
        ...item,
        stage: nextStage
      });
      await renderSavedStrategies();
    } catch (error) {
      window.alert(`Kademe kaydedilemedi: ${error.message}`);
    } finally {
      saveBtn.disabled = false;
    }
  });

  wrap.append(label, input, saveBtn);
  return wrap;
}

function renderCountBlock(title, counts, units) {
  const wrap = document.createElement("section");
  wrap.className = "saved-mini-block";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "recommend-list";
  const entries = (units || []).map((unit) => [unit.key, counts?.[unit.key] || 0]).filter(([, value]) => value > 0);

  if (entries.length === 0) {
    const row = document.createElement("li");
    row.className = "recommend-row";
    row.innerHTML = "<span>Kayit yok</span><strong>0</strong>";
    list.appendChild(row);
  } else {
    entries.forEach(([key, value]) => {
      const row = document.createElement("li");
      row.className = "recommend-row";
      row.innerHTML = `<span>${getUnitLabel(key)}</span><strong>${value}</strong>`;
      list.appendChild(row);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function getUnitLabel(key) {
  return [...ENEMY_UNITS, ...ALLY_UNITS].find((unit) => unit.key === key)?.label || key;
}

function formatStoredProbability(basisPoints) {
  const value = Number(basisPoints || 0) / 100;
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
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
