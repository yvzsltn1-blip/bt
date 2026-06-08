"use strict";

const archiveList = document.querySelector("#archiveList");
const archiveCountLabel = document.querySelector("#archiveCountLabel");
const archiveDataModeLabel = document.querySelector("#archiveDataModeLabel");
const archivePagination = document.querySelector("#archivePagination");
const archivePrevPageBtn = document.querySelector("#archivePrevPageBtn");
const archiveNextPageBtn = document.querySelector("#archiveNextPageBtn");
const archiveLastPageBtn = document.querySelector("#archiveLastPageBtn");
const archivePageNumbers = document.querySelector("#archivePageNumbers");
const archivePageInfo = document.querySelector("#archivePageInfo");
const archiveFilterSummary = document.querySelector("#archiveFilterSummary");
const archiveLevelFilterInput = document.querySelector("#archiveLevelFilterInput");
const archiveHoursFilterInput = document.querySelector("#archiveHoursFilterInput");
const archiveDatePresetSelect = document.querySelector("#archiveDatePresetSelect");
const archiveHostFilterSelect = document.querySelector("#archiveHostFilterSelect");
const archivePageSizeSelect = document.querySelector("#archivePageSizeSelect");
const archiveTestStatusFilterSelect = document.querySelector("#archiveTestStatusFilterSelect");
const archiveResetFiltersBtn = document.querySelector("#archiveResetFiltersBtn");
const archiveRefreshBtn = document.querySelector("#archiveRefreshBtn");
const archiveBulkRegressionBtn = document.querySelector("#archiveBulkRegressionBtn");
const archiveBulkRegressionModeSelect = document.querySelector("#archiveBulkRegressionModeSelect");
const archiveBulkRegressionLimitInput = document.querySelector("#archiveBulkRegressionLimitInput");
const archiveFilteredCountValue = document.querySelector("#archiveFilteredCountValue");
const archiveFilteredCountHint = document.querySelector("#archiveFilteredCountHint");
const archiveTestedCountValue = document.querySelector("#archiveTestedCountValue");
const archiveTestedCountHint = document.querySelector("#archiveTestedCountHint");
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
const archiveDeleteSelectedBtn = document.querySelector("#archiveDeleteSelectedBtn");
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
// Sunucu filtresi: bos = tum sunucular. Varsayilan s66.
const ARCHIVE_DEFAULT_HOST = "s66-tr.bitefight.gameforge.com";
const ARCHIVE_HOST_OPTIONS = new Set(["", "s66-tr.bitefight.gameforge.com", "s62-tr.bitefight.gameforge.com"]);
function normalizeArchiveHost(value) {
  return ARCHIVE_HOST_OPTIONS.has(value) ? value : ARCHIVE_DEFAULT_HOST;
}
const ARCHIVE_TEST_STATUS_OPTIONS = new Set(["all", "tested", "untested"]);
function normalizeTestStatusFilter(value) {
  return ARCHIVE_TEST_STATUS_OPTIONS.has(value) ? value : "all";
}
const ARCHIVE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const ARCHIVE_SUMMARY_CACHE_KEY = "btAnalyssArchiveSummaryCacheV5";
const ARCHIVE_SUMMARY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
// Sunucu aggregate'i calismazsa tam-tarama fallback'inde okunacak azami kayit (maliyet korumasi).
const ARCHIVE_FALLBACK_MAX_DOCS = 300;
// Degisim-token'i: koleksiyon degismediyse tum sayfayi cache'ten gosterip 1 okumaya iniyoruz.
const ARCHIVE_CHANGE_TOKEN_KEY = "btAnalyssArchiveChangeTokenV1";

function readArchiveChangeToken() {
  try {
    const raw = localStorage.getItem(ARCHIVE_CHANGE_TOKEN_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeArchiveChangeToken(token) {
  try {
    if (token && typeof token === "object") {
      localStorage.setItem(ARCHIVE_CHANGE_TOKEN_KEY, JSON.stringify(token));
    }
  } catch {
    // sessizce gec
  }
}

function archiveChangeTokensEqual(a, b) {
  if (!a || !b) {
    return false;
  }
  return Boolean(a.empty) === Boolean(b.empty)
    && String(a.newestUpdatedAt || "") === String(b.newestUpdatedAt || "");
}

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
    armyPowerText: "",
    datePreset: "all",
    sourceType: "",
    hours: null,
    host: ARCHIVE_DEFAULT_HOST
  },
  firstX: 10,
  // Istemci tarafi gorunum filtresi: "all" | "tested" | "untested". Sunucu sorgusunu
  // degistirmez, yalnizca yuklu kayitlari test durumuna gore eler.
  testStatusFilter: "all",
  pageSize: DEFAULT_PAGE_SIZE,
  visibleLimit: DEFAULT_PAGE_SIZE,
  selectedIds: new Set(),
  expandedIds: new Set(),
  loadedItems: [],
  remoteCursor: null,
  remoteHasMore: false,
  tailMode: false,
  tailItems: [],
  readSource: "idle",
  aggregates: {
    filtered: buildEmptyAggregate(),
    today: buildEmptyAggregate(),
    firstTen: buildEmptyAggregate()
  },
  levelBounds: buildEmptyLevelBounds()
};

let archiveTestResultsCache = [];

bindArchiveControls();
bindArchiveEditModal();
void bindAdminAuth();
void refreshArchiveView();
void refreshArchiveTestedStats();

archivePrevPageBtn?.addEventListener("click", () => {
  archiveState.tailMode = false;
  archiveState.tailItems = [];
  archiveState.visibleLimit = archiveState.pageSize;
  renderArchivePage();
});

archiveNextPageBtn?.addEventListener("click", async () => {
  if (archiveState.tailMode) {
    archiveState.tailMode = false;
    archiveState.tailItems = [];
  }
  const targetLimit = archiveState.visibleLimit + archiveState.pageSize;
  const testFilterActive = (archiveState.testStatusFilter || "all") !== "all";
  if (testFilterActive) {
    // Suzulmus kayitlardan bir sonraki sayfayi dolduracak kadar daha yukle.
    const ready = await ensureArchiveFilteredItemsLoadedUntil(targetLimit);
    if (!ready) {
      return;
    }
    archiveState.visibleLimit = Math.min(targetLimit, applyArchiveTestStatusFilter(archiveState.loadedItems).length);
  } else {
    const ready = await ensureArchiveItemsLoadedUntil(targetLimit);
    if (!ready) {
      return;
    }
    archiveState.visibleLimit = Math.min(targetLimit, archiveState.loadedItems.length);
  }
  renderArchivePage();
});

archiveLastPageBtn?.addEventListener("click", async () => {
  await loadArchiveTailPage();
});

archiveDeleteSelectedBtn?.addEventListener("click", () => {
  void handleDeleteSelectedArchives();
});

async function loadArchiveTailPage() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchivesPage !== "function") {
    return;
  }
  const requestToken = ++archiveRequestToken;
  archiveLastPageBtn.disabled = true;
  renderArchiveLoadingState();
  try {
    // En eski kayitlari ters yonde (asc) cek; aradaki veriyi okumadan sadece son sayfa.
    const page = await window.BTFirebase.loadOverviewArchivesPage({
      pageSize: archiveState.pageSize,
      cursor: null,
      preferCache: false,
      cacheMaxAgeMs: 0,
      sortDirection: "asc",
      filters: {
        armyPowerText: archiveState.filters.armyPowerText,
        datePreset: archiveState.filters.datePreset,
        hours: archiveState.filters.hours,
        host: archiveState.filters.host
      }
    });
    if (requestToken !== archiveRequestToken) {
      return;
    }
    // asc geldigi icin ters cevirip yine en yeni-ustte duzeninde gosteriyoruz.
    archiveState.tailItems = (page?.items || []).slice().reverse();
    archiveState.tailMode = true;
    archiveState.readSource = page?.readSource || archiveState.readSource;
    renderArchiveHeader();
    renderArchivePage();
  } finally {
    archiveLastPageBtn.disabled = false;
  }
}

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

  archiveHostFilterSelect?.addEventListener("change", () => {
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

  archiveTestStatusFilterSelect?.addEventListener("change", async () => {
    archiveState.testStatusFilter = normalizeTestStatusFilter(archiveTestStatusFilterSelect.value);
    // Filtrelenmis gorunum ilk sayfadan baslasin.
    archiveState.visibleLimit = archiveState.pageSize;
    if (archiveState.testStatusFilter !== "all") {
      // Test sonuc cache'ini her filtre uygulamasinda tazele ki baska pencerede
      // az once test edilen kayitlar aninda "test edildi" sayilsin (bayat cache'e
      // takilip "test edilmedi" gorunmesin). Sadece test koleksiyonu okunur, arsiv degil.
      await refreshArchiveTestedStats();
      // "Son 40" (tail) modundan cik.
      archiveState.tailMode = false;
      archiveState.tailItems = [];
      // Maliyet korumasi: tum arsivi tarama; sadece ilk sayfayi dolduracak kadar
      // suzulmus kayit yukle (sayfa basina ~pageSize okuma).
      archiveList.innerHTML = '<p class="summary-empty">Test durumuna gore suzuluyor...</p>';
      await ensureArchiveFilteredItemsLoadedUntil(archiveState.pageSize);
    }
    renderArchivePage();
  });

  archiveResetFiltersBtn?.addEventListener("click", () => {
    resetArchiveFilters();
    void refreshArchiveView();
  });

  archiveRefreshBtn?.addEventListener("click", () => {
    void refreshArchiveView({ forceRemote: true });
    void refreshArchiveTestedStats();
  });

  archiveBulkRegressionBtn?.addEventListener("click", async () => {
    if (!window.BulkBattleRegression || typeof window.BulkBattleRegression.openReportPage !== "function") {
      window.alert("Toplu test araci henuz hazir degil.");
      return;
    }

    const rawMode = archiveBulkRegressionModeSelect?.value;
    const mode = ["selected", "all", "untested"].includes(rawMode) ? rawMode : "first_n";
    const limit = Math.max(1, Math.min(500, Number.parseInt(archiveBulkRegressionLimitInput?.value || String(archiveState.pageSize), 10) || archiveState.pageSize));
    let regressionItems = [];
    let testedSignatures = new Set();

    archiveBulkRegressionBtn.disabled = true;
    try {
      if (mode === "selected") {
        // Secili kayitlar hem normal listeden hem de "Son 40" (tail) sayfasindan gelebilir.
        const selectionPool = new Map();
        [...archiveState.loadedItems, ...archiveState.tailItems].forEach((item) => {
          if (item?.id) {
            selectionPool.set(item.id, item);
          }
        });
        regressionItems = [...selectionPool.values()].filter((item) => archiveState.selectedIds.has(item?.id));
      } else if (mode === "all" || mode === "untested") {
        // Tum host kayitlarini yukle (artimli test icin gerekli).
        await ensureAllArchiveItemsLoaded();
        regressionItems = archiveState.loadedItems.slice();
        if (mode === "untested" && window.BTFirebase && typeof window.BTFirebase.loadArchiveRegressionTests === "function") {
          try {
            await window.BTFirebase.loadArchiveRegressionTests();
            testedSignatures = window.BTFirebase.getArchiveRegressionTestedSignatures();
          } catch (error) {
            console.warn("Test edilmis kayitlar okunamadi.", error);
          }
        }
      } else {
        await ensureArchiveItemsLoadedUntil(limit);
        regressionItems = archiveState.loadedItems.slice(0, limit);
      }
    } finally {
      archiveBulkRegressionBtn.disabled = false;
    }

    if (!regressionItems.length) {
      window.alert(mode === "selected" ? "Toplu test icin once kayit sec." : "Toplu test icin filtrede kayit yok.");
      return;
    }

    // Hazirla, ayni savaslari (matchSignature) teklestir ve untested modunda zaten test
    // edilmis benzersiz savaslari listeden cikar.
    const rawPrepared = typeof window.BulkBattleRegression.prepareArchiveItems === "function"
      ? window.BulkBattleRegression.prepareArchiveItems(regressionItems)
      : regressionItems;
    const seenSignatures = new Set();
    const preparedItems = rawPrepared.filter((item) => {
      const signature = item?.matchSignature || "";
      if (signature && seenSignatures.has(signature)) {
        return false;
      }
      if (signature) {
        seenSignatures.add(signature);
      }
      if (mode === "untested" && signature && testedSignatures.has(signature)) {
        return false;
      }
      return true;
    });

    if (!preparedItems.length) {
      window.alert(mode === "untested"
        ? "Test edilmeyen yeni kayit bulunamadi. Tum benzersiz savaslar zaten test edilmis."
        : "Toplu test icin uygun kayit yok.");
      return;
    }

    window.BulkBattleRegression.openReportPage({
      kind: "archive",
      title: "Arsiv Toplu Test",
      scopeLabel: buildArchiveRegressionScopeLabelForMode(mode, preparedItems.length, regressionItems.length),
      selectedCount: preparedItems.length,
      totalCount: preparedItems.length,
      persistResults: true,
      backHref: "archive.html",
      backLabel: "Arsiv",
      items: preparedItems
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
  archiveState.visibleLimit = archiveState.pageSize;
  archiveState.remoteCursor = null;
  archiveState.remoteHasMore = false;
  archiveState.tailMode = false;
  archiveState.tailItems = [];
  archiveState.loadedItems = [];
  archiveState.levelBounds = buildEmptyLevelBounds();
  archiveState.selectedIds.clear();
  renderArchiveSelectionSummary();
  renderArchiveLoadingState();

  // Degisim-token kontrolu: koleksiyon son senkrondan beri degismediyse her seyi
  // cache'ten goster (toplam 1 okuma). forceRemote ("Yenile") her zaman canli okur.
  let liveToken = null;
  let cacheOnly = false;
  let shouldBypassFreshCache = false;
  if (typeof window.BTFirebase?.loadOverviewArchiveChangeToken === "function") {
    liveToken = await window.BTFirebase.loadOverviewArchiveChangeToken();
    if (requestToken !== archiveRequestToken) {
      return;
    }
    if (!options.forceRemote && liveToken) {
      const cachedToken = readArchiveChangeToken();
      if (archiveChangeTokensEqual(liveToken, cachedToken)) {
        cacheOnly = true;
      } else {
        shouldBypassFreshCache = true;
      }
    }
  }

  const [pageResult] = await Promise.all([
    loadArchivePage({
      reset: true,
      forceRemote: Boolean(options.forceRemote || shouldBypassFreshCache),
      cacheOnly,
      requestToken
    }),
    refreshArchiveAggregates({
      forceRemote: Boolean(options.forceRemote || shouldBypassFreshCache),
      cacheOnly,
      requestToken
    })
  ]);

  if (requestToken !== archiveRequestToken) {
    return;
  }

  // Canli okuma yaptiysak (cache-only degilsek) yeni token'i sakla.
  if (!cacheOnly && liveToken) {
    writeArchiveChangeToken(liveToken);
  }

  archiveState.readSource = pageResult?.readSource || archiveState.readSource;
  renderArchiveHeader();

  // Test durumu filtresi aktifse: tum arsivi tarama; sadece ilk sayfayi dolduracak
  // kadar suzulmus kayit yukle (maliyet korumasi).
  if ((archiveState.testStatusFilter || "all") !== "all") {
    archiveState.visibleLimit = archiveState.pageSize;
    await ensureArchiveFilteredItemsLoadedUntil(archiveState.pageSize);
    if (requestToken !== archiveRequestToken) {
      return;
    }
  }

  renderArchivePage();
}

async function loadArchivePage(options = {}) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchivesPage !== "function") {
    return null;
  }

  if (options.reset) {
    archiveState.remoteCursor = null;
    archiveState.remoteHasMore = false;
    archiveState.visibleLimit = archiveState.pageSize;
    archiveState.loadedItems = [];
  }

  const page = await window.BTFirebase.loadOverviewArchivesPage({
    pageSize: archiveState.pageSize,
    cursor: options.reset ? null : archiveState.remoteCursor,
    // cacheOnly: token degismedi -> TTL'yi yok say, cache'ten ver. Aksi halde:
    // ilk sayfa acilisi cache-first; "Yenile" (forceRemote) ve sayfalama (cursor) canli kalir.
    preferCache: options.cacheOnly ? true : (Boolean(options.reset) && !options.forceRemote),
    cacheMaxAgeMs: options.cacheOnly
      ? Number.MAX_SAFE_INTEGER
      : (options.forceRemote ? 0 : ARCHIVE_CACHE_MAX_AGE_MS),
    filters: {
      armyPowerText: archiveState.filters.armyPowerText,
      datePreset: archiveState.filters.datePreset,
      hours: archiveState.filters.hours,
      host: archiveState.filters.host
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
  const ignoreTtl = Boolean(options.cacheOnly);
  const [filtered, today, firstTen, levelBounds] = await Promise.all([
    loadArchiveAggregateWithCache({
      cacheKey: buildAggregateCacheKey("filtered", archiveState.filters),
      forceRemote: Boolean(options.forceRemote),
      ignoreTtl,
      filters: archiveState.filters
    }),
    loadArchiveAggregateWithCache({
      cacheKey: buildAggregateCacheKey("today", { datePreset: "today", host: archiveState.filters.host }),
      forceRemote: Boolean(options.forceRemote),
      ignoreTtl,
      filters: { datePreset: "today", host: archiveState.filters.host }
    }),
    loadArchiveAggregateWithCache({
      cacheKey: buildAggregateCacheKey(`firstX_${archiveState.firstX}`, { armyPowerTextIn: firstXLevels, host: archiveState.filters.host }),
      forceRemote: Boolean(options.forceRemote),
      ignoreTtl,
      filters: { armyPowerTextIn: firstXLevels, host: archiveState.filters.host }
    }),
    loadArchiveLevelBoundsWithCache({
      cacheKey: buildAggregateCacheKey("levelBounds", archiveState.filters),
      forceRemote: Boolean(options.forceRemote),
      ignoreTtl,
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

async function computeArchiveAggregateFromFullPages(rawFilters) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchivesPage !== "function") {
    return buildEmptyAggregate();
  }
  const filters = rawFilters || {};
  let allItems = [];
  let cursor = null;
  let hasMore = true;
  const pageSize = 100;
  let safety = 0;
  // Maliyet korumasi: sunucu aggregate'i calismadiginda tum koleksiyonu okumak
  // yerine en fazla ARCHIVE_FALLBACK_MAX_DOCS kayit oku, sonrasini "yaklasik" isaretle.
  const maxPages = Math.ceil(ARCHIVE_FALLBACK_MAX_DOCS / pageSize);
  while (hasMore && safety < maxPages) {
    const page = await window.BTFirebase.loadOverviewArchivesPage({
      pageSize,
      cursor,
      preferCache: false,
      cacheMaxAgeMs: 0,
      filters
    });
    const items = Array.isArray(page?.items) ? page.items : [];
    allItems = allItems.concat(items);
    cursor = page?.cursor || null;
    hasMore = Boolean(page?.hasMore);
    safety += 1;
    if (!cursor) break;
  }
  // Tavana takildiysak (hala devami var) sayilar tam degil; "exact:false" don.
  const capped = hasMore && Boolean(cursor);
  const count = allItems.length;
  const totalExp = allItems.reduce((s, it) => s + normalizeMetricNumber(it?.expValue), 0);
  const totalLoot = allItems.reduce((s, it) => s + normalizeMetricNumber(it?.lootGoldValue), 0);
  return {
    count,
    totalLoot,
    totalExp,
    exact: !capped,
    readSource: capped ? "server-capped" : "server-full"
  };
}

async function loadArchiveAggregateWithCache(options) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchiveAggregate !== "function") {
    return buildEmptyAggregate();
  }

  const summaryCache = readArchiveSummaryCache();
  const cachedEntry = summaryCache[options.cacheKey];
  const cacheUsable = options.ignoreTtl
    ? Boolean(cachedEntry?.data)
    : (!options.forceRemote && isSummaryCacheFresh(cachedEntry));
  if (cacheUsable) {
    return {
      ...buildEmptyAggregate(),
      ...cachedEntry.data,
      readSource: "cache"
    };
  }

  const aggregate = await window.BTFirebase.loadOverviewArchiveAggregate({
    filters: options.filters || {}
  });

  let finalAgg = aggregate;
  const isWeak = !aggregate || aggregate.exact === false || (aggregate.readSource || "").includes("cache");
  if (isWeak) {
    finalAgg = await computeArchiveAggregateFromFullPages(options.filters || {});
  }

  summaryCache[options.cacheKey] = {
    savedAt: new Date().toISOString(),
    data: {
      count: normalizeMetricNumber(finalAgg?.count),
      totalLoot: normalizeMetricNumber(finalAgg?.totalLoot),
      totalExp: normalizeMetricNumber(finalAgg?.totalExp),
      exact: finalAgg?.exact !== false
    }
  };
  writeArchiveSummaryCache(summaryCache);

  return {
    count: normalizeMetricNumber(finalAgg?.count),
    totalLoot: normalizeMetricNumber(finalAgg?.totalLoot),
    totalExp: normalizeMetricNumber(finalAgg?.totalExp),
    exact: finalAgg?.exact !== false,
    readSource: finalAgg?.readSource || "server"
  };
}

async function loadArchiveLevelBoundsWithCache(options) {
  if (!window.BTFirebase || typeof window.BTFirebase.loadOverviewArchiveLevelBounds !== "function") {
    return buildEmptyLevelBounds();
  }

  const summaryCache = readArchiveSummaryCache();
  const cachedEntry = summaryCache[options.cacheKey];
  const cacheUsable = options.ignoreTtl
    ? Boolean(cachedEntry?.data)
    : (!options.forceRemote && isSummaryCacheFresh(cachedEntry));
  if (cacheUsable) {
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
  const totalCount = getArchiveDisplayedTotalCount(filteredAggregate);
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

  setText(archiveFilteredCountValue, formatNumber(getArchiveDisplayedTotalCount(filteredAggregate)));
  setText(archiveFilteredCountHint, filteredAggregate.exact ? "Tum filtreler icin toplam" : "Cache uzerinden yaklasik");
  updateArchiveTestedCard();
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

function getArchiveTestedSignatureSet() {
  const set = new Set();
  (archiveTestResultsCache || []).forEach((item) => {
    const signature = typeof item?.matchSignature === "string" ? item.matchSignature : "";
    if (signature) {
      set.add(signature);
    }
  });
  return set;
}

// Arsiv kayitlarinda matchSignature saklanmaz; test sonuclariyla eslestirmek icin
// toplu testin kullandigi ayni imzayi (buildArchiveBattleSignature) rosterlardan uretiriz.
function getArchiveItemSignature(item) {
  if (item?.matchSignature) {
    return item.matchSignature;
  }
  const BBR = window.BulkBattleRegression;
  if (!BBR || typeof BBR.buildArchiveBattleSignature !== "function") {
    return "";
  }
  try {
    const enemyCounts = BBR.parseArchiveEnemyCounts(item?.enemyRosterText || "");
    const allyCounts = BBR.parseArchiveAllyCounts(item?.allyRosterText || "");
    return BBR.buildArchiveBattleSignature(enemyCounts, allyCounts);
  } catch {
    return "";
  }
}

// "Test yapilanlar" / "Test yapilmayanlar" gorunum filtresini yuklu kayitlara uygular.
function applyArchiveTestStatusFilter(items) {
  const mode = archiveState.testStatusFilter || "all";
  if (mode === "all") {
    return items;
  }
  const testedSignatures = getArchiveTestedSignatureSet();
  return items.filter((item) => {
    const signature = getArchiveItemSignature(item);
    const isTested = Boolean(signature) && testedSignatures.has(signature);
    return mode === "tested" ? isTested : !isTested;
  });
}

function renderArchivePage() {
  if (!archiveList || !archivePagination || !archivePageInfo || !archivePrevPageBtn || !archiveNextPageBtn || !archivePageNumbers) {
    return;
  }

  const testMode = archiveState.testStatusFilter || "all";
  const testFilterActive = testMode !== "all";

  const hasAnyItems = archiveState.tailMode
    ? archiveState.tailItems.length > 0
    : archiveState.loadedItems.length > 0;
  if (!hasAnyItems) {
    archiveList.innerHTML = '<p class="summary-empty">Bu filtrelerde kayit bulunamadi.</p>';
    archivePagination.hidden = true;
    renderArchiveSelectionSummary();
    return;
  }

  // Test filtresi aktifken TUM yuklu kayitlar arasindan filtrele, sonra sayfa limitine kes.
  // (Filtre degisiminde tum arsiv yuklendigi icin bu, arsivin tamamini kapsar.)
  const filteredSource = archiveState.tailMode
    ? applyArchiveTestStatusFilter(archiveState.tailItems)
    : (testFilterActive ? applyArchiveTestStatusFilter(archiveState.loadedItems) : archiveState.loadedItems);

  const pageItems = archiveState.tailMode
    ? filteredSource
    : filteredSource.slice(0, archiveState.visibleLimit);

  if (!pageItems.length) {
    archiveList.innerHTML = `<p class="summary-empty">${testFilterActive
      ? (testMode === "tested" ? "Test yapilan kayit bulunamadi." : "Test yapilmayan kayit bulunamadi.")
      : "Bu filtrelerde kayit bulunamadi."}</p>`;
    archivePagination.hidden = true;
    renderArchiveSelectionSummary();
    return;
  }
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

  const totalCount = testFilterActive
    ? filteredSource.length
    : getArchiveDisplayedTotalCount(archiveState.aggregates.filtered || buildEmptyAggregate());

  const hasMoreVisible = !archiveState.tailMode
    && (testFilterActive
      ? (pageItems.length < filteredSource.length || archiveState.remoteHasMore)
      : (pageItems.length < archiveState.loadedItems.length || archiveState.remoteHasMore));
  // Birden fazla sayfa var mi? (Son 40 butonu icin) - test filtresinde gizli.
  const hasMultiplePages = !testFilterActive
    && (archiveState.remoteHasMore
      || archiveState.loadedItems.length > archiveState.pageSize
      || totalCount > archiveState.pageSize);

  // Test filtresi aktifken arsivin tamami okunmaz; bu yuzden toplam kesin degil.
  // Sunucuda daha fazla sayfa varsa "+" ile yaklasik oldugunu belirt.
  const totalCountText = (testFilterActive && archiveState.remoteHasMore)
    ? `${formatNumber(totalCount)}+`
    : formatNumber(totalCount);
  archivePagination.hidden = !archiveState.tailMode && !hasMoreVisible && pageItems.length <= archiveState.pageSize;
  archivePageInfo.textContent = archiveState.tailMode
    ? `Son ${formatNumber(pageItems.length)} (en eski) / ${formatNumber(totalCount)}`
    : `${formatNumber(pageItems.length)} / ${totalCountText} gosteriliyor`;

  const showFirstBtn = archiveState.tailMode || pageItems.length > archiveState.pageSize;
  archivePrevPageBtn.hidden = !showFirstBtn;
  archivePrevPageBtn.disabled = !showFirstBtn;
  archivePrevPageBtn.textContent = `Ilk ${archiveState.pageSize}`;

  archiveNextPageBtn.hidden = archiveState.tailMode;
  archiveNextPageBtn.disabled = !hasMoreVisible;
  archiveNextPageBtn.textContent = "Devamini Gor";

  if (archiveLastPageBtn) {
    archiveLastPageBtn.hidden = !hasMultiplePages;
    archiveLastPageBtn.disabled = archiveState.tailMode;
    archiveLastPageBtn.textContent = `Son ${archiveState.pageSize}`;
  }
  archivePageNumbers.innerHTML = "";
  syncArchiveSelectAllVisibleControl();
  renderArchiveSelectionSummary();
}

function getVisibleArchiveItems() {
  const testMode = archiveState.testStatusFilter || "all";
  if (archiveState.tailMode) {
    return applyArchiveTestStatusFilter(archiveState.tailItems);
  }
  if (testMode === "all") {
    return archiveState.loadedItems.slice(0, archiveState.visibleLimit);
  }
  // Test filtresi: tum yuklu kayitlari filtrele, sonra gorunur sayfaya kes.
  return applyArchiveTestStatusFilter(archiveState.loadedItems).slice(0, archiveState.visibleLimit);
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

function getSelectedArchiveItems() {
  const pool = new Map();
  [...archiveState.loadedItems, ...archiveState.tailItems].forEach((item) => {
    if (item?.id && archiveState.selectedIds.has(item.id)) {
      pool.set(item.id, item);
    }
  });
  return [...pool.values()];
}

function renderArchiveSelectionSummary() {
  if (!archiveSelectionSummary || !archiveSelectionCount || !archiveSelectionTotals) {
    return;
  }
  const selectedItems = getSelectedArchiveItems();
  const totalExp = selectedItems.reduce((sum, item) => sum + normalizeMetricNumber(item?.expValue), 0);
  const totalLoot = selectedItems.reduce((sum, item) => sum + normalizeMetricNumber(item?.lootGoldValue), 0);
  archiveSelectionSummary.hidden = selectedItems.length === 0;
  archiveSelectionCount.textContent = `${formatNumber(selectedItems.length)} kayit secildi`;
  archiveSelectionTotals.textContent = `${formatNumber(totalExp)} EXP / ${formatNumber(totalLoot)} ganimet`;
  if (archiveDeleteSelectedBtn) {
    archiveDeleteSelectedBtn.disabled = !isAdminSession || selectedItems.length === 0;
    archiveDeleteSelectedBtn.title = isAdminSession
      ? "Secili kayitlari sil"
      : "Silme icin admin girisi gerekli";
  }
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
  const item = findArchiveItemById(id);
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

function findArchiveItemById(id) {
  return archiveState.loadedItems.find((entry) => entry.id === id)
    || archiveState.tailItems.find((entry) => entry.id === id)
    || null;
}

async function handleDeleteArchive(id) {
  if (!isAdminSession) {
    window.alert("Arsiv silmek icin admin girisi zorunlu.");
    return;
  }
  const item = findArchiveItemById(id);
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

async function handleDeleteSelectedArchives() {
  if (!isAdminSession) {
    window.alert("Arsiv silmek icin admin girisi zorunlu.");
    return;
  }
  if (typeof window.BTFirebase?.deleteOverviewArchives !== "function") {
    window.alert("Toplu silme araci hazir degil.");
    return;
  }
  const ids = getSelectedArchiveItems().map((item) => item?.id).filter(Boolean);
  if (ids.length === 0) {
    window.alert("Once silinecek kayitlari sec.");
    return;
  }
  if (!window.confirm(`${ids.length} kayit silinsin mi? Bu islem geri alinamaz.`)) {
    return;
  }

  if (archiveDeleteSelectedBtn) {
    archiveDeleteSelectedBtn.disabled = true;
  }
  try {
    await window.BTFirebase.deleteOverviewArchives(ids);
    archiveState.selectedIds.clear();
    clearArchiveSummaryCache();
    await refreshArchiveView({ forceRemote: true });
  } catch (error) {
    console.warn("Secili arsiv kayitlari silinemedi.", error);
    window.alert(error?.message || "Secili kayitlar silinemedi.");
    renderArchiveSelectionSummary();
  }
}

async function handleEditArchive(id) {
  if (!isAdminSession) {
    window.alert("Arsiv duzenlemek icin admin girisi zorunlu.");
    return;
  }
  const item = findArchiveItemById(id);
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
    armyPowerText: normalizeDigits(archiveLevelFilterInput?.value || ""),
    datePreset: normalizeDatePreset(archiveDatePresetSelect?.value),
    hours: archiveHoursFilterInput?.value ? parseInt(archiveHoursFilterInput.value, 10) : null,
    host: normalizeArchiveHost(archiveHostFilterSelect?.value)
  };
}

function resetArchiveFilters() {
  archiveState.filters = {
    armyPowerText: "",
    datePreset: "all",
    hours: null,
    host: ARCHIVE_DEFAULT_HOST
  };
  archiveState.pageSize = DEFAULT_PAGE_SIZE;
  archiveState.testStatusFilter = "all";
  if (archiveTestStatusFilterSelect) {
    archiveTestStatusFilterSelect.value = "all";
  }
  if (archiveLevelFilterInput) {
    archiveLevelFilterInput.value = "";
  }
  if (archiveHoursFilterInput) {
    archiveHoursFilterInput.value = "";
  }
  if (archiveDatePresetSelect) {
    archiveDatePresetSelect.value = "all";
  }
  if (archiveHostFilterSelect) {
    archiveHostFilterSelect.value = ARCHIVE_DEFAULT_HOST;
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
  return `${parts.join(" / ")} filtresi aktif. ${formatNumber(getArchiveDisplayedTotalCount(filteredAggregate))} kayit bulundu, ${exactSuffix}.`;
}

function getArchiveDisplayedTotalCount(filteredAggregate) {
  const aggregateCount = Number(filteredAggregate?.count || 0);
  const loadedCount = Number(archiveState.loadedItems.length || 0);
  if (aggregateCount > 0 || hasAnyActiveArchiveFilter()) {
    return Math.max(aggregateCount, loadedCount);
  }
  return loadedCount;
}

function buildArchiveRegressionScopeLabel(count) {
  const parts = [];
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

async function ensureArchiveItemsLoadedUntil(targetCount) {
  while (targetCount > archiveState.loadedItems.length && archiveState.remoteHasMore) {
    await loadArchivePage();
  }
  return archiveState.loadedItems.length > 0;
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

// Test durumu filtresi aktifken tum arsivi taramak yerine, ekranda gosterilecek
// kadar (targetFilteredCount) SUZULMUS kayit bulana dek sayfa sayfa yukler.
// Boylece her sayfa ~pageSize okuma yapar; arsivin tamami okunmaz (maliyet korumasi).
async function ensureArchiveFilteredItemsLoadedUntil(targetFilteredCount) {
  let safety = 0;
  while (
    applyArchiveTestStatusFilter(archiveState.loadedItems).length < targetFilteredCount
    && archiveState.remoteHasMore
    && safety < 500
  ) {
    const previousCount = archiveState.loadedItems.length;
    const previousCursorId = archiveState.remoteCursor?.id || "";
    await loadArchivePage();
    safety += 1;
    if (archiveState.loadedItems.length === previousCount && (archiveState.remoteCursor?.id || "") === previousCursorId) {
      break;
    }
  }
  return archiveState.loadedItems.length > 0;
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

function buildArchiveRegressionFirstNScopeLabel(count) {
  return `Ilk ${count} arsiv kaydi`;
}

function buildArchiveRegressionSelectedScopeLabel(count) {
  return count === 1 ? "Secili 1 arsiv kaydi" : `Secili ${count} arsiv kaydi`;
}

async function refreshArchiveTestedStats() {
  if (!window.BTFirebase || typeof window.BTFirebase.loadArchiveRegressionTests !== "function") {
    return;
  }
  try {
    archiveTestResultsCache = await window.BTFirebase.loadArchiveRegressionTests();
  } catch (error) {
    console.warn("Test sonuclari okunamadi.", error);
  }
  updateArchiveTestedCard();
}

function updateArchiveTestedCard() {
  if (!archiveTestedCountValue) {
    return;
  }
  const host = archiveState.filters?.host || "";
  const relevant = (archiveTestResultsCache || []).filter((item) => !host || String(item?.host || "") === host);
  const pass = relevant.filter((item) => item?.result === "pass").length;
  const fail = relevant.filter((item) => item?.result === "fail").length;
  const skipped = relevant.filter((item) => item?.result === "skipped").length;
  setText(archiveTestedCountValue, formatNumber(relevant.length));
  if (archiveTestedCountHint) {
    archiveTestedCountHint.textContent =
      `${formatNumber(pass)} dogru / ${formatNumber(fail)} yanlis${skipped ? ` / ${formatNumber(skipped)} atlandi` : ""}`;
  }
}

function buildArchiveRegressionScopeLabelForMode(mode, uniqueCount, rawCount) {
  if (mode === "selected") {
    return buildArchiveRegressionSelectedScopeLabel(uniqueCount);
  }
  if (mode === "all") {
    return `Tum arsiv (${uniqueCount} benzersiz savas / ${rawCount} kayit)`;
  }
  if (mode === "untested") {
    return `Test edilmeyen ${uniqueCount} benzersiz savas`;
  }
  return buildArchiveRegressionFirstNScopeLabel(uniqueCount);
}
