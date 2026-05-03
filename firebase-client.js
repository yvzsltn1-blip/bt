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
  const LEGACY_KEY = "btAnalyssApprovedStrategies";
  const MIGRATION_KEY = "btAnalyssApprovedStrategiesMigrated";
  const COLLECTION = "approvedStrategies";
  const WRONG_COLLECTION = "wrongReports";
  const FAVORITE_COLLECTION = "favoriteStrategies";
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
    localStorage.setItem(key, JSON.stringify(items));
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
        "probabilityBasisPoints", "summaryText", "logText", "usedCapacity",
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
    loadApprovedStrategies,
    saveApprovedStrategy,
    deleteApprovedStrategy,
    clearApprovedStrategies,
    loadWrongReports,
    saveWrongReport,
    deleteWrongReport,
    clearWrongReports,
    loadFavoriteStrategies,
    saveFavoriteStrategy,
    deleteFavoriteStrategy,
    clearFavoriteStrategies
  };
})(window);
