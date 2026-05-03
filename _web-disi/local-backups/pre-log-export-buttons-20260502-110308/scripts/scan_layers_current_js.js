"use strict";

const fs = require("fs");
const path = require("path");

require("../battle-core.js");

const { simulateBattle, ENEMY_UNITS, ALLY_UNITS } = globalThis.BattleCore;

const ROOT = path.resolve(__dirname, "..");
const EXPORT_PATH = path.join(ROOT, "sonuc-arsivi", "layers_1_101_export.json");
const MAX_SEEDS = 512;

const ENEMY_KEY_BY_NAME = {
  skeleton: "skeletons",
  skeletons: "skeletons",
  skeeton: "skeletons",
  zombie: "zombies",
  zombies: "zombies",
  cultist: "cultists",
  cultists: "cultists",
  "bone wing": "bonewings",
  "bone wings": "bonewings",
  bonewing: "bonewings",
  bonewings: "bonewings",
  obese: "corpses",
  corpse: "corpses",
  corpses: "corpses",
  wraith: "wraiths",
  wraiths: "wraiths",
  revenant: "revenants",
  revenants: "revenants",
  "bone giant": "giants",
  "bone giants": "giants",
  bonegiant: "giants",
  bonegiants: "giants",
  broodmother: "broodmothers",
  broodmothers: "broodmothers",
  broodmothr: "broodmothers",
  lich: "liches",
  liches: "liches"
};

function createZeroCounts(units) {
  return Object.fromEntries(units.map((unit) => [unit.key, 0]));
}

function normalizeEnemyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

function parseEnemyCounts(row) {
  const counts = createZeroCounts(ENEMY_UNITS);
  const sources = [row.frontlineEnemies, row.backlineEnemies].filter(Boolean);
  for (const source of sources) {
    for (const rawPart of String(source).split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const match = part.match(/^(\d+)\s*(.+)$/);
      if (!match) throw new Error(`Layer ${row.layer} enemy parse failed: ${part}`);
      const key = ENEMY_KEY_BY_NAME[normalizeEnemyName(match[2])];
      if (!key) throw new Error(`Layer ${row.layer} unknown enemy: ${match[2]}`);
      counts[key] += Number.parseInt(match[1], 10);
    }
  }
  return counts;
}

function buildAllyCounts(row) {
  const counts = createZeroCounts(ALLY_UNITS);
  ALLY_UNITS.forEach((unit, index) => {
    counts[unit.key] = row.allyCounts[index] || 0;
  });
  return counts;
}

function buildExpectedLosses(row) {
  const losses = createZeroCounts(ALLY_UNITS);
  ALLY_UNITS.forEach((unit, index) => {
    losses[unit.key] = row.expectedLosses[index] || 0;
  });
  return losses;
}

function lossDiff(actual, expected) {
  return ALLY_UNITS.reduce(
    (sum, unit) => sum + Math.abs((actual[unit.key] || 0) - (expected[unit.key] || 0)),
    0
  );
}

function lossesToArray(losses) {
  return ALLY_UNITS.map((unit) => losses[unit.key] || 0);
}

function scanRow(row) {
  const enemyCounts = parseEnemyCounts(row);
  const allyCounts = buildAllyCounts(row);
  const expectedLosses = buildExpectedLosses(row);
  const isRandom = (enemyCounts.cultists || 0) > 0;
  const maxSeeds = isRandom ? MAX_SEEDS : 1;

  let exact = null;
  let bloodMatch = null;
  let best = null;

  for (let seed = 1; seed <= maxSeeds; seed += 1) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    const diff = lossDiff(result.allyLosses, expectedLosses);
    const bloodDiff = Math.abs(result.lostBloodTotal - row.expectedLostBlood);
    const winnerPenalty = result.winner === "ally" ? 0 : 1000000;
    const score = winnerPenalty + bloodDiff * 100 + diff;
    const summary = {
      seed,
      winner: result.winner,
      blood: result.lostBloodTotal,
      losses: lossesToArray(result.allyLosses),
      diff,
      bloodDiff
    };

    if (!best || score < best.score) {
      best = { ...summary, score };
    }

    if (result.winner === "ally" && result.lostBloodTotal === row.expectedLostBlood && !bloodMatch) {
      bloodMatch = summary;
    }

    if (result.winner === "ally" && result.lostBloodTotal === row.expectedLostBlood && diff === 0) {
      exact = summary;
      break;
    }
  }

  return {
    layer: row.layer,
    isRandom,
    expectedBlood: row.expectedLostBlood,
    expectedLosses: row.expectedLosses,
    exact,
    bloodMatch,
    best
  };
}

function main() {
  const rows = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"));
  const results = rows.map(scanRow);
  const exactCount = results.filter((item) => item.exact).length;
  const bloodCount = results.filter((item) => item.bloodMatch).length;
  console.log(JSON.stringify({
    engine: "js-current",
    exactCount,
    bloodCount,
    total: results.length,
    results
  }));
}

main();
