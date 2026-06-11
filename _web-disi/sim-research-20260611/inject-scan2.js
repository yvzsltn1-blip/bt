"use strict";
// Bir fail icin: hangi (raund, saldiran, delta) enjeksiyonu gercek sonucu uretir?
// Rotmaw'a (T8) giden hasara delta ekler (FLAGS.injects mekanizmasi).
// Kullanim: node inject-scan2.js <failNum> [maxDelta] [maxRound]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "test-sonuclari-1-40");
const ENEMY_KEYS = ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "giants", "broodmothers", "liches"];
const ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"];
const ENEMY_LABELS = ["R1 Iskelet", "R2 Zombi", "R3 Kultist", "R4 KemikKanat", "R5 Cesetler", "R6 Hortlak", "R7 MezarDehseti", "R8 KemikIzbandut", "R9 KuluckaAnasi", "R10 Lic", "Dirilen"];

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
const text = fs.readFileSync(path.join(DATA_DIR, failFile), "utf8");
const num = Number(process.argv[2] || 7);
const block = text.split(/\r?\n(?=#\d+ )/g).find((b) => b.startsWith(`#${num} `));
const rec = {
  enemyCounts: parseCountsBlock(block.match(/Rakip\s*:\s*\[([^\]]+)\]/)[1], "R", ENEMY_KEYS),
  allyCounts: parseCountsBlock(block.match(/Biz\s*:\s*\[([^\]]+)\]/)[1], "T", ALLY_KEYS),
  expectedWinner: block.match(/Gerceklesen sonuc:\s*(\S+)/)[1].startsWith("Galibiyet") ? "ally" : "enemy",
  expectedBlood: parseNumber(block.match(/Gerceklesen kayip:\s*([\d.]+)/)[1]),
  expectedLosses: parseLosses((block.match(/Gerceklesen kayip birlik:\s*(.*)/) || [])[1])
};
function matches(result) {
  if (result.winner !== rec.expectedWinner) return false;
  if (Number(result.lostBloodTotal || 0) !== rec.expectedBlood) return false;
  return ALLY_KEYS.every((k) => Number(result.allyLosses[k] || 0) === rec.expectedLosses[k]);
}
const maxDelta = Number(process.argv[3] || 60);
const maxRound = Number(process.argv[4] || 12);
// dusman saldirgan indeksleri battle-core: 0..9 dusman, 10 = dirilen (REVIVED)
const attackerIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const found = [];
for (let round = 1; round <= maxRound; round += 1) {
  for (const atk of attackerIndexes) {
    for (let delta = 1; delta <= maxDelta; delta += 1) {
      context.window.__SIM_FLAGS__ = {
        noRecomputeOnZeroDamage: true,
        injects: [{ round, attacker: atk, delta }]
      };
      let ok = false;
      const seedCount = (rec.enemyCounts.cultists || 0) === 0 ? 1 : 256;
      for (let seed = 0; seed < seedCount; seed += 1) {
        const result = core.simulateBattle(rec.enemyCounts, rec.allyCounts, { seed, collectLog: false, roundingMode: "legacy" });
        if (matches(result)) { ok = true; break; }
      }
      if (ok) {
        found.push(`raund ${round}, ${ENEMY_LABELS[atk]}, +${delta}`);
        break; // bu (round, atk) icin en kucuk delta yeter
      }
    }
  }
}
console.log(`#${num}: rotmaw'a tek enjeksiyonla eslesen cozumler (${found.length}):`);
for (const f of found) console.log("  " + f);
if (!found.length) console.log("  yok — tek enjeksiyon yetmiyor (veya rotmaw disinda kayip gerekiyor)");
