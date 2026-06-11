"use strict";
// Arsivdeki herhangi bir kaydi (pass/fail) bayrakli motorla kosup logunu basar.
// Kullanim: node inspect-rec.js <pass|fail> <stage> <num> [seed] [flagsJson]
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
vm.runInContext(fs.readFileSync(path.join(__dirname, "battle-core-flags.js"), "utf8"), context, { filename: "battle-core-flags.js" });
const core = context.window.BattleCore;

function parseCountsBlock(text, prefix, keys) {
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  const re = new RegExp(prefix + "(\\d+):(\\d+)", "g");
  let m;
  while ((m = re.exec(text)) !== null) counts[keys[Number(m[1]) - 1]] = Number(m[2]);
  return counts;
}

const kind = process.argv[2] || "fail";
const stage = Number(process.argv[3]);
const num = Number(process.argv[4]);
const seed = Number(process.argv[5] || 0);
const flags = JSON.parse(process.argv[6] || "{}");
context.window.__SIM_FLAGS__ = { noRecomputeOnZeroDamage: true, ...flags };

let found = null;
for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt"))) {
  const k = f.includes("-fail-") ? "fail" : "pass";
  if (k !== kind) continue;
  const text = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
  for (const block of text.split(/\r?\n(?=#\d+ )/g)) {
    const head = block.match(/^#(\d+) \[(DOGRU|YANLIS)\] (\d+)\. Kat/);
    if (!head) continue;
    if (Number(head[1]) === num && Number(head[3]) === stage) { found = block; break; }
  }
  if (found) break;
}
if (!found) { console.error("kayit bulunamadi"); process.exit(1); }
console.log(found.split("\n").slice(0, 9).join("\n"));
console.log("========================================= flags:", JSON.stringify(context.window.__SIM_FLAGS__));
const enemyCounts = parseCountsBlock(found.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS);
const allyCounts = parseCountsBlock(found.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS);
const result = core.simulateBattle(enemyCounts, allyCounts, { seed, collectLog: true, roundingMode: "legacy" });
console.log(result.logText);
console.log("WINNER:", result.winner, "| BLOOD:", result.lostBloodTotal, "| LOSSES:", JSON.stringify(result.allyLosses));
