"use strict";
// Iki bayrak seti arasinda bozulan pass kayitlarinin ilk log sapmasini bulur.
// node divergence.js '<baseFlags>' '<varFlags>' [maxCases]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];

const source = fs.readFileSync(path.join(__dirname, "battle-core-flags.js"), "utf8");
const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "battle-core-flags.js" });
const core = context.window.BattleCore;
const setFlags = (f) => { context.window.__SIM_FLAGS__ = f; };

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
const records = [];
for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt") && !f.includes("-fail-"))) {
  const text = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
  for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
    const head = block.match(/^#(\d+) \[DOGRU\] (\d+)\. Kat/);
    if (!head) continue;
    records.push({
      num: Number(head[1]), stage: Number(head[2]),
      enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
      allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS),
      expectedWinner: block.match(/Gerceklesen sonuc:\s*(\S+)/)[1].startsWith("Galibiyet") ? "ally" : "enemy",
      expectedBlood: parseNumber(block.match(/Gerceklesen kayip:\s*([\d.]+)/)[1]),
      expectedLosses: parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1])
    });
  }
}
function matches(rec, r) {
  if (r.winner !== rec.expectedWinner) return false;
  if (Number(r.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(r.allyLosses[k] || 0) === rec.expectedLosses[k]);
}
function passes(rec, maxSeeds) {
  const n = (rec.enemyCounts.cultists || 0) === 0 ? 1 : maxSeeds;
  for (let s = 0; s < n; s += 1) {
    if (matches(rec, core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed: s, collectLog: false, roundingMode: "legacy" }))) return s;
  }
  return -1;
}

const baseFlags = JSON.parse(process.argv[2]);
const varFlags = JSON.parse(process.argv[3]);
const maxCases = Number(process.argv[4] || 12);

let shown = 0;
for (const rec of records) {
  setFlags(baseFlags);
  const baseSeed = passes(rec, 256);
  if (baseSeed < 0) continue;
  setFlags(varFlags);
  if (passes(rec, 256) >= 0) continue;
  // bozuldu: base'in eslesen seed'iyle iki logu karsilastir
  setFlags(baseFlags);
  const baseLog = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed: baseSeed, collectLog: true, roundingMode: "legacy" }).logText.split("\n");
  setFlags(varFlags);
  const varLog = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed: baseSeed, collectLog: true, roundingMode: "legacy" }).logText.split("\n");
  let i = 0;
  while (i < Math.min(baseLog.length, varLog.length) && baseLog[i] === varLog[i]) i += 1;
  console.log(`=== kat${rec.stage}#${rec.num} (seed ${baseSeed}) ilk sapma satir ${i} ===`);
  console.log("  ONCE :", baseLog.slice(Math.max(0, i - 3), i + 2).join(" | "));
  console.log("  SONRA:", varLog.slice(Math.max(0, i - 3), i + 2).join(" | "));
  shown += 1;
  if (shown >= maxCases) break;
}
console.log(`(gosterilen: ${shown})`);
