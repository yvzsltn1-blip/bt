"use strict";

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const REGION = "europe-west1";
const ARCHIVE_COLLECTION = "overviewArchives";
const SNAPSHOT_BUCKET = "bt-analiz.firebasestorage.app";
const SNAPSHOT_ROOT = "archive-snapshots";
const MANIFEST_PATH = `${SNAPSHOT_ROOT}/manifest.json`;
const ITEM_INDEX_PATH = `${SNAPSHOT_ROOT}/item-index.json`;
const SNAPSHOT_TOKEN = "fe99d2c6-71b5-4f58-9c16-7f7f6e9f5b6d";
const PART_SIZE = 250;
const SNAPSHOT_FIELDS = [
  "savedAt",
  "updatedAt",
  "lootGoldValue",
  "expValue",
  "armyPowerText",
  "levelText",
  "enemyRosterText",
  "allyRosterText",
  "fallenUnitsText",
  "reviveStoneText",
  "sourceType",
  "host",
  "pageUrl",
  "pageTitle"
];

function pickSnapshotFields(data = {}) {
  return SNAPSHOT_FIELDS.reduce((result, fieldName) => {
    if (Object.prototype.hasOwnProperty.call(data, fieldName)) {
      result[fieldName] = data[fieldName];
    }
    return result;
  }, {});
}

function normalizeSnapshotItem(item = {}) {
  return {
    id: String(item?.id || ""),
    ...pickSnapshotFields(item)
  };
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function createEmptySummary() {
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

function cloneSummary(summary = {}) {
  return JSON.parse(JSON.stringify({
    ...createEmptySummary(),
    ...summary,
    byKat: summary.byKat || {},
    byDay: summary.byDay || {},
    byHour: summary.byHour || {}
  }));
}

function extractKat(value) {
  const text = String(value || "").trim();
  const slashMatch = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    const total = Number.parseInt(slashMatch[2], 10);
    return Number.isFinite(total) ? String(Math.max(0, Math.floor((total - 10) / 10))) : "";
  }
  const digits = text.replace(/[^\d]/g, "");
  return digits ? String(Number.parseInt(digits, 10)) : "";
}

function getLevelNumber(item) {
  const match = String(item?.levelText || "").match(/\d+/);
  if (!match) {
    return 0;
  }
  const numeric = Number.parseInt(match[0], 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildItemRef(item) {
  return {
    id: item.id,
    savedAt: String(item.savedAt || ""),
    levelText: String(item.levelText || ""),
    level: getLevelNumber(item)
  };
}

function updateBounds(summary, item) {
  const ref = buildItemRef(item);
  if (!ref.savedAt || ref.level <= 0) {
    return;
  }
  if (!summary.oldest || ref.savedAt < String(summary.oldest.savedAt || "")) {
    summary.oldest = ref;
  }
  if (!summary.newest || ref.savedAt > String(summary.newest.savedAt || "")) {
    summary.newest = ref;
  }
}

function addToSummary(summary, item) {
  summary.count += 1;
  summary.totalExp += toNumber(item.expValue);
  summary.totalLoot += toNumber(item.lootGoldValue);
  updateBounds(summary, item);
}

function getBucketSummary(map, key) {
  if (!key) {
    return null;
  }
  if (!map[key]) {
    map[key] = createEmptySummary();
  }
  return map[key];
}

function buildSummary(items = []) {
  const summary = createEmptySummary();
  items.forEach((item) => {
    addToSummary(summary, item);
    const kat = extractKat(item.armyPowerText);
    const day = String(item.savedAt || "").slice(0, 10);
    const hour = String(item.savedAt || "").slice(0, 13);
    const katSummary = getBucketSummary(summary.byKat, kat);
    const daySummary = getBucketSummary(summary.byDay, day);
    const hourSummary = getBucketSummary(summary.byHour, hour);
    if (katSummary) addToSummary(katSummary, item);
    if (daySummary) addToSummary(daySummary, item);
    if (hourSummary) addToSummary(hourSummary, item);
  });
  return summary;
}

function mergeSummary(left = {}, right = {}) {
  const result = cloneSummary(left);
  const add = cloneSummary(right);
  result.count += add.count;
  result.totalExp += add.totalExp;
  result.totalLoot += add.totalLoot;
  [add.oldest, add.newest].filter(Boolean).forEach((ref) => updateBounds(result, ref));
  ["byKat", "byDay", "byHour"].forEach((groupName) => {
    Object.entries(add[groupName] || {}).forEach(([key, value]) => {
      result[groupName][key] = mergeSummary(result[groupName][key], value);
    });
  });
  return result;
}

function normalizeServer(value) {
  const match = String(value || "").trim().toLowerCase().match(/^s(\d+)(?:-|\.|$)/);
  return match ? `s${match[1]}` : "unknown";
}

function createEmptyManifest() {
  return {
    version: 2,
    generatedAt: "",
    reason: "init",
    source: ARCHIVE_COLLECTION,
    partSize: PART_SIZE,
    count: 0,
    servers: {},
    summary: createEmptySummary()
  };
}

function normalizeManifest(parsed = {}) {
  return {
    ...createEmptyManifest(),
    version: 2,
    generatedAt: String(parsed?.generatedAt || ""),
    reason: String(parsed?.reason || ""),
    count: Number(parsed?.count || 0),
    servers: parsed?.servers && typeof parsed.servers === "object" ? parsed.servers : {},
    summary: cloneSummary(parsed?.summary)
  };
}

function normalizeItemIndex(parsed = {}) {
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return Object.entries(parsed).reduce((result, [archiveId, value]) => {
    if (!archiveId || !value || typeof value !== "object") {
      return result;
    }
    const server = String(value.server || "").trim();
    const path = String(value.path || "").trim();
    if (!server || !path) {
      return result;
    }
    result[archiveId] = { server, path };
    return result;
  }, {});
}

async function readJsonFile(file, fallback) {
  try {
    const [buffer] = await file.download();
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    if (error?.code === 404 || error?.message?.includes("No such object")) {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(file, payload) {
  await file.save(JSON.stringify(payload), {
    resumable: false,
    metadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60",
      metadata: {
        firebaseStorageDownloadTokens: SNAPSHOT_TOKEN
      }
    }
  });
}

function getServerEntry(manifest, server) {
  if (!manifest.servers[server]) {
    manifest.servers[server] = {
      count: 0,
      parts: [],
      summary: createEmptySummary()
    };
  }
  return manifest.servers[server];
}

function buildPartPath(server, partNumber) {
  return `${SNAPSHOT_ROOT}/servers/${server}/part-${String(partNumber).padStart(4, "0")}.json`;
}

async function readPart(bucket, path, server, partNumber) {
  const parsed = await readJsonFile(bucket.file(path), {
    version: 2,
    server,
    part: partNumber,
    count: 0,
    items: []
  });
  return {
    version: 2,
    server,
    part: Number(parsed?.part || partNumber),
    count: Number(parsed?.count || 0),
    rollupBefore: cloneSummary(parsed?.rollupBefore),
    summary: cloneSummary(parsed?.summary),
    items: Array.isArray(parsed?.items)
      ? parsed.items.map(normalizeSnapshotItem).filter((item) => item.id)
      : []
  };
}

async function writePart(bucket, path, partPayload) {
  const payload = {
    ...partPayload,
    count: partPayload.items.length,
    summary: buildSummary(partPayload.items),
    generatedAt: new Date().toISOString()
  };
  await writeJsonFile(bucket.file(path), payload);
  return payload;
}

async function removeItemFromManifestPart(bucket, itemIndex, manifest, archiveId, location) {
  if (!location?.path || !location?.server) {
    return false;
  }
  const serverEntry = getServerEntry(manifest, location.server);
  const partMeta = serverEntry.parts.find((part) => part.path === location.path);
  const partNumber = Number(partMeta?.part || 1);
  const part = await readPart(bucket, location.path, location.server, partNumber);
  const nextItems = part.items.filter((item) => item.id !== archiveId);
  if (nextItems.length === part.items.length) {
    delete itemIndex[archiveId];
    return false;
  }

  const nextPart = await writePart(bucket, location.path, {
    ...part,
    items: nextItems
  });
  if (partMeta) {
    partMeta.count = nextPart.count;
  }
  serverEntry.count = Math.max(0, Number(serverEntry.count || 0) - 1);
  delete itemIndex[archiveId];
  return true;
}

async function rebuildServerRollups(bucket, manifest, server) {
  const serverEntry = getServerEntry(manifest, server);
  let rollup = createEmptySummary();
  let serverCount = 0;
  for (const partMeta of serverEntry.parts) {
    const part = await readPart(bucket, partMeta.path, server, partMeta.part);
    const nextPart = await writePart(bucket, partMeta.path, {
      ...part,
      rollupBefore: rollup
    });
    partMeta.count = nextPart.count;
    partMeta.summary = nextPart.summary;
    rollup = mergeSummary(rollup, nextPart.summary);
    serverCount += nextPart.count;
  }
  serverEntry.count = serverCount;
  serverEntry.summary = rollup;
}

async function addItemToManifestPart(bucket, itemIndex, manifest, item) {
  const server = normalizeServer(item.host);
  const serverEntry = getServerEntry(manifest, server);
  let partMeta = serverEntry.parts[serverEntry.parts.length - 1] || null;
  if (!partMeta || Number(partMeta.count || 0) >= PART_SIZE) {
    const partNumber = serverEntry.parts.length + 1;
    partMeta = {
      part: partNumber,
      path: buildPartPath(server, partNumber),
      count: 0,
      summary: createEmptySummary()
    };
    serverEntry.parts.push(partMeta);
  }

  const part = await readPart(bucket, partMeta.path, server, partMeta.part);
  const items = part.items.filter((candidate) => candidate.id !== item.id);
  items.push(item);
  items.sort((left, right) => String(right?.savedAt || "").localeCompare(String(left?.savedAt || "")));
  const nextPart = await writePart(bucket, partMeta.path, {
    ...part,
    rollupBefore: part.rollupBefore || createEmptySummary(),
    items
  });

  partMeta.count = nextPart.count;
  partMeta.summary = nextPart.summary;
  serverEntry.count = Number(serverEntry.count || 0) + 1;
  itemIndex[item.id] = {
    server,
    path: partMeta.path
  };
  await rebuildServerRollups(bucket, manifest, server);
}

function refreshManifestCounts(manifest) {
  let total = 0;
  Object.values(manifest.servers).forEach((serverEntry) => {
    serverEntry.parts = (serverEntry.parts || []).filter((part) => Number(part.count || 0) > 0);
    serverEntry.count = serverEntry.parts.reduce((sum, part) => sum + Number(part.count || 0), 0);
    total += serverEntry.count;
  });
  manifest.count = total;
  manifest.summary = Object.values(manifest.servers).reduce(
    (summary, serverEntry) => mergeSummary(summary, serverEntry.summary),
    createEmptySummary()
  );
}

async function applyArchiveSnapshotChange(event) {
  const archiveId = event.params.archiveId;
  const beforeExists = Boolean(event.data?.before?.exists);
  const afterExists = Boolean(event.data?.after?.exists);
  const bucket = admin.storage().bucket(SNAPSHOT_BUCKET);
  const manifestFile = bucket.file(MANIFEST_PATH);
  const itemIndexFile = bucket.file(ITEM_INDEX_PATH);
  const rawManifest = await readJsonFile(manifestFile, createEmptyManifest());
  const manifest = normalizeManifest(rawManifest);
  const itemIndex = normalizeItemIndex(await readJsonFile(itemIndexFile, rawManifest?.itemIndex || {}));
  let reason = "delete";

  const knownLocation = itemIndex[archiveId];
  if (knownLocation) {
    const removed = await removeItemFromManifestPart(bucket, itemIndex, manifest, archiveId, knownLocation);
    if (removed) {
      await rebuildServerRollups(bucket, manifest, knownLocation.server);
    }
  }

  if (afterExists) {
    const nextItem = {
      id: archiveId,
      ...pickSnapshotFields(event.data.after.data())
    };
    await addItemToManifestPart(bucket, itemIndex, manifest, nextItem);
    reason = beforeExists ? "update" : "create";
  }

  refreshManifestCounts(manifest);
  manifest.generatedAt = new Date().toISOString();
  manifest.reason = reason;

  await writeJsonFile(manifestFile, manifest);
  await writeJsonFile(itemIndexFile, itemIndex);

  logger.info("Archive snapshot part updated", {
    reason,
    archiveId,
    count: manifest.count
  });
}

exports.refreshArchiveSnapshotOnWrite = onDocumentWritten(
  {
    region: REGION,
    document: `${ARCHIVE_COLLECTION}/{archiveId}`,
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
    concurrency: 1
  },
  applyArchiveSnapshotChange
);
