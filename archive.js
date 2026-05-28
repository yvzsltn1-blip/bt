"use strict";

const archiveList = document.querySelector("#archiveList");
const archiveCountLabel = document.querySelector("#archiveCountLabel");
const archiveDataModeLabel = document.querySelector("#archiveDataModeLabel");
const archivePagination = document.querySelector("#archivePagination");
const archivePrevPageBtn = document.querySelector("#archivePrevPageBtn");
const archiveNextPageBtn = document.querySelector("#archiveNextPageBtn");
const archivePageNumbers = document.querySelector("#archivePageNumbers");
const archivePageInfo = document.querySelector("#archivePageInfo");
const archiveFilterSummary = document.querySelector("#archiveFilterSummary");
const archiveLevelFilterInput = document.querySelector("#archiveLevelFilterInput");
const archiveDatePresetSelect = document.querySelector("#archiveDatePresetSelect");
const archiveSourceFilterSelect = document.querySelector("#archiveSourceFilterSelect");
const archivePageSizeSelect = document.querySelector("#archivePageSizeSelect");
const archiveResetFiltersBtn = document.querySelector("#archiveResetFiltersBtn");
const archiveRefreshBtn = document.querySelector("#archiveRefreshBtn");
const archiveFilteredCountValue = document.querySelector("#archiveFilteredCountValue");
const archiveFilteredCountHint = document.querySelector("#archiveFilteredCountHint");
const archiveFilteredExpValue = document.querySelector("#archiveFilteredExpValue");
const archiveFilteredLootValue = document.querySelector("#archiveFilteredLootValue");
const archiveTodayExpValue = document.querySelector("#archiveTodayExpValue");
const archiveTodayLootValue = document.querySelector("#archiveTodayLootValue");
const archiveFirstTenExpValue = document.querySelector("#archiveFirstTenExpValue");
const archiveFirstTenLootValue = document.querySelector("#archiveFirstTenLootValue");
const archiveCacheStatusValue = document.querySelector("#archiveCacheStatusValue");
const archiveCacheStatusHint = document.querySelector("#archiveCacheStatusHint");
const archiveAdminAuthStatus = document.querySelector("#archiveAdminAuthStatus");
const archiveAdminEmailInput = document.querySelector("#archiveAdminEmailInput");
const archiveAdminPasswordInput = document.querySelector("#archiveAdminPasswordInput");
const archiveAdminLoginBtn = document.querySelector("#archiveAdminLoginBtn");
const archiveAdminLogoutBtn = document.querySelector("#archiveAdminLogoutBtn");

const DEFAULT_PAGE_SIZE = 40;
const PAGE_SIZE_OPTIONS = new Set([20, 40, 80]);
const ARCHIVE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const ARCHIVE_SUMMARY_CACHE_KEY = "btAnalyssArchiveSummaryCacheV3";
const ARCHIVE_SUMMARY_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const FIRST_TEN_LEVELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

let isAdminSession = false;
let archiveLevelInputDebounce = 0;
let archiveRequestToken = 0;

const archiveState = {
  filters: {
    armyPowerText: "",
    datePreset: "all",
    sourceType: ""
  },
  pageSize: DEFAULT_PAGE_SIZE,
  currentPage: 0,
  loadedItems: [],
  remoteCursor: null,
  remoteHasMore: false,
  readSource: "idle",
  aggregates: {
    filtered: buildEmptyAggregate(),
    today: buildEmptyAggregate(),
    firstTen: buildEmptyAggregate()
  }
};

void bindAdminAuth();
bindArchiveControls();
void refreshArchiveView();

archivePrevPageBtn?.addEventListener("click", () => {
  if (archiveState.currentPage <= 0) {
    return;
  }
  archiveState.currentPage -= 1;
  renderArchivePage();
});

archiveNextPageBtn?.addEventListener("click", async () => {
  const targetPage = archiveState.currentPage + 1;
  const ready = await ensureArchivePageLoaded(targetPage);
  if (!ready) {
    return;
  }
  archiveState.currentPage = targetPage;
  renderArchivePage();
});

archivePageNumbers?.addEventListener("click", async (event) => {
  const pageButton = event.target instanceof Element ? event.target.closest("[data-page-index]") : null;
  if (!pageButton) {
    return;
  }
  const targetPage = Number.parseInt(pageButton.getAttribute("data-page-index") || "", 10);
  if (!Number.isInteger(targetPage) || targetPage < 0 || targetPage === archiveState.currentPage) {
    return;
  }
  const ready = await ensureArchivePageLoaded(targetPage);
  if (!ready) {
    return;
  }
  archiveState.currentPage = targetPage;
  renderArchivePage();
});

archiveList?.addEventListener("click", async (event) => {
  const actionButton = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!actionButton) {
    return;
  }

  const action = actionButton.getAttribute("data-action");
  const id = actionButton.getAttribute("data-id") || "";
  if (!id) {
    return;
  }

  if (!isAdminSession) {
    window.alert("Bu islem icin once admin girisi yapin.");
    return;
  }

  if (action === "delete") {
    await handleDeleteArchive(id);
    return;
  }

  if (action === "edit") {
    await handleEditArchive(id);
  }
});

function bindArchiveControls() {
  archiveLevelFilterInput?.addEventListener("input", () => {
    window.clearTimeout(archiveLevelInputDebounce);
    archiveLevelInputDebounce = window.setTimeout(() => {
      void applyFilters();
    }, 220);
  });

  archiveDatePresetSelect?.addEventListener("change", () => {
    void applyFilters();
  });

  archiveSourceFilterSelect?.addEventListener("change", () => {
    void applyFilters();
  });

  archivePageSizeSelect?.addEventListener("change", () => {
    const nextPageSize = normalizePageSize(archivePageSizeSelect?.value);
    if (nextPageSize === archiveState.pageSize) {
      return;
    }
    archiveState.pageSize = nextPageSize;
    void refreshArchiveView();
  });

  archiveResetFiltersBtn?.addEventListener("click", () => {
    resetArchiveFilters();
    void refreshArchiveView();
  });

  archiveRefreshBtn?.addEventListener("click", () => {
    void refreshArchiveView({ forceRemote: true });
  });
}

async function bindAdminAuth() {
  if (!window.AdminAuthUI || typeof window.AdminAuthUI.bindAdminControls !== "function") {
    return;
  }

  await window.AdminAuthUI.bindAdminControls({
    statusLabel: archiveAdminAuthStatus,
    emailInput: archiveAdminEmailInput,
    passwordInput: archiveAdminPasswordInput,
    loginButton: archiveAdminLoginBtn,
    logoutButton: archiveAdminLogoutBtn,
    onStateChange: (isAdmin) => {
      isAdminSession = isAdmin;
      renderArchivePage();
    }
  });
}

async function applyFilters() {
  archiveState.filters = readArchiveFiltersFromUi();
  await refreshArchiveView();
}

async function refreshArchiveView(options = {}) {
  const requestToken = ++archiveRequestToken;
  archiveState.currentPage = 0;
  archiveState.remoteCursor = null;
  archiveState.remoteHasMore = false;
  archiveState.loadedItems = [];
  renderArchiveLoadingState();

  const [pageResult] = await Promise.all([
    loadArchivePage({
      reset: true,
      forceRemote: Boolean(options.forceRemote),
      requestToken
    }),
    refreshArchiveAggregates({
      forceRemote: Boolean(options.forceRemote),
      requestToken
    })
  ]);

  if (requestToken !== archiveRequestToken) {
    return;
  }

  archiveState.readSource = pageResult?.readSource || archiveState.readSource;
  renderArchiveHeader();
  renderArchivePage();
  renderArchiveCacheInfo();
}

async function loadArchivePage(options = {}) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchivesPage !== "function") {
    return null;
  }

  if (options.reset) {
    archiveState.remoteCursor = null;
    archiveState.remoteHasMore = false;
    archiveState.currentPage = 0;
    archiveState.loadedItems = [];
  }

  const page = await window.BTFirebase.loadOverviewArchivesPage({
    pageSize: archiveState.pageSize,
    cursor: options.reset ? null : archiveState.remoteCursor,
    preferCache: Boolean(options.reset && !options.forceRemote && !hasAnyActiveArchiveFilter()),
    cacheMaxAgeMs: options.forceRemote ? 0 : ARCHIVE_CACHE_MAX_AGE_MS,
    filters: {
      armyPowerText: archiveState.filters.armyPowerText,
      datePreset: archiveState.filters.datePreset,
      sourceType: archiveState.filters.sourceType
    }
  });

  if (options.requestToken && options.requestToken !== archiveRequestToken) {
    return page;
  }

  archiveState.remoteCursor = page?.cursor || archiveState.remoteCursor;
  archiveState.remoteHasMore = Boolean(page?.hasMore);
  mergeArchiveItems(page?.items || []);
  archiveState.readSource = page?.readSource || archiveState.readSource;
  renderArchiveHeader();
  renderArchivePage();
  renderArchiveCacheInfo();
  return page;
}

async function refreshArchiveAggregates(options = {}) {
  const [filtered, today, firstTen] = await Promise.all([
    loadArchiveAggregateWithCache({
      cacheKey: buildAggregateCacheKey("filtered", archiveState.filters),
      forceRemote: Boolean(options.forceRemote),
      filters: archiveState.filters
    }),
    loadArchiveAggregateWithCache({
      cacheKey: buildAggregateCacheKey("today", { datePreset: "today" }),
      forceRemote: Boolean(options.forceRemote),
      filters: { datePreset: "today" }
    }),
    loadArchiveAggregateWithCache({
      cacheKey: buildAggregateCacheKey("firstTen", { armyPowerTextIn: FIRST_TEN_LEVELS }),
      forceRemote: Boolean(options.forceRemote),
      filters: { armyPowerTextIn: FIRST_TEN_LEVELS }
    })
  ]);

  if (options.requestToken && options.requestToken !== archiveRequestToken) {
    return;
  }

  archiveState.aggregates.filtered = filtered;
  archiveState.aggregates.today = today;
  archiveState.aggregates.firstTen = firstTen;
  renderArchiveHeader();
  renderArchiveAggregates();
}

async function loadArchiveAggregateWithCache(options) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchiveAggregate !== "function") {
    return buildEmptyAggregate();
  }

  const summaryCache = readArchiveSummaryCache();
  const cachedEntry = summaryCache[options.cacheKey];
  if (!options.forceRemote && isSummaryCacheFresh(cachedEntry)) {
    return {
      ...buildEmptyAggregate(),
      ...cachedEntry.data,
      readSource: "cache"
    };
  }

  const aggregate = await window.BTFirebase.loadOverviewArchiveAggregate({
    filters: options.filters || {}
  });

  summaryCache[options.cacheKey] = {
    savedAt: new Date().toISOString(),
    data: {
      count: normalizeMetricNumber(aggregate?.count),
      totalGold: normalizeMetricNumber(aggregate?.totalGold),
      totalLoot: normalizeMetricNumber(aggregate?.totalLoot),
      totalExp: normalizeMetricNumber(aggregate?.totalExp),
      exact: aggregate?.exact !== false
    }
  };
  writeArchiveSummaryCache(summaryCache);

  return {
    count: normalizeMetricNumber(aggregate?.count),
    totalGold: normalizeMetricNumber(aggregate?.totalGold),
    totalLoot: normalizeMetricNumber(aggregate?.totalLoot),
    totalExp: normalizeMetricNumber(aggregate?.totalExp),
    exact: aggregate?.exact !== false,
    readSource: aggregate?.readSource || "server"
  };
}

function renderArchiveLoadingState() {
  if (archiveFilterSummary) {
    archiveFilterSummary.textContent = "Kayitlar ve ozetler yukleniyor.";
  }
  if (archiveDataModeLabel) {
    archiveDataModeLabel.textContent = "Yukleniyor";
  }
  if (archiveList) {
    archiveList.innerHTML = '<p class="summary-empty">Kayitlar yukleniyor.</p>';
  }
}

function mergeArchiveItems(items) {
  const merged = new Map(archiveState.loadedItems.map((item) => [item.id, item]));
  (items || []).forEach((item) => {
    if (item?.id) {
      merged.set(item.id, item);
    }
  });
  archiveState.loadedItems = [...merged.values()].sort((left, right) => String(right?.savedAt || "").localeCompare(String(left?.savedAt || "")));
}

function renderArchiveHeader() {
  const filteredAggregate = archiveState.aggregates.filtered || buildEmptyAggregate();
  const totalCount = filteredAggregate.count > 0 || hasAnyActiveArchiveFilter()
    ? filteredAggregate.count
    : archiveState.loadedItems.length;
  if (archiveCountLabel) {
    archiveCountLabel.textContent = formatNumber(totalCount);
  }
  if (archiveDataModeLabel) {
    archiveDataModeLabel.textContent = formatReadSourceLabel(archiveState.readSource);
  }
  if (archiveFilterSummary) {
    archiveFilterSummary.textContent = buildArchiveFilterSummaryText(filteredAggregate);
  }
}

function renderArchiveAggregates() {
  const filteredAggregate = archiveState.aggregates.filtered || buildEmptyAggregate();
  const todayAggregate = archiveState.aggregates.today || buildEmptyAggregate();
  const firstTenAggregate = archiveState.aggregates.firstTen || buildEmptyAggregate();

  setText(archiveFilteredCountValue, formatNumber(filteredAggregate.count));
  setText(archiveFilteredCountHint, filteredAggregate.exact ? "Tum filtreler icin toplam" : "Cache uzerinden yaklasik");
  setText(archiveFilteredExpValue, formatNumber(filteredAggregate.totalExp));
  setText(archiveFilteredLootValue, formatNumber(filteredAggregate.totalLoot));
  setText(archiveTodayExpValue, `${formatNumber(todayAggregate.totalExp)} EXP`);
  setText(archiveTodayLootValue, `${formatNumber(todayAggregate.totalLoot)} ganimet`);
  setText(archiveFirstTenExpValue, `${formatNumber(firstTenAggregate.totalExp)} EXP`);
  setText(archiveFirstTenLootValue, `${formatNumber(firstTenAggregate.totalLoot)} ganimet`);
}

function renderArchiveCacheInfo() {
  if (!window.BTFirebase || typeof window.BTFirebase.getOverviewArchiveCacheInfo !== "function") {
    return;
  }

  const cacheInfo = window.BTFirebase.getOverviewArchiveCacheInfo();
  if (!cacheInfo?.lastSyncedAt) {
    setText(archiveCacheStatusValue, "Bos");
    setText(archiveCacheStatusHint, "Yerel cache henuz dolmadi");
    return;
  }

  setText(archiveCacheStatusValue, formatRelativeCacheAge(cacheInfo.lastSyncedAt));
  setText(archiveCacheStatusHint, `${formatNumber(cacheInfo.itemCount || 0)} kayit cache icinde`);
}

function renderArchivePage() {
  if (!archiveList || !archivePagination || !archivePageInfo || !archivePrevPageBtn || !archiveNextPageBtn || !archivePageNumbers) {
    return;
  }

  if (!archiveState.loadedItems.length) {
    archiveList.innerHTML = '<p class="summary-empty">Bu filtrelerde kayit bulunamadi.</p>';
    archivePagination.hidden = true;
    return;
  }

  const start = archiveState.currentPage * archiveState.pageSize;
  const pageItems = archiveState.loadedItems.slice(start, start + archiveState.pageSize);
  archiveList.innerHTML = `
    <div class="archive-table-wrap archive-table-desktop">
      <table class="archive-table">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Gold</th>
            <th>Ganimet Altin</th>
            <th>EXP</th>
            <th>Seviye</th>
            <th>Kat</th>
            <th>Islem</th>
          </tr>
        </thead>
        <tbody>
          ${pageItems.map((item) => renderArchiveRow(item)).join("")}
        </tbody>
      </table>
    </div>
    <div class="archive-card-list archive-card-mobile">
      ${pageItems.map((item) => renderArchiveCard(item)).join("")}
    </div>
  `;

  const exactTotal = archiveState.aggregates.filtered?.count || 0;
  const totalCount = exactTotal > 0 || hasAnyActiveArchiveFilter()
    ? exactTotal
    : archiveState.loadedItems.length;

  archivePagination.hidden = totalCount <= archiveState.pageSize && !archiveState.remoteHasMore;
  archivePageInfo.textContent = `${start + 1}-${start + pageItems.length} / ${formatNumber(totalCount)}`;
  archivePrevPageBtn.disabled = archiveState.currentPage === 0;
  archiveNextPageBtn.disabled = start + archiveState.pageSize >= archiveState.loadedItems.length && !archiveState.remoteHasMore;
  archivePageNumbers.innerHTML = renderArchivePageNumberButtons(totalCount);
}

function renderArchiveRow(item) {
  const sourceBadge = renderSourceBadge(item);
  const actionDisabled = isAdminSession ? "" : "disabled";

  return `
    <tr>
      <td>${escapeHtml(formatDateTime(item?.savedAt))}</td>
      <td>${renderArchiveGoldCell(item)}</td>
      <td>${escapeHtml(formatNumber(item?.lootGoldValue, item?.lootGoldText || "-"))}</td>
      <td>${escapeHtml(formatNumber(item?.expValue, item?.expText || "-"))}</td>
      <td>${escapeHtml(item?.levelText || "-")}</td>
      <td>${escapeHtml(formatArmyPowerDisplay(item?.armyPowerText || "-"))}</td>
      <td>
        <div class="archive-action-group">
          ${sourceBadge}
          <button class="button button-ghost archive-action-btn" type="button" data-action="edit" data-id="${escapeAttribute(item?.id || "")}" ${actionDisabled} title="Duzenle" aria-label="Duzenle">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
          <button class="button button-ghost archive-action-btn archive-action-btn-danger" type="button" data-action="delete" data-id="${escapeAttribute(item?.id || "")}" ${actionDisabled} title="Sil" aria-label="Sil">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderArchiveCard(item) {
  const sourceBadge = renderSourceBadge(item);
  const actionDisabled = isAdminSession ? "" : "disabled";
  return `
    <article class="archive-card">
      <div class="archive-card-head">
        <div>
          <p class="archive-card-date">${escapeHtml(formatDateTime(item?.savedAt))}</p>
          <div class="archive-card-title-row">
            ${sourceBadge}
            <strong>${escapeHtml(formatNumber(item?.goldValue, item?.goldText || "-"))} gold</strong>
          </div>
        </div>
        <div class="archive-action-group">
          <button class="button button-ghost archive-action-btn" type="button" data-action="edit" data-id="${escapeAttribute(item?.id || "")}" ${actionDisabled} title="Duzenle" aria-label="Duzenle">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
          <button class="button button-ghost archive-action-btn archive-action-btn-danger" type="button" data-action="delete" data-id="${escapeAttribute(item?.id || "")}" ${actionDisabled} title="Sil" aria-label="Sil">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
          </button>
        </div>
      </div>
      <div class="archive-card-metrics">
        ${renderArchiveCardMetric("Ganimet", formatNumber(item?.lootGoldValue, item?.lootGoldText || "-"))}
        ${renderArchiveCardMetric("EXP", formatNumber(item?.expValue, item?.expText || "-"))}
        ${renderArchiveCardMetric("Seviye", item?.levelText || "-")}
        ${renderArchiveCardMetric("Kat", formatArmyPowerDisplay(item?.armyPowerText || "-"))}
      </div>
    </article>
  `;
}

function renderArchiveCardMetric(label, value) {
  return `
    <div class="archive-card-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value || "-"))}</strong>
    </div>
  `;
}

function renderArchiveGoldCell(item) {
  const manualIcon = item?.sourceType === "manual"
    ? '<span class="archive-source-icon" title="Manuel kayit" aria-label="Manuel kayit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 5-3.4 9.2-7 10-3.6-.8-7-5-7-10V6l7-3z"></path><path d="M9.5 12.5l1.7 1.7 3.8-4.2"></path></svg></span>'
    : "";
  return `<span class="archive-gold-cell">${manualIcon}<span>${escapeHtml(formatNumber(item?.goldValue, item?.goldText || "-"))}</span></span>`;
}

function renderSourceBadge(item) {
  const label = item?.sourceType === "fill" ? "Fill" : "Manuel";
  const className = item?.sourceType === "fill" ? "archive-source-pill archive-source-pill-fill" : "archive-source-pill archive-source-pill-manual";
  return `<span class="${className}">${escapeHtml(label)}</span>`;
}

function formatArmyPowerDisplay(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") {
    return "-";
  }

  const slashMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    const total = Number.parseInt(slashMatch[2], 10);
    if (!Number.isFinite(total)) {
      return "-";
    }
    return String(Math.max(0, Math.floor((total - 10) / 10)));
  }

  const directNumber = Number.parseInt(text.replace(/[^\d-]/g, ""), 10);
  if (Number.isFinite(directNumber)) {
    return String(directNumber);
  }

  return text;
}

async function handleDeleteArchive(id) {
  const item = archiveState.loadedItems.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (!window.confirm("Bu satir silinsin mi?")) {
    return;
  }

  try {
    await window.BTFirebase.deleteOverviewArchive(id);
    clearArchiveSummaryCache();
    await refreshArchiveView({ forceRemote: true });
  } catch (error) {
    console.warn("Arsiv satiri silinemedi.", error);
    window.alert(error?.message || "Satir silinemedi.");
  }
}

async function handleEditArchive(id) {
  const item = archiveState.loadedItems.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  const currentGold = formatNumber(item?.goldValue, item?.goldText || "");
  const currentLoot = formatNumber(item?.lootGoldValue, item?.lootGoldText || "");
  const currentExp = formatNumber(item?.expValue, item?.expText || "");
  const currentArmyPower = formatArmyPowerDisplay(item?.armyPowerText || "-");
  const currentLevel = String(item?.levelText || "-");

  const nextGold = window.prompt("Yeni gold degeri", currentGold);
  if (nextGold === null) {
    return;
  }

  const nextLoot = window.prompt("Yeni ganimet altin degeri", currentLoot);
  if (nextLoot === null) {
    return;
  }

  const nextExp = window.prompt("Yeni EXP degeri", currentExp);
  if (nextExp === null) {
    return;
  }

  const nextArmyPower = window.prompt("Yeni kat degeri", currentArmyPower);
  if (nextArmyPower === null) {
    return;
  }

  const nextLevel = window.prompt("Yeni seviye", currentLevel);
  if (nextLevel === null) {
    return;
  }

  const normalizedGoldDigits = normalizeDigits(nextGold);
  const normalizedLootDigits = normalizeDigits(nextLoot);
  const normalizedExpDigits = normalizeDigits(nextExp);
  const normalizedArmyPowerDigits = normalizeDigits(nextArmyPower);
  const normalizedLevelDigits = normalizeDigits(nextLevel);

  if (!normalizedGoldDigits || !normalizedLootDigits || !normalizedExpDigits || !normalizedArmyPowerDigits || !normalizedLevelDigits) {
    window.alert("Gold, ganimet, EXP, kat ve seviye sayisal olmali.");
    return;
  }

  const updatedItem = {
    ...item,
    goldText: normalizedGoldDigits,
    goldValue: Number.parseInt(normalizedGoldDigits, 10),
    lootGoldText: normalizedLootDigits,
    lootGoldValue: Number.parseInt(normalizedLootDigits, 10),
    expText: normalizedExpDigits,
    expValue: Number.parseInt(normalizedExpDigits, 10),
    armyPowerText: formatArchiveKatStorage(normalizedArmyPowerDigits),
    levelText: normalizedLevelDigits,
    updatedAt: new Date().toISOString()
  };

  try {
    await window.BTFirebase.updateOverviewArchive(updatedItem);
    clearArchiveSummaryCache();
    await refreshArchiveView({ forceRemote: true });
  } catch (error) {
    console.warn("Arsiv satiri guncellenemedi.", error);
    window.alert(error?.message || "Satir guncellenemedi.");
  }
}

function readArchiveFiltersFromUi() {
  return {
    armyPowerText: normalizeDigits(archiveLevelFilterInput?.value || ""),
    datePreset: normalizeDatePreset(archiveDatePresetSelect?.value),
    sourceType: normalizeSourceType(archiveSourceFilterSelect?.value)
  };
}

function resetArchiveFilters() {
  archiveState.filters = {
    armyPowerText: "",
    datePreset: "all",
    sourceType: ""
  };
  archiveState.pageSize = DEFAULT_PAGE_SIZE;
  if (archiveLevelFilterInput) {
    archiveLevelFilterInput.value = "";
  }
  if (archiveDatePresetSelect) {
    archiveDatePresetSelect.value = "all";
  }
  if (archiveSourceFilterSelect) {
    archiveSourceFilterSelect.value = "";
  }
  if (archivePageSizeSelect) {
    archivePageSizeSelect.value = String(DEFAULT_PAGE_SIZE);
  }
}

function buildArchiveFilterSummaryText(filteredAggregate) {
  const parts = [];
  if (archiveState.filters.armyPowerText) {
    parts.push(`${archiveState.filters.armyPowerText}. kat`);
  }
  if (archiveState.filters.datePreset === "today") {
    parts.push("bugun");
  } else if (archiveState.filters.datePreset === "7d") {
    parts.push("son 7 gun");
  } else if (archiveState.filters.datePreset === "30d") {
    parts.push("son 30 gun");
  }
  if (archiveState.filters.sourceType === "manual") {
    parts.push("manuel");
  } else if (archiveState.filters.sourceType === "fill") {
    parts.push("fill");
  }
  if (!parts.length) {
    return "En yeni kayitlar listeleniyor. Acilislar cache-first calisir, gerekirse canli veri cekilir.";
  }
  const exactSuffix = filteredAggregate?.exact ? "tam toplam" : "cache tahmini";
  return `${parts.join(" / ")} filtresi aktif. ${formatNumber(filteredAggregate?.count || 0)} kayit bulundu, ${exactSuffix}.`;
}

function hasAnyActiveArchiveFilter() {
  return Boolean(
    archiveState.filters.armyPowerText ||
    archiveState.filters.sourceType ||
    archiveState.filters.datePreset !== "all"
  );
}

function buildEmptyAggregate() {
  return {
    count: 0,
    totalGold: 0,
    totalLoot: 0,
    totalExp: 0,
    exact: true,
    readSource: "cache"
  };
}

async function ensureArchivePageLoaded(targetPage) {
  const targetStart = targetPage * archiveState.pageSize;
  while (targetStart >= archiveState.loadedItems.length && archiveState.remoteHasMore) {
    await loadArchivePage();
  }
  return targetStart < archiveState.loadedItems.length;
}

function renderArchivePageNumberButtons(totalCount) {
  const totalPages = Math.max(1, Math.ceil(totalCount / archiveState.pageSize));
  const pageItems = buildArchivePageNumberItems(totalPages, archiveState.currentPage);
  return pageItems.map((item) => {
    if (item === "...") {
      return '<span class="archive-page-ellipsis">...</span>';
    }
    const pageIndex = Number(item);
    const isActive = pageIndex === archiveState.currentPage;
    return `
      <button
        class="archive-page-number${isActive ? " is-active" : ""}"
        type="button"
        data-page-index="${pageIndex}"
        ${isActive ? 'aria-current="page"' : ""}
      >${pageIndex + 1}</button>
    `;
  }).join("");
}

function buildArchivePageNumberItems(totalPages, currentPage) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const pages = new Set([0, totalPages - 1, currentPage]);
  if (currentPage - 1 > 0) {
    pages.add(currentPage - 1);
  }
  if (currentPage - 2 > 0) {
    pages.add(currentPage - 2);
  }
  if (currentPage + 1 < totalPages - 1) {
    pages.add(currentPage + 1);
  }
  if (currentPage + 2 < totalPages - 1) {
    pages.add(currentPage + 2);
  }

  const sortedPages = [...pages].sort((left, right) => left - right);
  const items = [];
  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) {
      items.push("...");
    }
    items.push(page);
  });
  return items;
}

function normalizeDigits(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  return String(Number.parseInt(digits, 10));
}

function formatArchiveKatStorage(value) {
  const digits = normalizeDigits(value);
  const numeric = Number.parseInt(digits, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return digits;
  }
  return `0/${(numeric * 10) + 10}`;
}

function normalizeDatePreset(value) {
  return value === "today" || value === "7d" || value === "30d" ? value : "all";
}

function normalizeSourceType(value) {
  return value === "manual" || value === "fill" ? value : "";
}

function normalizePageSize(value) {
  const parsed = Number.parseInt(value, 10);
  return PAGE_SIZE_OPTIONS.has(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function formatNumber(value, fallback = "0") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(fallback);
  }
  return numeric.toLocaleString("tr-TR");
}

function normalizeMetricNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatReadSourceLabel(value) {
  if (value === "server") {
    return "Canli";
  }
  if (value === "cache-fallback") {
    return "Cache";
  }
  if (value === "cache") {
    return "Cache";
  }
  if (value === "Yukleniyor") {
    return value;
  }
  return "Hazir";
}

function formatRelativeCacheAge(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) {
    return "Az once";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} dk`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} sa`;
  }
  return `${Math.floor(diffHours / 24)} gun`;
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return String(value || "-");
  }
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function readArchiveSummaryCache() {
  try {
    const raw = localStorage.getItem(ARCHIVE_SUMMARY_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeArchiveSummaryCache(value) {
  localStorage.setItem(ARCHIVE_SUMMARY_CACHE_KEY, JSON.stringify(value && typeof value === "object" ? value : {}));
}

function clearArchiveSummaryCache() {
  localStorage.removeItem(ARCHIVE_SUMMARY_CACHE_KEY);
}

function isSummaryCacheFresh(entry) {
  if (!entry?.savedAt) {
    return false;
  }
  const ageMs = Date.now() - Date.parse(entry.savedAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ARCHIVE_SUMMARY_CACHE_MAX_AGE_MS;
}

function buildAggregateCacheKey(prefix, filters) {
  return `${prefix}:${JSON.stringify(filters || {})}`;
}

function setText(node, value) {
  if (node) {
    node.textContent = String(value ?? "");
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
