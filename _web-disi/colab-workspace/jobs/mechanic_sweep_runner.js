"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function parseInput() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Missing input JSON path.");
  }
  return JSON.parse(stripBom(fs.readFileSync(inputPath, "utf8")));
}

function loadDataset(datasetPath) {
  const rows = [];
  const raw = stripBom(fs.readFileSync(datasetPath, "utf8"));
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    rows.push(JSON.parse(trimmed));
  });
  if (rows.length === 0) {
    throw new Error(`Dataset is empty: ${datasetPath}`);
  }
  return rows;
}

function arraysToCounts(values, units) {
  const counts = {};
  units.forEach((unit, index) => {
    counts[unit.key] = Number(values?.[index] || 0);
  });
  return counts;
}

function lossDiffSummary(resultLosses, actualLosses, allyUnits, bloodByKey) {
  let weighted = 0;
  const perTierAbs = [];
  allyUnits.forEach((unit, index) => {
    const actual = Number(actualLosses?.[index] || 0);
    const predicted = Number(resultLosses?.[unit.key] || 0);
    const absDiff = Math.abs(predicted - actual);
    perTierAbs.push(absDiff);
    weighted += absDiff * Number(bloodByKey[unit.key] || 0);
  });
  return {
    weighted,
    perTierAbs,
  };
}

function buildBaselineSource() {
  return fs.readFileSync(path.resolve(__dirname, "..", "..", "battle-core.js"), "utf8");
}

function applyVariantTransform(source, variant) {
  let next = source;

  if (variant.witchSplashMode === "any_hit") {
    const pattern = /        const witchesSplashEligible = attackerIndex === WITCHES_INDEX && unitNumbers\[WITCHES_INDEX\] > 0 && roundCount % 2 === 0;\r?\n\r?\n        if \(unitHealth\[defenderIndex\] <= 0\) \{\r?\n          if \(witchesSplashEligible\) \{\r?\n            witchesSplashDamage = ceilCombatValue\(attackerDamage \* 0\.25\);\r?\n          \}\r?\n          if \(attackerIndex === LICHES_INDEX\) \{\r?\n            lichesSplashDamage = ceilCombatValue\(attackerDamage \* 0\.5\);\r?\n          \}/;
    const replacement = `        if (attackerIndex === WITCHES_INDEX && unitNumbers[WITCHES_INDEX] > 0 && roundCount % 2 === 0) {
          witchesSplashDamage = ceilCombatValue(attackerDamage * 0.25);
        }

        if (unitHealth[defenderIndex] <= 0) {
          if (attackerIndex === LICHES_INDEX) {
            lichesSplashDamage = ceilCombatValue(attackerDamage * 0.5);
          }`;
    if (!pattern.test(next)) {
      throw new Error("witch splash patch region not found");
    }
    next = next.replace(pattern, replacement);
  }

  if (variant.broodSpawnMode === "roundstart6") {
    const pattern = /        if \(\r?\n          !detectedNextAttackerUnit &&\r?\n          unitNumbers\[BROODMOTHERS_INDEX\] > 0\r?\n        \) \{/;
    const replacement = `        if (
          !detectedNextAttackerUnit &&
          (unitNumbers[BROODMOTHERS_INDEX] > 0 || broodmothersRoundStartCount >= 6)
        ) {`;
    if (!pattern.test(next)) {
      throw new Error("broodmother patch region not found");
    }
    next = next.replace(pattern, replacement);
  }

  if (Number.isFinite(variant.corpseRevengeFactor) && Math.abs(variant.corpseRevengeFactor - 0.2) > 1e-9) {
    const replacement = variant.corpseRevengeFactor.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    next = next.replace(
      "const corpsesDamage = Math.ceil(corpses * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * 0.2);",
      `const corpsesDamage = Math.ceil(corpses * UNIT_DESC[CORPSES_INDEX][HEALTH_INDEX] * ${replacement});`
    );
  }

  if (Number.isFinite(variant.bansheeReducePct) && Math.abs(variant.bansheeReducePct - 25) > 1e-9) {
    const reducePct = Math.round(variant.bansheeReducePct);
    const factor = (1 - reducePct / 100).toFixed(2);
    next = next.replace("hasarini %25 azaltti", `hasarini %${reducePct} azaltti`);
    next = next.replace("-%25 azalmis hasarla saldiriyor", `-%${reducePct} azalmis hasarla saldiriyor`);
    next = next.replace("damageMultiplier *= 0.75;", `damageMultiplier *= ${factor};`);
  }

  return next;
}

function loadBattleCoreVariant(variant) {
  const source = buildBaselineSource();
  const transformed = applyVariantTransform(source, variant);
  const context = {
    globalThis: {},
    console: {
      log() {},
      warn() {},
      error() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(transformed, context);
  return context.globalThis.BattleCore;
}

function makeVariants(config) {
  const witchModes = config.witchModes || ["on_kill_only", "any_hit"];
  const broodModes = config.broodModes || ["alive_only", "roundstart6"];
  const corpseFactors = config.corpseRevengeFactors || [0.18, 0.2, 0.22];
  const bansheeReducePcts = config.bansheeReducePcts || [20, 22, 25];

  const variants = [];
  for (const witchSplashMode of witchModes) {
    for (const broodSpawnMode of broodModes) {
      for (const corpseRevengeFactor of corpseFactors) {
        for (const bansheeReducePct of bansheeReducePcts) {
          const id = [
            `witch_${witchSplashMode}`,
            `brood_${broodSpawnMode}`,
            `corpse_${String(corpseRevengeFactor).replace(".", "_")}`,
            `banshee_${bansheeReducePct}`,
          ].join("__");
          variants.push({
            id,
            witchSplashMode,
            broodSpawnMode,
            corpseRevengeFactor,
            bansheeReducePct,
          });
        }
      }
    }
  }
  return variants;
}

function evaluateRowBest(core, row, maxSeeds) {
  const { ALLY_UNITS, ENEMY_UNITS, BLOOD_BY_ALLY_KEY, simulateBattle } = core;
  const enemyCounts = arraysToCounts(row.enemyCounts, ENEMY_UNITS);
  const allyCounts = arraysToCounts(row.allyCounts, ALLY_UNITS);

  let best = null;
  for (let seed = 1; seed <= maxSeeds; seed += 1) {
    const result = simulateBattle(enemyCounts, allyCounts, { seed, collectLog: false });
    const lossSummary = lossDiffSummary(result.allyLosses || {}, row.actualLosses, ALLY_UNITS, BLOOD_BY_ALLY_KEY);
    const bloodAbsDiff = Math.abs(Number(result.lostBloodTotal || 0) - Number(row.actualBlood || 0));
    const exact = lossSummary.weighted === 0 && bloodAbsDiff === 0;
    const score = lossSummary.weighted * 1000 + bloodAbsDiff;
    if (!best || score < best.score) {
      best = {
        seed,
        score,
        exact,
        bloodAbsDiff,
        weightedLossDiff: lossSummary.weighted,
        perTierAbs: lossSummary.perTierAbs,
        result,
      };
    }
    if (exact) {
      break;
    }
  }
  return best;
}

function initBucket() {
  return {
    count: 0,
    exact: 0,
    weightedLossDiffSum: 0,
    bloodAbsDiffSum: 0,
    perTierAbsSums: Array.from({ length: 8 }, () => 0),
    sampleRepairs: [],
  };
}

function bucketSummary(bucket) {
  const divisor = Math.max(1, bucket.count);
  return {
    count: bucket.count,
    exact: bucket.exact,
    exactRate: bucket.exact / divisor,
    avgWeightedLossDiff: bucket.weightedLossDiffSum / divisor,
    avgBloodAbsDiff: bucket.bloodAbsDiffSum / divisor,
    avgPerTierAbsDiff: bucket.perTierAbsSums.map((value) => value / divisor),
    sampleRepairs: bucket.sampleRepairs,
  };
}

function evaluateVariant(variant, rows, maxSeeds) {
  const core = loadBattleCoreVariant(variant);
  const buckets = {
    wrong: initBucket(),
    correct: initBucket(),
  };

  rows.forEach((row, index) => {
    const best = evaluateRowBest(core, row, maxSeeds);
    const bucket = row.wrongFlag ? buckets.wrong : buckets.correct;
    bucket.count += 1;
    bucket.weightedLossDiffSum += best.weightedLossDiff;
    bucket.bloodAbsDiffSum += best.bloodAbsDiff;
    if (best.exact) {
      bucket.exact += 1;
    }
    best.perTierAbs.forEach((value, tierIndex) => {
      bucket.perTierAbsSums[tierIndex] += value;
    });
    if (row.wrongFlag && bucket.sampleRepairs.length < 5) {
      bucket.sampleRepairs.push({
        rowIndex: index,
        seed: best.seed,
        exact: best.exact,
        weightedLossDiff: best.weightedLossDiff,
        bloodAbsDiff: best.bloodAbsDiff,
      });
    }
  });

  return {
    id: variant.id,
    variant,
    wrong: bucketSummary(buckets.wrong),
    correct: bucketSummary(buckets.correct),
  };
}

function compareVariants(left, right) {
  if (left.correct.exactRate !== right.correct.exactRate) {
    return right.correct.exactRate - left.correct.exactRate;
  }
  if (left.correct.avgWeightedLossDiff !== right.correct.avgWeightedLossDiff) {
    return left.correct.avgWeightedLossDiff - right.correct.avgWeightedLossDiff;
  }
  if (left.wrong.exactRate !== right.wrong.exactRate) {
    return right.wrong.exactRate - left.wrong.exactRate;
  }
  if (left.wrong.avgWeightedLossDiff !== right.wrong.avgWeightedLossDiff) {
    return left.wrong.avgWeightedLossDiff - right.wrong.avgWeightedLossDiff;
  }
  return left.wrong.avgBloodAbsDiff - right.wrong.avgBloodAbsDiff;
}

function main() {
  const input = parseInput();
  const datasetPath = path.resolve(String(input.datasetPath || ""));
  if (!datasetPath) {
    throw new Error("datasetPath is required.");
  }
  const rows = loadDataset(datasetPath);
  const variants = makeVariants(input);
  const maxSeeds = Math.max(1, Math.floor(Number(input.maxSeeds || 48)));
  const topLimit = Math.max(1, Math.floor(Number(input.topLimit || 12)));

  const evaluated = variants.map((variant) => evaluateVariant(variant, rows, maxSeeds));
  evaluated.sort(compareVariants);

  const baseline = evaluated.find((item) => item.id === "witch_on_kill_only__brood_alive_only__corpse_0_2__banshee_25") || evaluated[0];
  const top = evaluated.slice(0, topLimit);

  process.stdout.write(JSON.stringify({
    ok: true,
    datasetPath,
    rowCount: rows.length,
    maxSeeds,
    variantCount: evaluated.length,
    baseline,
    top,
  }));
}

main();
