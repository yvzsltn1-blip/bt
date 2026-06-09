"use strict";

(function attachFirebaseClient(globalScope) {
  const firebaseConfig = {
    apiKey: "AIzaSyB6_mwliHgUXjCSidzZIBiQj_8hLkYvZV4",
    authDomain: "bt-analiz.firebaseapp.com",
    projectId: "bt-analiz",
    storageBucket: "bt-analiz.firebasestorage.app",
    messagingSenderId: "974000575553",
    appId: "1:974000575553:web:17f915f8832a3b8f55a2c0"
  };
  const ADMIN_EMAIL = "yavuz@gmail.com";

  const CACHE_KEY = "btAnalyssApprovedStrategiesCache";
  const WRONG_CACHE_KEY = "btAnalyssWrongReportsCache";
  const FAVORITE_CACHE_KEY = "btAnalyssFavoriteStrategiesCache";
  const OVERVIEW_ARCHIVE_CACHE_KEY = "btAnalyssOverviewArchivesCache";
  const ARCHIVE_TEST_CACHE_KEY = "btAnalyssArchiveRegressionTestsCache";
  const OVERVIEW_ARCHIVE_CACHE_META_KEY = "btAnalyssOverviewArchivesCacheMeta";
  // Liste cache'ini en yeni N kayitla sinirla; aksi halde 900+ kayit localStorage kotasini doldurup
  // yeni cekilen veriyi atilmaya zorluyordu. Ilk sayfa + cacheOnly icin bu fazlasiyla yeterli.
  const OVERVIEW_ARCHIVE_CACHE_MAX_ITEMS = 400;
  const LEGACY_KEY = "btAnalyssApprovedStrategies";
  const MIGRATION_KEY = "btAnalyssApprovedStrategiesMigrated";
  const COLLECTION = "approvedStrategies";
  const WRONG_COLLECTION = "wrongReports";
  const FAVORITE_COLLECTION = "favoriteStrategies";
  const OVERVIEW_ARCHIVE_COLLECTION = "overviewArchives";
  const ARCHIVE_TEST_COLLECTION = "archiveRegressionTests";
  const DEFAULT_PAGE_SIZE = 10;
  const ENEMY_COUNT_KEYS = [
    "skeletons", "zombies", "cultists", "bonewings", "corpses",
    "wraiths", "revenants", "giants", "broodmothers", "liches"
  ];
  const ALLY_COUNT_KEYS = [
    "bats", "ghouls", "thralls", "banshees",
    "necromancers", "gargoyles", "witches", "rotmaws"
  ];
  const hasFirebaseCompat = !!(
    globalScope.firebase &&
    Array.isArray(globalScope.firebase.apps) &&
    typeof globalScope.firebase.initializeApp === "function" &&
    typeof globalScope.firebase.firestore === "function"
  );
  const hasFirebaseAuth = !!(
    globalScope.firebase &&
    Array.isArray(globalScope.firebase.apps) &&
    typeof globalScope.firebase.auth === "function"
  );
  const textEncoder = typeof TextEncoder === "function" ? new TextEncoder() : null;

  if (hasFirebaseCompat && !globalScope.firebase.apps.length) {
    globalScope.firebase.initializeApp(firebaseConfig);
  }

  const db = hasFirebaseCompat ? globalScope.firebase.firestore() : null;
  const auth = hasFirebaseAuth ? globalScope.firebase.auth() : null;
  const firestoreRestBaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isAdminUser(user) {
    return !!(user && normalizeEmail(user.email) === ADMIN_EMAIL);
  }

  function readStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeStorage(key, items) {
    // Cache yazimi "best-effort"; kota dolarsa (QuotaExceededError) sessizce gec ki
    // sunucudan gelen taze veri asla atilmasin. (Onceki davranis: throw -> veri kaybi.)
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (error) {
      console.warn(`localStorage yazilamadi (${key}), cache atlandi.`, error?.name || error);
    }
  }

  function readObjectStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeObjectStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value && typeof value === "object" ? value : {}));
    } catch (error) {
      console.warn(`localStorage yazilamadi (${key}), cache atlandi.`, error?.name || error);
    }
  }

  function writeCache(items) {
    const normalized = mergeStrategies(items);
    writeStorage(CACHE_KEY, normalized);
    writeStorage(LEGACY_KEY, normalized);
  }

  function readMigrationFlag() {
    return localStorage.getItem(MIGRATION_KEY) === "1";
  }

  function writeMigrationFlag() {
    localStorage.setItem(MIGRATION_KEY, "1");
  }

  function buildApprovedEntryId(item) {
    const source = item?.source === "simulation" ? "simulation" : "optimizer";
    if (source === "simulation") {
      if (!item?.matchSignature || !item?.variantSignature) {
        return "";
      }
      return buildSimulationDocId(item.matchSignature, item.variantSignature);
    }
    if (!item || !Number.isFinite(Number(item.stage)) || !item.enemySignature) {
      return "";
    }
    return buildOptimizerDocId(item.stage, item.enemySignature);
  }

  function mergeStrategies(items) {
    const merged = new Map();
    items.forEach((item) => {
      const id = item.id || buildApprovedEntryId(item);
      if (!id) {
        return;
      }
      const nextItem = { ...item, id };
      const current = merged.get(id);
      if (!current) {
        merged.set(id, nextItem);
        return;
      }
      const currentStamp = current.updatedAt || current.savedAt || "";
      const nextStamp = nextItem.updatedAt || nextItem.savedAt || "";
      merged.set(id, nextStamp >= currentStamp ? nextItem : current);
    });
    return [...merged.values()];
  }

  function readLocalStrategies() {
    return mergeStrategies([
      ...readStorage(CACHE_KEY),
      ...readStorage(LEGACY_KEY)
    ]);
  }

  function readWrongReports() {
    return readStorage(WRONG_CACHE_KEY);
  }

  function writeWrongReports(items) {
    writeStorage(WRONG_CACHE_KEY, items);
  }

  function mergeFavorites(items) {
    const merged = new Map();
    items.forEach((item) => {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      if (!id) {
        return;
      }
      const nextItem = { ...item, id };
      const current = merged.get(id);
      if (!current) {
        merged.set(id, nextItem);
        return;
      }
      const currentStamp = current.updatedAt || current.savedAt || "";
      const nextStamp = nextItem.updatedAt || nextItem.savedAt || "";
      merged.set(id, nextStamp >= currentStamp ? nextItem : current);
    });
    return [...merged.values()];
  }

  function readFavoriteStrategies() {
    return mergeFavorites(readStorage(FAVORITE_CACHE_KEY));
  }

  function writeFavoriteStrategies(items) {
    writeStorage(FAVORITE_CACHE_KEY, mergeFavorites(items));
  }

  function mergeOverviewArchives(items) {
    const merged = new Map();
    items.forEach((item) => {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      if (!id) {
        return;
      }
      const { goldText, goldValue, ...archiveItem } = item;
      const nextItem = { ...archiveItem, id };
      const current = merged.get(id);
      if (!current) {
        merged.set(id, nextItem);
        return;
      }
      const currentStamp = current.savedAt || "";
      const nextStamp = nextItem.savedAt || "";
      merged.set(id, nextStamp >= currentStamp ? nextItem : current);
    });
    return [...merged.values()];
  }

  function readOverviewArchives() {
    return mergeOverviewArchives(readStorage(OVERVIEW_ARCHIVE_CACHE_KEY));
  }

  function writeOverviewArchives(items) {
    let merged = mergeOverviewArchives(items);
    if (merged.length > OVERVIEW_ARCHIVE_CACHE_MAX_ITEMS) {
      merged = sortByStringFieldDesc(merged, "savedAt").slice(0, OVERVIEW_ARCHIVE_CACHE_MAX_ITEMS);
    }
    writeStorage(OVERVIEW_ARCHIVE_CACHE_KEY, merged);
    writeOverviewArchiveCacheMeta({
      itemCount: merged.length,
      lastSyncedAt: new Date().toISOString()
    });
  }

  function readOverviewArchiveCacheMeta() {
    const meta = readObjectStorage(OVERVIEW_ARCHIVE_CACHE_META_KEY);
    return {
      itemCount: Number.isInteger(meta?.itemCount) && meta.itemCount >= 0 ? meta.itemCount : 0,
      lastSyncedAt: typeof meta?.lastSyncedAt === "string" ? meta.lastSyncedAt : ""
    };
  }

  function writeOverviewArchiveCacheMeta(value) {
    const itemCount = Number.isInteger(value?.itemCount) && value.itemCount >= 0
      ? value.itemCount
      : readOverviewArchives().length;
    writeObjectStorage(OVERVIEW_ARCHIVE_CACHE_META_KEY, {
      itemCount,
      lastSyncedAt: trimText(value?.lastSyncedAt || new Date().toISOString(), 40)
    });
  }

  function getOverviewArchiveCacheInfo() {
    const meta = readOverviewArchiveCacheMeta();
    return {
      itemCount: meta.itemCount,
      lastSyncedAt: meta.lastSyncedAt
    };
  }

  function normalizePageSize(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(parsed, 100);
  }

  function normalizeSortDirection(value) {
    return value === "asc" ? "asc" : "desc";
  }

  function sortByStringField(items, field, direction = "desc") {
    const normalizedDirection = normalizeSortDirection(direction);
    return [...items].sort((left, right) => {
      const leftValue = String(left?.[field] || "");
      const rightValue = String(right?.[field] || "");
      return normalizedDirection === "asc"
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue);
    });
  }

  function sortByStringFieldDesc(items, field) {
    return sortByStringField(items, field, "desc");
  }

  function isFreshCache(meta, maxAgeMs) {
    const normalizedMaxAgeMs = Number.parseInt(maxAgeMs, 10);
    if (!meta?.lastSyncedAt || !Number.isFinite(normalizedMaxAgeMs) || normalizedMaxAgeMs <= 0) {
      return false;
    }
    const age = Date.now() - Date.parse(meta.lastSyncedAt);
    return Number.isFinite(age) && age >= 0 && age <= normalizedMaxAgeMs;
  }

  function buildLocalPageResult(items, orderField, pageSize, cursor, options = {}) {
    const normalizedPageSize = normalizePageSize(pageSize);
    const sortedItems = sortByStringField(items, orderField, options.sortDirection);
    let startIndex = 0;
    if (cursor?.id) {
      const cursorIndex = sortedItems.findIndex((item) => item.id === cursor.id);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }
    const pageItems = sortedItems.slice(startIndex, startIndex + normalizedPageSize);
    return {
      items: pageItems,
      cursor: pageItems.length ? { id: pageItems[pageItems.length - 1].id } : cursor || null,
      hasMore: startIndex + normalizedPageSize < sortedItems.length
    };
  }

  async function loadLegacyFirstPageFallback({
    collectionName,
    orderField,
    mergeItems,
    readLocal,
    writeLocal,
    pageSize
  }) {
    const snapshot = await db.collection(collectionName).get();
    const remoteItems = mergeItems(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    if (typeof writeLocal === "function" && remoteItems.length > 0) {
      writeLocal(mergeItems([...readLocal(), ...remoteItems]));
    }
    return buildLocalPageResult(
      mergeItems([...remoteItems, ...readLocal()]),
      orderField,
      pageSize,
      null
    );
  }

  async function loadCollectionPage({
    collectionName,
    orderField,
    mergeItems,
    readLocal,
    writeLocal,
    pageSize = DEFAULT_PAGE_SIZE,
    cursor = null,
    sortDirection = "desc",
    filterLocalItems = null,
    buildRemoteQuery = null,
    allowLegacyFirstPageFallback = true,
    preferCache = false,
    cacheMaxAgeMs = 0,
    readMeta = null
  }) {
    const normalizedPageSize = normalizePageSize(pageSize);
    const normalizedSortDirection = normalizeSortDirection(sortDirection);
    const localItems = typeof filterLocalItems === "function" ? filterLocalItems(readLocal()) : readLocal();
    if (!db) {
      return {
        ...buildLocalPageResult(localItems, orderField, normalizedPageSize, cursor, {
          sortDirection: normalizedSortDirection
        }),
        readSource: "cache"
      };
    }

    if (!cursor && preferCache && localItems.length > 0 && isFreshCache(typeof readMeta === "function" ? readMeta() : null, cacheMaxAgeMs)) {
      return {
        ...buildLocalPageResult(localItems, orderField, normalizedPageSize, cursor, {
          sortDirection: normalizedSortDirection
        }),
        readSource: "cache"
      };
    }

    try {
      let query = typeof buildRemoteQuery === "function"
        ? buildRemoteQuery(db.collection(collectionName), {
          cursor,
          sortDirection: normalizedSortDirection
        })
        : db.collection(collectionName).orderBy(orderField, normalizedSortDirection);
      if (cursor?.id) {
        query = query.startAfter(cursor);
      }
      const snapshot = await query.limit(normalizedPageSize + 1).get();
      const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
      const hasMore = docs.length > normalizedPageSize;
      const pageDocs = hasMore ? docs.slice(0, normalizedPageSize) : docs;
      const items = mergeItems(pageDocs.map((doc) => ({ ...doc.data(), id: doc.id })));
      if (!cursor && allowLegacyFirstPageFallback && items.length === 0) {
        return loadLegacyFirstPageFallback({
          collectionName,
          orderField,
          mergeItems,
          readLocal,
          writeLocal,
          pageSize: normalizedPageSize
        });
      }
      if (typeof writeLocal === "function" && items.length > 0) {
        writeLocal(mergeItems([...readLocal(), ...items]));
      }
      return {
        items,
        cursor: pageDocs.length ? pageDocs[pageDocs.length - 1] : cursor || null,
        hasMore,
        readSource: "server"
      };
    } catch (error) {
      console.warn(`${collectionName} sayfali okunamadi, cache kullaniliyor.`, error);
      if (!cursor && allowLegacyFirstPageFallback) {
        try {
          return await loadLegacyFirstPageFallback({
            collectionName,
            orderField,
            mergeItems,
            readLocal,
            writeLocal,
            pageSize: normalizedPageSize
          });
        } catch (fallbackError) {
          console.warn(`${collectionName} legacy ilk sayfa fallback'i de okunamadi.`, fallbackError);
        }
      }
      return {
        ...buildLocalPageResult(localItems, orderField, normalizedPageSize, cursor, {
          sortDirection: normalizedSortDirection
        }),
        readSource: "cache-fallback"
      };
    }
  }

  function normalizeOverviewArchiveNumericFilter(value) {
    const digits = String(value ?? "").replace(/[^\d]/g, "");
    if (!digits) {
      return "";
    }
    return String(Number.parseInt(digits, 10));
  }

  function normalizeOverviewArchiveDatePreset(value) {
    if (value === "today" || value === "7d" || value === "30d") {
      return value;
    }
    return "all";
  }

  function normalizeOverviewArchiveSourceType(value) {
    return value === "manual" || value === "fill" ? value : "";
  }

  function extractOverviewArchiveKatValue(value) {
    const text = String(value || "").trim();
    if (!text || text === "-") {
      return "";
    }
    const slashMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (slashMatch) {
      const total = Number.parseInt(slashMatch[2], 10);
      if (!Number.isFinite(total)) {
        return "";
      }
      return normalizeOverviewArchiveNumericFilter(Math.max(0, Math.floor((total - 10) / 10)));
    }
    return normalizeOverviewArchiveNumericFilter(text);
  }

  function buildOverviewArchiveKatStorageValue(value) {
    const kat = Number.parseInt(normalizeOverviewArchiveNumericFilter(value), 10);
    if (!Number.isFinite(kat) || kat <= 0) {
      return "";
    }
    return `0/${(kat * 10) + 10}`;
  }

  function buildOverviewArchiveKatStorageVariants(value) {
    const direct = normalizeOverviewArchiveNumericFilter(value);
    const slash = buildOverviewArchiveKatStorageValue(value);
    const legacySlash = direct ? `${direct}/${(Number.parseInt(direct, 10) * 10) + 10}` : "";
    return [...new Set([direct, slash, legacySlash].filter(Boolean))];
  }

  function normalizeOverviewArchiveNumericFilterList(values) {
    if (!Array.isArray(values)) {
      return [];
    }
    const uniqueValues = new Set();
    values.forEach((value) => {
      const normalized = normalizeOverviewArchiveNumericFilter(value);
      if (normalized) {
        uniqueValues.add(normalized);
      }
    });
    return [...uniqueValues].slice(0, 100);
  }

  function buildOverviewArchiveDateRange(datePreset) {
    const normalizedPreset = normalizeOverviewArchiveDatePreset(datePreset);
    if (normalizedPreset === "all") {
      return null;
    }

    const now = new Date();

    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(dayStart);
    end.setDate(end.getDate() + 1);

    const start = new Date(dayStart);
    if (normalizedPreset === "7d") {
      start.setDate(start.getDate() - 6);
    } else if (normalizedPreset === "30d") {
      start.setDate(start.getDate() - 29);
    }

    return {
      startIso: start.toISOString(),
      endIso: end.toISOString()
    };
  }

  function normalizeOverviewArchiveDateRange(value) {
    const startIso = String(value?.startIso || "");
    const endIso = String(value?.endIso || "");
    if (!startIso || !endIso) {
      return null;
    }
    if (!Number.isFinite(Date.parse(startIso)) || !Number.isFinite(Date.parse(endIso))) {
      return null;
    }
    return { startIso, endIso };
  }

  function normalizeOverviewArchiveFilters(options = {}) {
    const armyPowerText = normalizeOverviewArchiveNumericFilter(options.armyPowerText);
    let dateRange = normalizeOverviewArchiveDateRange(options.dateRange)
      || buildOverviewArchiveDateRange(options.datePreset);
    
    const hours = options.hours ? Number.parseInt(options.hours, 10) : null;
    if (Number.isFinite(hours) && hours > 0) {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
      dateRange = {
        startIso: start.toISOString(),
        endIso: now.toISOString()
      };
    }

    return {
      datePreset: normalizeOverviewArchiveDatePreset(options.datePreset),
      dateRange,
      armyPowerText,
      armyPowerTextIn: armyPowerText ? [] : normalizeOverviewArchiveNumericFilterList(options.armyPowerTextIn),
      sourceType: normalizeOverviewArchiveSourceType(options.sourceType),
      host: typeof options.host === "string" ? options.host.trim() : ""
    };
  }

  function isOverviewArchiveFilterEmpty(filters) {
    return !filters.armyPowerText && !filters.armyPowerTextIn.length && !filters.sourceType && !filters.dateRange && !filters.host;
  }

  function filterOverviewArchiveItems(items, rawFilters = {}) {
    const filters = normalizeOverviewArchiveFilters(rawFilters);
    return (items || []).filter((item) => {
      const savedAt = String(item?.savedAt || "");
      const armyPowerText = extractOverviewArchiveKatValue(item?.armyPowerText || "");
      const sourceType = normalizeOverviewArchiveSourceType(item?.sourceType);
      if (filters.host && String(item?.host || "") !== filters.host) {
        return false;
      }
      if (filters.armyPowerText && armyPowerText !== filters.armyPowerText) {
        return false;
      }
      if (filters.armyPowerTextIn.length > 0 && !filters.armyPowerTextIn.includes(armyPowerText)) {
        return false;
      }
      if (filters.sourceType && sourceType !== filters.sourceType) {
        return false;
      }
      if (filters.dateRange && !(savedAt >= filters.dateRange.startIso && savedAt < filters.dateRange.endIso)) {
        return false;
      }
      return true;
    });
  }

  function applyOverviewArchiveFiltersToQuery(collectionRef, rawFilters = {}, options = {}) {
    const filters = normalizeOverviewArchiveFilters(rawFilters);
    let query = collectionRef;
    if (filters.host) {
      query = query.where("host", "==", filters.host);
    }
    if (filters.armyPowerText) {
      query = query.where("armyPowerText", "in", buildOverviewArchiveKatStorageVariants(filters.armyPowerText));
    } else if (filters.armyPowerTextIn.length > 0) {
      const variants = [];
      filters.armyPowerTextIn.forEach((val) => {
        variants.push(...buildOverviewArchiveKatStorageVariants(val));
      });
      const uniqueVariants = [...new Set(variants)].slice(0, 30);
      query = query.where("armyPowerText", "in", uniqueVariants);
    }
    if (filters.sourceType) {
      query = query.where("sourceType", "==", filters.sourceType);
    }
    if (filters.dateRange) {
      query = query
        .where("savedAt", ">=", filters.dateRange.startIso)
        .where("savedAt", "<", filters.dateRange.endIso);
    }
    if (options.includeOrderBy !== false) {
      query = query.orderBy("savedAt", normalizeSortDirection(options.sortDirection));
    }
    return query;
  }

  function sumOverviewArchiveField(items, fieldName) {
    return (items || []).reduce((total, item) => {
      const value = Number(item?.[fieldName]);
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function buildOverviewArchiveAggregateFromItems(items, options = {}) {
    return {
      count: Array.isArray(items) ? items.length : 0,
      totalLoot: sumOverviewArchiveField(items, "lootGoldValue"),
      totalExp: sumOverviewArchiveField(items, "expValue"),
      exact: Boolean(options.exact),
      readSource: options.readSource || "cache"
    };
  }

  function toAggregateNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  // Filtrelerden Firestore REST structuredQuery "where" objesi kur.
  function buildOverviewArchiveRestWhere(filters) {
    const clauses = [];
    if (filters.host) {
      clauses.push({ fieldFilter: { field: { fieldPath: "host" }, op: "EQUAL", value: { stringValue: filters.host } } });
    }
    if (filters.armyPowerText) {
      const variants = buildOverviewArchiveKatStorageVariants(filters.armyPowerText).slice(0, 30);
      clauses.push({ fieldFilter: { field: { fieldPath: "armyPowerText" }, op: "IN", value: { arrayValue: { values: variants.map((v) => ({ stringValue: v })) } } } });
    } else if (filters.armyPowerTextIn.length > 0) {
      const variants = [];
      filters.armyPowerTextIn.forEach((val) => variants.push(...buildOverviewArchiveKatStorageVariants(val)));
      const unique = [...new Set(variants)].slice(0, 30);
      clauses.push({ fieldFilter: { field: { fieldPath: "armyPowerText" }, op: "IN", value: { arrayValue: { values: unique.map((v) => ({ stringValue: v })) } } } });
    }
    if (filters.sourceType) {
      clauses.push({ fieldFilter: { field: { fieldPath: "sourceType" }, op: "EQUAL", value: { stringValue: filters.sourceType } } });
    }
    if (filters.dateRange) {
      clauses.push({ fieldFilter: { field: { fieldPath: "savedAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: filters.dateRange.startIso } } });
      clauses.push({ fieldFilter: { field: { fieldPath: "savedAt" }, op: "LESS_THAN", value: { stringValue: filters.dateRange.endIso } } });
    }
    if (clauses.length === 0) {
      return null;
    }
    if (clauses.length === 1) {
      return clauses[0];
    }
    return { compositeFilter: { op: "AND", filters: clauses } };
  }

  // count + sum(loot) + sum(exp) icin Firestore REST runAggregationQuery (1 okuma).
  // Compat SDK'nin query.aggregate() destegi guvenilmez oldugu icin REST kullaniyoruz.
  async function loadOverviewArchiveAggregateViaRest(filters) {
    if (typeof globalScope.fetch !== "function") {
      return null;
    }
    const where = buildOverviewArchiveRestWhere(filters);
    const structuredQuery = { from: [{ collectionId: OVERVIEW_ARCHIVE_COLLECTION }] };
    if (where) {
      structuredQuery.where = where;
    }
    const body = {
      structuredAggregationQuery: {
        structuredQuery,
        aggregations: [
          { alias: "countOfDocs", count: {} },
          { alias: "totalLoot", sum: { field: { fieldPath: "lootGoldValue" } } },
          { alias: "totalExp", sum: { field: { fieldPath: "expValue" } } }
        ]
      }
    };
    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}:runAggregationQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Aggregate REST HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const json = await response.json();
    const row = Array.isArray(json) ? json.find((entry) => entry?.result?.aggregateFields) : null;
    if (!row) {
      // Bos/degistirilmis yanit: reklam/gizlilik uzantilari REST :runAggregationQuery
      // istegini cogu zaman 200 + bos govde ile engeller. Bunu "0 kayit kesin toplam"
      // sanmak yerine hata firlat ki cagiran taraf SDK count() fallback'ine dussun.
      throw new Error(`Aggregate REST yaniti beklenmedik bicimde: ${JSON.stringify(json).slice(0, 200)}`);
    }
    const fields = row.result.aggregateFields || {};
    const num = (f) => toAggregateNumber(f?.integerValue ?? f?.doubleValue ?? 0);
    return {
      count: num(fields.countOfDocs),
      totalLoot: num(fields.totalLoot),
      totalExp: num(fields.totalExp),
      exact: true,
      readSource: "server-rest"
    };
  }

  async function loadOverviewArchiveCountViaRest(filters) {
    if (typeof globalScope.fetch !== "function") {
      return null;
    }
    const where = buildOverviewArchiveRestWhere(filters);
    const structuredQuery = { from: [{ collectionId: OVERVIEW_ARCHIVE_COLLECTION }] };
    if (where) {
      structuredQuery.where = where;
    }
    const body = {
      structuredAggregationQuery: {
        structuredQuery,
        aggregations: [{ alias: "countOfDocs", count: {} }]
      }
    };
    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}:runAggregationQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Count REST HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const json = await response.json();
    const row = Array.isArray(json) ? json.find((entry) => entry?.result?.aggregateFields) : null;
    if (!row) {
      // Bkz. loadOverviewArchiveAggregateViaRest: bos/engellenmis yaniti "0" sanma.
      throw new Error(`Count REST yaniti beklenmedik bicimde: ${JSON.stringify(json).slice(0, 200)}`);
    }
    const field = row.result.aggregateFields?.countOfDocs;
    return toAggregateNumber(field?.integerValue ?? field?.doubleValue ?? 0);
  }

  // SDK count() aggregate'i Firestore WebChannel uzerinden gider; REST :runAggregationQuery
  // URL'sini hedefleyen reklam/gizlilik uzantilari bunu engellemez. Bu yuzden REST bloklu
  // oldugunda gercek toplami tek okumayla almamizi saglar.
  async function loadOverviewArchiveCountViaSdk(filters) {
    if (!db) {
      return null;
    }
    let query = applyOverviewArchiveFiltersToQuery(
      db.collection(OVERVIEW_ARCHIVE_COLLECTION),
      filters,
      { includeOrderBy: false }
    );
    if (typeof query.count !== "function") {
      return null;
    }
    const snapshot = await query.count().get();
    const data = typeof snapshot?.data === "function" ? snapshot.data() : null;
    const value = Number(data?.count);
    return Number.isFinite(value) ? value : null;
  }

  async function loadOverviewArchiveAggregate(options = {}) {
    const filters = normalizeOverviewArchiveFilters(options.filters || {});
    const localItems = filterOverviewArchiveItems(readOverviewArchives(), filters);

    // 1) REST aggregate: count + sum(loot) + sum(exp) tek okumada (uzanti engellemiyorsa).
    try {
      const restAgg = await loadOverviewArchiveAggregateViaRest(filters);
      if (restAgg) {
        return restAgg;
      }
    } catch (error) {
      console.warn("Arsiv REST aggregate okunamadi, SDK count'a dusuluyor.", error);
    }

    // 2) REST bloklu/basarisizsa: SDK count() (WebChannel) ile gercek toplam (1 okuma).
    //    Sayi (count) kesindir; toplamlar (loot/exp) yerel cache'ten yaklasik gelir.
    try {
      const sdkCount = await loadOverviewArchiveCountViaSdk(filters);
      if (sdkCount !== null) {
        return {
          count: sdkCount,
          totalLoot: sumOverviewArchiveField(localItems, "lootGoldValue"),
          totalExp: sumOverviewArchiveField(localItems, "expValue"),
          exact: false,
          readSource: "sdk-count"
        };
      }
    } catch (sdkError) {
      console.warn("Arsiv SDK count fallback okunamadi, REST count deneniyor.", sdkError);
    }

    // 3) Son care REST count (genelde REST ile birlikte bloklu olur ama ucuz dene).
    try {
      const count = await loadOverviewArchiveCountViaRest(filters);
      if (count !== null) {
        return {
          count,
          totalLoot: sumOverviewArchiveField(localItems, "lootGoldValue"),
          totalExp: sumOverviewArchiveField(localItems, "expValue"),
          exact: false,
          readSource: "server-rest-count"
        };
      }
    } catch (countError) {
      console.warn("Arsiv REST count fallback okunamadi, cache'e dusuluyor.", countError);
    }

    // 4) Hicbiri olmazsa yerel cache'ten yaklasik (archive.js capli tam-taramayi tetikler).
    return buildOverviewArchiveAggregateFromItems(localItems, {
      exact: false,
      readSource: "cache-fallback"
    });
  }

  function buildOverviewArchiveLevelBoundsFromItems(items, options = {}) {
    const sortedItems = [...(items || [])]
      .filter((item) => getOverviewArchiveLevelNumber(item) > 0)
      .sort((left, right) => String(left?.savedAt || "").localeCompare(String(right?.savedAt || "")));
    return {
      oldest: sortedItems[0] || null,
      newest: sortedItems[sortedItems.length - 1] || null,
      exact: Boolean(options.exact),
      readSource: options.readSource || "cache"
    };
  }

  function getOverviewArchiveLevelNumber(item) {
    if (!item) {
      return 0;
    }
    const directValue = Number(item.levelValue);
    if (Number.isFinite(directValue) && directValue > 0) {
      return directValue;
    }
    const match = String(item.levelText || "").match(/\d+/);
    if (!match) {
      return 0;
    }
    const numeric = Number.parseInt(match[0], 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  async function findOverviewArchiveLevelBound(collection, filters, sortDirection) {
    let cursor = null;
    let safety = 0;
    while (safety < 20) {
      let query = applyOverviewArchiveFiltersToQuery(collection, filters, {
        includeOrderBy: true,
        sortDirection
      });
      if (cursor) {
        query = query.startAfter(cursor);
      }
      // Cogu kayitta seviye dolu oldugu icin once tek kayit dene (1 okuma);
      // sadece bastaki kayit(lar)da seviye yoksa daha genis sayfaya gec.
      const pageLimit = safety === 0 ? 1 : 50;
      const snapshot = await query.limit(pageLimit).get();
      const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
      const foundDoc = docs.find((doc) => getOverviewArchiveLevelNumber(doc?.data?.()) > 0);
      if (foundDoc) {
        return { ...foundDoc.data(), id: foundDoc.id };
      }
      if (docs.length < pageLimit) {
        return null;
      }
      cursor = docs[docs.length - 1];
      safety += 1;
    }
    return null;
  }

  async function loadOverviewArchiveLevelBounds(options = {}) {
    const filters = normalizeOverviewArchiveFilters(options.filters || {});
    const localItems = filterOverviewArchiveItems(readOverviewArchives(), filters);
    if (!db) {
      return buildOverviewArchiveLevelBoundsFromItems(localItems, {
        exact: true,
        readSource: "cache"
      });
    }

    const collection = db.collection(OVERVIEW_ARCHIVE_COLLECTION);
    try {
      const [oldest, newest] = await Promise.all([
        findOverviewArchiveLevelBound(collection, filters, "asc"),
        findOverviewArchiveLevelBound(collection, filters, "desc")
      ]);
      const bounds = {
        oldest,
        newest,
        exact: true,
        readSource: "server"
      };
      const cacheItems = [bounds.oldest, bounds.newest].filter(Boolean);
      if (cacheItems.length > 0) {
        writeOverviewArchives(mergeOverviewArchives([...readOverviewArchives(), ...cacheItems]));
      }
      return bounds;
    } catch (error) {
      console.warn("Arsiv seviye sinirlari okunamadi, cache kullaniliyor.", error);
      return buildOverviewArchiveLevelBoundsFromItems(localItems, {
        exact: false,
        readSource: "cache-fallback"
      });
    }
  }

  function sanitizeApprovedEntry(item) {
    const source = item?.source === "simulation" ? "simulation" : "optimizer";
    const basePayload = {
      source,
      savedAt: trimText(item?.savedAt || new Date().toISOString(), 40),
      updatedAt: trimText(new Date().toISOString(), 40)
    };
    if (item?.promotedFromWrong === true) {
      basePayload.promotedFromWrong = true;
      basePayload.promotedFromWrongAt = trimText(item?.promotedFromWrongAt || new Date().toISOString(), 40);
      const promotedFromWrongId = trimText(item?.promotedFromWrongId || "", 80);
      if (promotedFromWrongId) {
        basePayload.promotedFromWrongId = promotedFromWrongId;
      }
    }

    if (source === "simulation") {
      const payload = {
        ...basePayload,
        sourceLabel: trimText(item?.sourceLabel || "Simulasyon", 30),
        enemyTitle: trimText(item?.enemyTitle || "Versus", 120),
        enemyCounts: sanitizeCountMap(item?.enemyCounts, ENEMY_COUNT_KEYS),
        allyCounts: sanitizeCountMap(item?.allyCounts, ALLY_COUNT_KEYS),
        matchSignature: trimText(item?.matchSignature || "", 200),
        variantSignature: trimText(item?.variantSignature || "", 500),
        variantTitle: trimText(item?.variantTitle || "", 80),
        winner: item?.winner === "enemy" ? "enemy" : "ally",
        probabilityBasisPoints: clampInt(item?.probabilityBasisPoints, 10000),
        summaryText: trimText(item?.summaryText || "", 40000),
        logText: trimText(item?.logText || "", 400000),
        usedCapacity: clampInt(item?.usedCapacity, 999999),
        usedPoints: clampInt(item?.usedPoints, 99999),
        lostBlood: clampInt(item?.lostBlood, 999999)
      };
      const roundingMode = sanitizeRoundingMode(item?.roundingMode);
      if (roundingMode) {
        payload.roundingMode = roundingMode;
      }
      const representativeSeed = sanitizeOptionalInt(item?.representativeSeed, 4294967295);
      if (representativeSeed !== null) {
        payload.representativeSeed = representativeSeed;
      }
      if (Number.isInteger(item?.stage) && item.stage >= 1 && item.stage <= 9999) {
        payload.stage = item.stage;
      }
      return payload;
    }

    const payload = {
      ...basePayload,
      sourceLabel: trimText(item?.sourceLabel || "Optimizer", 30),
      stage: clampInt(item?.stage, 9999),
      mode: item?.mode === "fast" || item?.mode === "deep" ? item.mode : "balanced",
      objective: item?.objective === "min_army" ? "min_army" : "min_loss",
      diversityMode: Boolean(item?.diversityMode),
      stoneMode: Boolean(item?.stoneMode),
      modeLabel: trimText(item?.modeLabel || "", 80),
      enemySignature: trimText(item?.enemySignature || "", 120),
      enemyTitle: trimText(item?.enemyTitle || "Versus", 120),
      enemyCounts: sanitizeCountMap(item?.enemyCounts, ENEMY_COUNT_KEYS),
      allyPool: sanitizeCountMap(item?.allyPool, ALLY_COUNT_KEYS),
      recommendationCounts: sanitizeCountMap(item?.recommendationCounts, ALLY_COUNT_KEYS),
      usedPoints: clampInt(item?.usedPoints, 99999),
      lostBlood: clampInt(item?.lostBlood, 999999),
      winRate: clampInt(item?.winRate, 100)
    };
    const representativeSeed = sanitizeOptionalInt(item?.representativeSeed, 4294967295);
    if (representativeSeed !== null) {
      payload.representativeSeed = representativeSeed;
    }
    return payload;
  }

  function clampInt(value, maxValue) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.min(parsed, maxValue);
  }

  function sanitizeRoundingMode(value) {
    if (value === "legacy" || value === "safe" || value === "exact") {
      return value;
    }
    return "";
  }

  function getUtf8Size(text) {
    const normalized = typeof text === "string" ? text : String(text ?? "");
    if (textEncoder) {
      return textEncoder.encode(normalized).length;
    }
    return unescape(encodeURIComponent(normalized)).length;
  }

  function trimText(value, maxLen) {
    const text = typeof value === "string" ? value : String(value ?? "");
    if (getUtf8Size(text) <= maxLen) {
      return text;
    }
    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (getUtf8Size(text.slice(0, mid)) <= maxLen) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return text.slice(0, low);
  }

  function sanitizeCountMap(source, allowedKeys) {
    const result = {};
    allowedKeys.forEach((key) => {
      if (!source || !(key in source)) {
        return;
      }
      result[key] = clampInt(source[key], 9999);
    });
    return result;
  }

  function sanitizeOptionalInt(value, maxValue) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    return clampInt(value, maxValue);
  }

  function sanitizeWrongReport(item) {
    const source = item?.source === "optimizer" ? "optimizer" : "simulation";
    // Live wrongReports rules currently accept only this minimal subset on create.
    return {
      source,
      sourceLabel: trimText(item?.sourceLabel || (source === "optimizer" ? "Optimizer" : "Simulasyon"), 30),
      reportedAt: trimText(item?.reportedAt || new Date().toISOString(), 40),
      enemyCounts: sanitizeCountMap(item?.enemyCounts, ENEMY_COUNT_KEYS),
      allyCounts: sanitizeCountMap(item?.allyCounts, ALLY_COUNT_KEYS),
      matchSignature: trimText(item?.matchSignature || "", 200),
      summaryText: trimText(item?.summaryText || "", 40000),
      logText: trimText(item?.logText || "", 400000),
      usedCapacity: clampInt(item?.usedCapacity, 999999),
      actualSummaryText: trimText(item?.actualSummaryText || "", 40000),
      actualNote: trimText(item?.actualNote || "", 4000)
    };
  }

  function sanitizeFavoriteStrategy(item) {
    const source = item?.source === "simulation" ? "simulation" : "optimizer";
    const enemyCounts = sanitizeCountMap(item?.enemyCounts, ENEMY_COUNT_KEYS);
    return {
      source,
      sourceLabel: trimText(item?.sourceLabel || (source === "simulation" ? "Simulasyon Fav" : "Optimizer Fav"), 30),
      savedAt: trimText(item?.savedAt || new Date().toISOString(), 40),
      updatedAt: trimText(new Date().toISOString(), 40),
      ...(Number.isFinite(Number(item?.stage)) && Number(item.stage) > 0 ? { stage: clampInt(item.stage, 9999) } : {}),
      mode: item?.mode === "fast" || item?.mode === "deep" ? item.mode : "balanced",
      objective: item?.objective === "min_army" ? "min_army" : "min_loss",
      diversityMode: Boolean(item?.diversityMode),
      stoneMode: Boolean(item?.stoneMode),
      modeLabel: trimText(item?.modeLabel || "Favori", 80),
      enemySignature: trimText(item?.enemySignature || "-", 120),
      enemyRosterSignature: ENEMY_COUNT_KEYS.map((key) => enemyCounts[key] || 0).join("|"),
      enemyTitle: trimText(item?.enemyTitle || "Versus", 120),
      enemyCounts,
      allyPool: sanitizeCountMap(item?.allyPool, ALLY_COUNT_KEYS),
      recommendationCounts: sanitizeCountMap(item?.recommendationCounts, ALLY_COUNT_KEYS),
      usedPoints: clampInt(item?.usedPoints, 99999),
      lostBlood: clampInt(item?.lostBlood, 999999),
      winRate: clampInt(item?.winRate, 100)
    };
  }

  function sanitizeOverviewArchive(item) {
    return {
      savedAt: trimText(item?.savedAt || new Date().toISOString(), 40),
      updatedAt: trimText(new Date().toISOString(), 40),
      lootGoldText: trimText(item?.lootGoldText || "-", 40),
      lootGoldValue: clampInt(item?.lootGoldValue, 9999999999999),
      expText: trimText(item?.expText || "-", 40),
      expValue: clampInt(item?.expValue, 9999999999999),
      armyPowerText: trimText(item?.armyPowerText || "-", 20),
      levelText: trimText(item?.levelText || "-", 20),
      enemyRosterText: trimText(item?.enemyRosterText || "-", 160),
      allyRosterText: trimText(item?.allyRosterText || "-", 160),
      fallenUnitsText: trimText(item?.fallenUnitsText || "-", 240),
      reviveStoneText: trimText(item?.reviveStoneText || "-", 40),
      sourceType: item?.sourceType === "fill" ? "fill" : "manual",
      host: trimText(item?.host || "", 120),
      pageUrl: trimText(item?.pageUrl || "", 400),
      pageTitle: trimText(item?.pageTitle || "", 160)
    };
  }

  function normalizeWinnerValue(value) {
    return value === "ally" || value === "enemy" ? value : "unknown";
  }

  function sanitizeArchiveRegressionTest(item) {
    const result = item?.result === "fail" || item?.result === "skipped" ? item.result : "pass";
    return {
      matchSignature: trimText(item?.matchSignature || "-", 200),
      result,
      host: trimText(item?.host || "", 120),
      stage: sanitizeOptionalInt(item?.stage, 9999),
      testedAt: trimText(item?.testedAt || new Date().toISOString(), 40),
      enemyCounts: sanitizeCountMap(item?.enemyCounts, ENEMY_COUNT_KEYS),
      allyCounts: sanitizeCountMap(item?.allyCounts, ALLY_COUNT_KEYS),
      expectedWinner: normalizeWinnerValue(item?.expectedWinner),
      expectedLostBlood: sanitizeOptionalInt(item?.expectedLostBlood, 999999),
      expectedAllyLosses: sanitizeCountMap(item?.expectedAllyLosses, ALLY_COUNT_KEYS),
      actualWinner: normalizeWinnerValue(item?.actualWinner),
      actualLostBlood: sanitizeOptionalInt(item?.actualLostBlood, 999999),
      actualAllyLosses: sanitizeCountMap(item?.actualAllyLosses, ALLY_COUNT_KEYS),
      differences: trimText(item?.differences || "", 2000),
      note: trimText(item?.note || "", 2000),
      archiveId: trimText(item?.archiveId || "", 120),
      archiveSavedAt: trimText(item?.archiveSavedAt || "", 40),
      enemyRosterText: trimText(item?.enemyRosterText || "", 160),
      allyRosterText: trimText(item?.allyRosterText || "", 160)
    };
  }

  function readArchiveRegressionTests() {
    return readStorage(ARCHIVE_TEST_CACHE_KEY);
  }

  function writeArchiveRegressionTests(items) {
    writeStorage(ARCHIVE_TEST_CACHE_KEY, Array.isArray(items) ? items : []);
  }

  function isIntegerInRange(value, minValue, maxValue) {
    return Number.isInteger(value) && value >= minValue && value <= maxValue;
  }

  function validateShortString(value, maxLen) {
    return typeof value === "string" && getUtf8Size(value) > 0 && getUtf8Size(value) <= maxLen;
  }

  function validateTextString(value, maxLen) {
    return typeof value === "string" && getUtf8Size(value) <= maxLen;
  }

  function validateCountMap(mapValue, allowedKeys, path, errors) {
    if (!mapValue || typeof mapValue !== "object" || Array.isArray(mapValue)) {
      errors.push(`${path} map olmali.`);
      return;
    }
    const keys = Object.keys(mapValue);
    const invalidKeys = keys.filter((key) => !allowedKeys.includes(key));
    if (invalidKeys.length > 0) {
      errors.push(`${path} icinde izin verilmeyen alanlar var: ${invalidKeys.join(", ")}`);
    }
    keys.forEach((key) => {
      if (!isIntegerInRange(mapValue[key], 0, 9999)) {
        errors.push(`${path}.${key} 0..9999 araliginda tam sayi olmali.`);
      }
    });
  }

  function validateWrongReportPayload(payload, docId) {
    const errors = [];
    const allowedKeys = [
      "source", "sourceLabel", "reportedAt", "stage", "mode", "objective", "diversityMode",
      "stoneMode", "seed", "expectedWinner", "expectedLostBlood", "expectedUsedCapacity",
      "expectedUsedPoints", "expectedAllyLosses", "expectedVariantSignature",
      "modeLabel", "enemyCounts", "allyCounts", "matchSignature",
      "recommendationCounts", "summaryText", "logText", "possible",
      "usedPoints", "lostBlood", "winRate", "pointLimit", "usedCapacity",
      "actualSummaryText", "actualNote", "actualOutcomeLine", "actualCapacity",
      "actualLosses", "actualWinner", "actualLostUnitsTotal", "actualLostBlood"
    ];
    const requiredKeys = [
      "source", "sourceLabel", "reportedAt", "enemyCounts", "allyCounts",
      "matchSignature", "summaryText", "logText", "usedCapacity",
      "actualSummaryText", "actualNote"
    ];

    if (!/^wrong_[0-9]+_[a-z0-9]+$/.test(docId)) {
      errors.push(`Belge kimligi kurala uymuyor: ${docId}`);
    }

    const payloadKeys = Object.keys(payload);
    const extraKeys = payloadKeys.filter((key) => !allowedKeys.includes(key));
    if (extraKeys.length > 0) {
      errors.push(`Payload icinde izin verilmeyen alanlar var: ${extraKeys.join(", ")}`);
    }

    const missingKeys = requiredKeys.filter((key) => !(key in payload));
    if (missingKeys.length > 0) {
      errors.push(`Zorunlu alanlar eksik: ${missingKeys.join(", ")}`);
    }

    if (!["simulation", "optimizer"].includes(payload.source)) {
      errors.push(`source gecersiz: ${String(payload.source)}`);
    }
    if (!validateShortString(payload.sourceLabel, 30)) {
      errors.push("sourceLabel 1..30 karakter olmali.");
    }
    if (!validateShortString(payload.reportedAt, 40)) {
      errors.push("reportedAt 1..40 karakter olmali.");
    }
    if ("stage" in payload && !isIntegerInRange(payload.stage, 1, 9999)) {
      errors.push("stage 1..9999 araliginda tam sayi olmali.");
    }
    if ("mode" in payload && !["balanced", "fast", "deep"].includes(payload.mode)) {
      errors.push(`mode gecersiz: ${String(payload.mode)}`);
    }
    if ("objective" in payload && !["min_loss", "min_army"].includes(payload.objective)) {
      errors.push(`objective gecersiz: ${String(payload.objective)}`);
    }
    if ("diversityMode" in payload && typeof payload.diversityMode !== "boolean") {
      errors.push("diversityMode boolean olmali.");
    }
    if ("stoneMode" in payload && typeof payload.stoneMode !== "boolean") {
      errors.push("stoneMode boolean olmali.");
    }
    if ("seed" in payload && !isIntegerInRange(payload.seed, 0, 4294967295)) {
      errors.push("seed 0..4294967295 araliginda tam sayi olmali.");
    }
    if ("modeLabel" in payload && !validateShortString(payload.modeLabel, 80)) {
      errors.push("modeLabel 1..80 karakter olmali.");
    }

    validateCountMap(payload.enemyCounts, ENEMY_COUNT_KEYS, "enemyCounts", errors);
    validateCountMap(payload.allyCounts, ALLY_COUNT_KEYS, "allyCounts", errors);

    if ("recommendationCounts" in payload && payload.recommendationCounts !== null) {
      validateCountMap(payload.recommendationCounts, ALLY_COUNT_KEYS, "recommendationCounts", errors);
    }

    if (!validateShortString(payload.matchSignature, 200)) {
      errors.push("matchSignature 1..200 karakter olmali.");
    }
    if ("expectedWinner" in payload && !["ally", "enemy", "unknown"].includes(payload.expectedWinner)) {
      errors.push(`expectedWinner gecersiz: ${String(payload.expectedWinner)}`);
    }
    if ("expectedLostBlood" in payload && payload.expectedLostBlood !== null && !isIntegerInRange(payload.expectedLostBlood, 0, 999999)) {
      errors.push("expectedLostBlood 0..999999 araliginda tam sayi olmali.");
    }
    if ("expectedUsedCapacity" in payload && payload.expectedUsedCapacity !== null && !isIntegerInRange(payload.expectedUsedCapacity, 0, 999999)) {
      errors.push("expectedUsedCapacity 0..999999 araliginda tam sayi olmali.");
    }
    if ("expectedUsedPoints" in payload && payload.expectedUsedPoints !== null && !isIntegerInRange(payload.expectedUsedPoints, 0, 99999)) {
      errors.push("expectedUsedPoints 0..99999 araliginda tam sayi olmali.");
    }
    if ("expectedAllyLosses" in payload) {
      validateCountMap(payload.expectedAllyLosses, ALLY_COUNT_KEYS, "expectedAllyLosses", errors);
    }
    if ("expectedVariantSignature" in payload && !validateTextString(payload.expectedVariantSignature, 1000)) {
      errors.push("expectedVariantSignature en fazla 1000 karakter olmali.");
    }
    if (!validateTextString(payload.summaryText, 40000)) {
      errors.push("summaryText en fazla 40000 karakter olmali.");
    }
    if (!validateTextString(payload.logText, 400000)) {
      errors.push("logText en fazla 400000 karakter olmali.");
    }
    if ("possible" in payload && typeof payload.possible !== "boolean") {
      errors.push("possible boolean olmali.");
    }
    if ("usedPoints" in payload && !isIntegerInRange(payload.usedPoints, 0, 99999)) {
      errors.push("usedPoints 0..99999 araliginda tam sayi olmali.");
    }
    if ("lostBlood" in payload && payload.lostBlood !== null && !isIntegerInRange(payload.lostBlood, 0, 999999)) {
      errors.push("lostBlood 0..999999 araliginda tam sayi olmali.");
    }
    if ("winRate" in payload && !isIntegerInRange(payload.winRate, 0, 100)) {
      errors.push("winRate 0..100 araliginda tam sayi olmali.");
    }
    if ("pointLimit" in payload && !isIntegerInRange(payload.pointLimit, 0, 99999)) {
      errors.push("pointLimit 0..99999 araliginda tam sayi olmali.");
    }
    if (!isIntegerInRange(payload.usedCapacity, 0, 999999)) {
      errors.push("usedCapacity 0..999999 araliginda tam sayi olmali.");
    }
    if (!validateTextString(payload.actualSummaryText, 40000)) {
      errors.push("actualSummaryText en fazla 40000 karakter olmali.");
    }
    if (!validateTextString(payload.actualNote, 4000)) {
      errors.push("actualNote en fazla 4000 karakter olmali.");
    }
    if ("actualOutcomeLine" in payload && !validateTextString(payload.actualOutcomeLine, 400)) {
      errors.push("actualOutcomeLine en fazla 400 karakter olmali.");
    }
    if ("actualCapacity" in payload && payload.actualCapacity !== null && !isIntegerInRange(payload.actualCapacity, 0, 999999)) {
      errors.push("actualCapacity 0..999999 araliginda tam sayi olmali.");
    }
    if ("actualLosses" in payload) {
      validateCountMap(payload.actualLosses, ALLY_COUNT_KEYS, "actualLosses", errors);
    }
    if ("actualWinner" in payload && !["ally", "enemy", "unknown"].includes(payload.actualWinner)) {
      errors.push(`actualWinner gecersiz: ${String(payload.actualWinner)}`);
    }
    if ("actualLostUnitsTotal" in payload && payload.actualLostUnitsTotal !== null && !isIntegerInRange(payload.actualLostUnitsTotal, 0, 999999)) {
      errors.push("actualLostUnitsTotal 0..999999 araliginda tam sayi olmali.");
    }
    if ("actualLostBlood" in payload && payload.actualLostBlood !== null && !isIntegerInRange(payload.actualLostBlood, 0, 999999)) {
      errors.push("actualLostBlood 0..999999 araliginda tam sayi olmali.");
    }

    return errors;
  }

  function validateApprovedPayload(payload, docId) {
    const errors = [];

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return ["Approved payload obje olmali."];
    }

    if (payload.source === "simulation") {
      const allowedKeys = [
        "source", "sourceLabel", "savedAt", "updatedAt", "stage", "enemyTitle", "enemyCounts",
        "promotedFromWrong", "promotedFromWrongAt", "promotedFromWrongId",
        "allyCounts", "matchSignature", "variantSignature", "representativeSeed", "variantTitle", "winner",
        "probabilityBasisPoints", "summaryText", "logText", "usedCapacity", "roundingMode",
        "usedPoints", "lostBlood"
      ];
      const requiredKeys = [
        "source", "sourceLabel", "savedAt", "updatedAt", "enemyTitle", "enemyCounts",
        "allyCounts", "matchSignature", "variantSignature", "variantTitle", "winner",
        "probabilityBasisPoints", "summaryText", "logText", "usedCapacity",
        "usedPoints", "lostBlood"
      ];

      if (!/^sim_[0-9a-f]+$/.test(docId)) {
        errors.push(`Belge ID formati hatali: ${docId}`);
      }
      const extraKeys = Object.keys(payload).filter((key) => !allowedKeys.includes(key));
      if (extraKeys.length > 0) {
        errors.push(`Izin verilmeyen alanlar: ${extraKeys.join(", ")}`);
      }
      const missingKeys = requiredKeys.filter((key) => !(key in payload));
      if (missingKeys.length > 0) {
        errors.push(`Eksik zorunlu alanlar: ${missingKeys.join(", ")}`);
      }
      if (payload.source !== "simulation") {
        errors.push(`source gecersiz: ${String(payload.source)}`);
      }
      if (!validateShortString(payload.sourceLabel, 30)) {
        errors.push("sourceLabel 1..30 karakter olmali.");
      }
      if (!validateShortString(payload.savedAt, 40)) {
        errors.push("savedAt 1..40 karakter olmali.");
      }
      if (!validateShortString(payload.updatedAt, 40)) {
        errors.push("updatedAt 1..40 karakter olmali.");
      }
      if ("stage" in payload && !isIntegerInRange(payload.stage, 1, 9999)) {
        errors.push("stage 1..9999 araliginda tam sayi olmali.");
      }
      if (!validateShortString(payload.enemyTitle, 120)) {
        errors.push("enemyTitle 1..120 karakter olmali.");
      }
      validateCountMap(payload.enemyCounts, ENEMY_COUNT_KEYS, "enemyCounts", errors);
      validateCountMap(payload.allyCounts, ALLY_COUNT_KEYS, "allyCounts", errors);
      if (!validateShortString(payload.matchSignature, 200)) {
        errors.push("matchSignature 1..200 karakter olmali.");
      }
      if (!validateTextString(payload.variantSignature, 500)) {
        errors.push("variantSignature en fazla 500 karakter olmali.");
      }
      if ("representativeSeed" in payload && !isIntegerInRange(payload.representativeSeed, 0, 4294967295)) {
        errors.push("representativeSeed 0..4294967295 araliginda tam sayi olmali.");
      }
      if (!validateShortString(payload.variantTitle, 80)) {
        errors.push("variantTitle 1..80 karakter olmali.");
      }
      if (!["ally", "enemy"].includes(payload.winner)) {
        errors.push(`winner gecersiz: ${String(payload.winner)}`);
      }
      if (!isIntegerInRange(payload.probabilityBasisPoints, 0, 10000)) {
        errors.push("probabilityBasisPoints 0..10000 araliginda tam sayi olmali.");
      }
      if (!validateTextString(payload.summaryText, 40000)) {
        errors.push("summaryText en fazla 40000 karakter olmali.");
      }
      if (!validateTextString(payload.logText, 400000)) {
        errors.push("logText en fazla 400000 karakter olmali.");
      }
      if ("roundingMode" in payload && !["legacy", "safe", "exact"].includes(payload.roundingMode)) {
        errors.push(`roundingMode gecersiz: ${String(payload.roundingMode)}`);
      }
      if (!isIntegerInRange(payload.usedCapacity, 0, 999999)) {
        errors.push("usedCapacity 0..999999 araliginda tam sayi olmali.");
      }
      if (!isIntegerInRange(payload.usedPoints, 0, 99999)) {
        errors.push("usedPoints 0..99999 araliginda tam sayi olmali.");
      }
      if (!isIntegerInRange(payload.lostBlood, 0, 999999)) {
        errors.push("lostBlood 0..999999 araliginda tam sayi olmali.");
      }
      if ("promotedFromWrong" in payload && typeof payload.promotedFromWrong !== "boolean") {
        errors.push("promotedFromWrong boolean olmali.");
      }
      if ("promotedFromWrongAt" in payload && !validateShortString(payload.promotedFromWrongAt, 40)) {
        errors.push("promotedFromWrongAt 1..40 karakter olmali.");
      }
      if ("promotedFromWrongId" in payload && !validateShortString(payload.promotedFromWrongId, 80)) {
        errors.push("promotedFromWrongId 1..80 karakter olmali.");
      }
      return errors;
    }

    const allowedKeys = [
      "source", "sourceLabel", "savedAt", "updatedAt", "stage", "mode", "objective",
      "diversityMode", "stoneMode", "modeLabel",
      "promotedFromWrong", "promotedFromWrongAt", "promotedFromWrongId",
      "enemySignature", "enemyTitle", "enemyCounts", "allyPool", "representativeSeed",
      "recommendationCounts", "usedPoints", "lostBlood", "winRate"
    ];
    const requiredKeys = [
      "source", "sourceLabel", "savedAt", "updatedAt", "stage", "mode", "objective",
      "diversityMode", "stoneMode", "modeLabel",
      "enemySignature", "enemyTitle", "enemyCounts", "allyPool",
      "recommendationCounts", "usedPoints", "lostBlood", "winRate"
    ];

    if (!/^stage_[0-9]+_[0-9a-f]+$/.test(docId)) {
      errors.push(`Belge ID formati hatali: ${docId}`);
    }
    const extraKeys = Object.keys(payload).filter((key) => !allowedKeys.includes(key));
    if (extraKeys.length > 0) {
      errors.push(`Izin verilmeyen alanlar: ${extraKeys.join(", ")}`);
    }
    const missingKeys = requiredKeys.filter((key) => !(key in payload));
    if (missingKeys.length > 0) {
      errors.push(`Eksik zorunlu alanlar: ${missingKeys.join(", ")}`);
    }
    if (payload.source !== "optimizer") {
      errors.push(`source gecersiz: ${String(payload.source)}`);
    }
    if (!validateShortString(payload.sourceLabel, 30)) {
      errors.push("sourceLabel 1..30 karakter olmali.");
    }
    if (!validateShortString(payload.savedAt, 40)) {
      errors.push("savedAt 1..40 karakter olmali.");
    }
    if (!validateShortString(payload.updatedAt, 40)) {
      errors.push("updatedAt 1..40 karakter olmali.");
    }
    if (!isIntegerInRange(payload.stage, 1, 9999)) {
      errors.push("stage 1..9999 araliginda tam sayi olmali.");
    }
    if (!["balanced", "fast", "deep"].includes(payload.mode)) {
      errors.push(`mode gecersiz: ${String(payload.mode)}`);
    }
    if (!["min_loss", "min_army"].includes(payload.objective)) {
      errors.push(`objective gecersiz: ${String(payload.objective)}`);
    }
    if (typeof payload.diversityMode !== "boolean") {
      errors.push("diversityMode boolean olmali.");
    }
    if (typeof payload.stoneMode !== "boolean") {
      errors.push("stoneMode boolean olmali.");
    }
    if (!validateShortString(payload.modeLabel, 80)) {
      errors.push("modeLabel 1..80 karakter olmali.");
    }
    if ("promotedFromWrong" in payload && typeof payload.promotedFromWrong !== "boolean") {
      errors.push("promotedFromWrong boolean olmali.");
    }
    if ("promotedFromWrongAt" in payload && !validateShortString(payload.promotedFromWrongAt, 40)) {
      errors.push("promotedFromWrongAt 1..40 karakter olmali.");
    }
    if ("promotedFromWrongId" in payload && !validateShortString(payload.promotedFromWrongId, 80)) {
      errors.push("promotedFromWrongId 1..80 karakter olmali.");
    }
    if (!validateShortString(payload.enemySignature, 120)) {
      errors.push("enemySignature 1..120 karakter olmali.");
    }
    if (!validateShortString(payload.enemyTitle, 120)) {
      errors.push("enemyTitle 1..120 karakter olmali.");
    }
    validateCountMap(payload.enemyCounts, ENEMY_COUNT_KEYS, "enemyCounts", errors);
    validateCountMap(payload.allyPool, ALLY_COUNT_KEYS, "allyPool", errors);
    if ("representativeSeed" in payload && !isIntegerInRange(payload.representativeSeed, 0, 4294967295)) {
      errors.push("representativeSeed 0..4294967295 araliginda tam sayi olmali.");
    }
    validateCountMap(payload.recommendationCounts, ALLY_COUNT_KEYS, "recommendationCounts", errors);
    if (!isIntegerInRange(payload.usedPoints, 0, 99999)) {
      errors.push("usedPoints 0..99999 araliginda tam sayi olmali.");
    }
    if (!isIntegerInRange(payload.lostBlood, 0, 999999)) {
      errors.push("lostBlood 0..999999 araliginda tam sayi olmali.");
    }
    if (!isIntegerInRange(payload.winRate, 0, 100)) {
      errors.push("winRate 0..100 araliginda tam sayi olmali.");
    }

    return errors;
  }

  function formatWrongReportError(error, payload, docId) {
    const localErrors = validateWrongReportPayload(payload, docId);
    const lines = [
      `Firestore hata kodu: ${error?.code || "bilinmiyor"}`,
      `Firestore mesaji: ${error?.message || "bilinmiyor"}`,
      `Belge kimligi: ${docId}`,
      `Payload alanlari: ${Object.keys(payload).join(", ")}`,
      `Byte boyutlari: summaryText=${getUtf8Size(payload.summaryText || "")}, logText=${getUtf8Size(payload.logText || "")}, actualSummaryText=${getUtf8Size(payload.actualSummaryText || "")}, actualNote=${getUtf8Size(payload.actualNote || "")}`
    ];

    if (localErrors.length > 0) {
      lines.push("Yerel kural dogrulamasi basarisiz:");
      localErrors.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("Yerel kural dogrulamasi gecti.");
      lines.push("Sunucu hala reddediyorsa aktif projede farkli kural, farkli Firestore veritabani veya oturum/policy kaynakli ek bir kisit olabilir.");
    }

    return new Error(lines.join("\n"));
  }

  function toFirestoreRestValue(value) {
    if (value === null) {
      return { nullValue: null };
    }
    if (typeof value === "string") {
      return { stringValue: value };
    }
    if (typeof value === "boolean") {
      return { booleanValue: value };
    }
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const fields = {};
      Object.entries(value).forEach(([key, nestedValue]) => {
        fields[key] = toFirestoreRestValue(nestedValue);
      });
      return { mapValue: { fields } };
    }
    throw new Error(`Firestore REST donusumu bu degeri desteklemiyor: ${String(value)}`);
  }

  function toFirestoreRestFields(payload) {
    const fields = {};
    Object.entries(payload).forEach(([key, value]) => {
      fields[key] = toFirestoreRestValue(value);
    });
    return fields;
  }

  async function createWrongReportViaRest(docId, payload) {
    if (typeof globalScope.fetch !== "function") {
      throw new Error("REST fallback icin fetch kullanilamiyor.");
    }

    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}/${WRONG_COLLECTION}?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: toFirestoreRestFields(payload)
        })
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`REST fallback basarisiz: HTTP ${response.status} ${response.statusText}\n${responseText}`);
    }

    return response.json().catch(() => null);
  }

  async function upsertFavoriteStrategyViaRest(docId, payload) {
    if (typeof globalScope.fetch !== "function") {
      throw new Error("REST fallback icin fetch kullanilamiyor.");
    }

    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}/${FAVORITE_COLLECTION}/${encodeURIComponent(docId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: toFirestoreRestFields(payload)
        })
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`REST fallback basarisiz: HTTP ${response.status} ${response.statusText}\n${responseText}`);
    }

    return response.json().catch(() => null);
  }

  async function upsertApprovedStrategyViaRest(docId, payload, idToken) {
    if (typeof globalScope.fetch !== "function") {
      throw new Error("REST fallback icin fetch kullanilamiyor.");
    }
    if (!idToken) {
      throw new Error("REST fallback icin Firebase ID token gerekli.");
    }

    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}/${COLLECTION}/${encodeURIComponent(docId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fields: toFirestoreRestFields(payload)
        })
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`REST fallback basarisiz: HTTP ${response.status} ${response.statusText}\n${responseText}`);
    }

    return response.json().catch(() => null);
  }

  async function createOverviewArchiveViaRest(docId, payload) {
    if (typeof globalScope.fetch !== "function") {
      throw new Error("REST fallback icin fetch kullanilamiyor.");
    }

    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}/${OVERVIEW_ARCHIVE_COLLECTION}?documentId=${encodeURIComponent(docId)}&key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: toFirestoreRestFields(payload)
        })
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`REST fallback basarisiz: HTTP ${response.status} ${response.statusText}\n${responseText}`);
    }

    return response.json().catch(() => null);
  }

  async function upsertArchiveRegressionTestViaRest(docId, payload) {
    if (typeof globalScope.fetch !== "function") {
      throw new Error("REST fallback icin fetch kullanilamiyor.");
    }

    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}/${ARCHIVE_TEST_COLLECTION}/${encodeURIComponent(docId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: toFirestoreRestFields(payload)
        })
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`REST fallback basarisiz: HTTP ${response.status} ${response.statusText}\n${responseText}`);
    }

    return response.json().catch(() => null);
  }

  async function migrateLocalStrategies() {
    if (!db || readMigrationFlag() || !isAdminSignedIn()) {
      return;
    }
    const localItems = readLocalStrategies();
    if (!localItems.length) {
      writeMigrationFlag();
      return;
    }
    const batch = db.batch();
    localItems.forEach((item) => {
      const id = item.id || buildApprovedEntryId(item);
      if (!id) {
        return;
      }
      batch.set(db.collection(COLLECTION).doc(id), sanitizeApprovedEntry(item), { merge: true });
    });
    await batch.commit();
    writeMigrationFlag();
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function buildOptimizerDocId(stage, enemySignature) {
    return `stage_${stage}_${hashText(`${stage}:${enemySignature}`)}`;
  }

  function buildSimulationDocId(matchSignature, variantSignature) {
    return `sim_${hashText(`${matchSignature}::${variantSignature}`)}`;
  }

  function buildFavoriteStrategyDocId() {
    const suffix = Math.random().toString(36).slice(2, 9) || "0";
    return `fav_${Date.now()}_${suffix}`;
  }

  function buildOverviewArchiveDocId() {
    const suffix = Math.random().toString(36).slice(2, 9) || "0";
    return `overview_${Date.now()}_${suffix}`;
  }

  function validateFavoritePayload(data, docId) {
    const errors = [];
    const ALLOWED_KEYS = [
      "source", "sourceLabel", "savedAt", "updatedAt", "stage", "mode", "objective",
      "diversityMode", "stoneMode", "modeLabel",
      "enemySignature", "enemyRosterSignature", "enemyTitle", "enemyCounts", "allyPool",
      "recommendationCounts", "usedPoints", "lostBlood", "winRate"
    ];
    const REQUIRED_KEYS = [
      "source", "sourceLabel", "savedAt", "updatedAt", "mode", "objective",
      "diversityMode", "stoneMode", "modeLabel",
      "enemySignature", "enemyRosterSignature", "enemyTitle", "enemyCounts", "allyPool",
      "recommendationCounts", "usedPoints", "lostBlood", "winRate"
    ];

    if (!/^fav_[0-9]+_[a-z0-9]+$/.test(docId)) {
      errors.push(`Belge ID formati hatali: ${docId}`);
    }

    const keys = Object.keys(data);
    const extraKeys = keys.filter((k) => !ALLOWED_KEYS.includes(k));
    if (extraKeys.length > 0) {
      errors.push(`Izin verilmeyen alanlar: ${extraKeys.join(", ")}`);
    }
    const missingKeys = REQUIRED_KEYS.filter((k) => !(k in data));
    if (missingKeys.length > 0) {
      errors.push(`Eksik zorunlu alanlar: ${missingKeys.join(", ")}`);
    }

    if (!["optimizer", "simulation"].includes(data.source)) {
      errors.push(`source gecersiz: ${data.source}`);
    }
    if (typeof data.sourceLabel !== "string" || data.sourceLabel.length === 0 || data.sourceLabel.length > 30) {
      errors.push(`sourceLabel gecersiz: ${JSON.stringify(data.sourceLabel)}`);
    }
    if (typeof data.savedAt !== "string" || data.savedAt.length === 0 || data.savedAt.length > 40) {
      errors.push(`savedAt gecersiz: ${JSON.stringify(data.savedAt)}`);
    }
    if (typeof data.updatedAt !== "string" || data.updatedAt.length === 0 || data.updatedAt.length > 40) {
      errors.push(`updatedAt gecersiz: ${JSON.stringify(data.updatedAt)}`);
    }
    if ("stage" in data && !(Number.isInteger(data.stage) && data.stage >= 1 && data.stage <= 9999)) {
      errors.push(`stage gecersiz: ${data.stage}`);
    }
    if (!["balanced", "fast", "deep"].includes(data.mode)) {
      errors.push(`mode gecersiz: ${data.mode}`);
    }
    if (!["min_loss", "min_army"].includes(data.objective)) {
      errors.push(`objective gecersiz: ${data.objective}`);
    }
    if (typeof data.diversityMode !== "boolean") {
      errors.push(`diversityMode boolean olmali: ${data.diversityMode}`);
    }
    if (typeof data.stoneMode !== "boolean") {
      errors.push(`stoneMode boolean olmali: ${data.stoneMode}`);
    }
    if (typeof data.modeLabel !== "string" || data.modeLabel.length === 0 || data.modeLabel.length > 80) {
      errors.push(`modeLabel gecersiz: ${JSON.stringify(data.modeLabel)}`);
    }
    if (typeof data.enemySignature !== "string" || data.enemySignature.length === 0 || data.enemySignature.length > 120) {
      errors.push(`enemySignature gecersiz: ${JSON.stringify(data.enemySignature)}`);
    }
    if (typeof data.enemyRosterSignature !== "string" || data.enemyRosterSignature.length === 0 || data.enemyRosterSignature.length > 120) {
      errors.push(`enemyRosterSignature gecersiz: ${JSON.stringify(data.enemyRosterSignature)}`);
    }
    if (typeof data.enemyTitle !== "string" || data.enemyTitle.length === 0 || data.enemyTitle.length > 120) {
      errors.push(`enemyTitle gecersiz: ${JSON.stringify(data.enemyTitle)}`);
    }
    if (!Number.isInteger(data.usedPoints) || data.usedPoints < 0 || data.usedPoints > 99999) {
      errors.push(`usedPoints gecersiz: ${data.usedPoints}`);
    }
    if (!Number.isInteger(data.lostBlood) || data.lostBlood < 0 || data.lostBlood > 999999) {
      errors.push(`lostBlood gecersiz: ${data.lostBlood}`);
    }
    if (!Number.isInteger(data.winRate) || data.winRate < 0 || data.winRate > 100) {
      errors.push(`winRate gecersiz: ${data.winRate}`);
    }

    return errors;
  }

  function validateOverviewArchivePayload(data, docId) {
    const errors = [];
    const allowedKeys = ["savedAt", "updatedAt", "lootGoldText", "lootGoldValue", "expText", "expValue", "armyPowerText", "levelText", "enemyRosterText", "allyRosterText", "fallenUnitsText", "reviveStoneText", "sourceType", "host", "pageUrl", "pageTitle"];
    const requiredKeys = ["savedAt", "updatedAt", "lootGoldText", "lootGoldValue", "expText", "expValue", "armyPowerText", "levelText", "sourceType"];

    if (!/^overview_[0-9]+_[a-z0-9]+$/.test(docId)) {
      errors.push(`Belge ID formati hatali: ${docId}`);
    }

    const keys = Object.keys(data || {});
    const extraKeys = keys.filter((key) => !allowedKeys.includes(key));
    if (extraKeys.length > 0) {
      errors.push(`Izin verilmeyen alanlar: ${extraKeys.join(", ")}`);
    }
    const missingKeys = requiredKeys.filter((key) => !(key in data));
    if (missingKeys.length > 0) {
      errors.push(`Eksik zorunlu alanlar: ${missingKeys.join(", ")}`);
    }

    if (!validateShortString(data.savedAt, 40)) {
      errors.push("savedAt 1..40 karakter olmali.");
    }
    if (!validateShortString(data.updatedAt, 40)) {
      errors.push("updatedAt 1..40 karakter olmali.");
    }
    if (!validateShortString(data.lootGoldText, 40)) {
      errors.push("lootGoldText 1..40 karakter olmali.");
    }
    if (!isIntegerInRange(data.lootGoldValue, 0, 9999999999999)) {
      errors.push("lootGoldValue 0..9999999999999 araliginda tam sayi olmali.");
    }
    if (!validateShortString(data.expText, 40)) {
      errors.push("expText 1..40 karakter olmali.");
    }
    if (!isIntegerInRange(data.expValue, 0, 9999999999999)) {
      errors.push("expValue 0..9999999999999 araliginda tam sayi olmali.");
    }
    if (!validateShortString(data.armyPowerText, 20)) {
      errors.push("armyPowerText 1..20 karakter olmali.");
    }
    if (!validateShortString(data.levelText, 20)) {
      errors.push("levelText 1..20 karakter olmali.");
    }
    if ("enemyRosterText" in data && data.enemyRosterText && !validateShortString(data.enemyRosterText, 160)) {
      errors.push("enemyRosterText 1..160 karakter olmali.");
    }
    if ("allyRosterText" in data && data.allyRosterText && !validateShortString(data.allyRosterText, 160)) {
      errors.push("allyRosterText 1..160 karakter olmali.");
    }
    if ("fallenUnitsText" in data && data.fallenUnitsText && !validateShortString(data.fallenUnitsText, 240)) {
      errors.push("fallenUnitsText 1..240 karakter olmali.");
    }
    if ("reviveStoneText" in data && data.reviveStoneText && !validateShortString(data.reviveStoneText, 40)) {
      errors.push("reviveStoneText 1..40 karakter olmali.");
    }
    if (!["manual", "fill"].includes(data.sourceType)) {
      errors.push("sourceType manual veya fill olmali.");
    }
    if ("host" in data && data.host && !validateShortString(data.host, 120)) {
      errors.push("host 1..120 karakter olmali.");
    }
    if ("pageUrl" in data && data.pageUrl && !validateShortString(data.pageUrl, 400)) {
      errors.push("pageUrl 1..400 karakter olmali.");
    }
    if ("pageTitle" in data && data.pageTitle && !validateShortString(data.pageTitle, 160)) {
      errors.push("pageTitle 1..160 karakter olmali.");
    }

    return errors;
  }

  function formatFavoriteStrategyError(error, payload, docId) {
    const localErrors = validateFavoritePayload(payload, docId);
    const lines = [
      `Firestore hata kodu: ${error?.code || "bilinmiyor"}`,
      `Firestore mesaji: ${error?.message || "bilinmiyor"}`,
      `Belge kimligi: ${docId}`,
      `Payload alanlari: ${Object.keys(payload).join(", ")}`,
      `Byte boyutlari: sourceLabel=${getUtf8Size(payload.sourceLabel || "")}, modeLabel=${getUtf8Size(payload.modeLabel || "")}, enemySignature=${getUtf8Size(payload.enemySignature || "")}, enemyTitle=${getUtf8Size(payload.enemyTitle || "")}`
    ];

    if (localErrors.length > 0) {
      lines.push("Yerel kural dogrulamasi basarisiz:");
      localErrors.forEach((item) => lines.push(`- ${item}`));
    } else {
      lines.push("Yerel kural dogrulamasi gecti.");
      lines.push("Sunucu hala reddediyorsa aktif projede farkli kural, farkli Firestore veritabani veya oturum/policy kaynakli ek bir kisit olabilir.");
    }

    return new Error(lines.join("\n"));
  }

  async function loadApprovedStrategies() {
    if (!db) {
      return readLocalStrategies();
    }

    try {
      await migrateLocalStrategies();
      const snapshot = await db.collection(COLLECTION).get();
      const remoteItems = mergeStrategies(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
      const items = mergeStrategies([...remoteItems, ...readLocalStrategies()]);
      writeCache(items);
      return items;
    } catch (error) {
      console.warn("Firestore okunamadi, cache kullaniliyor.", error);
      return readLocalStrategies();
    }
  }

  async function loadApprovedStrategiesPage(options = {}) {
    await migrateLocalStrategies();
    return loadCollectionPage({
      collectionName: COLLECTION,
      orderField: "savedAt",
      mergeItems: mergeStrategies,
      readLocal: readLocalStrategies,
      writeLocal: writeCache,
      pageSize: options.pageSize,
      cursor: options.cursor || null
    });
  }

  async function saveApprovedStrategy(item) {
    const docId = buildApprovedEntryId(item);
    const payload = sanitizeApprovedEntry(item);
    const validationErrors = validateApprovedPayload(payload, docId);

    if (!docId) {
      throw new Error("Kayit kimligi olusturulamadi.");
    }
    if (validationErrors.length > 0) {
      throw new Error(`Onayli kayit verisi kurallara uymuyor:\n${validationErrors.map((entry) => `- ${entry}`).join("\n")}`);
    }

    if (!db) {
      const next = mergeStrategies([...readLocalStrategies(), { ...payload, id: docId }]);
      writeCache(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }

    const currentUser = auth ? auth.currentUser : null;
    if (!isAdminUser(currentUser)) {
      throw new Error("Onayli kayit kaydetmek icin admin girisi zorunludur. Lutfen once admin olarak giris yapin.");
    }

    try {
      if (typeof currentUser.getIdToken === "function") {
        await currentUser.getIdToken(true);
      }
      await db.collection(COLLECTION).doc(docId).set(payload, { merge: true });
      return { ...payload, id: docId };
    } catch (error) {
      if (error?.code === "permission-denied") {
        try {
          const idToken = typeof currentUser.getIdToken === "function"
            ? await currentUser.getIdToken(true)
            : "";
          await upsertApprovedStrategyViaRest(docId, payload, idToken);
          return { ...payload, id: docId, savedVia: "rest-fallback" };
        } catch (retryError) {
          const activeUser = auth ? auth.currentUser : null;
          const activeEmail = activeUser?.email ? normalizeEmail(activeUser.email) : "-";
          const tokenResult = typeof activeUser?.getIdTokenResult === "function"
            ? await activeUser.getIdTokenResult().catch(() => null)
            : null;
          const claimEmail = tokenResult?.claims?.email ? normalizeEmail(tokenResult.claims.email) : "-";
          throw new Error(
            [
              "Onayli kayit Firestore tarafinda reddedildi.",
              `Auth durum: ${activeUser ? "aktif" : "yok"}`,
              `Auth email: ${activeEmail}`,
              `Token email claim: ${claimEmail}`,
              `Beklenen admin: ${ADMIN_EMAIL}`,
              `Hata kodu: ${retryError?.code || error?.code || "bilinmiyor"}`,
              validationErrors.length > 0 ? `Yerel kural hatalari: ${validationErrors.join(" | ")}` : "Yerel kural dogrulamasi gecti.",
              "Admin paneli acik gorunse bile Firestore istegi yetkisiz kaldi. Sayfayi yenileyip yeniden admin girisi deneyin."
            ].join("\n")
          );
        }
      }
      console.warn("Firestore kaydi basarisiz, yerel cache kullaniliyor.", error);
      const next = mergeStrategies([...readLocalStrategies(), { ...payload, id: docId }]);
      writeCache(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }
  }

  async function deleteApprovedStrategy(id) {
    const nextLocal = readLocalStrategies().filter((candidate) => candidate.id !== id);
    if (!db) {
      writeCache(nextLocal);
      return;
    }
    await db.collection(COLLECTION).doc(id).delete();
    writeCache(nextLocal);
  }

  async function clearApprovedStrategies() {
    if (!db) {
      writeCache([]);
      return;
    }
    const snapshot = await db.collection(COLLECTION).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    writeCache([]);
  }

  async function loadWrongReports() {
    if (!db) {
      return readWrongReports();
    }

    try {
      const snapshot = await db.collection(WRONG_COLLECTION).get();
      const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      writeWrongReports(items);
      return items;
    } catch (error) {
      console.warn("Yanlis raporlari okunamadi, cache kullaniliyor.", error);
      return readWrongReports();
    }
  }

  async function loadWrongReportsPage(options = {}) {
    return loadCollectionPage({
      collectionName: WRONG_COLLECTION,
      orderField: "reportedAt",
      mergeItems: (items) => items,
      readLocal: readWrongReports,
      writeLocal: writeWrongReports,
      pageSize: options.pageSize,
      cursor: options.cursor || null
    });
  }

  async function loadFavoriteStrategies() {
    if (!db) {
      return readFavoriteStrategies();
    }

    try {
      const snapshot = await db.collection(FAVORITE_COLLECTION).get();
      const remoteItems = mergeFavorites(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
      const items = mergeFavorites([...remoteItems, ...readFavoriteStrategies()]);
      writeFavoriteStrategies(items);
      return items;
    } catch (error) {
      console.warn("Fav dizilimler okunamadi, cache kullaniliyor.", error);
      return readFavoriteStrategies();
    }
  }

  async function loadFavoriteStrategiesPage(options = {}) {
    return loadCollectionPage({
      collectionName: FAVORITE_COLLECTION,
      orderField: "savedAt",
      mergeItems: mergeFavorites,
      readLocal: readFavoriteStrategies,
      writeLocal: writeFavoriteStrategies,
      pageSize: options.pageSize,
      cursor: options.cursor || null
    });
  }

  async function findWrongReportsByMatchSignature(source, matchSignature) {
    const normalizedSource = source === "optimizer" ? "optimizer" : "simulation";
    const normalizedSignature = trimText(matchSignature || "", 200);
    if (!normalizedSignature) {
      return [];
    }
    if (!db) {
      return sortByStringFieldDesc(
        readWrongReports().filter((item) => item?.source === normalizedSource && item?.matchSignature === normalizedSignature),
        "reportedAt"
      );
    }
    try {
      const snapshot = await db.collection(WRONG_COLLECTION)
        .where("matchSignature", "==", normalizedSignature)
        .limit(DEFAULT_PAGE_SIZE)
        .get();
      const items = snapshot.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }))
        .filter((item) => item?.source === normalizedSource);
      if (items.length > 0) {
        writeWrongReports([
          ...items,
          ...readWrongReports().filter((item) => !items.some((nextItem) => nextItem.id === item.id))
        ]);
      }
      return sortByStringFieldDesc(items, "reportedAt");
    } catch (error) {
      console.warn("Wrong report hedefli okunamadi, cache kullaniliyor.", error);
      return sortByStringFieldDesc(
        readWrongReports().filter((item) => item?.source === normalizedSource && item?.matchSignature === normalizedSignature),
        "reportedAt"
      );
    }
  }

  async function findApprovedStrategyByDocId(docId) {
    const normalizedId = typeof docId === "string" ? docId.trim() : "";
    if (!normalizedId) {
      return null;
    }
    if (!db) {
      return readLocalStrategies().find((item) => item.id === normalizedId) || null;
    }
    try {
      const snapshot = await db.collection(COLLECTION).doc(normalizedId).get();
      if (!snapshot?.exists) {
        return null;
      }
      const item = { ...snapshot.data(), id: snapshot.id };
      writeCache(mergeStrategies([...readLocalStrategies(), item]));
      return item;
    } catch (error) {
      console.warn("Onayli kayit hedefli okunamadi, cache kullaniliyor.", error);
      return readLocalStrategies().find((item) => item.id === normalizedId) || null;
    }
  }

  async function findFavoriteStrategiesByEnemySignature(enemySignature, options = {}) {
    const normalizedSignature = trimText(enemySignature || "", 120);
    const normalizedPageSize = normalizePageSize(options.pageSize || DEFAULT_PAGE_SIZE);
    if (!normalizedSignature) {
      return [];
    }
    const localFilter = () => sortByStringFieldDesc(
      readFavoriteStrategies().filter((item) => (
        item?.enemyRosterSignature === normalizedSignature || item?.enemySignature === normalizedSignature
      )),
      "savedAt"
    ).slice(0, normalizedPageSize);
    if (!db) {
      return localFilter();
    }
    try {
      const rosterSnapshot = await db.collection(FAVORITE_COLLECTION)
        .where("enemyRosterSignature", "==", normalizedSignature)
        .limit(normalizedPageSize)
        .get();
      const signatureSnapshot = await db.collection(FAVORITE_COLLECTION)
        .where("enemySignature", "==", normalizedSignature)
        .limit(normalizedPageSize)
        .get();
      const items = mergeFavorites([
        ...rosterSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
        ...signatureSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
      ]);
      const sortedItems = sortByStringFieldDesc(items, "savedAt").slice(0, normalizedPageSize);
      if (sortedItems.length > 0) {
        writeFavoriteStrategies(mergeFavorites([...readFavoriteStrategies(), ...sortedItems]));
      }
      return sortedItems;
    } catch (error) {
      console.warn("Fav hedefli okunamadi, cache kullaniliyor.", error);
      return localFilter();
    }
  }

  async function saveFavoriteStrategy(item) {
    const docId = typeof item?.id === "string" && item.id.trim() ? item.id.trim() : buildFavoriteStrategyDocId();
    const payload = sanitizeFavoriteStrategy(item);
    const validationErrors = validateFavoritePayload(payload, docId);

    if (!db) {
      const next = mergeFavorites([...readFavoriteStrategies(), { ...payload, id: docId }]);
      writeFavoriteStrategies(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }

    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser || normalizeEmail(currentUser.email) !== ADMIN_EMAIL) {
      throw new Error("Fav kaydetmek icin admin girisi zorunludur. Lutfen once admin olarak giris yapin.");
    }

    if (validationErrors.length > 0) {
      throw new Error(`Favori verisi kurallara uymuyor:\n${validationErrors.map((e) => `- ${e}`).join("\n")}`);
    }

    try {
      await db.collection(FAVORITE_COLLECTION).doc(docId).set(payload);
      const next = mergeFavorites([...readFavoriteStrategies(), { ...payload, id: docId }]);
      writeFavoriteStrategies(next);
      return { ...payload, id: docId };
    } catch (error) {
      if (error?.code === "permission-denied") {
        try {
          await upsertFavoriteStrategyViaRest(docId, payload);
          const next = mergeFavorites([...readFavoriteStrategies(), { ...payload, id: docId }]);
          writeFavoriteStrategies(next);
          return { ...payload, id: docId, savedVia: "rest-fallback" };
        } catch (restError) {
          throw formatFavoriteStrategyError(restError, payload, docId);
        }
      }
      throw formatFavoriteStrategyError(error, payload, docId);
    }
  }

  async function deleteFavoriteStrategy(id) {
    const docId = typeof id === "string" ? id.trim() : "";
    const nextLocal = readFavoriteStrategies().filter((candidate) => candidate.id !== docId);
    if (!db) {
      writeFavoriteStrategies(nextLocal);
      return;
    }
    await db.collection(FAVORITE_COLLECTION).doc(docId).delete();
    writeFavoriteStrategies(nextLocal);
  }

  async function clearFavoriteStrategies() {
    if (!db) {
      writeFavoriteStrategies([]);
      return;
    }
    const snapshot = await db.collection(FAVORITE_COLLECTION).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    writeFavoriteStrategies([]);
  }

  async function saveWrongReport(item) {
    const docId = `wrong_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const payload = sanitizeWrongReport(item);
    const localErrors = validateWrongReportPayload(payload, docId);

    if (localErrors.length > 0) {
      throw new Error([
        "Wrong report payload yerel kural dogrulamasini gecemedi.",
        ...localErrors.map((entry) => `- ${entry}`)
      ].join("\n"));
    }

    if (!db) {
      const next = [{ ...payload, id: docId }, ...readWrongReports()];
      writeWrongReports(next);
      return next[0];
    }

    try {
      await db.collection(WRONG_COLLECTION).doc(docId).set(payload);
      return { ...payload, id: docId };
    } catch (error) {
      if (error?.code === "permission-denied") {
        try {
          await createWrongReportViaRest(docId, payload);
          return { ...payload, id: docId, savedVia: "rest-fallback" };
        } catch (restError) {
          throw formatWrongReportError(restError, payload, docId);
        }
      }
      throw formatWrongReportError(error, payload, docId);
    }
  }

  async function deleteWrongReport(id) {
    if (!db) {
      writeWrongReports(readWrongReports().filter((candidate) => candidate.id !== id));
      return;
    }
    await db.collection(WRONG_COLLECTION).doc(id).delete();
  }

  async function clearWrongReports() {
    if (!db) {
      writeWrongReports([]);
      return;
    }
    const snapshot = await db.collection(WRONG_COLLECTION).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    writeWrongReports([]);
  }

  function buildArchiveRegressionTestDocId(matchSignature) {
    return `arctest_${hashText(String(matchSignature || "-"))}`;
  }

  async function loadArchiveRegressionTests() {
    if (!db) {
      return readArchiveRegressionTests();
    }

    try {
      const snapshot = await db.collection(ARCHIVE_TEST_COLLECTION).get();
      const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      writeArchiveRegressionTests(items);
      return items;
    } catch (error) {
      console.warn("Arsiv test sonuclari okunamadi, cache kullaniliyor.", error);
      return readArchiveRegressionTests();
    }
  }

  function getArchiveRegressionTestedSignatures() {
    const set = new Set();
    readArchiveRegressionTests().forEach((item) => {
      const signature = typeof item?.matchSignature === "string" ? item.matchSignature : "";
      if (signature) {
        set.add(signature);
      }
    });
    return set;
  }

  async function saveArchiveRegressionTest(item) {
    const payload = sanitizeArchiveRegressionTest(item);
    const docId = buildArchiveRegressionTestDocId(payload.matchSignature);

    if (!db) {
      const next = [{ ...payload, id: docId }, ...readArchiveRegressionTests().filter((candidate) => candidate.id !== docId)];
      writeArchiveRegressionTests(next);
      return { ...payload, id: docId };
    }

    try {
      await db.collection(ARCHIVE_TEST_COLLECTION).doc(docId).set(payload, { merge: true });
      const next = [{ ...payload, id: docId }, ...readArchiveRegressionTests().filter((candidate) => candidate.id !== docId)];
      writeArchiveRegressionTests(next);
      return { ...payload, id: docId };
    } catch (error) {
      if (error?.code === "permission-denied") {
        await upsertArchiveRegressionTestViaRest(docId, payload);
        const next = [{ ...payload, id: docId }, ...readArchiveRegressionTests().filter((candidate) => candidate.id !== docId)];
        writeArchiveRegressionTests(next);
        return { ...payload, id: docId, savedVia: "rest-fallback" };
      }
      throw error;
    }
  }

  async function clearArchiveRegressionTests() {
    if (!db) {
      writeArchiveRegressionTests([]);
      return;
    }
    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser || normalizeEmail(currentUser.email) !== ADMIN_EMAIL) {
      throw new Error("Arsiv test sonuclarini silmek icin admin girisi zorunludur.");
    }
    const snapshot = await db.collection(ARCHIVE_TEST_COLLECTION).get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    writeArchiveRegressionTests([]);
  }

  async function deleteSkippedArchiveRegressionTests(options = {}) {
    const host = typeof options.host === "string" ? options.host : "";
    const isSkippedForHost = (item) => (
      String(item?.result || "") === "skipped"
      && (!host || String(item?.host || "") === host)
    );
    const getTestDocId = (item) => {
      const explicitId = typeof item?.id === "string" ? item.id.trim() : "";
      if (explicitId) {
        return explicitId;
      }
      return item?.matchSignature ? buildArchiveRegressionTestDocId(item.matchSignature) : "";
    };
    const getArchiveDocId = (item) => (typeof item?.archiveId === "string" ? item.archiveId.trim() : "");

    if (!db) {
      const skippedItems = readArchiveRegressionTests().filter(isSkippedForHost);
      const archiveIds = new Set(skippedItems.map(getArchiveDocId).filter(Boolean));
      writeArchiveRegressionTests(readArchiveRegressionTests().filter((item) => !isSkippedForHost(item)));
      writeOverviewArchives(readOverviewArchives().filter((item) => !archiveIds.has(item?.id)));
      return {
        deletedTests: skippedItems.map(getTestDocId).filter(Boolean).length,
        deletedArchives: archiveIds.size
      };
    }

    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser || normalizeEmail(currentUser.email) !== ADMIN_EMAIL) {
      throw new Error("Atlanan kayitlari silmek icin admin girisi zorunludur.");
    }

    let query = db.collection(ARCHIVE_TEST_COLLECTION).where("result", "==", "skipped");
    if (host) {
      query = query.where("host", "==", host);
    }
    const snapshot = await query.get();
    const skippedItems = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    const testDocIds = [...new Set(snapshot.docs.map((doc) => doc.id).filter(Boolean))];
    const archiveDocIds = [...new Set(skippedItems.map(getArchiveDocId).filter(Boolean))];

    const refs = [
      ...testDocIds.map((docId) => db.collection(ARCHIVE_TEST_COLLECTION).doc(docId)),
      ...archiveDocIds.map((docId) => db.collection(OVERVIEW_ARCHIVE_COLLECTION).doc(docId))
    ];
    const chunkSize = 400;
    for (let start = 0; start < refs.length; start += chunkSize) {
      const batch = db.batch();
      refs.slice(start, start + chunkSize).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    const testIdSet = new Set(testDocIds);
    const archiveIdSet = new Set(archiveDocIds);
    writeArchiveRegressionTests(readArchiveRegressionTests().filter((item) => !testIdSet.has(getTestDocId(item))));
    writeOverviewArchives(readOverviewArchives().filter((item) => !archiveIdSet.has(item?.id)));
    return {
      deletedTests: testDocIds.length,
      deletedArchives: archiveDocIds.length
    };
  }

  function normalizeArchiveRegressionResult(value) {
    return value === "pass" || value === "fail" || value === "skipped" ? value : "";
  }

  function mergeArchiveRegressionTests(items) {
    const seen = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = item?.id;
      if (!id) {
        return;
      }
      seen.set(id, { ...seen.get(id), ...item });
    });
    return [...seen.values()];
  }

  function countLocalArchiveRegressionTests(host, stageStart = null, stageEnd = null) {
    const local = readArchiveRegressionTests().filter((item) => (
      (!host || String(item?.host || "") === host)
      && (!Number.isInteger(stageStart) || Number(item?.stage) >= stageStart)
      && (!Number.isInteger(stageEnd) || Number(item?.stage) <= stageEnd)
    ));
    const counts = { pass: 0, fail: 0, skipped: 0, total: local.length };
    local.forEach((item) => {
      if (item?.result === "fail") {
        counts.fail += 1;
      } else if (item?.result === "skipped") {
        counts.skipped += 1;
      } else {
        counts.pass += 1;
      }
    });
    return counts;
  }

  // Sayfali okuma: sadece aktif sekme/sunucu icin 10'ar kayit okur (startAfter cursor ile).
  // 100k kayitta bile sayfa acilisi yalnizca ilk 10 dokumani okur.
  async function loadArchiveRegressionTestsPage(options = {}) {
    const host = typeof options.host === "string" ? options.host : "";
    const result = normalizeArchiveRegressionResult(options.result);
    return loadCollectionPage({
      collectionName: ARCHIVE_TEST_COLLECTION,
      orderField: "testedAt",
      mergeItems: mergeArchiveRegressionTests,
      readLocal: readArchiveRegressionTests,
      writeLocal: writeArchiveRegressionTests,
      pageSize: options.pageSize || DEFAULT_PAGE_SIZE,
      cursor: options.cursor || null,
      sortDirection: "desc",
      filterLocalItems: (items) => (Array.isArray(items) ? items : []).filter((item) => (
        (!host || String(item?.host || "") === host)
        && (!result || String(item?.result || "") === result)
      )),
      buildRemoteQuery: (collection) => {
        let query = collection;
        if (host) {
          query = query.where("host", "==", host);
        }
        if (result) {
          query = query.where("result", "==", result);
        }
        return query.orderBy("testedAt", "desc");
      },
      allowLegacyFirstPageFallback: false
    });
  }

  // Tek bir sekme/sunucu icin count() degerini Firestore REST runAggregationQuery ile okur.
  // Compat SDK'nin .count() destegi guvenilmez oldugu icin (bkz. loadOverviewArchiveAggregateViaRest) REST kullaniyoruz.
  async function runArchiveRegressionCountRest(host, result, stageStart = null, stageEnd = null) {
    if (typeof globalScope.fetch !== "function") {
      return null;
    }
    const clauses = [];
    if (host) {
      clauses.push({ fieldFilter: { field: { fieldPath: "host" }, op: "EQUAL", value: { stringValue: host } } });
    }
    if (result) {
      clauses.push({ fieldFilter: { field: { fieldPath: "result" }, op: "EQUAL", value: { stringValue: result } } });
    }
    if (Number.isInteger(stageStart) && stageStart === stageEnd) {
      clauses.push({ fieldFilter: { field: { fieldPath: "stage" }, op: "EQUAL", value: { integerValue: String(stageStart) } } });
    } else {
      if (Number.isInteger(stageStart)) {
        clauses.push({ fieldFilter: { field: { fieldPath: "stage" }, op: "GREATER_THAN_OR_EQUAL", value: { integerValue: String(stageStart) } } });
      }
      if (Number.isInteger(stageEnd)) {
        clauses.push({ fieldFilter: { field: { fieldPath: "stage" }, op: "LESS_THAN_OR_EQUAL", value: { integerValue: String(stageEnd) } } });
      }
    }
    const structuredQuery = { from: [{ collectionId: ARCHIVE_TEST_COLLECTION }] };
    if (clauses.length === 1) {
      structuredQuery.where = clauses[0];
    } else if (clauses.length > 1) {
      structuredQuery.where = { compositeFilter: { op: "AND", filters: clauses } };
    }
    const body = {
      structuredAggregationQuery: {
        structuredQuery,
        aggregations: [{ alias: "c", count: {} }]
      }
    };
    const response = await globalScope.fetch(
      `${firestoreRestBaseUrl}:runAggregationQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Count REST HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const json = await response.json();
    const row = Array.isArray(json) ? json.find((entry) => entry?.result?.aggregateFields) : null;
    const field = row?.result?.aggregateFields?.c;
    return toAggregateNumber(field?.integerValue ?? field?.doubleValue ?? 0);
  }

  // Sekme sayaclarini aggregation ile okur: 100k kayit ~ birkac okuma birimi, dokuman basina ucret yok.
  async function countArchiveRegressionTests(options = {}) {
    const host = typeof options.host === "string" ? options.host : "";
    const stageValue = Number(options.stage);
    const startValue = Number(options.stageStart);
    const endValue = Number(options.stageEnd);
    const singleStage = Number.isInteger(stageValue) && stageValue >= 0 ? stageValue : null;
    const stageStart = Number.isInteger(startValue) && startValue >= 0 ? startValue : singleStage;
    const stageEnd = Number.isInteger(endValue) && endValue >= 0 ? endValue : singleStage;
    if (typeof globalScope.fetch !== "function") {
      return countLocalArchiveRegressionTests(host, stageStart, stageEnd);
    }
    try {
      const [pass, fail, skipped] = await Promise.all([
        runArchiveRegressionCountRest(host, "pass", stageStart, stageEnd),
        runArchiveRegressionCountRest(host, "fail", stageStart, stageEnd),
        runArchiveRegressionCountRest(host, "skipped", stageStart, stageEnd)
      ]);
      if (pass === null || fail === null || skipped === null) {
        return countLocalArchiveRegressionTests(host, stageStart, stageEnd);
      }
      return { pass, fail, skipped, total: pass + fail + skipped };
    } catch (error) {
      const canUseStageFallback = Number.isInteger(stageStart)
        && Number.isInteger(stageEnd)
        && stageStart < stageEnd
        && stageEnd - stageStart < 300;
      if (canUseStageFallback) {
        try {
          const totals = { pass: 0, fail: 0, skipped: 0, total: 0 };
          const stageNumbers = Array.from({ length: stageEnd - stageStart + 1 }, (_, index) => stageStart + index);
          for (let offset = 0; offset < stageNumbers.length; offset += 10) {
            const rows = await Promise.all(stageNumbers.slice(offset, offset + 10).map(async (stage) => {
              const [pass, fail, skipped] = await Promise.all([
                runArchiveRegressionCountRest(host, "pass", stage, stage),
                runArchiveRegressionCountRest(host, "fail", stage, stage),
                runArchiveRegressionCountRest(host, "skipped", stage, stage)
              ]);
              return { pass, fail, skipped };
            }));
            rows.forEach((row) => {
              totals.pass += row.pass;
              totals.fail += row.fail;
              totals.skipped += row.skipped;
            });
          }
          totals.total = totals.pass + totals.fail + totals.skipped;
          return totals;
        } catch (fallbackError) {
          console.warn("Arsiv test aralik sayimlari okunamadi, cache kullaniliyor.", fallbackError);
        }
      } else {
        console.warn("Arsiv test sayimlari okunamadi, cache kullaniliyor.", error);
      }
      return countLocalArchiveRegressionTests(host, stageStart, stageEnd);
    }
  }

  // TXT indir butonu icin: secili sunucudaki TUM kayitlari okur (kullanici tetikler, sayfa acilisinda degil).
  async function loadAllArchiveRegressionTests(options = {}) {
    const host = typeof options.host === "string" ? options.host : "";
    if (!db) {
      return readArchiveRegressionTests().filter((item) => !host || String(item?.host || "") === host);
    }
    try {
      let query = db.collection(ARCHIVE_TEST_COLLECTION);
      if (host) {
        query = query.where("host", "==", host);
      }
      const snapshot = await query.get();
      const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      writeArchiveRegressionTests(mergeArchiveRegressionTests([...readArchiveRegressionTests(), ...items]));
      return items;
    } catch (error) {
      console.warn("Arsiv test sonuclari (tum) okunamadi, cache kullaniliyor.", error);
      return readArchiveRegressionTests().filter((item) => !host || String(item?.host || "") === host);
    }
  }

  // Disa aktarim icin: tek bir tur (pass/fail/skipped) kayitlari sunucudan okur.
  // stages bos -> tum katlar; tek sorgu (result, testedAt indeksi) + opsiyonel limit.
  // stages dolu -> her kat icin esitlik sorgusu (result==, stage==, host==): bileşik
  // index GEREKMEZ (Firestore zigzag-merge), maliyet eslesen dokuman sayisi kadardir.
  async function loadArchiveRegressionTestsForExport(options = {}) {
    const host = typeof options.host === "string" ? options.host : "";
    const result = normalizeArchiveRegressionResult(options.result);
    const rawLimit = Number(options.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 0;
    const stages = Array.isArray(options.stages)
      ? [...new Set(options.stages.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n >= 0))]
      : [];
    const stageStartValue = Number(options.stageStart);
    const stageEndValue = Number(options.stageEnd);
    const stageStart = Number.isInteger(stageStartValue) && stageStartValue >= 0 ? stageStartValue : null;
    const stageEnd = Number.isInteger(stageEndValue) && stageEndValue >= 0 ? stageEndValue : null;
    const sortDesc = (items) => items.slice().sort((a, b) => String(b?.testedAt || "").localeCompare(String(a?.testedAt || "")));
    const localFallback = () => {
      let items = readArchiveRegressionTests()
        .filter((item) => (!host || String(item?.host || "") === host) && String(item?.result || "") === result);
      if (stages.length) {
        const set = new Set(stages);
        items = items.filter((item) => Number.isInteger(item?.stage) && set.has(item.stage));
      } else if (stageStart !== null || stageEnd !== null) {
        items = items.filter((item) => (
          Number.isInteger(item?.stage)
          && (stageStart === null || item.stage >= stageStart)
          && (stageEnd === null || item.stage <= stageEnd)
        ));
      }
      items = sortDesc(items);
      return limit ? items.slice(0, limit) : items;
    };
    if (!result) {
      return [];
    }
    if (!db) {
      return localFallback();
    }
    try {
      if (stages.length === 0 && (stageStart !== null || stageEnd !== null)) {
        let query = db.collection(ARCHIVE_TEST_COLLECTION).where("result", "==", result);
        if (host) {
          query = query.where("host", "==", host);
        }
        if (stageStart !== null) {
          query = query.where("stage", ">=", stageStart);
        }
        if (stageEnd !== null) {
          query = query.where("stage", "<=", stageEnd);
        }
        const snapshot = await query.get();
        const items = sortDesc(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
        return limit ? items.slice(0, limit) : items;
      }
      if (stages.length === 0) {
        let query = db.collection(ARCHIVE_TEST_COLLECTION).where("result", "==", result);
        if (host) {
          query = query.where("host", "==", host);
        }
        query = query.orderBy("testedAt", "desc");
        if (limit) {
          query = query.limit(limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      }
      const byId = new Map();
      for (const stage of stages) {
        let query = db.collection(ARCHIVE_TEST_COLLECTION)
          .where("result", "==", result)
          .where("stage", "==", stage);
        if (host) {
          query = query.where("host", "==", host);
        }
        const snapshot = await query.get();
        snapshot.docs.forEach((doc) => byId.set(doc.id, { ...doc.data(), id: doc.id }));
      }
      const merged = sortDesc([...byId.values()]);
      return limit ? merged.slice(0, limit) : merged;
    } catch (error) {
      const canUseStageFallback = stages.length === 0
        && stageStart !== null
        && stageEnd !== null
        && stageStart <= stageEnd
        && stageEnd - stageStart < 300;
      if (canUseStageFallback) {
        try {
          const byId = new Map();
          for (let stage = stageStart; stage <= stageEnd; stage += 1) {
            let query = db.collection(ARCHIVE_TEST_COLLECTION)
              .where("result", "==", result)
              .where("stage", "==", stage);
            if (host) {
              query = query.where("host", "==", host);
            }
            const snapshot = await query.get();
            snapshot.docs.forEach((doc) => byId.set(doc.id, { ...doc.data(), id: doc.id }));
          }
          const items = sortDesc([...byId.values()]);
          return limit ? items.slice(0, limit) : items;
        } catch (fallbackError) {
          console.warn("Test sonuclari kat bazinda okunamadi, cache kullaniliyor.", fallbackError);
        }
      } else {
        console.warn("Test sonuclari (export) okunamadi, cache kullaniliyor.", error);
      }
      return localFallback();
    }
  }

  async function loadOverviewArchives() {
    if (!db) {
      return readOverviewArchives();
    }

    try {
      const snapshot = await db.collection(OVERVIEW_ARCHIVE_COLLECTION).get();
      const remoteItems = mergeOverviewArchives(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
      const items = mergeOverviewArchives([...remoteItems, ...readOverviewArchives()]);
      writeOverviewArchives(items);
      return items;
    } catch (error) {
      console.warn("Arsiv kayitlari okunamadi, cache kullaniliyor.", error);
      return readOverviewArchives();
    }
  }

  async function loadOverviewArchivesPage(options = {}) {
    const filters = normalizeOverviewArchiveFilters(options.filters || {});
    const sortDirection = normalizeSortDirection(options.sortDirection);
    return loadCollectionPage({
      collectionName: OVERVIEW_ARCHIVE_COLLECTION,
      orderField: "savedAt",
      mergeItems: mergeOverviewArchives,
      readLocal: readOverviewArchives,
      writeLocal: writeOverviewArchives,
      pageSize: options.pageSize,
      cursor: options.cursor || null,
      sortDirection,
      filterLocalItems: (items) => filterOverviewArchiveItems(items, filters),
      buildRemoteQuery: (collection) => applyOverviewArchiveFiltersToQuery(collection, filters, {
        includeOrderBy: true,
        sortDirection
      }),
      allowLegacyFirstPageFallback: isOverviewArchiveFilterEmpty(filters),
      preferCache: Boolean(options.preferCache),
      cacheMaxAgeMs: options.cacheMaxAgeMs,
      readMeta: readOverviewArchiveCacheMeta
    });
  }

  // Tek okumayla "koleksiyonda bir sey degisti mi?" sinyali: en yeni updatedAt.
  // create/loot-patch/edit hepsi updatedAt'i tazeler; degisim olmadiysa ayni doner.
  async function loadOverviewArchiveChangeToken() {
    if (!db) {
      return null;
    }
    try {
      const snapshot = await db.collection(OVERVIEW_ARCHIVE_COLLECTION)
        .orderBy("updatedAt", "desc")
        .limit(1)
        .get();
      const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
      if (docs.length === 0) {
        return { newestUpdatedAt: "", empty: true };
      }
      const data = typeof docs[0]?.data === "function" ? docs[0].data() : {};
      return {
        newestUpdatedAt: String(data?.updatedAt || data?.savedAt || ""),
        empty: false
      };
    } catch (error) {
      console.warn("Arsiv degisim tokeni okunamadi.", error);
      return null;
    }
  }

  async function saveOverviewArchive(item) {
    const docId = typeof item?.id === "string" && item.id.trim() ? item.id.trim() : buildOverviewArchiveDocId();
    const payload = sanitizeOverviewArchive(item);
    const validationErrors = validateOverviewArchivePayload(payload, docId);

    if (validationErrors.length > 0) {
      throw new Error(`Arsiv verisi kurallara uymuyor:\n${validationErrors.map((entry) => `- ${entry}`).join("\n")}`);
    }

    if (!db) {
      const next = mergeOverviewArchives([...readOverviewArchives(), { ...payload, id: docId }]);
      writeOverviewArchives(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }

    try {
      await db.collection(OVERVIEW_ARCHIVE_COLLECTION).doc(docId).set(payload);
      const next = mergeOverviewArchives([...readOverviewArchives(), { ...payload, id: docId }]);
      writeOverviewArchives(next);
      return { ...payload, id: docId };
    } catch (error) {
      if (error?.code === "permission-denied") {
        const response = await createOverviewArchiveViaRest(docId, payload);
        const next = mergeOverviewArchives([...readOverviewArchives(), { ...payload, id: docId }]);
        writeOverviewArchives(next);
        return { ...payload, id: docId, savedVia: response ? "rest-fallback" : "rest-fallback" };
      }
      console.warn("Arsiv Firestore kaydi basarisiz, yerel cache kullaniliyor.", error);
      const next = mergeOverviewArchives([...readOverviewArchives(), { ...payload, id: docId }]);
      writeOverviewArchives(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }
  }

  async function updateOverviewArchive(item) {
    const docId = typeof item?.id === "string" ? item.id.trim() : "";
    if (!docId) {
      throw new Error("Guncellenecek arsiv kaydi icin id gerekli.");
    }

    const payload = sanitizeOverviewArchive(item);
    const validationErrors = validateOverviewArchivePayload(payload, docId);
    if (validationErrors.length > 0) {
      throw new Error(`Arsiv verisi kurallara uymuyor:\n${validationErrors.map((entry) => `- ${entry}`).join("\n")}`);
    }

    if (!db) {
      const next = mergeOverviewArchives([...readOverviewArchives().filter((candidate) => candidate.id !== docId), { ...payload, id: docId }]);
      writeOverviewArchives(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }

    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser || normalizeEmail(currentUser.email) !== ADMIN_EMAIL) {
      throw new Error("Arsiv duzenlemek icin admin girisi zorunludur.");
    }

    await db.collection(OVERVIEW_ARCHIVE_COLLECTION).doc(docId).set(payload);
    const next = mergeOverviewArchives([...readOverviewArchives().filter((candidate) => candidate.id !== docId), { ...payload, id: docId }]);
    writeOverviewArchives(next);
    return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
  }

  async function deleteOverviewArchive(id) {
    const docId = typeof id === "string" ? id.trim() : "";
    if (!docId) {
      throw new Error("Silinecek arsiv kaydi icin id gerekli.");
    }

    const nextLocal = readOverviewArchives().filter((candidate) => candidate.id !== docId);
    if (!db) {
      writeOverviewArchives(nextLocal);
      return;
    }

    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser || normalizeEmail(currentUser.email) !== ADMIN_EMAIL) {
      throw new Error("Arsiv silmek icin admin girisi zorunludur.");
    }

    await db.collection(OVERVIEW_ARCHIVE_COLLECTION).doc(docId).delete();
    writeOverviewArchives(nextLocal);
  }

  async function deleteOverviewArchives(ids) {
    const docIds = [...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )];
    if (docIds.length === 0) {
      return { deleted: 0 };
    }

    const idSet = new Set(docIds);
    const nextLocal = readOverviewArchives().filter((candidate) => !idSet.has(candidate.id));
    if (!db) {
      writeOverviewArchives(nextLocal);
      return { deleted: docIds.length };
    }

    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser || normalizeEmail(currentUser.email) !== ADMIN_EMAIL) {
      throw new Error("Arsiv silmek icin admin girisi zorunludur.");
    }

    // Firestore batch limiti 500; guvenli olmasi icin 400'luk parcalara bol.
    const collection = db.collection(OVERVIEW_ARCHIVE_COLLECTION);
    const chunkSize = 400;
    for (let start = 0; start < docIds.length; start += chunkSize) {
      const batch = db.batch();
      docIds.slice(start, start + chunkSize).forEach((docId) => {
        batch.delete(collection.doc(docId));
      });
      await batch.commit();
    }

    writeOverviewArchives(nextLocal);
    return { deleted: docIds.length };
  }

  function getCurrentUser() {
    return auth ? auth.currentUser : null;
  }

  function isAdminSignedIn() {
    return isAdminUser(getCurrentUser());
  }

  function onAdminStateChanged(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    if (!auth) {
      callback(false, null);
      return () => {};
    }
    return auth.onAuthStateChanged((user) => {
      callback(isAdminUser(user), user);
    });
  }

  async function signInAdmin(email, password) {
    if (!auth) {
      throw new Error("Admin girisi hazir degil. Firebase Console > Authentication > Sign-in method > Email/Password acilmali.");
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail !== ADMIN_EMAIL) {
      throw new Error("Bu panel sadece tanimli admin hesabi ile kullanilabilir.");
    }
    const rawPassword = String(password || "");
    if (!rawPassword.trim()) {
      throw new Error("Admin girisi icin Firebase Auth sifresini girmelisin.");
    }

    try {
      const credential = await auth.signInWithEmailAndPassword(normalizedEmail, rawPassword);
      if (!isAdminUser(credential.user)) {
        await auth.signOut();
        throw new Error("Bu hesap admin yetkisine sahip degil.");
      }
      return credential.user;
    } catch (error) {
      if (error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password" || error?.code === "auth/user-not-found") {
        throw new Error("Firebase Auth girisi basarisiz. Bu alan site giris sifresi degil, admin Firebase hesabinin sifresi olmali.");
      }
      if (error?.code === "auth/too-many-requests") {
        throw new Error("Cok fazla basarisiz giris denemesi oldu. Biraz bekleyip tekrar dene.");
      }
      throw error;
    }
  }

  async function signOutAdmin() {
    if (!auth) {
      return;
    }
    await auth.signOut();
  }

  async function verifyAdminPassword(password) {
    if (!auth) {
      throw new Error("Admin dogrulamasi hazir degil.");
    }
    const user = getCurrentUser();
    if (!isAdminUser(user)) {
      throw new Error("Bu islem icin aktif admin oturumu gerekli.");
    }
    const rawPassword = String(password || "");
    if (!rawPassword.trim()) {
      throw new Error("Bu islem icin sifre tekrar girilmeli.");
    }
    const provider = globalScope.firebase?.auth?.EmailAuthProvider;
    if (!provider || typeof provider.credential !== "function") {
      throw new Error("Admin dogrulamasi kullanilamiyor.");
    }
    const credential = provider.credential(normalizeEmail(user.email), rawPassword);
    try {
      await user.reauthenticateWithCredential(credential);
      return true;
    } catch (error) {
      if (error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password") {
        throw new Error("Tekrar girilen Firebase Auth sifresi hatali.");
      }
      throw error;
    }
  }

  globalScope.BTFirebase = {
    ADMIN_EMAIL,
    getCurrentUser,
    isAdminSignedIn,
    onAdminStateChanged,
    signInAdmin,
    signOutAdmin,
    verifyAdminPassword,
    buildApprovedOptimizerDocId: buildOptimizerDocId,
    buildApprovedSimulationDocId: buildSimulationDocId,
    loadApprovedStrategies,
    loadApprovedStrategiesPage,
    findApprovedStrategyByDocId,
    saveApprovedStrategy,
    deleteApprovedStrategy,
    clearApprovedStrategies,
    loadWrongReports,
    loadWrongReportsPage,
    findWrongReportsByMatchSignature,
    saveWrongReport,
    deleteWrongReport,
    clearWrongReports,
    loadFavoriteStrategies,
    loadFavoriteStrategiesPage,
    findFavoriteStrategiesByEnemySignature,
    saveFavoriteStrategy,
    deleteFavoriteStrategy,
    clearFavoriteStrategies,
    loadOverviewArchives,
    loadOverviewArchivesPage,
    loadOverviewArchiveChangeToken,
    loadOverviewArchiveAggregate,
    loadOverviewArchiveLevelBounds,
    getOverviewArchiveCacheInfo,
    saveOverviewArchive,
    updateOverviewArchive,
    deleteOverviewArchive,
    deleteOverviewArchives,
    loadArchiveRegressionTests,
    loadArchiveRegressionTestsPage,
    countArchiveRegressionTests,
    loadAllArchiveRegressionTests,
    loadArchiveRegressionTestsForExport,
    saveArchiveRegressionTest,
    getArchiveRegressionTestedSignatures,
    buildArchiveRegressionTestDocId,
    deleteSkippedArchiveRegressionTests,
    clearArchiveRegressionTests
  };
})(window);
