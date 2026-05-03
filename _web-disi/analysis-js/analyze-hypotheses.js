"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadBattleCoreFromSource(source) {
  delete globalThis.BattleCore;
  vm.runInThisContext(source, { filename: "battle-core.js" });
  return globalThis.BattleCore;
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function createZeroCounts(units) {
  return Object.fromEntries(units.map((unit) => [unit.key, 0]));
}

function parseFirestoreMap(mv) {
  const fields = mv?.fields || {};
  const result = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = Number.parseInt(val.integerValue || val.stringValue || "0", 10);
  }
  return result;
}

function parseSummaryLosses(summaryText, allyUnits) {
  const losses = createZeroCounts(allyUnits);
  if (!summaryText) {
    return losses;
  }

  let inLossSection = false;
  for (const line of summaryText.split("\n")) {
    if (line.includes("Kayip Birlikler")) {
      inLossSection = true;
      continue;
    }
    if (inLossSection && line.startsWith("=")) {
      break;
    }
    if (!inLossSection) {
      continue;
    }

    const match = line.match(/-\s+(\d+)\s+(.+)/);
    if (!match) {
      continue;
    }

    const count = Number.parseInt(match[1], 10);
    const unitName = match[2].trim();
    if (unitName.includes("Yarasa")) {
      losses.bats = count;
    } else if (unitName.includes("Gulyabani")) {
      losses.ghouls = count;
    } else if (unitName.includes("Vampir") || unitName.includes("Kole")) {
      losses.thralls = count;
    } else if (unitName.includes("Bansi")) {
      losses.banshees = count;
    } else if (unitName.includes("Nekromant")) {
      losses.necromancers = count;
    } else if (unitName.includes("Gargoyl")) {
      losses.gargoyles = count;
    } else if (unitName.includes("Cadisi") || unitName.includes("Cadilari")) {
      losses.witches = count;
    } else if (unitName.includes("Cene") || unitName.includes("Ceneler")) {
      losses.rotmaws = count;
    }
  }

  return losses;
}

function parseSummaryBlood(summaryText) {
  if (!summaryText) {
    return 0;
  }
  const match = summaryText.match(/=\s*\d+\s+toplam\s+\(+\s*(\d+)\s+kan\)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function lossesMatch(actual, expected, allyUnits) {
  return allyUnits.every((unit) => (actual[unit.key] || 0) === (expected[unit.key] || 0));
}

function countDifferences(actual, expected, allyUnits) {
  let diff = 0;
  for (const unit of allyUnits) {
    diff += Math.abs((actual[unit.key] || 0) - (expected[unit.key] || 0));
  }
  return diff;
}

function formatLosses(losses, allyUnits) {
  return allyUnits.map((unit) => losses[unit.key] || 0).join("-");
}

function parseYanlisSonuclar(battleCore) {
  const { ENEMY_UNITS, ALLY_UNITS } = battleCore;
  const filePath = path.join(__dirname, "sonuc-arsivi", "Yanlis Sonuclar.txt");
  const text = fs.readFileSync(filePath, "utf8");
  const reports = [];
  const blocks = text.split(/\nRapor \d+/);

  for (const block of blocks) {
    const enemyMatch = block.match(/Rakip dizilis \(T1-T10\):\s*([\d-]+)/);
    const allyMatch = block.match(/Bizim dizilis \(T1-T8\):\s*([\d-]+)/);
    const expectedMatch = block.match(/Beklenen kayiplar \(T1-T8\):\s*([\d-]+)/);
    const actualMatch = block.match(/Gercek kayiplar \(T1-T8\):\s*([\d-]+)/);
    const expectedBloodMatch = block.match(/Beklenen toplam kan kaybi:\s*(\d+)/);
    const actualBloodMatch = block.match(/Gercek toplam kan kaybi:\s*(\d+)/);
    if (!enemyMatch || !allyMatch || !expectedMatch || !actualMatch) {
      continue;
    }

    const enemyParts = enemyMatch[1].split("-").map(Number);
    const allyParts = allyMatch[1].split("-").map(Number);
    const expectedParts = expectedMatch[1].split("-").map(Number);
    const actualParts = actualMatch[1].split("-").map(Number);

    const enemyCounts = {};
    ENEMY_UNITS.forEach((unit, index) => {
      enemyCounts[unit.key] = enemyParts[index] || 0;
    });

    const allyCounts = {};
    ALLY_UNITS.forEach((unit, index) => {
      allyCounts[unit.key] = allyParts[index] || 0;
    });

    const expectedLosses = {};
    const actualLosses = {};
    ALLY_UNITS.forEach((unit, index) => {
      expectedLosses[unit.key] = expectedParts[index] || 0;
      actualLosses[unit.key] = actualParts[index] || 0;
    });

    reports.push({
      id: `yanlis-${reports.length + 1}`,
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood: Number.parseInt(expectedBloodMatch?.[1] || "0", 10),
      actualLosses,
      actualBlood: Number.parseInt(actualBloodMatch?.[1] || "0", 10)
    });
  }

  return reports;
}

function loadWrongFromFirestore(battleCore) {
  const filePath = path.join(__dirname, "wrongReports.firestoredump.json");
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
  const reports = [];
  for (const doc of raw.documents || []) {
    const fields = doc.fields || {};
    const enemyCounts = parseFirestoreMap((fields.enemyCounts?.mapValue) || fields.enemyCounts);
    const allyCounts = parseFirestoreMap((fields.allyCounts?.mapValue) || fields.allyCounts);
    const actualSummary = fields.actualSummaryText?.stringValue || "";
    const simSummary = fields.summaryText?.stringValue || "";

    reports.push({
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      actualLosses: parseSummaryLosses(actualSummary, battleCore.ALLY_UNITS),
      actualBlood: parseSummaryBlood(actualSummary),
      simLosses: parseSummaryLosses(simSummary, battleCore.ALLY_UNITS),
      simBlood: parseSummaryBlood(simSummary)
    });
  }

  return reports;
}

function loadApprovedFromFirestore(battleCore) {
  const filePath = path.join(__dirname, "approvedStrategies.firestoredump.json");
  const raw = JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
  const reports = [];

  for (const doc of raw.documents || []) {
    const fields = doc.fields || {};
    const enemyCounts = parseFirestoreMap((fields.enemyCounts?.mapValue) || fields.enemyCounts);
    const allyCounts = parseFirestoreMap((fields.allyCounts?.mapValue) || fields.allyCounts);
    const summaryText = fields.summaryText?.stringValue || "";
    const logText = fields.logText?.stringValue || "";
    const seedMatch = logText.match(/temsilci seed:\s*(\d+)/i);

    reports.push({
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      expectedLosses: parseSummaryLosses(summaryText, battleCore.ALLY_UNITS),
      expectedBlood:
        Number.parseInt(fields.lostBlood?.integerValue || fields.lostBlood?.stringValue || "0", 10) ||
        parseSummaryBlood(summaryText),
      winner: fields.winner?.stringValue || "ally",
      seed: seedMatch ? Number.parseInt(seedMatch[1], 10) : null
    });
  }

  return reports;
}

function loadLayers101(battleCore) {
  const filePath = path.join(__dirname, "sonuc-arsivi", "layers_1_101_export.json");
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const results = [];

  const enemyKeyByName = {
    skeleton: "skeletons",
    skeletons: "skeletons",
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
    lich: "liches",
    liches: "liches"
  };

  for (const row of rows) {
    const enemyCounts = createZeroCounts(battleCore.ENEMY_UNITS);
    const allyCounts = createZeroCounts(battleCore.ALLY_UNITS);
    const expectedLosses = createZeroCounts(battleCore.ALLY_UNITS);

    for (const source of [row.frontlineEnemies, row.backlineEnemies].filter(Boolean)) {
      for (const rawPart of String(source).split(",")) {
        const part = rawPart.trim();
        if (!part) {
          continue;
        }
        const match = part.match(/^(\d+)\s+(.+)$/);
        if (!match) {
          continue;
        }
        const amount = Number.parseInt(match[1], 10);
        const normalizedName = match[2].trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
        const key = enemyKeyByName[normalizedName];
        if (key) {
          enemyCounts[key] += amount;
        }
      }
    }

    battleCore.ALLY_UNITS.forEach((unit, index) => {
      allyCounts[unit.key] = (row.allyCounts && row.allyCounts[index]) || 0;
      expectedLosses[unit.key] = (row.expectedLosses && row.expectedLosses[index]) || 0;
    });

    results.push({
      id: `layer-${row.layer}`,
      layer: row.layer,
      enemyCounts,
      allyCounts,
      expectedLosses,
      expectedBlood: row.expectedLostBlood || 0,
      expectedWinner: "ally",
      isRandom: (enemyCounts.cultists || 0) > 0
    });
  }

  return results;
}

function findMatchingSeed(simulateBattle, allyUnits, enemyCounts, allyCounts, expectedLosses, expectedBlood, expectedWinner, maxSeeds) {
  for (let seed = 1; seed <= maxSeeds; seed += 1) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    if (
      lossesMatch(result.allyLosses, expectedLosses, allyUnits) &&
      result.lostBloodTotal === expectedBlood &&
      result.winner === expectedWinner
    ) {
      return { found: true, seed, result };
    }
  }
  return { found: false };
}

function findClosestSeed(simulateBattle, allyUnits, enemyCounts, allyCounts, expectedLosses, expectedBlood, expectedWinner, maxSeeds) {
  let bestSeed = 1;
  let bestResult = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestBloodDiff = Number.POSITIVE_INFINITY;

  for (let seed = 1; seed <= maxSeeds; seed += 1) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    const diff = countDifferences(result.allyLosses, expectedLosses, allyUnits);
    const bloodDiff = Math.abs(result.lostBloodTotal - expectedBlood);
    const winnerPenalty = result.winner === expectedWinner ? 0 : 1000;
    const score = winnerPenalty + diff * 100 + bloodDiff;
    const bestScore = bestDiff * 100 + bestBloodDiff;

    if (score < bestScore || diff < bestDiff) {
      bestSeed = seed;
      bestResult = result;
      bestDiff = diff;
      bestBloodDiff = bloodDiff;
    }
  }

  return { seed: bestSeed, result: bestResult, diff: bestDiff, bloodDiff: bestBloodDiff };
}

function runEvaluation(source) {
  const battleCore = loadBattleCoreFromSource(source);
  const { simulateBattle, ALLY_UNITS } = battleCore;
  const wrongFirestore = loadWrongFromFirestore(battleCore);
  const wrongYanlis = parseYanlisSonuclar(battleCore);
  const approvedReports = loadApprovedFromFirestore(battleCore);
  const layers101 = loadLayers101(battleCore);

  const allWrong = [...wrongFirestore];
  for (const report of wrongYanlis) {
    const duplicate = allWrong.some(
      (candidate) =>
        JSON.stringify(candidate.enemyCounts) === JSON.stringify(report.enemyCounts) &&
        JSON.stringify(candidate.allyCounts) === JSON.stringify(report.allyCounts)
    );
    if (!duplicate) {
      allWrong.push(report);
    }
  }

  let wrongFixed = 0;
  let wrongStillWrong = 0;
  let wrongWorse = 0;
  const wrongDetails = [];

  for (const report of allWrong) {
    const originalDiff = countDifferences(report.simLosses || report.expectedLosses || {}, report.actualLosses, ALLY_UNITS);
    const match = findMatchingSeed(
      simulateBattle,
      ALLY_UNITS,
      report.enemyCounts,
      report.allyCounts,
      report.actualLosses,
      report.actualBlood,
      "ally",
      64
    );

    if (match.found) {
      wrongFixed += 1;
      wrongDetails.push({ id: report.id, status: "FIXED", seed: match.seed });
      continue;
    }

    const closest = findClosestSeed(
      simulateBattle,
      ALLY_UNITS,
      report.enemyCounts,
      report.allyCounts,
      report.actualLosses,
      report.actualBlood,
      "ally",
      64
    );

    if (closest.diff < originalDiff) {
      wrongFixed += 1;
      wrongDetails.push({ id: report.id, status: "IMPROVED", seed: closest.seed, diff: closest.diff, prevDiff: originalDiff });
    } else if (closest.diff > originalDiff) {
      wrongWorse += 1;
      wrongDetails.push({ id: report.id, status: "WORSE", seed: closest.seed, diff: closest.diff, prevDiff: originalDiff });
    } else {
      wrongStillWrong += 1;
      wrongDetails.push({ id: report.id, status: "STILL_WRONG", seed: closest.seed, diff: closest.diff });
    }
  }

  let approvedKept = 0;
  const approvedBroken = [];
  for (const report of approvedReports) {
    const match = findMatchingSeed(
      simulateBattle,
      ALLY_UNITS,
      report.enemyCounts,
      report.allyCounts,
      report.expectedLosses,
      report.expectedBlood,
      report.winner || "ally",
      32
    );
    if (match.found) {
      approvedKept += 1;
    } else {
      approvedBroken.push(report.id);
    }
  }

  let layers101Exact = 0;
  for (const report of layers101) {
    const maxSeeds = report.isRandom ? 512 : 1;
    let exactFound = false;
    for (let seed = 1; seed <= maxSeeds; seed += 1) {
      const result = simulateBattle(report.enemyCounts, report.allyCounts, { seed, collectLog: false });
      const sameWinner = result.winner === (report.expectedWinner || "ally");
      const sameBlood = result.lostBloodTotal === report.expectedBlood;
      const sameLosses = lossesMatch(result.allyLosses, report.expectedLosses, ALLY_UNITS);
      if (sameWinner && sameBlood && sameLosses) {
        exactFound = true;
        break;
      }
    }
    if (exactFound) {
      layers101Exact += 1;
    }
  }

  const focusIds = new Set(["yanlis-1", "yanlis-4", "yanlis-7", "yanlis-18", "wrong_1777415591614_g7dc64p"]);
  const focus = wrongDetails.filter((detail) => focusIds.has(detail.id));

  return {
    wrong: { total: allWrong.length, fixed: wrongFixed, stillWrong: wrongStillWrong, worse: wrongWorse, focus },
    approved: { total: approvedReports.length, kept: approvedKept, broken: approvedBroken },
    layers101: { total: layers101.length, exact: layers101Exact }
  };
}

function applyNamedPatch(source, patchName) {
  if (patchName === "baseline" || patchName === "") {
    return source;
  }

  if (patchName === "revived-count-uses-revived-hp") {
    return source.replace(
      "const baseHp = UNIT_DESC[ZOMBIES_INDEX][HEALTH_INDEX];",
      "const baseHp = UNIT_DESC[REVIVED_INDEX][HEALTH_INDEX];"
    );
  }

  if (patchName === "gargoyle-slow-does-not-reorder-current-round") {
    return source.replace(
      /\s*orders = buildOrders\(unitSpeed\);\r?\n\s*defenderOrderFrontFirst = orders\.defenderOrderFrontFirst;\r?\n\s*defenderOrderRearFirst = orders\.defenderOrderRearFirst;\r?\n/,
      "\n"
    );
  }

  if (patchName === "broodmother-spawns-if-alive-at-round-start") {
    return source
      .replace(
        "      let bansheesReduceRound = -1;\n      let bansheesReduceTarget = -1;\n      let gargoylesReactiveReduceEvent = false;\n      let gargoylesReactiveReduceEnemyIndex = -1;\n",
        "      let bansheesReduceRound = -1;\n      let bansheesReduceTarget = -1;\n      let gargoylesReactiveReduceEvent = false;\n      let gargoylesReactiveReduceEnemyIndex = -1;\n      const broodmothersAliveAtRoundStart = unitNumbers[BROODMOTHERS_INDEX] > 0;\n"
      )
      .replace(
        "        if (!detectedNextAttackerUnit && unitNumbers[BROODMOTHERS_INDEX] > 0) {",
        "        if (!detectedNextAttackerUnit && broodmothersAliveAtRoundStart) {"
      );
  }

  if (patchName === "broodmother-spawns-if-round-start-count-ge-6") {
    return source
      .replace(
        "      let bansheesReduceRound = -1;\n      let bansheesReduceTarget = -1;\n      let gargoylesReactiveReduceEvent = false;\n      let gargoylesReactiveReduceEnemyIndex = -1;\n",
        "      let bansheesReduceRound = -1;\n      let bansheesReduceTarget = -1;\n      let gargoylesReactiveReduceEvent = false;\n      let gargoylesReactiveReduceEnemyIndex = -1;\n      const broodmothersRoundStartCount = unitNumbers[BROODMOTHERS_INDEX];\n"
      )
      .replace(
        "        if (!detectedNextAttackerUnit && unitNumbers[BROODMOTHERS_INDEX] > 0) {",
        "        if (!detectedNextAttackerUnit && (unitNumbers[BROODMOTHERS_INDEX] > 0 || broodmothersRoundStartCount >= 6)) {"
      );
  }

  if (patchName === "gargoyle-slow-reorders-attacker-order-too") {
    return source.replace(
      "          orders = buildOrders(unitSpeed);\n          defenderOrderFrontFirst = orders.defenderOrderFrontFirst;\n          defenderOrderRearFirst = orders.defenderOrderRearFirst;",
      "          orders = buildOrders(unitSpeed);\n          attackerOrder = orders.attackerOrder;\n          defenderOrderFrontFirst = orders.defenderOrderFrontFirst;\n          defenderOrderRearFirst = orders.defenderOrderRearFirst;"
    );
  }

  throw new Error(`Unknown patch: ${patchName}`);
}

function main() {
  const patchName = process.argv[2] || "baseline";
  const baseSource = fs.readFileSync(path.join(__dirname, "battle-core.js"), "utf8");
  const source = patchName
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((current, part) => applyNamedPatch(current, part), baseSource);
  const result = runEvaluation(source);

  console.log(`Patch: ${patchName}`);
  console.log(JSON.stringify(result, null, 2));
}

main();
