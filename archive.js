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
const archiveBulkRegressionBtn = document.querySelector("#archiveBulkRegressionBtn");
const archiveFilteredCountValue = document.querySelector("#archiveFilteredCountValue");
const archiveFilteredCountHint = document.querySelector("#archiveFilteredCountHint");
const archiveFilteredExpValue = document.querySelector("#archiveFilteredExpValue");
const archiveFilteredLootValue = document.querySelector("#archiveFilteredLootValue");
const archiveTodayExpValue = document.querySelector("#archiveTodayExpValue");
const archiveTodayLootValue = document.querySelector("#archiveTodayLootValue");
const archiveFirstTenExpValue = document.querySelector("#archiveFirstTenExpValue");
const archiveFirstTenLootValue = document.querySelector("#archiveFirstTenLootValue");
const archiveFirstXInput = document.querySelector("#archiveFirstXInput");
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
const archiveEditGoldTextInput = document.querySelector("#archiveEditGoldTextInput");
const archiveEditGoldValueInput = document.querySelector("#archiveEditGoldValueInput");
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
const ARCHIVE_SUMMARY_CACHE_KEY = "btAnalyssArchiveSummaryCacheV3";
const ARCHIVE_SUMMARY_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function getFirstXLevels(x) {
  const count = Math.max(1, Math.min(100, Number(x) || 10));
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

let archiveLevelInputDebounce = 0;
let archiveRequestToken = 0;
let isAdminSession = false;
let currentEditingArchiveId = "";

const archiveState = {
  filters: {
    armyPowerText: "",
    datePreset: "all",
    sourceType: ""
  },
  firstX: 10,
  pageSize: DEFAULT_PAGE_SIZE,
  currentPage: 0,
  expandedIds: new Set(),
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

bindArchiveControls();
bindArchiveEditModal();
void bindAdminAuth();
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

  archiveBulkRegressionBtn?.addEventListener("click", async () => {
    if (!window.BulkBattleRegression || typeof window.BulkBattleRegression.openReportPage !== "function") {
      window.alert("Toplu test araci henuz hazir degil.");
      return;
    }

    archiveBulkRegressionBtn.disabled = true;
    try {
      await ensureAllArchiveItemsLoaded();
    } finally {
      archiveBulkRegressionBtn.disabled = false;
    }

    if (!archiveState.loadedItems.length) {
      window.alert("Toplu test icin filtrede kayit yok.");
      return;
    }

    window.BulkBattleRegression.openReportPage({
      kind: "archive",
      title: "Arsiv Toplu Test",
      scopeLabel: buildArchiveRegressionScopeLabel(archiveState.loadedItems.length),
      selectedCount: archiveState.loadedItems.length,
      totalCount: archiveState.loadedItems.length,
      backHref: "archive.html",
      backLabel: "Arsiv",
      items: typeof window.BulkBattleRegression.prepareArchiveItems === "function"
        ? window.BulkBattleRegression.prepareArchiveItems(archiveState.loadedItems)
        : archiveState.loadedItems
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
  await refreshArchiveAggregates({ requestToken });
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
    preferCache: false,
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
  return page;
}

async function refreshArchiveAggregates(options = {}) {
  const firstXLevels = getFirstXLevels(archiveState.firstX);
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
      cacheKey: buildAggregateCacheKey(`firstX_${archiveState.firstX}`, { armyPowerTextIn: firstXLevels }),
      forceRemote: Boolean(options.forceRemote),
      filters: { armyPowerTextIn: firstXLevels }
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

  archivePagination.hidden = totalCount <= archiveState.pageSize && !archiveState.remoteHasMore;
  archivePageInfo.textContent = `${start + 1}-${start + pageItems.length} / ${formatNumber(totalCount)}`;
  archivePrevPageBtn.disabled = archiveState.currentPage === 0;
  archiveNextPageBtn.disabled = start + archiveState.pageSize >= archiveState.loadedItems.length && !archiveState.remoteHasMore;
  archivePageNumbers.innerHTML = renderArchivePageNumberButtons(totalCount);
}

function renderArchiveRow(item) {
  const isExpanded = archiveState.expandedIds.has(item?.id);
  return `
    <tr class="archive-row-main">
      <td>${escapeHtml(formatDateTime(item?.savedAt))}</td>
      <td>${renderArchiveGoldCell(item)}</td>
      <td>${escapeHtml(formatNumber(item?.lootGoldValue, item?.lootGoldText || "-"))}</td>
      <td>${escapeHtml(formatNumber(item?.expValue, item?.expText || "-"))}</td>
      <td>${escapeHtml(item?.levelText || "-")}</td>
      <td>${escapeHtml(formatArmyPowerDisplay(item?.armyPowerText || "-"))}</td>
      <td class="archive-detail-cell">${renderArchiveDetailButton(item, isExpanded)}</td>
      <td class="archive-action-cell">${renderArchiveActionGroup(item)}</td>
    </tr>
    ${isExpanded ? renderArchiveDetailRow(item) : ""}
  `;
}

function renderArchiveCard(item) {
  return `
    <article class="archive-card">
      <div class="archive-card-head">
        <div>
          <p class="archive-card-date">${escapeHtml(formatDateTime(item?.savedAt))}</p>
          <div class="archive-card-title-row">
            <strong>${escapeHtml(formatNumber(item?.goldValue, item?.goldText || "-"))} gold</strong>
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

function renderArchiveGoldCell(item) {
  const manualIcon = item?.sourceType === "manual"
    ? '<span class="archive-source-icon" title="Manuel kayit" aria-label="Manuel kayit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v6c0 5-3.4 9.2-7 10-3.6-.8-7-5-7-10V6l7-3z"></path><path d="M9.5 12.5l1.7 1.7 3.8-4.2"></path></svg></span>'
    : "";
  return `<span class="archive-gold-cell">${manualIcon}<span>${escapeHtml(formatNumber(item?.goldValue, item?.goldText || "-"))}</span></span>`;
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
      <span class="archive-detail-inline ${entry.className}">${escapeHtml(entry.text)}</span>
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
      text: formatArchiveDetailEntryText(normalizeArchiveDetailText(entry.value), entry.className)
    }))
    .filter((entry) => entry.text);
}

function formatArchiveDetailEntryText(text, className) {
  return text || "";
}

function hasArchiveDetails(item) {
  return getArchiveDetailEntries(item).length > 0;
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
  setInputValue(archiveEditGoldTextInput, item.goldText || "");
  setInputValue(archiveEditGoldValueInput, item.goldValue ?? "");
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
  const goldValue = parseRequiredArchiveInt(archiveEditGoldValueInput?.value, "Gold Value");
  const lootGoldValue = parseRequiredArchiveInt(archiveEditLootGoldValueInput?.value, "Loot Gold Value");
  const expValue = parseRequiredArchiveInt(archiveEditExpValueInput?.value, "EXP Value");
  const savedAt = normalizeRequiredArchiveText(archiveEditSavedAtInput?.value, "Kayit Tarihi");
  const levelText = normalizeRequiredArchiveText(archiveEditLevelTextInput?.value, "Seviye");
  const armyPowerText = normalizeRequiredArchiveText(archiveEditArmyPowerTextInput?.value, "Army Power Text");
  const sourceType = normalizeArchiveSourceType(archiveEditSourceTypeInput?.value);

  return {
    ...item,
    savedAt,
    goldText: normalizeArchiveText(archiveEditGoldTextInput?.value, String(goldValue)),
    goldValue,
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

function buildArchiveRegressionScopeLabel(count) {
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
  if (archiveState.filters.sourceType) {
    parts.push(archiveState.filters.sourceType);
  }
  return parts.length
    ? `${count} arsiv kaydi secildi (${parts.join(" / ")})`
    : `${count} arsiv kaydi secildi`;
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

async function ensureAllArchiveItemsLoaded() {
  let safety = 0;
  while (archiveState.remoteHasMore && safety < 500) {
    const previousCount = archiveState.loadedItems.length;
    const previousCursorId = archiveState.remoteCursor?.id || "";
    await loadArchivePage();
    safety += 1;
    if (archiveState.loadedItems.length === previousCount && (archiveState.remoteCursor?.id || "") === previousCursorId) {
      break;
    }
  }
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
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
    if (totalPages <= 4) {
      return Array.from({ length: totalPages }, (_, index) => index);
    }

    const pages = new Set([0, currentPage, totalPages - 1]);
    if (currentPage > 1 && currentPage < totalPages - 2) {
      pages.add(currentPage + 1);
    } else if (currentPage <= 1) {
      pages.add(1);
    } else {
      pages.add(totalPages - 2);
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
