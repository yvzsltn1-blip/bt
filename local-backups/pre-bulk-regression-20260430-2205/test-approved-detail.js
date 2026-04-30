"use strict";

const fs = require("fs");
const path = require("path");

function stripBom(text) { return text.replace(/^\uFEFF/, ""); }

function loadBattleCore() {
  delete require.cache[require.resolve("./battle-core.js")];
  require("./battle-core.js");
  return globalThis.BattleCore;
}

function createZeroCounts(units) {
  return Object.fromEntries(units.map((u) => [u.key, 0]));
}

function parseFirestoreMap(mv) {
  const fields = mv?.fields || {};
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = Number.parseInt(val.integerValue || val.stringValue || "0", 10);
  }
  return result;
}

function parseSummaryLosses(summaryText, ALLY_UNITS) {
  const losses = createZeroCounts(ALLY_UNITS);
  if (!summaryText) return losses;
  const lines = summaryText.split("\n");
  let inLossSection = false;
  for (const line of lines) {
    if (line.includes("Kayip Birlikler")) { inLossSection = true; continue; }
    if (inLossSection && line.startsWith("=")) break;
    if (!inLossSection) continue;
    const match = line.match(/-\s+(\d+)\s+(.+)/);
    if (!match) continue;
    const count = parseInt(match[1], 10);
    const unitName = match[2].trim();
    if (unitName.includes("Yarasa")) losses.bats = count;
    else if (unitName.includes("Gulyabani")) losses.ghouls = count;
    else if (unitName.includes("Vampir") || unitName.includes("Kole")) losses.thralls = count;
    else if (unitName.includes("Bansi")) losses.banshees = count;
    else if (unitName.includes("Nekromant")) losses.necromancers = count;
    else if (unitName.includes("Gargoyl")) losses.gargoyles = count;
    else if (unitName.includes("Cadisi") || unitName.includes("Cadilari")) losses.witches = count;
    else if (unitName.includes("Cene") || unitName.includes("Ceneler")) losses.rotmaws = count;
  }
  return losses;
}

function formatLosses(losses, units) {
  return units.map((u) => losses[u.key] || 0).join("-");
}

function main() {
  const BattleCore = loadBattleCore();
  const { simulateBattle, ENEMY_UNITS, ALLY_UNITS, BLOOD_BY_ALLY_KEY } = BattleCore;

  // Approved strategies yukle
  const raw = JSON.parse(stripBom(fs.readFileSync(path.join(__dirname, "approvedStrategies.firestoredump.json"), "utf8")));
  const reports = [];
  for (const doc of raw.documents || []) {
    const f = doc.fields || {};
    const enemyCounts = parseFirestoreMap(f.enemyCounts?.mapValue || f.enemyCounts);
    const allyCounts = parseFirestoreMap(f.allyCounts?.mapValue || f.allyCounts);
    const summaryText = f.summaryText?.stringValue || "";
    const expectedLosses = parseSummaryLosses(summaryText, ALLY_UNITS);
    const expectedBlood = parseInt(f.lostBlood?.integerValue || f.lostBlood?.stringValue || "0", 10);
    const winner = f.winner?.stringValue || "ally";
    const logText = f.logText?.stringValue || "";
    const seedMatch = logText.match(/temsilci seed:\s*(\d+)/);
    const seed = seedMatch ? parseInt(seedMatch[1], 10) : null;

    reports.push({ id: doc.name.split("/").pop(), enemyCounts, allyCounts, expectedLosses, expectedBlood, winner, seed });
  }

  console.log(`=== APPROVED STRATEGIES DETAYLI TEST ===\n`);
  console.log(`Toplam: ${reports.length}\n`);

  // Her approved'i tek tek test et
  for (const r of reports) {
    const maxSeeds = 32;
    let found = false;
    let foundSeed = -1;

    for (let seed = 1; seed <= maxSeeds; seed++) {
      const result = simulateBattle(r.enemyCounts, r.allyCounts, { seed, collectLog: false });
      const sameLosses = ALLY_UNITS.every((u) => (result.allyLosses[u.key] || 0) === (r.expectedLosses[u.key] || 0));
      const sameBlood = result.lostBloodTotal === r.expectedBlood;
      const sameWinner = result.winner === r.winner;

      if (sameLosses && sameBlood && sameWinner) {
        found = true;
        foundSeed = seed;
        break;
      }
    }

    if (found) {
      console.log(`  ${r.id}: OK (seed ${foundSeed})`);
    } else {
      // En yakin sonucu bul
      let bestSeed = 1;
      let bestDiff = Infinity;
      for (let seed = 1; seed <= 8; seed++) {
        const result = simulateBattle(r.enemyCounts, r.allyCounts, { seed, collectLog: false });
        let diff = 0;
        for (const u of ALLY_UNITS) {
          diff += Math.abs((result.allyLosses[u.key] || 0) - (r.expectedLosses[u.key] || 0));
        }
        diff += Math.abs(result.lostBloodTotal - r.expectedBlood) / 10;
        if (result.winner !== r.winner) diff += 100;
        if (diff < bestDiff) { bestDiff = diff; bestSeed = seed; }
      }

      const bestResult = simulateBattle(r.enemyCounts, r.allyCounts, { seed: bestSeed, collectLog: false });
      console.log(`  ${r.id}: FAIL (bestSeed ${bestSeed}, diff ${bestDiff.toFixed(1)})`);
      console.log(`    Beklenen: ${formatLosses(r.expectedLosses, ALLY_UNITS)} (kan ${r.expectedBlood})`);
      console.log(`    Sonuc:    ${formatLosses(bestResult.allyLosses, ALLY_UNITS)} (kan ${bestResult.lostBloodTotal})`);
    }
  }
}

main();
