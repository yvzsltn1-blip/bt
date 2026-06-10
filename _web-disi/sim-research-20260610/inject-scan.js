"use strict";
// Nokta-mudahale taramasi: yanlis vakalarda tek bir vurusa (saldiran x raund x +delta)
// ekstra hasar enjekte edip gercek sonucu birebir ureten kombinasyonlari bulur.
// node inject-scan.js <failNum...>
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];
const ATTACKER_NAMES = { 0: "Iskelet(R1)", 1: "Zombi(R2)", 2: "Kultist(R3)", 3: "KemikKanat(R4)", 18: "Dirilen" };

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
const fails = {};
for (const block of failText.split(/\r?\n(?=#\d+ )/g)) {
  const head = block.match(/^#(\d+) \[YANLIS\] (\d+)\. Kat/);
  if (!head) continue;
  fails[Number(head[1])] = {
    num: Number(head[1]), stage: Number(head[2]),
    enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
    allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS),
    expectedWinner: block.match(/Gerceklesen sonuc:\s*(\S+)/)[1].startsWith("Galibiyet") ? "ally" : "enemy",
    expectedBlood: parseNumber(block.match(/Gerceklesen kayip:\s*([\d.]+)/)[1]),
    expectedLosses: parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1])
  };
}
function matches(rec, r) {
  if (r.winner !== rec.expectedWinner) return false;
  if (Number(r.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(r.allyLosses[k] || 0) === rec.expectedLosses[k]);
}

const nums = process.argv.slice(2).map(Number);
for (const n of nums) {
  const rec = fails[n];
  if (!rec) continue;
  console.log(`\n### Yanlis #${n} (kat${rec.stage}) icin nokta-mudahale taramasi`);
  const attackers = [0, 1, 2, 3, 18].filter((a) => a === 18 ? rec.enemyCounts.zombies > 0 : rec.enemyCounts[ENEMY_KEYS[a]] > 0);
  const seedMax = (rec.enemyCounts.cultists || 0) === 0 ? 1 : 64;
  const found = {};
  for (const attacker of attackers) {
    for (let round = 1; round <= 6; round += 1) {
      for (let delta = 1; delta <= 24; delta += 1) {
        let hit = false;
        for (let seed = 0; seed < seedMax; seed += 1) {
          context.window.__SIM_FLAGS__ = { noRecomputeOnZeroDamage: true, inject: { attacker, round, delta } };
          const r = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed, collectLog: false, roundingMode: "legacy" });
          if (matches(rec, r)) { hit = true; break; }
        }
        if (hit) {
          const key = `${ATTACKER_NAMES[attacker]} r${round}`;
          if (!found[key]) found[key] = [];
          found[key].push(delta);
        }
      }
    }
  }
  const keys = Object.keys(found);
  if (!keys.length) {
    console.log("  Hicbir tekil +delta enjeksiyonu gercek sonucu uretemedi.");
  } else {
    for (const k of keys) {
      const ds = found[k];
      console.log(`  ${k}: +delta ${ds[0]}..${ds[ds.length - 1]} (${ds.length} deger)`);
    }
  }
}
