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
  const LEGACY_KEY = "btAnalyssApprovedStrategies";
  const MIGRATION_KEY = "btAnalyssApprovedStrategiesMigrated";
  const COLLECTION = "approvedStrategies";
  const WRONG_COLLECTION = "wrongReports";
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

  if (hasFirebaseCompat && !globalScope.firebase.apps.length) {
    globalScope.firebase.initializeApp(firebaseConfig);
  }

  const db = hasFirebaseCompat ? globalScope.firebase.firestore() : null;
  const auth = hasFirebaseAuth ? globalScope.firebase.auth() : null;

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

  function buildStrategyId(item) {
    if (!item || !Number.isFinite(Number(item.stage)) || !item.enemySignature) {
      return "";
    }
    return buildDocId(item.stage, item.enemySignature);
  }

  function mergeStrategies(items) {
    const merged = new Map();
    items.forEach((item) => {
      const id = item.id || buildStrategyId(item);
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

  function sanitizeForSave(item) {
    const payload = {
      ...item,
      savedAt: item.savedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    delete payload.id;
    return payload;
  }

  function clampInt(value, maxValue) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.min(parsed, maxValue);
  }

  function trimText(value, maxLen) {
    const text = typeof value === "string" ? value : String(value ?? "");
    return text.length > maxLen ? text.slice(0, maxLen) : text;
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
    const payload = {
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

    if (Number.isInteger(item?.stage) && item.stage >= 1 && item.stage <= 9999) {
      payload.stage = item.stage;
    }
    if (item?.mode === "balanced" || item?.mode === "fast" || item?.mode === "deep") {
      payload.mode = item.mode;
    }
    if (item?.objective === "min_loss" || item?.objective === "min_army") {
      payload.objective = item.objective;
    }
    if (typeof item?.diversityMode === "boolean") {
      payload.diversityMode = item.diversityMode;
    }
    if (typeof item?.stoneMode === "boolean") {
      payload.stoneMode = item.stoneMode;
    }
    if (item?.modeLabel) {
      payload.modeLabel = trimText(item.modeLabel, 80);
    }
    if (item?.recommendationCounts === null) {
      payload.recommendationCounts = null;
    } else if (item?.recommendationCounts) {
      payload.recommendationCounts = sanitizeCountMap(item.recommendationCounts, ALLY_COUNT_KEYS);
    }
    if (typeof item?.possible === "boolean") {
      payload.possible = item.possible;
    }

    const usedPoints = sanitizeOptionalInt(item?.usedPoints, 99999);
    if (usedPoints !== null) {
      payload.usedPoints = usedPoints;
    }

    const lostBlood = sanitizeOptionalInt(item?.lostBlood, 999999);
    if (lostBlood !== null) {
      payload.lostBlood = lostBlood;
    }

    const winRate = sanitizeOptionalInt(item?.winRate, 100);
    if (winRate !== null) {
      payload.winRate = winRate;
    }

    const pointLimit = sanitizeOptionalInt(item?.pointLimit, 99999);
    if (pointLimit !== null) {
      payload.pointLimit = pointLimit;
    }

    return payload;
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
      const id = item.id || buildStrategyId(item);
      if (!id) {
        return;
      }
      batch.set(db.collection(COLLECTION).doc(id), sanitizeForSave(item), { merge: true });
    });
    await batch.commit();
    writeMigrationFlag();
  }

  function buildDocId(stage, enemySignature) {
    let hash = 2166136261;
    const text = `${stage}:${enemySignature}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `stage_${stage}_${(hash >>> 0).toString(16)}`;
  }

  async function loadApprovedStrategies() {
    if (!db) {
      return readLocalStrategies();
    }

    try {
      await migrateLocalStrategies();
      const snapshot = await db.collection(COLLECTION).get();
      const items = mergeStrategies(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
      writeCache(items);
      return items;
    } catch (error) {
      console.warn("Firestore okunamadi, cache kullaniliyor.", error);
      return readLocalStrategies();
    }
  }

  async function saveApprovedStrategy(item) {
    const docId = buildDocId(item.stage, item.enemySignature);
    const payload = sanitizeForSave(item);

    if (!db) {
      const next = mergeStrategies([...readLocalStrategies(), { ...payload, id: docId }]);
      writeCache(next);
      return next.find((candidate) => candidate.id === docId) || { ...payload, id: docId };
    }

    await db.collection(COLLECTION).doc(docId).set(payload, { merge: true });
    return { ...payload, id: docId };
  }

  async function deleteApprovedStrategy(id) {
    if (!db) {
      writeCache(readLocalStrategies().filter((candidate) => candidate.id !== id));
      return;
    }
    await db.collection(COLLECTION).doc(id).delete();
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

  async function saveWrongReport(item) {
    const docId = `wrong_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const payload = sanitizeWrongReport(item);

    if (!db) {
      const next = [{ ...payload, id: docId }, ...readWrongReports()];
      writeWrongReports(next);
      return next[0];
    }

    await db.collection(WRONG_COLLECTION).doc(docId).set(payload);
    return { ...payload, id: docId };
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

    const credential = await auth.signInWithEmailAndPassword(normalizedEmail, String(password || ""));
    if (!isAdminUser(credential.user)) {
      await auth.signOut();
      throw new Error("Bu hesap admin yetkisine sahip degil.");
    }

    return credential.user;
  }

  async function signOutAdmin() {
    if (!auth) {
      return;
    }
    await auth.signOut();
  }

  globalScope.BTFirebase = {
    ADMIN_EMAIL,
    getCurrentUser,
    isAdminSignedIn,
    onAdminStateChanged,
    signInAdmin,
    signOutAdmin,
    loadApprovedStrategies,
    saveApprovedStrategy,
    deleteApprovedStrategy,
    clearApprovedStrategies,
    loadWrongReports,
    saveWrongReport,
    deleteWrongReport,
    clearWrongReports
  };
})(window);
