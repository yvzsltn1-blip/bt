"use strict";
// allyHalfRandom altinda pass kayitlarinin kacinda yazi-tura tetikleniyor,
// tetiklenenlerde eslesme hangi seedde bulunuyor? (kirilganlik olcumu)
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
context.window.__SIM_FLAGS__ = { noRecomputeOnZeroDamage: true, allyHalfRandom: true };

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
for (const f of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".txt"))) {
  const kind = f.includes("-fail-") ? "fail" : "pass";
  const text = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
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
}
function matches(rec, result) {
  if (result.winner !== rec.expectedWinner) return false;
  if (Number(result.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(result.allyLosses[k] || 0) === rec.expectedLosses[k]);
}
const passRecords = records.filter((r) => r.kind === "pass");
let touched = 0, untouched = 0, matchSeedHist = { s0: 0, "s1-3": 0, "s4-15": 0, "s16-63": 0, "s64-255": 0, yok: 0 };
let totalMatchedSeeds = 0, totalSeedsChecked = 0, worst = [];
for (const rec of passRecords) {
  // Once seed 0..255 tarayip eslesen seed sayisini ve ilk seedini olc
  let firstMatch = -1, matchCount = 0;
  for (let seed = 0; seed < 256; seed += 1) {
    const result = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed, collectLog: false, roundingMode: "legacy" });
    if (matches(rec, result)) {
      if (firstMatch < 0) firstMatch = seed;
      matchCount += 1;
    }
  }
  totalMatchedSeeds += matchCount;
  totalSeedsChecked += 256;
  if (firstMatch === 0 && matchCount === 256) untouched += 1;
  else touched += 1;
  if (firstMatch < 0) matchSeedHist.yok += 1;
  else if (firstMatch === 0) matchSeedHist.s0 += 1;
  else if (firstMatch <= 3) matchSeedHist["s1-3"] += 1;
  else if (firstMatch <= 15) matchSeedHist["s4-15"] += 1;
  else if (firstMatch <= 63) matchSeedHist["s16-63"] += 1;
  else matchSeedHist["s64-255"] += 1;
  if (firstMatch >= 0 && matchCount <= 8) worst.push(`kat${rec.stage}#${rec.num}: ${matchCount}/256 (ilk s${firstMatch})`);
}
console.log(`Pass toplam: ${passRecords.length}`);
console.log(`Tam deterministik gibi (her seed eslesti): ${untouched}`);
console.log(`Seed'e bagimli hale gelen: ${touched}`);
console.log("Ilk eslesen seed dagilimi:", JSON.stringify(matchSeedHist));
console.log(`Ortalama eslesen seed orani: ${(totalMatchedSeeds / totalSeedsChecked * 100).toFixed(1)}%`);
console.log(`En kirilgan passler (<=8/256 seed eslesiyor): ${worst.length}`);
for (const w of worst.slice(0, 20)) console.log("  " + w);
