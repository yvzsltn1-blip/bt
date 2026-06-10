"use strict";
// Cift-nokta enjeksiyon taramasi (deterministik vakalar icin).
// node inject2-scan.js <failNum> [seedMax]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];
const NAMES = { 0: "Isk", 1: "Zom", 2: "Kul", 3: "KK", 18: "Dir" };

const source = fs.readFileSync(path.join(__dirname, "battle-core-flags.js"), "utf8");
const context = { console, window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "battle-core-flags.js" });
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
const failFile = fs.readdirSync(DATA_DIR).find((f) => f.includes("-fail-"));
const failText = fs.readFileSync(path.join(DATA_DIR, failFile), "utf8");
const num = Number(process.argv[2]);
const seedMax = Number(process.argv[3] || 1);
const block = failText.split(/\r?\n(?=#\d+ )/g).find((b) => b.startsWith(`#${num} `));
const rec = {
  enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
  allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS),
  expectedWinner: block.match(/Gerceklesen sonuc:\s*(\S+)/)[1].startsWith("Galibiyet") ? "ally" : "enemy",
  expectedBlood: parseNumber(block.match(/Gerceklesen kayip:\s*([\d.]+)/)[1]),
  expectedLosses: parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1])
};
function matches(r) {
  if (r.winner !== rec.expectedWinner) return false;
  if (Number(r.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(r.allyLosses[k] || 0) === rec.expectedLosses[k]);
}

const attackers = [0, 1, 2, 3, 18].filter((a) => a === 18 ? rec.enemyCounts.zombies > 0 : rec.enemyCounts[ENEMY_KEYS[a]] > 0);
const points = [];
for (const a of attackers) for (let r = 1; r <= 7; r += 1) points.push({ attacker: a, round: r });

const hits = [];
for (let i = 0; i < points.length; i += 1) {
  for (let j = i; j < points.length; j += 1) {
    for (let d1 = 1; d1 <= 14; d1 += 1) {
      for (let d2 = i === j ? 99 : 1; d2 <= (i === j ? 0 : 14); d2 += 1) { /* same point: skip */ }
      for (let d2 = 1; d2 <= 14; d2 += 1) {
        if (i === j) continue;
        let ok = false;
        for (let s = 0; s < seedMax; s += 1) {
          context.window.__SIM_FLAGS__ = { noRecomputeOnZeroDamage: true, injects: [{ ...points[i], delta: d1 }, { ...points[j], delta: d2 }] };
          if (matches(core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed: s, collectLog: false, roundingMode: "legacy" }))) { ok = true; break; }
        }
        if (ok) hits.push(`${NAMES[points[i].attacker]}r${points[i].round}+${d1} & ${NAMES[points[j].attacker]}r${points[j].round}+${d2}`);
      }
    }
  }
}
console.log(`#${num}: ${hits.length} eslesen cift-nokta kombinasyonu`);
for (const h of hits.slice(0, 60)) console.log("  " + h);
if (hits.length > 60) console.log(`  ... (+${hits.length - 60})`);
