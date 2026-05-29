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
const archiveServerFilterSelect = document.querySelector("#archiveServerFilterSelect");
const archiveLevelFilterInput = document.querySelector("#archiveLevelFilterInput");
const archiveHoursFilterInput = document.querySelector("#archiveHoursFilterInput");
const archiveDatePresetSelect = document.querySelector("#archiveDatePresetSelect");
const archivePageSizeSelect = document.querySelector("#archivePageSizeSelect");
const archiveResetFiltersBtn = document.querySelector("#archiveResetFiltersBtn");
const archiveRefreshBtn = document.querySelector("#archiveRefreshBtn");
const archiveBulkRegressionBtn = document.querySelector("#archiveBulkRegressionBtn");
const archiveFilteredCountValue = document.querySelector("#archiveFilteredCountValue");
const archiveFilteredCountHint = document.querySelector("#archiveFilteredCountHint");
const archiveFilteredExpValue = document.querySelector("#archiveFilteredExpValue");
const archiveFilteredLootValue = document.querySelector("#archiveFilteredLootValue");
const archiveTodayExpValue = document.querySelector("#archiveTodayExpValue");
const archiveTodayLootValue = document.querySelector("#archiveTodayLootValue");
const archiveFirstTenExpValue = document.querySelector("#archiveFirstTenExpValue");
const archiveFirstTenLootValue = document.querySelector("#archiveFirstTenLootValue");
const archiveFilteredLevelValue = document.querySelector("#archiveFilteredLevelValue");
const archiveFilteredLevelHint = document.querySelector("#archiveFilteredLevelHint");
const archiveFirstXInput = document.querySelector("#archiveFirstXInput");
const archiveSelectionSummary = document.querySelector("#archiveSelectionSummary");
const archiveSelectionCount = document.querySelector("#archiveSelectionCount");
const archiveSelectionTotals = document.querySelector("#archiveSelectionTotals");
const adminAuthStatus = document.querySelector("#adminAuthStatus");
const adminEmailInput = document.querySelector("#adminEmailInput");
const adminPasswordInput = document.querySelector("#adminPasswordInput");
const adminLoginBtn = document.querySelector("#adminLoginBtn");
const adminLogoutBtn = document.querySelector("#adminLogoutBtn");
const archiveEditModal = document.querySelector("#archiveEditModal");
const archiveEditCloseBtn = document.querySelector("#archiveEditCloseBtn");
const archiveEditCancelBtn = document.querySelector("#archiveEditCancelBtn");
const archiveEditSaveBtn = document.querySelector("#archiveEditSaveBtn");
const archiveEditDocIdLabel = document.querySelector("#archiveEditDocIdLabel");
const archiveEditUpdatedAtLabel = document.querySelector("#archiveEditUpdatedAtLabel");
const archiveEditErrorBox = document.querySelector("#archiveEditErrorBox");
const archiveEditSavedAtInput = document.querySelector("#archiveEditSavedAtInput");
const archiveEditSourceTypeInput = document.querySelector("#archiveEditSourceTypeInput");
const archiveEditLootGoldTextInput = document.querySelector("#archiveEditLootGoldTextInput");
const archiveEditLootGoldValueInput = document.querySelector("#archiveEditLootGoldValueInput");
const archiveEditExpTextInput = document.querySelector("#archiveEditExpTextInput");
const archiveEditExpValueInput = document.querySelector("#archiveEditExpValueInput");
const archiveEditLevelTextInput = document.querySelector("#archiveEditLevelTextInput");
const archiveEditArmyPowerTextInput = document.querySelector("#archiveEditArmyPowerTextInput");
const archiveEditEnemyRosterTextInput = document.querySelector("#archiveEditEnemyRosterTextInput");
const archiveEditAllyRosterTextInput = document.querySelector("#archiveEditAllyRosterTextInput");
const archiveEditFallenUnitsTextInput = document.querySelector("#archiveEditFallenUnitsTextInput");
const archiveEditReviveStoneTextInput = document.querySelector("#archiveEditReviveStoneTextInput");
const archiveEditHostInput = document.querySelector("#archiveEditHostInput");
const archiveEditPageUrlInput = document.querySelector("#archiveEditPageUrlInput");
const archiveEditPageTitleInput = document.querySelector("#archiveEditPageTitleInput");

const DEFAULT_PAGE_SIZE = 40;
const PAGE_SIZE_OPTIONS = new Set([20, 40, 80]);
const ARCHIVE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const ARCHIVE_SUMMARY_CACHE_KEY = "btAnalyssArchiveSummaryCacheV5";
const ARCHIVE_SUMMARY_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const ARCHIVE_SNAPSHOT_BASE_URL = "https://firebasestorage.googleapis.com/v0/b/bt-analiz.firebasestorage.app/o/";
const ARCHIVE_SNAPSHOT_TOKEN = "fe99d2c6-71b5-4f58-9c16-7f7f6e9f5b6d";
const ARCHIVE_SNAPSHOT_MANIFEST_PATH = "archive-snapshots/manifest.json";
const ARCHIVE_SNAPSHOT_LEGACY_PATH = "archive-snapshots/latest.json";

function getFirstXLevels(x) {
  const count = Math.max(1, Math.min(100, Number(x) || 10));
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

let archiveLevelInputDebounce = 0;
let archiveHoursInputDebounce = 0;
let archiveRequestToken = 0;
let isAdminSession = false;
let currentEditingArchiveId = "";

const archiveState = {
  filters: {
    server: "s66",
    armyPowerText: "",
    datePreset: "all",
    sourceType: "",
    hours: null
  },
  firstX: 10,
  pageSize: DEFAULT_PAGE_SIZE,
  visibleLimit: DEFAULT_PAGE_SIZE,
  selectedIds: new Set(),
  expandedIds: new Set(),
  loadedItems: [],
  snapshotParts: [],
  snapshotLoadedPartPaths: new Set(),
  remoteCursor: null,
  remoteHasMore: false,
  readSource: "idle",
  aggregates: {
    filtered: buildEmptyAggregate(),
    today: buildEmptyAggregate(),
    firstTen: buildEmptyAggregate()
  },
  levelBounds: buildEmptyLevelBounds()
};

bindArchiveControls();
bindArchiveEditModal();
void bindAdminAuth();
void refreshArchiveView();

archivePrevPageBtn?.addEventListener("click", () => {
  archiveState.visibleLimit = archiveState.pageSize;
  renderArchivePage();
});

archiveNextPageBtn?.addEventListener("click", async () => {
  const targetLimit = archiveState.visibleLimit + archiveState.pageSize;
  const ready = await ensureArchiveItemsLoadedUntil(targetLimit);
  if (!ready) {
    return;
  }
  archiveState.visibleLimit = Math.min(targetLimit, archiveState.loadedItems.length);
  renderArchivePage();
});

archiveList?.addEventListener("click", (event) => {
  const editButton = event.target instanceof Element ? event.target.closest("[data-archive-edit-id]") : null;
  if (editButton) {
    const id = editButton.getAttribute("data-archive-edit-id") || "";
    if (id) {
      void handleEditArchive(id);
    }
    return;
  }

  const deleteButton = event.target instanceof Element ? event.target.closest("[data-archive-delete-id]") : null;
  if (deleteButton) {
    const id = deleteButton.getAttribute("data-archive-delete-id") || "";
    if (id) {
      void handleDeleteArchive(id);
    }
    return;
  }

  const simButton = event.target instanceof Element ? event.target.closest("[data-archive-sim-id]") : null;
  if (simButton) {
    const id = simButton.getAttribute("data-archive-sim-id") || "";
    if (id) {
      openArchiveItemSimulation(id);
    }
    return;
  }

  const detailButton = event.target instanceof Element ? event.target.closest("[data-archive-detail-id]") : null;
  if (!detailButton) {
    return;
  }
  const id = detailButton.getAttribute("data-archive-detail-id") || "";
  if (!id) {
    return;
  }
  if (archiveState.expandedIds.has(id)) {
    archiveState.expandedIds.delete(id);
  } else {
    archiveState.expandedIds.add(id);
  }
  renderArchivePage();
});

archiveList?.addEventListener("change", (event) => {
  const selectAllCheckbox = event.target instanceof HTMLInputElement
    ? event.target.closest("[data-archive-select-all-visible]")
    : null;
  if (selectAllCheckbox) {
    setVisibleArchiveSelection(selectAllCheckbox.checked);
    renderArchivePage();
    return;
  }

  const checkbox = event.target instanceof HTMLInputElement
    ? event.target.closest("[data-archive-select-id]")
    : null;
  if (!checkbox) {
    return;
  }
  const id = checkbox.getAttribute("data-archive-select-id") || "";
  if (!id) {
    return;
  }
  if (checkbox.checked) {
    archiveState.selectedIds.add(id);
  } else {
    archiveState.selectedIds.delete(id);
  }
  renderArchiveSelectionSummary();
});

function bindArchiveControls() {
  archiveLevelFilterInput?.addEventListener("input", () => {
    window.clearTimeout(archiveLevelInputDebounce);
    archiveLevelInputDebounce = window.setTimeout(() => {
      void applyFilters();
    }, 220);
  });

  archiveHoursFilterInput?.addEventListener("input", () => {
    window.clearTimeout(archiveHoursInputDebounce);
    archiveHoursInputDebounce = window.setTimeout(() => {
      void applyFilters();
    }, 250);
  });

  archiveDatePresetSelect?.addEventListener("change", () => {
    void applyFilters();
  });

  archiveServerFilterSelect?.addEventListener("change", () => {
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

  archiveBulkRegressionBtn?.addEventListener("click", async () => {
    if (!window.BulkBattleRegression || typeof window.BulkBattleRegression.openReportPage !== "function") {
      window.alert("Toplu test araci henuz hazir degil.");
      return;
    }

    let regressionItems = [];
    archiveBulkRegressionBtn.disabled = true;
    try {
      regressionItems = await loadArchiveSnapshotItemsForRegression();
    } catch (error) {
      console.warn("Arsiv snapshot okunamadi, Firestore fallback kullaniliyor.", error);
      await ensureAllArchiveItemsLoaded();
      regressionItems = archiveState.loadedItems;
    } finally {
      archiveBulkRegressionBtn.disabled = false;
    }

    if (!regressionItems.length) {
      window.alert("Toplu test icin filtrede kayit yok.");
      return;
    }

    window.BulkBattleRegression.openReportPage({
      kind: "archive",
      title: "Arsiv Toplu Test",
      scopeLabel: buildArchiveRegressionScopeLabel(regressionItems.length),
      selectedCount: regressionItems.length,
      totalCount: regressionItems.length,
      backHref: "archive.html",
      backLabel: "Arsiv",
      items: typeof window.BulkBattleRegression.prepareArchiveItems === "function"
        ? window.BulkBattleRegression.prepareArchiveItems(regressionItems)
        : regressionItems
    });
  });

  const firstXInputs = document.querySelectorAll(".archive-first-x-input");
  firstXInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const val = Math.max(1, Math.min(100, Number(input.value) || 10));
      firstXInputs.forEach((other) => {
        if (other !== input) {
          other.value = String(val);
        }
      });
      if (val !== archiveState.firstX) {
        archiveState.firstX = val;
        void refreshArchiveAggregatesOnly();
      }
    });
  });
}

async function refreshArchiveAggregatesOnly() {
  const requestToken = ++archiveRequestToken;
  try {
    const payload = await loadArchiveSnapshotPayload();
    applyArchiveSnapshotState(payload);
    renderArchiveHeader();
    renderArchiveAggregates();
    renderArchivePage();
    return;
  } catch (error) {
    console.warn("Arsiv snapshot ozetleri okunamadi, Firestore fallback kullaniliyor.", error);
  }
  await refreshArchiveAggregates({ requestToken });
}

async function applyFilters() {
  archiveState.filters = readArchiveFiltersFromUi();
  await refreshArchiveView();
}

async function refreshArchiveView(options = {}) {
  const requestToken = ++archiveRequestToken;
  archiveState.visibleLimit = archiveState.pageSize;
  archiveState.remoteCursor = null;
  archiveState.remoteHasMore = false;
  archiveState.snapshotParts = [];
  archiveState.snapshotLoadedPartPaths = new Set();
  archiveState.loadedItems = [];
  archiveState.levelBounds = buildEmptyLevelBounds();
  archiveState.selectedIds.clear();
  renderArchiveSelectionSummary();
  renderArchiveLoadingState();

  try {
    const payload = await loadArchiveSnapshotPayload();
    if (requestToken !== archiveRequestToken) {
      return;
    }
    applyArchiveSnapshotState(payload);
    renderArchiveHeader();
    renderArchiveAggregates();
    renderArchivePage();
    return;
  } catch (error) {
    console.warn("Arsiv snapshot okunamadi, Firestore fallback kullaniliyor.", error);
  }

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
}

async function loadArchivePage(options = {}) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchivesPage !== "function") {
    return null;
  }

  if (options.reset) {
    archiveState.remoteCursor = null;
    archiveState.remoteHasMore = false;
    archiveState.snapshotParts = [];
    archiveState.snapshotLoadedPartPaths = new Set();
    archiveState.visibleLimit = archiveState.pageSize;
    archiveState.loadedItems = [];
  }

  const page = await window.BTFirebase.loadOverviewArchivesPage({
    pageSize: archiveState.pageSize,
    cursor: options.reset ? null : archiveState.remoteCursor,
    preferCache: false,
    cacheMaxAgeMs: options.forceRemote ? 0 : ARCHIVE_CACHE_MAX_AGE_MS,
    filters: {
      server: archiveState.filters.server,
      armyPowerText: archiveState.filters.armyPowerText,
      datePreset: archiveState.filters.datePreset,
      hours: archiveState.filters.hours
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
  return page;
}

async function refreshArchiveAggregates(options = {}) {
  const firstXLevels = getFirstXLevels(archiveState.firstX);
  const [filtered, today, firstTen, levelBounds] = await Promise.all([
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
      cacheKey: buildAggregateCacheKey(`firstX_${archiveState.firstX}`, { armyPowerTextIn: firstXLevels }),
      forceRemote: Boolean(options.forceRemote),
      filters: { armyPowerTextIn: firstXLevels }
    }),
    loadArchiveLevelBoundsWithCache({
      cacheKey: buildAggregateCacheKey("levelBounds", archiveState.filters),
      forceRemote: Boolean(options.forceRemote),
      filters: archiveState.filters
    })
  ]);

  if (options.requestToken && options.requestToken !== archiveRequestToken) {
    return;
  }

  archiveState.aggregates.filtered = filtered;
  archiveState.aggregates.today = today;
  archiveState.aggregates.firstTen = firstTen;
  archiveState.levelBounds = levelBounds;
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
      totalLoot: normalizeMetricNumber(aggregate?.totalLoot),
      totalExp: normalizeMetricNumber(aggregate?.totalExp),
      exact: aggregate?.exact !== false
    }
  };
  writeArchiveSummaryCache(summaryCache);

  return {
    count: normalizeMetricNumber(aggregate?.count),
    totalLoot: normalizeMetricNumber(aggregate?.totalLoot),
    totalExp: normalizeMetricNumber(aggregate?.totalExp),
    exact: aggregate?.exact !== false,
    readSource: aggregate?.readSource || "server"
  };
}

async function loadArchiveLevelBoundsWithCache(options) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchiveLevelBounds !== "function") {
    return buildEmptyLevelBounds();
  }

  const summaryCache = readArchiveSummaryCache();
  const cachedEntry = summaryCache[options.cacheKey];
  if (!options.forceRemote && isSummaryCacheFresh(cachedEntry)) {
    return {
      ...buildEmptyLevelBounds(),
      ...cachedEntry.data,
      readSource: "cache"
    };
  }

  const bounds = await window.BTFirebase.loadOverviewArchiveLevelBounds({
    filters: options.filters || {}
  });
  const normalizedBounds = {
    oldest: bounds?.oldest || null,
    newest: bounds?.newest || null,
    exact: bounds?.exact !== false,
    readSource: bounds?.readSource || "server"
  };
  summaryCache[options.cacheKey] = {
    savedAt: new Date().toISOString(),
    data: normalizedBounds
  };
  writeArchiveSummaryCache(summaryCache);
  return normalizedBounds;
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
  updateLevelDifference();
}

function updateLevelDifference() {
  if (!archiveFilteredLevelValue || !archiveFilteredLevelHint) return;

  const oldestItem = archiveState.levelBounds?.oldest || null;
  const newestItem = archiveState.levelBounds?.newest || null;
  if (!oldestItem || !newestItem) {
    archiveFilteredLevelValue.textContent = "-";
    archiveFilteredLevelHint.textContent = "Veri yetersiz";
    return;
  }

  const getNumericLevel = (item) => {
    if (!item) return 0;
    const directValue = Number(item.levelValue);
    if (Number.isFinite(directValue) && directValue > 0) {
      return directValue;
    }
    const match = String(item.levelText || "").match(/\d+/);
    if (match) {
      const val = Number.parseInt(match[0], 10);
      if (Number.isFinite(val) && val > 0) return val;
    }
    return 0;
  };

  const startLevel = getNumericLevel(oldestItem);
  const endLevel = getNumericLevel(newestItem);

  if (startLevel > 0 && endLevel > 0) {
    const diff = endLevel - startLevel;
    const diffText = diff >= 0 ? `+${diff}` : `${diff}`;
    archiveFilteredLevelValue.textContent = `${startLevel} -> ${endLevel}`;
    archiveFilteredLevelHint.textContent = `Seviye Farki: ${diffText}`;
  } else {
    archiveFilteredLevelValue.textContent = "-";
    archiveFilteredLevelHint.textContent = "Seviye bulunamadi";
  }
}

function renderArchivePage() {
  if (!archiveList || !archivePagination || !archivePageInfo || !archivePrevPageBtn || !archiveNextPageBtn || !archivePageNumbers) {
    return;
  }

  if (!archiveState.loadedItems.length) {
    archiveList.innerHTML = '<p class="summary-empty">Bu filtrelerde kayit bulunamadi.</p>';
    archivePagination.hidden = true;
    renderArchiveSelectionSummary();
    return;
  }

  const pageItems = archiveState.loadedItems.slice(0, archiveState.visibleLimit);
  archiveList.innerHTML = `
    <div class="archive-table-wrap archive-table-desktop">
      <table class="archive-table">
        <thead>
          <tr>
            <th class="archive-select-col">${renderArchiveSelectAllCheckbox(pageItems)}</th>
            <th>Tarih</th>
            <th>Ganimet</th>
            <th>EXP</th>
            <th>Seviye</th>
            <th>Kat</th>
            <th class="archive-detail-col">Detay</th>
            <th class="archive-actions-col">Islem</th>
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

  const hasMoreVisible = pageItems.length < archiveState.loadedItems.length || archiveState.remoteHasMore;
  archivePagination.hidden = !hasMoreVisible && pageItems.length <= archiveState.pageSize;
  archivePageInfo.textContent = `${formatNumber(pageItems.length)} / ${formatNumber(totalCount)} gosteriliyor`;
  archivePrevPageBtn.hidden = pageItems.length <= archiveState.pageSize;
  archivePrevPageBtn.disabled = pageItems.length <= archiveState.pageSize;
  archivePrevPageBtn.textContent = `Ilk ${archiveState.pageSize}`;
  archiveNextPageBtn.disabled = !hasMoreVisible;
  archiveNextPageBtn.textContent = "Devamini Gor";
  archivePageNumbers.innerHTML = "";
  syncArchiveSelectAllVisibleControl();
  renderArchiveSelectionSummary();
}

function getVisibleArchiveItems() {
  return archiveState.loadedItems.slice(0, archiveState.visibleLimit);
}

function setVisibleArchiveSelection(selected) {
  getVisibleArchiveItems().forEach((item) => {
    const id = item?.id || "";
    if (!id) {
      return;
    }
    if (selected) {
      archiveState.selectedIds.add(id);
    } else {
      archiveState.selectedIds.delete(id);
    }
  });
}

function renderArchiveSelectAllCheckbox(pageItems) {
  const visibleCount = pageItems.filter((item) => item?.id).length;
  return `
    <label class="archive-select-check archive-select-all-check" title="Gorunen ${formatNumber(visibleCount)} kaydi sec">
      <input
        type="checkbox"
        data-archive-select-all-visible="1"
        aria-label="Gorunen kayitlari sec"
        ${visibleCount === 0 ? "disabled" : ""}
      >
      <span></span>
    </label>
  `;
}

function syncArchiveSelectAllVisibleControl() {
  const checkbox = archiveList?.querySelector("[data-archive-select-all-visible]");
  if (!(checkbox instanceof HTMLInputElement)) {
    return;
  }
  const visibleItems = getVisibleArchiveItems().filter((item) => item?.id);
  const selectedCount = visibleItems.filter((item) => archiveState.selectedIds.has(item.id)).length;
  checkbox.checked = visibleItems.length > 0 && selectedCount === visibleItems.length;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < visibleItems.length;
}

function renderArchiveRow(item) {
  const isExpanded = archiveState.expandedIds.has(item?.id);
  const isSelected = archiveState.selectedIds.has(item?.id);
  return `
    <tr class="archive-row-main${isSelected ? " is-selected" : ""}">
      <td class="archive-select-cell">${renderArchiveSelectCheckbox(item, isSelected)}</td>
      <td>${escapeHtml(formatDateTime(item?.savedAt))}</td>
      <td>${escapeHtml(formatNumber(item?.lootGoldValue, item?.lootGoldText || "-"))}</td>
      <td class="archive-exp-cell">${escapeHtml(formatNumber(item?.expValue, item?.expText || "-"))}</td>
      <td>${escapeHtml(item?.levelText || "-")}</td>
      <td>${escapeHtml(formatArmyPowerDisplay(item?.armyPowerText || "-"))}</td>
      <td class="archive-detail-cell">${renderArchiveDetailButton(item, isExpanded)}</td>
      <td class="archive-action-cell">${renderArchiveActionGroup(item)}</td>
    </tr>
    ${isExpanded ? renderArchiveDetailRow(item) : ""}
  `;
}

function renderArchiveCard(item) {
  const isSelected = archiveState.selectedIds.has(item?.id);
  return `
    <article class="archive-card${isSelected ? " is-selected" : ""}">
      <div class="archive-card-head">
        ${renderArchiveSelectCheckbox(item, isSelected)}
        <div>
          <p class="archive-card-date">${escapeHtml(formatDateTime(item?.savedAt))}</p>
          <div class="archive-card-title-row">
            <strong>${escapeHtml(formatNumber(item?.lootGoldValue, item?.lootGoldText || "-"))} ganimet</strong>
          </div>
        </div>
        ${renderArchiveActionGroup(item)}
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

function renderArchiveSelectCheckbox(item, isSelected) {
  return `
    <label class="archive-select-check" title="Kaydi sec">
      <input
        type="checkbox"
        data-archive-select-id="${escapeAttribute(item?.id || "")}"
        ${isSelected ? "checked" : ""}
        aria-label="Kaydi sec"
      >
      <span></span>
    </label>
  `;
}

function renderArchiveSelectionSummary() {
  if (!archiveSelectionSummary || !archiveSelectionCount || !archiveSelectionTotals) {
    return;
  }
  const selectedItems = archiveState.loadedItems.filter((item) => archiveState.selectedIds.has(item?.id));
  const totalExp = selectedItems.reduce((sum, item) => sum + normalizeMetricNumber(item?.expValue), 0);
  const totalLoot = selectedItems.reduce((sum, item) => sum + normalizeMetricNumber(item?.lootGoldValue), 0);
  archiveSelectionSummary.hidden = selectedItems.length === 0;
  archiveSelectionCount.textContent = `${formatNumber(selectedItems.length)} kayit secildi`;
  archiveSelectionTotals.textContent = `${formatNumber(totalExp)} EXP / ${formatNumber(totalLoot)} ganimet`;
  syncArchiveSelectAllVisibleControl();
}

function renderArchiveActionGroup(item) {
  const adminTitle = isAdminSession
    ? "Admin islem"
    : "Duzenleme ve silme icin admin girisi gerekli";
  return `
    <div class="archive-action-group">
      <button
        class="archive-action-btn"
        type="button"
        data-archive-edit-id="${escapeAttribute(item?.id || "")}"
        aria-label="Kaydi duzenle"
        title="${isAdminSession ? "Kaydi duzenle" : adminTitle}"
        ${isAdminSession ? "" : "disabled"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button
        class="archive-action-btn archive-action-btn-danger"
        type="button"
        data-archive-delete-id="${escapeAttribute(item?.id || "")}"
        aria-label="Kaydi sil"
        title="${isAdminSession ? "Kaydi sil" : adminTitle}"
        ${isAdminSession ? "" : "disabled"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      </button>
    </div>
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

function renderArchiveDetailButton(item, isExpanded) {
  const hasDetails = hasArchiveDetails(item);
  return `
    <button
      class="archive-detail-toggle${isExpanded ? " is-open" : ""}"
      type="button"
      data-archive-detail-id="${item?.id || ""}"
      aria-label="Detay"
      aria-expanded="${isExpanded ? "true" : "false"}"
      ${hasDetails ? "" : "disabled"}
      title="${hasDetails ? "Detayi ac" : "Detay yok"}"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5c5.5 0 9.5 5.2 10.5 7-1 1.8-5 7-10.5 7S2.5 13.8 1.5 12C2.5 10.2 6.5 5 12 5z"></path>
        <circle cx="12" cy="12" r="3.2"></circle>
      </svg>
    </button>
  `;
}

function renderArchiveDetailRow(item) {
  const detailLines = getArchiveDetailEntries(item)
    .map((entry) => `
      <span class="archive-detail-inline ${entry.className}">${escapeHtml(entry.text)}${entry.actionHtml || ""}</span>
    `)
    .join("");

  if (!detailLines) {
    return "";
  }

  return `
    <tr class="archive-detail-row">
      <td colspan="8">
        <div class="archive-detail-panel archive-detail-panel-inline">
          ${detailLines}
        </div>
      </td>
    </tr>
  `;
}

function normalizeArchiveDetailText(value) {
  const text = String(value || "").trim();
  return text && text !== "-" ? text : "";
}

function getArchiveDetailEntries(item) {
  return [
    { value: item?.enemyRosterText, className: "is-enemy" },
    { value: item?.allyRosterText, className: "is-ally" },
    { value: item?.fallenUnitsText, className: "is-fallen" }
  ]
    .map((entry) => ({
      className: entry.className,
      text: formatArchiveDetailEntryText(normalizeArchiveDetailText(entry.value), entry.className),
      actionHtml: entry.className === "is-fallen" ? renderArchiveSimulationButton(item) : ""
    }))
    .filter((entry) => entry.text);
}

function formatArchiveDetailEntryText(text, className) {
  if (className === "is-fallen") {
    return formatArchiveFallenDisplayText(text);
  }
  return text || "";
}

function formatArchiveFallenDisplayText(text) {
  const entries = [...String(text || "").matchAll(/\(T(\d+)\)\s*x\s*(\d+)/gi)]
    .map((match) => `T${match[1]} x${match[2]}`);
  if (!entries.length) {
    return text || "";
  }
  return `Olenler : [${entries.join(", ")}]`;
}

function hasArchiveDetails(item) {
  return getArchiveDetailEntries(item).length > 0;
}

function renderArchiveSimulationButton(item) {
  if (!item?.id || !window.BulkBattleRegression || typeof window.BulkBattleRegression.openSimulationForCounts !== "function") {
    return "";
  }
  return `
    <button
      class="archive-inline-sim-btn"
      type="button"
      data-archive-sim-id="${escapeAttribute(item.id)}"
      aria-label="Simulasyonda ac"
      title="Simulasyonda ac"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg>
    </button>
  `;
}

function openArchiveItemSimulation(id) {
  const item = archiveState.loadedItems.find((entry) => entry.id === id);
  const regression = window.BulkBattleRegression;
  if (!item || !regression) {
    return;
  }
  if (typeof regression.parseArchiveEnemyCounts !== "function" || typeof regression.parseArchiveAllyCounts !== "function") {
    window.alert("Simulasyon hazir degil.");
    return;
  }
  const enemyCounts = regression.parseArchiveEnemyCounts(item.enemyRosterText || "");
  const allyCounts = regression.parseArchiveAllyCounts(item.allyRosterText || "");
  regression.openSimulationForCounts(enemyCounts, allyCounts);
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
  if (!isAdminSession) {
    window.alert("Arsiv silmek icin admin girisi zorunlu.");
    return;
  }
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
  if (!isAdminSession) {
    window.alert("Arsiv duzenlemek icin admin girisi zorunlu.");
    return;
  }
  const item = archiveState.loadedItems.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  openArchiveEditModal(item);
}

function bindArchiveEditModal() {
  archiveEditCloseBtn?.addEventListener("click", closeArchiveEditModal);
  archiveEditCancelBtn?.addEventListener("click", closeArchiveEditModal);
  archiveEditSaveBtn?.addEventListener("click", () => {
    void submitArchiveEditModal();
  });
  archiveEditModal?.addEventListener("click", (event) => {
    if (event.target === archiveEditModal) {
      closeArchiveEditModal();
    }
  });
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
    onStateChange: (isAdmin) => {
      isAdminSession = isAdmin;
      if (!isAdminSession) {
        closeArchiveEditModal();
      }
      renderArchivePage();
    }
  });
}

function openArchiveEditModal(item) {
  if (!archiveEditModal || !item?.id) {
    return;
  }

  currentEditingArchiveId = item.id;
  setText(archiveEditDocIdLabel, item.id);
  setText(archiveEditUpdatedAtLabel, formatDateTime(item.updatedAt || item.savedAt));
  setInputValue(archiveEditSavedAtInput, item.savedAt || "");
  setInputValue(archiveEditSourceTypeInput, item.sourceType || "manual");
  setInputValue(archiveEditLootGoldTextInput, item.lootGoldText || "-");
  setInputValue(archiveEditLootGoldValueInput, item.lootGoldValue ?? 0);
  setInputValue(archiveEditExpTextInput, item.expText || "-");
  setInputValue(archiveEditExpValueInput, item.expValue ?? 0);
  setInputValue(archiveEditLevelTextInput, item.levelText || "-");
  setInputValue(archiveEditArmyPowerTextInput, item.armyPowerText || "-");
  setInputValue(archiveEditEnemyRosterTextInput, item.enemyRosterText || "-");
  setInputValue(archiveEditAllyRosterTextInput, item.allyRosterText || "-");
  setInputValue(archiveEditFallenUnitsTextInput, item.fallenUnitsText || "-");
  setInputValue(archiveEditReviveStoneTextInput, item.reviveStoneText || "-");
  setInputValue(archiveEditHostInput, item.host || "");
  setInputValue(archiveEditPageUrlInput, item.pageUrl || "");
  setInputValue(archiveEditPageTitleInput, item.pageTitle || "");
  if (archiveEditSaveBtn) {
    archiveEditSaveBtn.disabled = false;
  }
  setArchiveEditError("");
  archiveEditModal.hidden = false;
}

function closeArchiveEditModal() {
  if (!archiveEditModal) {
    return;
  }
  archiveEditModal.hidden = true;
  currentEditingArchiveId = "";
  setArchiveEditError("");
}

async function submitArchiveEditModal() {
  if (!isAdminSession) {
    setArchiveEditError("Admin girisi kapali. Tekrar giris yap.");
    return;
  }
  const item = archiveState.loadedItems.find((entry) => entry.id === currentEditingArchiveId);
  if (!item) {
    setArchiveEditError("Duzenlenen kayit bulunamadi.");
    return;
  }

  let payload;
  try {
    payload = buildArchiveEditPayload(item);
  } catch (error) {
    setArchiveEditError(error?.message || "Form verisi gecersiz.");
    return;
  }

  if (archiveEditSaveBtn) {
    archiveEditSaveBtn.disabled = true;
  }
  setArchiveEditError("");

  try {
    await window.BTFirebase.updateOverviewArchive(payload);
    clearArchiveSummaryCache();
    closeArchiveEditModal();
    await refreshArchiveView({ forceRemote: true });
  } catch (error) {
    console.warn("Arsiv satiri guncellenemedi.", error);
    setArchiveEditError(error?.message || "Satir guncellenemedi.");
  } finally {
    if (archiveEditSaveBtn) {
      archiveEditSaveBtn.disabled = false;
    }
  }
}

function buildArchiveEditPayload(item) {
  const lootGoldValue = parseRequiredArchiveInt(archiveEditLootGoldValueInput?.value, "Loot Gold Value");
  const expValue = parseRequiredArchiveInt(archiveEditExpValueInput?.value, "EXP Value");
  const savedAt = normalizeRequiredArchiveText(archiveEditSavedAtInput?.value, "Kayit Tarihi");
  const levelText = normalizeRequiredArchiveText(archiveEditLevelTextInput?.value, "Seviye");
  const armyPowerText = normalizeRequiredArchiveText(archiveEditArmyPowerTextInput?.value, "Army Power Text");
  const sourceType = normalizeArchiveSourceType(archiveEditSourceTypeInput?.value);

  return {
    ...item,
    savedAt,
    lootGoldText: normalizeArchiveText(archiveEditLootGoldTextInput?.value, String(lootGoldValue)),
    lootGoldValue,
    expText: normalizeArchiveText(archiveEditExpTextInput?.value, String(expValue)),
    expValue,
    levelText,
    armyPowerText,
    enemyRosterText: normalizeArchiveText(archiveEditEnemyRosterTextInput?.value, "-"),
    allyRosterText: normalizeArchiveText(archiveEditAllyRosterTextInput?.value, "-"),
    fallenUnitsText: normalizeArchiveText(archiveEditFallenUnitsTextInput?.value, "-"),
    reviveStoneText: normalizeArchiveText(archiveEditReviveStoneTextInput?.value, "-"),
    sourceType,
    host: normalizeArchiveText(archiveEditHostInput?.value, ""),
    pageUrl: normalizeArchiveText(archiveEditPageUrlInput?.value, ""),
    pageTitle: normalizeArchiveText(archiveEditPageTitleInput?.value, "")
  };
}

function setArchiveEditError(message) {
  if (!archiveEditErrorBox) {
    return;
  }
  const text = String(message || "").trim();
  archiveEditErrorBox.hidden = !text;
  archiveEditErrorBox.textContent = text;
}

function setInputValue(node, value) {
  if (node) {
    node.value = String(value ?? "");
  }
}

function normalizeArchiveText(value, fallback) {
  const text = String(value ?? "").trim();
  if (text) {
    return text;
  }
  return String(fallback ?? "").trim();
}

function normalizeRequiredArchiveText(value, label) {
  const text = normalizeArchiveText(value, "");
  if (!text) {
    throw new Error(`${label} bos birakilamaz.`);
  }
  return text;
}

function parseRequiredArchiveInt(value, label) {
  const digits = normalizeDigits(value);
  if (!digits) {
    throw new Error(`${label} sayisal olmali.`);
  }
  const numeric = Number.parseInt(digits, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} gecersiz.`);
  }
  return numeric;
}

function normalizeArchiveSourceType(value) {
  return value === "fill" ? "fill" : "manual";
}

function readArchiveFiltersFromUi() {
  return {
    server: normalizeArchiveServerFilter(archiveServerFilterSelect?.value || "s66"),
    armyPowerText: normalizeDigits(archiveLevelFilterInput?.value || ""),
    datePreset: normalizeDatePreset(archiveDatePresetSelect?.value),
    hours: archiveHoursFilterInput?.value ? parseInt(archiveHoursFilterInput.value, 10) : null
  };
}

function resetArchiveFilters() {
  archiveState.filters = {
    server: "s66",
    armyPowerText: "",
    datePreset: "all",
    hours: null
  };
  if (archiveServerFilterSelect) {
    archiveServerFilterSelect.value = "s66";
  }
  archiveState.pageSize = DEFAULT_PAGE_SIZE;
  if (archiveLevelFilterInput) {
    archiveLevelFilterInput.value = "";
  }
  if (archiveHoursFilterInput) {
    archiveHoursFilterInput.value = "";
  }
  if (archiveDatePresetSelect) {
    archiveDatePresetSelect.value = "all";
  }
  if (archivePageSizeSelect) {
    archivePageSizeSelect.value = String(DEFAULT_PAGE_SIZE);
  }
}

function buildArchiveFilterSummaryText(filteredAggregate) {
  const parts = [];
  if (archiveState.filters.server && archiveState.filters.server !== "all") {
    parts.push(archiveState.filters.server);
  }
  if (archiveState.filters.armyPowerText) {
    parts.push(`${archiveState.filters.armyPowerText}. kat`);
  }
  if (archiveState.filters.hours) {
    parts.push(`son ${archiveState.filters.hours} saat`);
  } else if (archiveState.filters.datePreset === "today") {
    parts.push("bugun");
  } else if (archiveState.filters.datePreset === "7d") {
    parts.push("son 7 gun");
  } else if (archiveState.filters.datePreset === "30d") {
    parts.push("son 30 gun");
  }

  if (!parts.length) {
    return "En yeni kayitlar listeleniyor. Acilislar cache-first calisir, gerekirse canli veri cekilir.";
  }
  const exactSuffix = filteredAggregate?.exact ? "tam toplam" : "cache tahmini";
  return `${parts.join(" / ")} filtresi aktif. ${formatNumber(filteredAggregate?.count || 0)} kayit bulundu, ${exactSuffix}.`;
}

function buildArchiveRegressionScopeLabel(count) {
  const parts = [];
  if (archiveState.filters.server && archiveState.filters.server !== "all") {
    parts.push(archiveState.filters.server);
  }
  if (archiveState.filters.armyPowerText) {
    parts.push(`${archiveState.filters.armyPowerText}. kat`);
  }
  if (archiveState.filters.hours) {
    parts.push(`son ${archiveState.filters.hours} saat`);
  } else if (archiveState.filters.datePreset === "today") {
    parts.push("bugun");
  } else if (archiveState.filters.datePreset === "7d") {
    parts.push("son 7 gun");
  } else if (archiveState.filters.datePreset === "30d") {
    parts.push("son 30 gun");
  }
  return parts.length
    ? `${count} arsiv kaydi secildi (${parts.join(" / ")})`
    : `${count} arsiv kaydi secildi`;
}

function hasAnyActiveArchiveFilter() {
  return Boolean(
    archiveState.filters.armyPowerText ||
    (archiveState.filters.server && archiveState.filters.server !== "all") ||
    archiveState.filters.hours ||
    archiveState.filters.datePreset !== "all"
  );
}

function buildEmptyAggregate() {
  return {
    count: 0,
    totalLoot: 0,
    totalExp: 0,
    exact: true,
    readSource: "cache"
  };
}

function buildEmptyLevelBounds() {
  return {
    oldest: null,
    newest: null,
    exact: true,
    readSource: "cache"
  };
}

async function loadArchiveSnapshotItemsForRegression() {
  const payload = await loadArchiveSnapshotPayload({ partMode: "all" });
  return filterArchiveSnapshotItems(payload.items);
}

async function loadArchiveSnapshotPayload(options = {}) {
  try {
    return await loadArchiveSnapshotPayloadFromManifest(options);
  } catch (error) {
    console.warn("Arsiv manifest okunamadi, legacy snapshot deneniyor.", error);
    return await loadArchiveSnapshotPayloadFromLegacy();
  }
}

async function loadArchiveSnapshotPayloadFromManifest(options = {}) {
  const manifest = await fetchArchiveSnapshotJson(ARCHIVE_SNAPSHOT_MANIFEST_PATH);
  const allParts = selectArchiveSnapshotParts(manifest, { mode: "all" });
  const parts = options.partMode === "all"
    ? allParts
    : selectArchiveSnapshotParts(manifest, { mode: "latest" });
  const partPayloads = await Promise.all(parts.map((part) => fetchArchiveSnapshotJson(part.path)));
  const items = partPayloads.flatMap((payload) => Array.isArray(payload?.items) ? payload.items : []);
  const summary = getArchiveSnapshotManifestSummary(manifest);
  return {
    version: Number(manifest?.version || 2),
    generatedAt: String(manifest?.generatedAt || ""),
    reason: String(manifest?.reason || ""),
    source: String(manifest?.source || "overviewArchives"),
    count: Number(summary?.count || items.length),
    summary,
    availableParts: allParts,
    loadedPartPaths: parts.map((part) => part.path),
    items: items
      .map(normalizeArchiveSnapshotItem)
      .filter((item) => item.id)
      .sort((left, right) => String(right?.savedAt || "").localeCompare(String(left?.savedAt || "")))
  };
}

async function loadArchiveSnapshotPayloadFromLegacy() {
  const payload = await fetchArchiveSnapshotJson(ARCHIVE_SNAPSHOT_LEGACY_PATH);
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("Snapshot formati gecersiz.");
  }

  return {
    ...payload,
    items: payload.items.map(normalizeArchiveSnapshotItem).filter((item) => item.id)
  };
}

function selectArchiveSnapshotParts(manifest, options = {}) {
  const servers = manifest?.servers && typeof manifest.servers === "object" ? manifest.servers : {};
  const selectedServer = normalizeArchiveServerFilter(archiveState.filters?.server || "all");
  const serverNames = selectedServer === "all" ? Object.keys(servers) : [selectedServer];
  return serverNames.flatMap((server) => {
    const parts = Array.isArray(servers?.[server]?.parts) ? servers[server].parts : [];
    const selectedParts = options.mode === "all" ? parts : [parts[parts.length - 1]];
    return selectedParts
      .filter((part) => part?.path)
      .map((part) => ({ ...part, server }));
  }).sort((left, right) => {
    const serverCompare = String(left.server || "").localeCompare(String(right.server || ""));
    if (serverCompare !== 0) return serverCompare;
    return Number(right.part || 0) - Number(left.part || 0);
  });
}

function getArchiveSnapshotManifestSummary(manifest) {
  const servers = manifest?.servers && typeof manifest.servers === "object" ? manifest.servers : {};
  const selectedServer = normalizeArchiveServerFilter(archiveState.filters?.server || "all");
  if (selectedServer !== "all") {
    return servers?.[selectedServer]?.summary || null;
  }
  return manifest?.summary || null;
}

async function fetchArchiveSnapshotJson(path) {
  const encodedPath = encodeURIComponent(path);
  const url = `${ARCHIVE_SNAPSHOT_BASE_URL}${encodedPath}?alt=media&token=${encodeURIComponent(ARCHIVE_SNAPSHOT_TOKEN)}&_=${Date.now()}`;
  const response = await fetch(url, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Snapshot okunamadi: ${path} HTTP ${response.status}`);
  }

  return await response.json();
}

function normalizeArchiveSnapshotItem(item = {}) {
  return {
    ...item,
    id: String(item?.id || ""),
    lootGoldValue: normalizeMetricNumber(item?.lootGoldValue),
    expValue: normalizeMetricNumber(item?.expValue)
  };
}

function applyArchiveSnapshotState(payload) {
  const filteredItems = filterArchiveSnapshotItems(payload.items);
  archiveState.loadedItems = filteredItems;
  archiveState.snapshotParts = Array.isArray(payload.availableParts) ? payload.availableParts : [];
  archiveState.snapshotLoadedPartPaths = new Set(Array.isArray(payload.loadedPartPaths) ? payload.loadedPartPaths : []);
  archiveState.remoteCursor = null;
  archiveState.remoteHasMore = hasMoreArchiveSnapshotParts();
  archiveState.readSource = "json";
  archiveState.aggregates.filtered = buildArchiveSnapshotAggregateFromSummary(payload.summary, archiveState.filters)
    || buildArchiveSnapshotAggregate(filteredItems, "json");
  archiveState.aggregates.today = buildArchiveSnapshotAggregateFromSummary(payload.summary, { datePreset: "today" })
    || buildArchiveSnapshotAggregate(filterArchiveSnapshotItems(payload.items, { datePreset: "today" }), "json");
  archiveState.aggregates.firstTen = buildArchiveSnapshotAggregateFromSummary(payload.summary, { armyPowerTextIn: getFirstXLevels(archiveState.firstX) })
    || buildArchiveSnapshotAggregate(filterArchiveSnapshotItems(payload.items, { armyPowerTextIn: getFirstXLevels(archiveState.firstX) }), "json");
  archiveState.levelBounds = buildArchiveSnapshotLevelBoundsFromSummary(payload.summary, archiveState.filters)
    || buildArchiveSnapshotLevelBounds(filteredItems);
}

function normalizeArchiveLevelBoundItem(item) {
  if (!item) {
    return null;
  }
  return {
    ...item,
    levelText: item.levelText || (Number(item.level) > 0 ? String(item.level) : "")
  };
}

function hasMoreArchiveSnapshotParts() {
  return archiveState.snapshotParts.some((part) => part?.path && !archiveState.snapshotLoadedPartPaths.has(part.path));
}

async function loadPreviousArchiveSnapshotPart() {
  const nextPart = archiveState.snapshotParts.find((part) => {
    if (!part?.path || archiveState.snapshotLoadedPartPaths.has(part.path)) {
      return false;
    }
    if (canSkipArchiveSnapshotPart(part)) {
      archiveState.snapshotLoadedPartPaths.add(part.path);
      return false;
    }
    return true;
  });
  if (!nextPart) {
    archiveState.remoteHasMore = hasMoreArchiveSnapshotParts();
    return false;
  }

  const payload = await fetchArchiveSnapshotJson(nextPart.path);
  archiveState.snapshotLoadedPartPaths.add(nextPart.path);
  const items = Array.isArray(payload?.items)
    ? filterArchiveSnapshotItems(payload.items.map(normalizeArchiveSnapshotItem).filter((item) => item.id))
    : [];
  mergeArchiveItems(items);
  archiveState.remoteHasMore = hasMoreArchiveSnapshotParts();
  return items.length > 0 || archiveState.remoteHasMore;
}

function canSkipArchiveSnapshotPart(part) {
  const summary = part?.summary || null;
  if (!summary) {
    return false;
  }
  const selected = selectArchiveSnapshotSummary(summary, archiveState.filters || {});
  return selected && normalizeMetricNumber(selected.count) === 0;
}

function buildArchiveSnapshotAggregateFromSummary(summary, filters = {}) {
  const selected = selectArchiveSnapshotSummary(summary, filters);
  if (!selected) {
    return null;
  }
  return {
    count: normalizeMetricNumber(selected.count),
    totalLoot: normalizeMetricNumber(selected.totalLoot),
    totalExp: normalizeMetricNumber(selected.totalExp),
    exact: true,
    readSource: "json"
  };
}

function buildArchiveSnapshotLevelBoundsFromSummary(summary, filters = {}) {
  const selected = selectArchiveSnapshotSummary(summary, filters);
  if (!selected) {
    return null;
  }
  return {
    oldest: normalizeArchiveLevelBoundItem(selected.oldest),
    newest: normalizeArchiveLevelBoundItem(selected.newest),
    exact: true,
    readSource: "json"
  };
}

function selectArchiveSnapshotSummary(summary, filters = {}) {
  if (!summary) {
    return null;
  }
  const armyPowerText = normalizeDigits(filters.armyPowerText || "");
  const armyPowerTextIn = Array.isArray(filters.armyPowerTextIn)
    ? filters.armyPowerTextIn.map(normalizeDigits).filter(Boolean)
    : [];
  const hasTimeFilter = Boolean(filters.hours || (filters.datePreset && filters.datePreset !== "all"));
  if (armyPowerText && !hasTimeFilter) {
    return summary.byKat?.[armyPowerText] || createArchiveEmptySummary();
  }
  if (armyPowerTextIn.length > 0 && !hasTimeFilter) {
    return armyPowerTextIn.reduce(
      (combined, key) => mergeArchiveSummaries(combined, summary.byKat?.[key]),
      createArchiveEmptySummary()
    );
  }
  if (!armyPowerText && armyPowerTextIn.length === 0 && filters.hours) {
    return selectArchiveHourSummary(summary, filters.hours);
  }
  if (!armyPowerText && armyPowerTextIn.length === 0 && filters.datePreset && filters.datePreset !== "all") {
    return selectArchiveDaySummary(summary, filters.datePreset);
  }
  if (!armyPowerText && armyPowerTextIn.length === 0) {
    return summary;
  }
  return null;
}

function createArchiveEmptySummary() {
  return {
    count: 0,
    totalExp: 0,
    totalLoot: 0,
    oldest: null,
    newest: null,
    byKat: {},
    byDay: {},
    byHour: {}
  };
}

function mergeArchiveSummaries(left = createArchiveEmptySummary(), right = null) {
  if (!right) {
    return left;
  }
  const result = {
    ...createArchiveEmptySummary(),
    count: normalizeMetricNumber(left.count) + normalizeMetricNumber(right.count),
    totalExp: normalizeMetricNumber(left.totalExp) + normalizeMetricNumber(right.totalExp),
    totalLoot: normalizeMetricNumber(left.totalLoot) + normalizeMetricNumber(right.totalLoot),
    oldest: left.oldest || null,
    newest: left.newest || null
  };
  [right.oldest, right.newest].filter(Boolean).forEach((item) => {
    if (!result.oldest || String(item.savedAt || "") < String(result.oldest.savedAt || "")) {
      result.oldest = item;
    }
    if (!result.newest || String(item.savedAt || "") > String(result.newest.savedAt || "")) {
      result.newest = item;
    }
  });
  return result;
}

function selectArchiveDaySummary(summary, datePreset) {
  const range = buildArchiveSnapshotDateRange({ datePreset });
  if (!range) {
    return summary;
  }
  return Object.entries(summary.byDay || {}).reduce((combined, [day, value]) => {
    const dayIso = `${day}T00:00:00.000Z`;
    return dayIso >= range.startIso && dayIso < range.endIso
      ? mergeArchiveSummaries(combined, value)
      : combined;
  }, createArchiveEmptySummary());
}

function selectArchiveHourSummary(summary, hours) {
  const range = buildArchiveSnapshotDateRange({ hours });
  if (!range) {
    return summary;
  }
  return Object.entries(summary.byHour || {}).reduce((combined, [hour, value]) => {
    const hourIso = `${hour}:00:00.000Z`;
    return hourIso >= range.startIso && hourIso < range.endIso
      ? mergeArchiveSummaries(combined, value)
      : combined;
  }, createArchiveEmptySummary());
}

function buildArchiveSnapshotAggregate(items, readSource) {
  return {
    count: Array.isArray(items) ? items.length : 0,
    totalLoot: (items || []).reduce((sum, item) => sum + normalizeMetricNumber(item?.lootGoldValue), 0),
    totalExp: (items || []).reduce((sum, item) => sum + normalizeMetricNumber(item?.expValue), 0),
    exact: true,
    readSource
  };
}

function buildArchiveSnapshotLevelBounds(items) {
  const sortedItems = [...(items || [])]
    .filter((item) => getArchiveSnapshotLevelNumber(item) > 0)
    .sort((left, right) => String(left?.savedAt || "").localeCompare(String(right?.savedAt || "")));
  return {
    oldest: sortedItems[0] || null,
    newest: sortedItems[sortedItems.length - 1] || null,
    exact: true,
    readSource: "json"
  };
}

function getArchiveSnapshotLevelNumber(item) {
  const match = String(item?.levelText || "").match(/\d+/);
  if (!match) {
    return 0;
  }
  const numeric = Number.parseInt(match[0], 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function filterArchiveSnapshotItems(items, overrideFilters = null) {
  const filters = overrideFilters || archiveState.filters || {};
  const server = normalizeArchiveServerFilter(filters.server || "all");
  const dateRange = buildArchiveSnapshotDateRange(filters);
  const armyPowerText = normalizeDigits(filters.armyPowerText || "");
  const armyPowerTextIn = Array.isArray(filters.armyPowerTextIn)
    ? filters.armyPowerTextIn.map(normalizeDigits).filter(Boolean)
    : [];
  const sourceType = normalizeArchiveSourceTypeFilter(filters.sourceType || "");

  return (items || []).filter((item) => {
    const savedAt = String(item?.savedAt || "");
    const itemArmyPowerText = extractArchiveSnapshotKatValue(item?.armyPowerText || "");
    if (server !== "all" && extractArchiveSnapshotServerValue(item?.host || "") !== server) {
      return false;
    }
    if (armyPowerText && itemArmyPowerText !== armyPowerText) {
      return false;
    }
    if (armyPowerTextIn.length > 0 && !armyPowerTextIn.includes(itemArmyPowerText)) {
      return false;
    }
    if (sourceType && normalizeArchiveSourceTypeFilter(item?.sourceType || "") !== sourceType) {
      return false;
    }
    if (dateRange && !(savedAt >= dateRange.startIso && savedAt < dateRange.endIso)) {
      return false;
    }
    return true;
  });
}

function buildArchiveSnapshotDateRange(filters) {
  const hours = filters?.hours ? Number.parseInt(filters.hours, 10) : null;
  if (Number.isFinite(hours) && hours > 0) {
    const now = new Date();
    return {
      startIso: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
      endIso: now.toISOString()
    };
  }

  const preset = normalizeDatePreset(filters?.datePreset || "all");
  if (preset === "all") {
    return null;
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(dayStart);
  end.setDate(end.getDate() + 1);

  const start = new Date(dayStart);
  if (preset === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 29);
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function extractArchiveSnapshotKatValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") {
    return "";
  }
  const slashMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    const total = Number.parseInt(slashMatch[2], 10);
    return Number.isFinite(total) ? normalizeDigits(Math.max(0, Math.floor((total - 10) / 10))) : "";
  }
  return normalizeDigits(text);
}

function normalizeArchiveSourceTypeFilter(value) {
  return value === "manual" || value === "fill" ? value : "";
}

function normalizeArchiveServerFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^s\d+$/.test(normalized) ? normalized : "all";
}

function extractArchiveSnapshotServerValue(host) {
  const match = String(host || "").trim().toLowerCase().match(/^s(\d+)(?:-|\.|$)/);
  return match ? `s${match[1]}` : "";
}

async function ensureArchiveItemsLoadedUntil(targetCount) {
  while (targetCount > archiveState.loadedItems.length && archiveState.remoteHasMore) {
    if (archiveState.readSource === "json") {
      const loaded = await loadPreviousArchiveSnapshotPart();
      if (!loaded && !archiveState.remoteHasMore) {
        break;
      }
    } else {
      await loadArchivePage();
    }
  }
  return archiveState.loadedItems.length > 0;
}

async function ensureAllArchiveItemsLoaded() {
  let safety = 0;
  while (archiveState.remoteHasMore && safety < 500) {
    const previousCount = archiveState.loadedItems.length;
    const previousCursorId = archiveState.remoteCursor?.id || "";
    if (archiveState.readSource === "json") {
      await loadPreviousArchiveSnapshotPart();
    } else {
      await loadArchivePage();
    }
    safety += 1;
    if (
      archiveState.readSource !== "json" &&
      archiveState.loadedItems.length === previousCount &&
      (archiveState.remoteCursor?.id || "") === previousCursorId
    ) {
      break;
    }
  }
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
  return value === "today" || value === "7d" || value === "30d" || value === "1h" || value === "6h" || value === "12h" || value === "24h" || value === "48h" ? value : "all";
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
  if (value === "json") {
    return "JSON";
  }
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
