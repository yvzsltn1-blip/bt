"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

delete require.cache[require.resolve("./battle-core.js")];
require("./battle-core.js");

const { simulateBattle, ENEMY_UNITS, ALLY_UNITS } = globalThis.BattleCore;

function buildCounts(values, units) {
  const counts = {};
  units.forEach((unit, index) => {
    counts[unit.key] = values[index] || 0;
  });
  return counts;
}

function parseEnemyCountsFromLayer(row) {
  const counts = buildCounts([], ENEMY_UNITS);
  const enemyKeyByName = {
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

  for (const source of [row.frontlineEnemies, row.backlineEnemies].filter(Boolean)) {
    for (const rawPart of String(source).split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      const match = part.match(/^(\d+)\s*(.+)$/);
      if (!match) continue;
      const normalizedName = match[2].trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
      counts[enemyKeyByName[normalizedName]] += Number.parseInt(match[1], 10);
    }
  }

  return counts;
}

function lossesToSeries(losses) {
  return ALLY_UNITS.map((unit) => losses[unit.key] || 0).join("-");
}

function testReport1RegressionFix() {
  const enemyCounts = buildCounts([13, 26, 17, 22, 6, 4, 9, 7, 6, 4], ENEMY_UNITS);
  const allyCounts = buildCounts([41, 65, 22, 29, 1, 10, 1, 0], ALLY_UNITS);

  const result = simulateBattle(enemyCounts, allyCounts, { seed: 0, collectLog: false });

  assert.equal(result.winner, "enemy");
  assert.equal(result.lostBloodTotal, 3730);
  assert.equal(lossesToSeries(result.allyLosses), "41-65-22-29-1-10-1-0");
}

function testLayer67StillMatches() {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, "sonuc-arsivi", "layers_1_101_export.json"), "utf8"));
  const row = rows.find((entry) => entry.layer === 67);
  assert(row, "Layer 67 not found");

  const enemyCounts = parseEnemyCountsFromLayer(row);
  const allyCounts = buildCounts(row.allyCounts, ALLY_UNITS);
  const result = simulateBattle(enemyCounts, allyCounts, { seed: 1, collectLog: false });

  assert.equal(result.winner, "ally");
  assert.equal(result.lostBloodTotal, row.expectedLostBlood);
  assert.equal(lossesToSeries(result.allyLosses), row.expectedLosses.join("-"));
}

testReport1RegressionFix();
testLayer67StillMatches();

console.log("test-rounding-fix passed");
