"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const TOKEN = "fe99d2c6-71b5-4f58-9c16-7f7f6e9f5b6d";
const BUCKET = "bt-analiz.firebasestorage.app";
const BASE_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;
const PART_SIZE = 250;
const ROOT = "C:\\tmp\\archive-snapshot-parts250-node";

function snapshotUrl(objectPath) {
  return `${BASE_URL}${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(TOKEN)}`;
}

function emptySummary() {
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

function clone(value) {
  return JSON.parse(JSON.stringify(value || emptySummary()));
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function levelOf(item) {
  const match = String(item?.levelText || "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function itemRef(item) {
  return {
    id: String(item?.id || ""),
    savedAt: String(item?.savedAt || ""),
    levelText: String(item?.levelText || ""),
    level: levelOf(item)
  };
}

function updateBounds(summary, item) {
  const ref = itemRef(item);
  if (!ref.savedAt || ref.level <= 0) return;
  if (!summary.oldest || ref.savedAt < String(summary.oldest.savedAt || "")) summary.oldest = ref;
  if (!summary.newest || ref.savedAt > String(summary.newest.savedAt || "")) summary.newest = ref;
}

function addItem(summary, item) {
  summary.count += 1;
  summary.totalExp += number(item?.expValue);
  summary.totalLoot += number(item?.lootGoldValue);
  updateBounds(summary, item);
}

function katOf(item) {
  const text = String(item?.armyPowerText || "").trim();
  const slash = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slash) return String(Math.max(0, Math.floor((Number.parseInt(slash[2], 10) - 10) / 10)));
  const digits = text.replace(/[^\d]/g, "");
  return digits ? String(Number.parseInt(digits, 10)) : "";
}

function bucket(map, key) {
  if (!key) return null;
  if (!map[key]) map[key] = emptySummary();
  return map[key];
}

function buildSummary(items) {
  const summary = emptySummary();
  for (const item of items) {
    addItem(summary, item);
    const day = String(item?.savedAt || "").slice(0, 10);
    const hour = String(item?.savedAt || "").slice(0, 13);
    const katSummary = bucket(summary.byKat, katOf(item));
    const daySummary = bucket(summary.byDay, day);
    const hourSummary = bucket(summary.byHour, hour);
    if (katSummary) addItem(katSummary, item);
    if (daySummary) addItem(daySummary, item);
    if (hourSummary) addItem(hourSummary, item);
  }
  return summary;
}

function mergeSummary(left, right) {
  if (!left) return clone(right);
  if (!right) return clone(left);
  const result = clone(left);
  result.count += number(right.count);
  result.totalExp += number(right.totalExp);
  result.totalLoot += number(right.totalLoot);
  for (const ref of [right.oldest, right.newest].filter(Boolean)) {
    if (!result.oldest || String(ref.savedAt || "") < String(result.oldest.savedAt || "")) result.oldest = ref;
    if (!result.newest || String(ref.savedAt || "") > String(result.newest.savedAt || "")) result.newest = ref;
  }
  for (const group of ["byKat", "byDay", "byHour"]) {
    for (const [key, value] of Object.entries(right[group] || {})) {
      result[group][key] = mergeSummary(result[group][key], value);
    }
  }
  return result;
}

function serverOf(item) {
  const match = String(item?.host || "").trim().toLowerCase().match(/^s(\d+)(?:-|\.|$)/);
  return match ? `s${match[1]}` : "unknown";
}

function upload(localPath, objectPath) {
  execFileSync(
    `gcloud.cmd storage cp "${localPath}" "gs://${BUCKET}/${objectPath}" --content-type="application/json; charset=utf-8" --cache-control="public, max-age=60" --custom-metadata="firebaseStorageDownloadTokens=${TOKEN}"`,
    { stdio: "inherit", shell: true }
  );
}

async function main() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  const latest = await fetch(snapshotUrl("archive-snapshots/latest.json")).then((res) => res.json());
  const generatedAt = new Date().toISOString();
  const manifest = {
    version: 2,
    generatedAt,
    reason: "partition-rollup-migration",
    source: "overviewArchives",
    partSize: PART_SIZE,
    count: 0,
    servers: {},
    summary: emptySummary()
  };
  const itemIndex = {};

  const groups = new Map();
  for (const item of latest.items || []) {
    const server = serverOf(item);
    if (!groups.has(server)) groups.set(server, []);
    groups.get(server).push(item);
  }

  for (const [server, rawItems] of groups.entries()) {
    const items = rawItems.sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
    let rollup = emptySummary();
    const parts = [];
    for (let index = 0; index < items.length; index += PART_SIZE) {
      const partNumber = Math.floor(index / PART_SIZE) + 1;
      const partItems = items
        .slice(index, index + PART_SIZE)
        .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
      const summary = buildSummary(partItems);
      const objectPath = `archive-snapshots/servers/${server}/part-${String(partNumber).padStart(4, "0")}.json`;
      const localDir = path.join(ROOT, "servers", server);
      fs.mkdirSync(localDir, { recursive: true });
      const localPath = path.join(localDir, `part-${String(partNumber).padStart(4, "0")}.json`);
      fs.writeFileSync(localPath, JSON.stringify({
        version: 2,
        generatedAt,
        server,
        part: partNumber,
        count: partItems.length,
        rollupBefore: rollup,
        summary,
        items: partItems
      }));
      upload(localPath, objectPath);
      parts.push({ part: partNumber, path: objectPath, count: partItems.length, summary });
      for (const item of partItems) itemIndex[item.id] = { server, path: objectPath };
      rollup = mergeSummary(rollup, summary);
    }
    manifest.servers[server] = { count: items.length, parts, summary: rollup };
    manifest.count += items.length;
    manifest.summary = mergeSummary(manifest.summary, rollup);
  }

  const manifestPath = path.join(ROOT, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  upload(manifestPath, "archive-snapshots/manifest.json");
  const itemIndexPath = path.join(ROOT, "item-index.json");
  fs.writeFileSync(itemIndexPath, JSON.stringify(itemIndex));
  upload(itemIndexPath, "archive-snapshots/item-index.json");
  console.log(`count=${manifest.count}; servers=${Object.keys(manifest.servers).join(",")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
