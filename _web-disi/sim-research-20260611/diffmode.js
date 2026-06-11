"use strict";
// Bir yanlis vakayi iki modda kosup loglarin ilk ayristigi yeri basar.
// Kullanim: node diffmode.js <failNum> <modeA> <modeB> [seedA] [seedB]
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
const failFile = fs.readdirSync(DATA_DIR).find((f) => f.includes("-fail-"));
const text = fs.readFileSync(path.join(DATA_DIR, failFile), "utf8");
const recs = {};
for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
  const head = block.match(/^#(\d+) \[(DOGRU|YANLIS)\] (\d+)\. Kat/);
  if (!head) continue;
  recs[Number(head[1])] = {
    enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
    allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS)
  };
}

const num = Number(process.argv[2] || 3);
const modeA = process.argv[3] || "legacy";
const modeB = process.argv[4] || "safe";
const seedA = Number(process.argv[5] || 0);
const seedB = Number(process.argv[6] || process.argv[5] || 0);
const rec = recs[num];
const ra = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed: seedA, collectLog: true, roundingMode: modeA });
const rb = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed: seedB, collectLog: true, roundingMode: modeB });
const A = String(ra.logText || ra.log || "").split("\n");
const B = String(rb.logText || rb.log || "").split("\n");
let i = 0;
while (i < A.length && i < B.length && A[i] === B[i]) i += 1;
console.log(`#${num} ${modeA}(seed${seedA}) vs ${modeB}(seed${seedB}) — ilk fark satir ${i}`);
console.log("--- ortak son 6 satir ---");
for (let j = Math.max(0, i - 6); j < i; j += 1) console.log("  " + A[j]);
console.log(`--- ${modeA} devami (12 satir) ---`);
for (let j = i; j < Math.min(A.length, i + 12); j += 1) console.log("A " + A[j]);
console.log(`--- ${modeB} devami (12 satir) ---`);
for (let j = i; j < Math.min(B.length, i + 12); j += 1) console.log("B " + B[j]);
