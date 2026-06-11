"use strict";
// Tum arsivi verilen roundingMode ile kosar. Kullanim: node mode-harness.js <mode>
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
for (const f of ["battle-core.js", "simulat.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), context, { filename: f });
}
const core = context.window.BattleCore;

function parseCountsBlock(text, prefix, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(text)) !== null) counts[keys[Number(m[1]) - 1]] = Number(m[2]);
  return counts;
}
function parseNumber(t) { return Number(String(t).replace(/\./g, "").trim()); }
function parseLosses(text) {
  const losses = Object.fromEntries(ALLY_KEYS.map((k) => [k, 0]));
  if (!text || text.trim() === "-") return losses;
  const re = /\(T(\d)\)\s*x(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) losses[ALLY_KEYS[Number(m[1]) - 1]] = Number(m[2]);
  return losses;
}
function parseFile(filePath, kind) {
  const text = fs.readFileSync(filePath, "utf8");
  const records = [];
  for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
    const head = block.match(/^#(\d+) \[(DOGRU|YANLIS)\] (\d+)\. Kat/);
    if (!head) continue;
    records.push({
      kind, num: Number(head[1]), stage: Number(head[3]),
      enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
      allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS),
      expectedWinner: block.match(/Gerceklesen sonuc:\s*(\S+)/)[1].startsWith("Galibiyet") ? "ally" : "enemy",
      expectedBlood: parseNumber(block.match(/Gerceklesen kayip:\s*([\d.]+)/)[1]),
      expectedLosses: parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1])
    });
  }
  return records;
}
const records = [];
for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt"))) {
  records.push(...parseFile(path.join(DATA_DIR, f), f.includes("-fail-") ? "fail" : "pass"));
}
function matches(rec, result) {
  if (result.winner !== rec.expectedWinner) return false;
  if (Number(result.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(result.allyLosses[k] || 0) === rec.expectedLosses[k]);
}
const mode = process.argv[2] || "exact";
function testRecord(rec, maxSeeds) {
  const seedCount = mode === "simulat" ? 1 : ((rec.enemyCounts.cultists || 0) === 0 ? 1 : maxSeeds);
  for (let seed = 0; seed < seedCount; seed += 1) {
    const result = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed, collectLog: false, roundingMode: mode });
    if (matches(rec, result)) return true;
  }
  return false;
}
let passOk = 0;
const broken = [];
for (const rec of records.filter((r) => r.kind === "pass")) {
  if (testRecord(rec, 256)) passOk += 1;
  else broken.push(`kat${rec.stage}#${rec.num}`);
}
const fixed = [];
for (const rec of records.filter((r) => r.kind === "fail")) {
  if (testRecord(rec, 1024)) fixed.push(`#${rec.num}`);
}
console.log(`mode=${mode} dogru ${passOk}/1946 | duzelen ${fixed.length}/11 ${fixed.join(",")}`);
if (broken.length) console.log("BOZULAN:", broken.slice(0, 30).join(",") + (broken.length > 30 ? ` (+${broken.length - 30})` : ""));
