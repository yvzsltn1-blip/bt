"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TARGET_CASE = {
  id: "screen-vs-2026-04-30",
  enemyCounts: {
    skeletons: 15,
    zombies: 11,
    cultists: 17,
    bonewings: 7,
    corpses: 17,
    wraiths: 9,
    revenants: 5,
    giants: 5,
    broodmothers: 7,
    liches: 4
  },
  allyCounts: {
    bats: 40,
    ghouls: 52,
    thralls: 20,
    banshees: 22,
    necromancers: 9,
    gargoyles: 3,
    witches: 6,
    rotmaws: 0
  },
  actualLosses: {
    bats: 17,
    ghouls: 52,
    thralls: 0,
    banshees: 0,
    necromancers: 9,
    gargoyles: 3,
    witches: 6,
    rotmaws: 0
  },
  actualBlood: 2165,
  winner: "ally"
};

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
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

function parseSummaryLosses(summaryText, allyUnits) {
  const losses = createZeroCounts(allyUnits);
  if (!summaryText) {
    return losses;
  }
  const lines = String(summaryText).split("\n");
  let inLossSection = false;
  for (const line of lines) {
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

function parseSummaryBlood(summaryText) {
  if (!summaryText) {
    return 0;
  }
  const totalMatch = String(summaryText).match(/=\s*\d+\s+toplam\s+\(+\s*(\d+)\s+kan\)/);
  return totalMatch ? Number.parseInt(totalMatch[1], 10) : 0;
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

function getDumpDocuments(preferredPaths) {
  for (const relPath of preferredPaths) {
    const filePath = path.join(__dirname, relPath);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const raw = JSON.parse(stripBom(fs.readFileSync(filePath, "utf8")));
    return raw.documents || [];
  }
  return [];
}

function loadWrongReports(allyUnits) {
  const documents = getDumpDocuments(["live_wrong_reports.json", "wrongReports.firestoredump.json"]);
  return documents.map((doc) => {
    const f = doc.fields || {};
    const enemyCounts = parseFirestoreMap(f.enemyCounts?.mapValue || f.enemyCounts);
    const allyCounts = parseFirestoreMap(f.allyCounts?.mapValue || f.allyCounts);
    return {
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      actualLosses: parseSummaryLosses(f.actualSummaryText?.stringValue || "", allyUnits),
      actualBlood: parseSummaryBlood(f.actualSummaryText?.stringValue || ""),
      simLosses: parseSummaryLosses(f.summaryText?.stringValue || "", allyUnits),
      simBlood: parseSummaryBlood(f.summaryText?.stringValue || "")
    };
  });
}

function loadApprovedReports(allyUnits) {
  const documents = getDumpDocuments(["live_approved_strategies.json", "approvedStrategies.firestoredump.json"]);
  return documents.map((doc) => {
    const f = doc.fields || {};
    const enemyCounts = parseFirestoreMap(f.enemyCounts?.mapValue || f.enemyCounts);
    const allyCounts = parseFirestoreMap(f.allyCounts?.mapValue || f.allyCounts);
    const summaryText = f.summaryText?.stringValue || "";
    const logText = f.logText?.stringValue || "";
    const seedMatch = logText.match(/temsilci seed:\s*(\d+)/);
    return {
      id: doc.name.split("/").pop(),
      enemyCounts,
      allyCounts,
      expectedLosses: parseSummaryLosses(summaryText, allyUnits),
      expectedBlood: Number.parseInt(f.lostBlood?.integerValue || f.lostBlood?.stringValue || "0", 10) || parseSummaryBlood(summaryText),
      expectedWinner: f.winner?.stringValue || "ally",
      seed: seedMatch ? Number.parseInt(seedMatch[1], 10) : null
    };
  });
}

function buildSpeedTieRearSpeed3EnemyFirstPatch() {
  return `  function buildOrders(unitSpeed) {
    const minSpeed = Math.min(...unitSpeed);
    const maxSpeed = Math.max(...unitSpeed);

    const attackerOrder = [];
    for (let speed = maxSpeed; speed >= minSpeed; speed -= 1) {
      const rearSideOrder = speed === 3 ? ["enemy", "ally"] : ["ally", "enemy"];
      for (const side of rearSideOrder) {
        for (let j = UNIT_DESC.length - 1; j >= 0; j -= 1) {
          if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === side && UNIT_DESC[j][POSITION_INDEX] === "rear") {
            attackerOrder.push(j);
          }
        }
      }
      for (const side of ["ally", "enemy"]) {
        for (let j = UNIT_DESC.length - 1; j >= 0; j -= 1) {
          if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === side && UNIT_DESC[j][POSITION_INDEX] === "front") {
            attackerOrder.push(j);
          }
        }
      }
    }

    const defenderOrderFront = [];
    for (let speed = minSpeed; speed <= maxSpeed; speed += 1) {
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "enemy" && UNIT_DESC[j][POSITION_INDEX] === "front") {
          defenderOrderFront.push(j);
        }
      }
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "ally" && UNIT_DESC[j][POSITION_INDEX] === "front") {
          defenderOrderFront.push(j);
        }
      }
    }

    const defenderOrderRear = [];
    for (let speed = minSpeed; speed <= maxSpeed; speed += 1) {
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "enemy" && UNIT_DESC[j][POSITION_INDEX] === "rear") {
          defenderOrderRear.push(j);
        }
      }
      for (let j = 0; j < UNIT_DESC.length; j += 1) {
        if (unitSpeed[j] === speed && UNIT_DESC[j][SIDE_INDEX] === "ally" && UNIT_DESC[j][POSITION_INDEX] === "rear") {
          defenderOrderRear.push(j);
        }
      }
    }

    const defenderOrderFrontFirst = defenderOrderFront.slice();
    const defenderOrderRearFirst = defenderOrderRear.slice();

    for (let i = 0; i < defenderOrderRear.length; i += 1) {
      defenderOrderFrontFirst.push(defenderOrderRear[i]);
    }
    for (let i = 0; i < defenderOrderFront.length; i += 1) {
      defenderOrderRearFirst.push(defenderOrderFront[i]);
    }

    return {
      attackerOrder,
      defenderOrderFrontFirst,
      defenderOrderRearFirst
    };
  }
`;
}

function applyVariantTransform(source, variantName) {
  let next = source;

  if (variantName === "speed_tie_rear_speed3_enemy_first" || variantName === "combo") {
    const start = next.indexOf("  function buildOrders(unitSpeed) {");
    const end = next.indexOf("  function getDefenderOrderForAttacker", start);
    if (start === -1 || end === -1) {
      throw new Error("buildOrders patch region not found");
    }
    next = `${next.slice(0, start)}${buildSpeedTieRearSpeed3EnemyFirstPatch()}${next.slice(end)}`;
  }

  if (variantName === "witch_splash_on_kill_only" || variantName === "combo") {
    const pattern = /        if \(attackerIndex === WITCHES_INDEX && unitNumbers\[WITCHES_INDEX\] > 0 && roundCount % 2 === 0\) \{\r?\n          witchesSplashDamage = ceilCombatValue\(attackerDamage \* 0\.25\);\r?\n        \}\r?\n\r?\n        if \(unitHealth\[defenderIndex\] <= 0\) \{\r?\n          if \(attackerIndex === LICHES_INDEX\) \{\r?\n            lichesSplashDamage = ceilCombatValue\(attackerDamage \* 0\.5\);\r?\n          \}/;
    const replacement = `        const witchesSplashEligible = attackerIndex === WITCHES_INDEX && unitNumbers[WITCHES_INDEX] > 0 && roundCount % 2 === 0;

        if (unitHealth[defenderIndex] <= 0) {
          if (witchesSplashEligible) {
            witchesSplashDamage = ceilCombatValue(attackerDamage * 0.25);
          }
          if (attackerIndex === LICHES_INDEX) {
            lichesSplashDamage = ceilCombatValue(attackerDamage * 0.5);
          }`;
    if (!pattern.test(next)) {
      throw new Error("witch splash patch region not found");
    }
    next = next.replace(pattern, replacement);
  }

  if (variantName === "witch_kill_plus_brood_alive_only") {
    next = applyVariantTransform(next, "witch_splash_on_kill_only");
    const broodPattern = /        if \(\r?\n          !detectedNextAttackerUnit &&\r?\n          \(unitNumbers\[BROODMOTHERS_INDEX\] > 0 \|\| broodmothersRoundStartCount >= 6\)\r?\n        \) \{/;
    const broodReplacement = `        if (
          !detectedNextAttackerUnit &&
          unitNumbers[BROODMOTHERS_INDEX] > 0
        ) {`;
    if (!broodPattern.test(next)) {
      throw new Error("broodmother patch region not found");
    }
    next = next.replace(broodPattern, broodReplacement);
  }

  return next;
}

function loadBattleCoreVariant(variantName) {
  const source = fs.readFileSync(path.join(__dirname, "battle-core.js"), "utf8");
  const transformed = variantName === "baseline" ? source : applyVariantTransform(source, variantName);
  const context = { globalThis: {}, console };
  vm.createContext(context);
  vm.runInContext(transformed, context);
  return context.globalThis.BattleCore;
}

function evaluateClosest(core, report, allyUnits, maxSeeds) {
  let best = null;
  for (let seed = 1; seed <= maxSeeds; seed += 1) {
    const result = core.simulateBattle(report.enemyCounts, report.allyCounts, { seed, collectLog: false });
    const lossDiff = countDifferences(result.allyLosses, report.actualLosses, allyUnits);
    const bloodDiff = Math.abs((result.lostBloodTotal || 0) - report.actualBlood);
    const winnerDiff = result.winner === report.winner ? 0 : 1;
    const score = winnerDiff * 1000000 + lossDiff * 1000 + bloodDiff;
    if (!best || score < best.score) {
      best = { seed, result, lossDiff, bloodDiff, winnerDiff, score };
    }
    if (winnerDiff === 0 && lossDiff === 0 && bloodDiff === 0) {
      break;
    }
  }
  return best;
}

function runWrongSuite(core, allyUnits, wrongReports) {
  let exact = 0;
  let improvedVsStored = 0;
  let worseVsStored = 0;
  let totalBestLossDiff = 0;
  let totalBestBloodDiff = 0;

  for (const report of wrongReports) {
    const storedDiff = countDifferences(report.simLosses, report.actualLosses, allyUnits);
    const best = evaluateClosest(core, {
      enemyCounts: report.enemyCounts,
      allyCounts: report.allyCounts,
      actualLosses: report.actualLosses,
      actualBlood: report.actualBlood,
      winner: "ally"
    }, allyUnits, 64);

    totalBestLossDiff += best.lossDiff;
    totalBestBloodDiff += best.bloodDiff;
    if (best.lossDiff === 0 && best.bloodDiff === 0 && best.winnerDiff === 0) {
      exact += 1;
    }
    if (best.lossDiff < storedDiff) {
      improvedVsStored += 1;
    } else if (best.lossDiff > storedDiff) {
      worseVsStored += 1;
    }
  }

  return {
    total: wrongReports.length,
    exact,
    improvedVsStored,
    worseVsStored,
    avgBestLossDiff: wrongReports.length ? totalBestLossDiff / wrongReports.length : 0,
    avgBestBloodDiff: wrongReports.length ? totalBestBloodDiff / wrongReports.length : 0
  };
}

function runApprovedSuite(core, allyUnits, approvedReports) {
  let exact = 0;
  const mismatches = [];
  for (const report of approvedReports) {
    const seeds = report.seed ? [report.seed] : [1, 2, 3, 4, 5, 6, 7, 8];
    let matched = false;
    let lastResult = null;
    for (const seed of seeds) {
      const result = core.simulateBattle(report.enemyCounts, report.allyCounts, { seed, collectLog: false });
      lastResult = result;
      if (
        result.winner === report.expectedWinner &&
        (result.lostBloodTotal || 0) === report.expectedBlood &&
        lossesMatch(result.allyLosses, report.expectedLosses, allyUnits)
      ) {
        matched = true;
        break;
      }
    }
    if (matched) {
      exact += 1;
    } else if (mismatches.length < 5) {
      mismatches.push({
        id: report.id,
        expectedBlood: report.expectedBlood,
        actualBlood: lastResult?.lostBloodTotal || 0
      });
    }
  }
  return {
    total: approvedReports.length,
    exact,
    mismatches
  };
}

function runTargetCase(core, allyUnits) {
  const seed1 = core.simulateBattle(TARGET_CASE.enemyCounts, TARGET_CASE.allyCounts, { seed: 1, collectLog: false });
  const best = evaluateClosest(core, TARGET_CASE, allyUnits, 64);
  return {
    seed1LossDiff: countDifferences(seed1.allyLosses, TARGET_CASE.actualLosses, allyUnits),
    seed1BloodDiff: Math.abs((seed1.lostBloodTotal || 0) - TARGET_CASE.actualBlood),
    seed1Blood: seed1.lostBloodTotal || 0,
    seed1Losses: seed1.allyLosses,
    bestSeed: best.seed,
    bestLossDiff: best.lossDiff,
    bestBloodDiff: best.bloodDiff,
    bestBlood: best.result?.lostBloodTotal || 0,
    bestLosses: best.result?.allyLosses || {}
  };
}

function formatLosses(losses, allyUnits) {
  return allyUnits.map((unit) => `${unit.key}:${losses?.[unit.key] || 0}`).join(" ");
}

function main() {
  const baselineCore = loadBattleCoreVariant("baseline");
  const allyUnits = baselineCore.ALLY_UNITS;
  const wrongReports = loadWrongReports(allyUnits);
  const approvedReports = loadApprovedReports(allyUnits);

  const variants = [
    "baseline",
    "speed_tie_rear_speed3_enemy_first",
    "witch_splash_on_kill_only",
    "combo",
    "witch_kill_plus_brood_alive_only"
  ];

  console.log(`wrong_reports=${wrongReports.length} approved_reports=${approvedReports.length}`);
  console.log("");

  for (const variant of variants) {
    const core = loadBattleCoreVariant(variant);
    const wrong = runWrongSuite(core, allyUnits, wrongReports);
    const approved = runApprovedSuite(core, allyUnits, approvedReports);
    const target = runTargetCase(core, allyUnits);

    console.log("============================================================");
    console.log(variant);
    console.log("============================================================");
    console.log(`wrong exact: ${wrong.exact}/${wrong.total}`);
    console.log(`wrong improved_vs_stored: ${wrong.improvedVsStored}`);
    console.log(`wrong worse_vs_stored: ${wrong.worseVsStored}`);
    console.log(`wrong avg_best_loss_diff: ${wrong.avgBestLossDiff.toFixed(2)}`);
    console.log(`wrong avg_best_blood_diff: ${wrong.avgBestBloodDiff.toFixed(2)}`);
    console.log(`approved exact: ${approved.exact}/${approved.total}`);
    console.log(`target seed1 blood: ${target.seed1Blood} diff_loss=${target.seed1LossDiff} diff_blood=${target.seed1BloodDiff}`);
    console.log(`target best<=64 seed: ${target.bestSeed} blood=${target.bestBlood} diff_loss=${target.bestLossDiff} diff_blood=${target.bestBloodDiff}`);
    console.log(`target seed1 losses: ${formatLosses(target.seed1Losses, allyUnits)}`);
    console.log(`target best losses:  ${formatLosses(target.bestLosses, allyUnits)}`);
    if (approved.mismatches.length > 0) {
      console.log("sample approved mismatches:");
      approved.mismatches.forEach((item) => {
        console.log(`  ${item.id}: expectedBlood=${item.expectedBlood} actualBlood=${item.actualBlood}`);
      });
    }
    console.log("");
  }
}

main();
