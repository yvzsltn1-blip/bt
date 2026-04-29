"use strict";

const fs = require("fs");
const path = require("path");
require("../battle-core.js");

const { simulateBattle, ENEMY_UNITS, ALLY_UNITS } = globalThis.BattleCore;

const ROOT_DIR = __dirname;
const WORKBOOK_PATH = path.join(ROOT_DIR, "_v21-101.xlsx");
const EXPORT_PATH = path.join(ROOT_DIR, "layers_1_101_export.json");
const REPORT_PATH = path.join(ROOT_DIR, "101-katman-simulator-karsilastirma-raporu.txt");
const MISMATCH_REPORT_PATH = path.join(ROOT_DIR, "101-katman-eslesmeyenler-kisa-liste.txt");
const DEFAULT_MAX_SEEDS = 512;

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

function loadWorkbookRows() {
  if (!fs.existsSync(EXPORT_PATH)) {
    throw new Error(
      `Excel export dosyasi bulunamadi: ${path.relative(ROOT_DIR, EXPORT_PATH)}. ` +
      "Once extract_excel_layers.py scriptini calistir."
    );
  }
  return JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"));
}

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
    const parts = String(source).split(",");
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) {
        continue;
      }
      const match = part.match(/^(\d+)\s*(.+)$/);
      if (!match) {
        throw new Error(`Katman ${row.layer} dusman parcasi okunamadi: ${JSON.stringify(part)}`);
      }
      const amount = Number.parseInt(match[1], 10);
      const normalizedName = normalizeEnemyName(match[2]);
      const key = ENEMY_KEY_BY_NAME[normalizedName];
      if (!key) {
        throw new Error(`Katman ${row.layer} icin bilinmeyen dusman adi: ${JSON.stringify(match[2])}`);
      }
      counts[key] += amount;
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

function countsToTierSeries(counts, units) {
  return units.map((unit) => counts[unit.key] || 0).join("-");
}

function lossesMatch(actualLosses, expectedLosses) {
  return ALLY_UNITS.every((unit) => (actualLosses[unit.key] || 0) === (expectedLosses[unit.key] || 0));
}

function cloneLosses(losses) {
  return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, losses?.[unit.key] || 0]));
}

function buildResultSummary(result) {
  return {
    winner: result.winner,
    lostBloodTotal: result.lostBloodTotal,
    allyLosses: cloneLosses(result.allyLosses)
  };
}

function computeDistance(result, expectedWinner, expectedLostBlood, expectedLosses) {
  const winnerPenalty = result.winner === expectedWinner ? 0 : 1000000;
  const bloodPenalty = Math.abs((result.lostBloodTotal || 0) - expectedLostBlood) * 100;
  const unitPenalty = ALLY_UNITS.reduce(
    (sum, unit) => sum + Math.abs((result.allyLosses?.[unit.key] || 0) - (expectedLosses[unit.key] || 0)),
    0
  );
  return winnerPenalty + bloodPenalty + unitPenalty;
}

function scanLayer(layerRow, maxSeeds) {
  const enemyCounts = parseEnemyCounts(layerRow);
  const allyCounts = buildAllyCounts(layerRow);
  const expectedLosses = buildExpectedLosses(layerRow);
  const expectedWinner = "ally";
  const expectedLostBlood = layerRow.expectedLostBlood;
  const isRandom = (enemyCounts.cultists || 0) > 0;
  const seedsToTry = isRandom ? maxSeeds : 1;

  let exactMatch = null;
  let bloodMatch = null;
  let bestCandidate = null;

  for (let seed = 1; seed <= seedsToTry; seed += 1) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    const distance = computeDistance(result, expectedWinner, expectedLostBlood, expectedLosses);

    if (!bestCandidate || distance < bestCandidate.distance) {
      bestCandidate = {
        seed,
        distance,
        result: buildResultSummary(result)
      };
    }

    const sameWinner = result.winner === expectedWinner;
    const sameBlood = sameWinner && result.lostBloodTotal === expectedLostBlood;
    if (sameBlood && !bloodMatch) {
      bloodMatch = {
        seed,
        result: buildResultSummary(result)
      };
    }

    const sameLosses = lossesMatch(result.allyLosses, expectedLosses);
    if (sameBlood && sameLosses) {
      exactMatch = {
        seed,
        result: buildResultSummary(result)
      };
      break;
    }
  }

  return {
    layer: layerRow.layer,
    armyPower: layerRow.armyPower,
    armyPowerUsed: layerRow.armyPowerUsed,
    enemyCounts,
    allyCounts,
    expectedWinner,
    expectedLostBlood,
    expectedLosses,
    seedsScanned: exactMatch ? exactMatch.seed : seedsToTry,
    isRandom,
    exactMatch,
    bloodMatch,
    bestCandidate
  };
}

function formatStatus(entry) {
  if (entry.exactMatch) {
    return "ESLESTI";
  }
  if (entry.bloodMatch) {
    return "KAN AYNI / PROFIL FARKLI";
  }
  return "ESLESMEDI";
}

function formatSimLine(label, payload, seed) {
  return `${label}: ${payload.winner === "ally" ? "Zafer" : "Maglubiyet"} | Kan ${payload.lostBloodTotal} | Kayip T1-T8 ${countsToTierSeries(payload.allyLosses, ALLY_UNITS)}${seed ? ` | seed ${seed}` : ""}`;
}

function buildReport(results, maxSeeds) {
  const exactCount = results.filter((entry) => entry.exactMatch).length;
  const bloodCount = results.filter((entry) => entry.bloodMatch).length;
  const deterministicCount = results.filter((entry) => !entry.isRandom).length;
  const randomCount = results.length - deterministicCount;

  const lines = [
    "101 Katman Excel Sonucu / Simulator Karsilastirma Raporu",
    "=========================================================",
    `Tarih: ${new Date().toISOString()}`,
    `Kaynak Excel: ${path.relative(ROOT_DIR, WORKBOOK_PATH)}`,
    `Rapor: ${path.relative(ROOT_DIR, REPORT_PATH)}`,
    "",
    "Eslesme kriteri:",
    "- Birincil: zafer/maglubiyet + toplam kan kaybi + T1-T8 kayip profili birebir ayni",
    "- Ikincil: zafer/maglubiyet + toplam kan kaybi ayni, ama kayip profili farkli olabilir",
    "",
    `Toplam katman: ${results.length}`,
    `Tam eslesen katman: ${exactCount}/${results.length}`,
    `Kan kaybi ayni olan katman: ${bloodCount}/${results.length}`,
    `Deterministik katman: ${deterministicCount}`,
    `Random taranan katman: ${randomCount}`,
    `Random katman basina taranan azami seed: ${maxSeeds}`,
    "",
    "Katman bazli detay",
    "-------------------"
  ];

  for (const entry of results) {
    lines.push(
      "",
      `Katman ${entry.layer} [${formatStatus(entry)}]`,
      `Dusman T1-T10: ${countsToTierSeries(entry.enemyCounts, ENEMY_UNITS)}`,
      `Biz T1-T8: ${countsToTierSeries(entry.allyCounts, ALLY_UNITS)}`,
      `Excel: Zafer | Kan ${entry.expectedLostBlood} | Kayip T1-T8 ${countsToTierSeries(entry.expectedLosses, ALLY_UNITS)}`,
      `Tarama: ${entry.isRandom ? `${entry.seedsScanned} seed` : "deterministik"}`
    );

    if (entry.exactMatch) {
      lines.push(formatSimLine("Simulator", entry.exactMatch.result, entry.exactMatch.seed));
      continue;
    }

    if (entry.bloodMatch) {
      lines.push(formatSimLine("Simulator", entry.bloodMatch.result, entry.bloodMatch.seed));
    }

    if (entry.bestCandidate) {
      lines.push(formatSimLine("En yakin", entry.bestCandidate.result, entry.bestCandidate.seed));
    }
  }

  return lines.join("\n");
}

function buildMismatchReport(results) {
  const mismatches = results.filter((entry) => !entry.exactMatch);
  const lines = [
    "101 Katman Eslesmeyenler Kisa Liste",
    "===================================",
    `Tarih: ${new Date().toISOString()}`,
    `Toplam tam eslesmeyen katman: ${mismatches.length}`,
    "",
    "Durum anahtari:",
    "- KAN AYNI / PROFIL FARKLI: toplam kan kaybi ayni, T1-T8 kayip profili farkli",
    "- ESLESMEDI: toplam kan kaybi da farkli",
    "",
    "Liste",
    "-----"
  ];

  for (const entry of mismatches) {
    lines.push(
      "",
      `Katman ${entry.layer} [${formatStatus(entry)}]`,
      `Dusman T1-T10: ${countsToTierSeries(entry.enemyCounts, ENEMY_UNITS)}`,
      `Biz T1-T8: ${countsToTierSeries(entry.allyCounts, ALLY_UNITS)}`,
      `Excel: Kan ${entry.expectedLostBlood} | Kayip ${countsToTierSeries(entry.expectedLosses, ALLY_UNITS)}`
    );

    if (entry.bloodMatch) {
      lines.push(`Simulator: Kan ${entry.bloodMatch.result.lostBloodTotal} | Kayip ${countsToTierSeries(entry.bloodMatch.result.allyLosses, ALLY_UNITS)} | seed ${entry.bloodMatch.seed}`);
    } else if (entry.bestCandidate) {
      lines.push(`En yakin: Kan ${entry.bestCandidate.result.lostBloodTotal} | Kayip ${countsToTierSeries(entry.bestCandidate.result.allyLosses, ALLY_UNITS)} | seed ${entry.bestCandidate.seed}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const parsed = Number.parseInt(process.argv[2] || "", 10);
  const maxSeeds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SEEDS;
  const rows = loadWorkbookRows().sort((left, right) => left.layer - right.layer);
  const results = rows.map((row) => scanLayer(row, maxSeeds));
  const report = buildReport(results, maxSeeds);
  const mismatchReport = buildMismatchReport(results);
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  fs.writeFileSync(MISMATCH_REPORT_PATH, mismatchReport, "utf8");

  const exactCount = results.filter((entry) => entry.exactMatch).length;
  const bloodCount = results.filter((entry) => entry.bloodMatch).length;
  console.log(JSON.stringify({
    reportPath: REPORT_PATH,
    mismatchReportPath: MISMATCH_REPORT_PATH,
    totalLayers: results.length,
    exactMatchCount: exactCount,
    bloodMatchCount: bloodCount,
    maxSeeds
  }, null, 2));
}

main();
