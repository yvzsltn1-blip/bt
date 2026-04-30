"use strict";

require("./battle-core.js");

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  POINTS_BY_ALLY_KEY,
  calculateArmyPoints,
  getStagePointLimit,
  simulateBattle,
  optimizeArmyUsage
} = globalThis.BattleCore;

const PRESET_SCENARIOS = {
  samples: {
    stage: 10,
    enemy: Object.fromEntries(ENEMY_UNITS.map((unit) => [unit.key, unit.sample || 0])),
    allyPool: Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, unit.sample || 0]))
  },
  progress: {
    stage: 5,
    enemy: {
      skeletons: 10,
      zombies: 5,
      cultists: 3,
      bonewings: 0,
      corpses: 0,
      wraiths: 0,
      revenants: 0,
      giants: 0,
      broodmothers: 0,
      liches: 0
    },
    allyPool: {
      bats: 50,
      ghouls: 20,
      thralls: 10,
      banshees: 0,
      necromancers: 0,
      gargoyles: 0,
      witches: 0,
      rotmaws: 0
    }
  },
  progress_fullpool: {
    stage: 5,
    enemy: {
      skeletons: 10,
      zombies: 5,
      cultists: 3,
      bonewings: 0,
      corpses: 0,
      wraiths: 0,
      revenants: 0,
      giants: 0,
      broodmothers: 0,
      liches: 0
    },
    allyPool: Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, unit.sample || 0]))
  }
};

function parseArgs(argv) {
  const options = {
    preset: "progress",
    mode: "balanced",
    batchRuns: 1,
    exactTrials: 24,
    minWinRate: 0.75,
    diversityMode: false,
    stage: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--preset" && next) {
      options.preset = next;
      index += 1;
      continue;
    }
    if (token === "--mode" && next) {
      options.mode = next;
      index += 1;
      continue;
    }
    if (token === "--batch-runs" && next) {
      options.batchRuns = Math.max(1, Number.parseInt(next, 10) || 1);
      index += 1;
      continue;
    }
    if (token === "--exact-trials" && next) {
      options.exactTrials = Math.max(1, Number.parseInt(next, 10) || 1);
      index += 1;
      continue;
    }
    if (token === "--min-win-rate" && next) {
      options.minWinRate = Number.parseFloat(next);
      index += 1;
      continue;
    }
    if (token === "--stage" && next) {
      options.stage = Math.max(1, Number.parseInt(next, 10) || 1);
      index += 1;
      continue;
    }
    if (token === "--diversity") {
      options.diversityMode = true;
    }
  }

  return options;
}

function getScenario(options) {
  const preset = PRESET_SCENARIOS[options.preset];
  if (!preset) {
    throw new Error(`Unknown preset: ${options.preset}`);
  }

  return {
    stage: options.stage || preset.stage,
    enemy: { ...preset.enemy },
    allyPool: { ...preset.allyPool }
  };
}

function getRunConfig(stage, runIndex, mode, diversityMode = false) {
  const presets = {
    fast: {
      trialStart: 4,
      trialStep: 1,
      trialMax: 12,
      fullStart: 6,
      fullStep: 2,
      fullMax: 20,
      beamStart: 7,
      beamStep: 2,
      beamMax: 18,
      iterStart: 3,
      iterStep: 1,
      iterMax: 6,
      eliteCount: 4,
      stabilityMultiplier: 2,
      exploratoryMultiplier: 6,
      exhaustiveLimit: 1500,
      seedOffset: 1301
    },
    balanced: {
      trialStart: 6,
      trialStep: 2,
      trialMax: 20,
      fullStart: 10,
      fullStep: 4,
      fullMax: 36,
      beamStart: 10,
      beamStep: 3,
      beamMax: 28,
      iterStart: 4,
      iterStep: 1,
      iterMax: 8,
      eliteCount: 6,
      stabilityMultiplier: 3,
      exploratoryMultiplier: 10,
      exhaustiveLimit: 6000,
      seedOffset: 2603
    },
    deep: {
      trialStart: 10,
      trialStep: 3,
      trialMax: 30,
      fullStart: 16,
      fullStep: 6,
      fullMax: 48,
      beamStart: 14,
      beamStep: 4,
      beamMax: 36,
      iterStart: 5,
      iterStep: 1,
      iterMax: 10,
      eliteCount: 8,
      stabilityMultiplier: 4,
      exploratoryMultiplier: 16,
      exhaustiveLimit: 20000,
      seedOffset: 5209
    }
  };

  const preset = presets[mode] || presets.balanced;
  const trialCount = Math.min(preset.trialStart + (runIndex - 1) * preset.trialStep, preset.trialMax);
  const fullArmyTrials = Math.min(preset.fullStart + (runIndex - 1) * preset.fullStep, preset.fullMax);
  const beamWidth = Math.min(preset.beamStart + (runIndex - 1) * preset.beamStep, preset.beamMax);

  return {
    trialCount,
    fullArmyTrials,
    beamWidth,
    maxIterations: Math.min(preset.iterStart + (runIndex - 1) * preset.iterStep, preset.iterMax),
    eliteCount: preset.eliteCount,
    stabilityTrials: Math.max(fullArmyTrials, trialCount * preset.stabilityMultiplier),
    exploratoryCandidateCount: Math.min(Math.max(60, beamWidth * preset.exploratoryMultiplier), 640),
    exhaustiveCandidateLimit: preset.exhaustiveLimit,
    diversityCandidateCount: diversityMode
      ? Math.min(Math.max(24, Math.floor(beamWidth * 3)), 144)
      : 0,
    baseSeed: 41017 + stage * 31 + runIndex * 7919 + preset.seedOffset + (diversityMode ? 170003 : 0)
  };
}

function getCountSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function compareEvaluations(a, b) {
  if (a.feasible !== b.feasible) {
    return a.feasible ? -1 : 1;
  }
  if (a.feasible) {
    if (a.winRate !== b.winRate) {
      return b.winRate - a.winRate;
    }
    if (a.avgLostBlood !== b.avgLostBlood) {
      return a.avgLostBlood - b.avgLostBlood;
    }
    if (a.avgUsedPoints !== b.avgUsedPoints) {
      return a.avgUsedPoints - b.avgUsedPoints;
    }
    if (a.avgUsedCapacity !== b.avgUsedCapacity) {
      return a.avgUsedCapacity - b.avgUsedCapacity;
    }
    if (a.avgLostUnits !== b.avgLostUnits) {
      return a.avgLostUnits - b.avgLostUnits;
    }
    return a.signature.localeCompare(b.signature);
  }

  if (a.winRate !== b.winRate) {
    return b.winRate - a.winRate;
  }
  if (a.avgEnemyRemainingHealth !== b.avgEnemyRemainingHealth) {
    return a.avgEnemyRemainingHealth - b.avgEnemyRemainingHealth;
  }
  if (a.avgEnemyRemainingUnits !== b.avgEnemyRemainingUnits) {
    return a.avgEnemyRemainingUnits - b.avgEnemyRemainingUnits;
  }
  return a.signature.localeCompare(b.signature);
}

function cloneCounts(source) {
  return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, source[unit.key] || 0]));
}

function evaluateCounts(enemyCounts, counts, options) {
  const trials = options.trials;
  const minWinRate = options.minWinRate;
  const baseSeed = options.baseSeed;
  const signature = getCountSignature(counts);
  let wins = 0;
  let winLostBloodSum = 0;
  let winLostUnitsSum = 0;
  let usedCapacitySum = 0;
  let usedPointsSum = 0;
  let enemyRemainingHealthSum = 0;
  let enemyRemainingUnitsSum = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977 + signature.length * 13;
    const result = simulateBattle(enemyCounts, counts, { seed, collectLog: false });
    usedCapacitySum += result.usedCapacity;
    usedPointsSum += result.usedPoints;
    enemyRemainingHealthSum += result.enemyRemainingHealth;
    enemyRemainingUnitsSum += result.enemyRemainingUnits;
    if (result.winner === "ally") {
      wins += 1;
      winLostBloodSum += result.lostBloodTotal;
      winLostUnitsSum += result.lostUnitsTotal;
    }
  }

  const winRate = wins / trials;
  return {
    counts: cloneCounts(counts),
    signature,
    trials,
    wins,
    winRate,
    feasible: winRate >= minWinRate,
    avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgUsedCapacity: usedCapacitySum / trials,
    avgUsedPoints: usedPointsSum / trials,
    avgEnemyRemainingHealth: enemyRemainingHealthSum / trials,
    avgEnemyRemainingUnits: enemyRemainingUnitsSum / trials
  };
}

function getResultSource(result) {
  return result.possible ? result.recommendation : (result.fallback || result.fullArmyEvaluation);
}

function pickBetterResult(left, right) {
  return compareEvaluations(getResultSource(left), getResultSource(right)) <= 0 ? left : right;
}

function runOptimizerLikeUi(stage, enemy, allyPool, options) {
  const maxPoints = getStagePointLimit(stage);
  let bestResult = null;
  let totalCandidates = 0;
  let totalSimulationRuns = 0;

  for (let runIndex = 1; runIndex <= options.batchRuns; runIndex += 1) {
    const runConfig = getRunConfig(stage, runIndex, options.mode, options.diversityMode);
    const result = optimizeArmyUsage(allyPool, enemy, {
      maxPoints,
      minWinRate: options.minWinRate,
      trialCount: runConfig.trialCount,
      fullArmyTrials: runConfig.fullArmyTrials,
      beamWidth: runConfig.beamWidth,
      maxIterations: runConfig.maxIterations,
      eliteCount: runConfig.eliteCount,
      stabilityTrials: runConfig.stabilityTrials,
      baseSeed: runConfig.baseSeed,
      diversityMode: options.diversityMode,
      exploratoryCandidateCount: runConfig.exploratoryCandidateCount,
      exhaustiveCandidateLimit: runConfig.exhaustiveCandidateLimit,
      diversityCandidateCount: runConfig.diversityCandidateCount,
      knownSignatures: []
    });

    bestResult = bestResult ? pickBetterResult(bestResult, result) : result;
    totalCandidates += result.searchedCandidates || 0;
    totalSimulationRuns += result.simulationRuns || 0;
  }

  return {
    result: bestResult,
    totalCandidates,
    totalSimulationRuns
  };
}

function enumerateCandidates(allyPool, maxPoints, visit) {
  const counts = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  let total = 0;

  function walk(unitIndex, remainingPoints) {
    if (unitIndex >= ALLY_UNITS.length) {
      total += 1;
      visit(cloneCounts(counts));
      return;
    }

    const unit = ALLY_UNITS[unitIndex];
    const cost = POINTS_BY_ALLY_KEY[unit.key];
    const maxCount = Math.min(allyPool[unit.key] || 0, Math.floor(remainingPoints / cost));

    for (let count = 0; count <= maxCount; count += 1) {
      counts[unit.key] = count;
      walk(unitIndex + 1, remainingPoints - count * cost);
    }

    counts[unit.key] = 0;
  }

  walk(0, maxPoints);
  return total;
}

function formatCounts(counts) {
  return ALLY_UNITS
    .map((unit) => ({ label: unit.label, count: counts[unit.key] || 0 }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.label}: ${entry.count}`)
    .join(", ") || "(bos)";
}

function dominatesForQuestion(candidate, baseline) {
  return candidate.feasible &&
    baseline.feasible &&
    candidate.avgUsedPoints <= baseline.avgUsedPoints &&
    candidate.avgLostBlood <= baseline.avgLostBlood &&
    candidate.winRate >= baseline.winRate &&
    (
      candidate.avgUsedPoints < baseline.avgUsedPoints ||
      candidate.avgLostBlood < baseline.avgLostBlood ||
      candidate.winRate > baseline.winRate
    );
}

function summarizeEvaluation(label, evaluation) {
  return [
    `${label}:`,
    `  winRate=${(evaluation.winRate * 100).toFixed(1)}%`,
    `  avgLostBlood=${Number.isFinite(evaluation.avgLostBlood) ? evaluation.avgLostBlood.toFixed(2) : "inf"}`,
    `  avgUsedPoints=${evaluation.avgUsedPoints.toFixed(2)}`,
    `  avgUsedCapacity=${evaluation.avgUsedCapacity.toFixed(2)}`,
    `  avgLostUnits=${Number.isFinite(evaluation.avgLostUnits) ? evaluation.avgLostUnits.toFixed(2) : "inf"}`,
    `  counts=${formatCounts(evaluation.counts)}`
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenario = getScenario(options);
  const maxPoints = getStagePointLimit(scenario.stage);
  const optimizerRun = runOptimizerLikeUi(scenario.stage, scenario.enemy, scenario.allyPool, options);
  const optimizerChoice = getResultSource(optimizerRun.result);
  const optimizerEval = evaluateCounts(scenario.enemy, optimizerChoice.counts, {
    trials: options.exactTrials,
    minWinRate: options.minWinRate,
    baseSeed: 900001 + scenario.stage * 101
  });

  let exactBest = null;
  let cheapestWin = null;
  let lowestLossWin = null;
  let bestDominator = null;
  let feasibleCount = 0;

  const totalCandidates = enumerateCandidates(scenario.allyPool, maxPoints, (candidate) => {
    const evaluation = evaluateCounts(scenario.enemy, candidate, {
      trials: options.exactTrials,
      minWinRate: options.minWinRate,
      baseSeed: 900001 + scenario.stage * 101
    });

    if (!exactBest || compareEvaluations(evaluation, exactBest) < 0) {
      exactBest = evaluation;
    }

    if (!evaluation.feasible) {
      return;
    }

    feasibleCount += 1;

    if (!cheapestWin ||
      evaluation.avgUsedPoints < cheapestWin.avgUsedPoints ||
      (evaluation.avgUsedPoints === cheapestWin.avgUsedPoints && compareEvaluations(evaluation, cheapestWin) < 0)
    ) {
      cheapestWin = evaluation;
    }

    if (!lowestLossWin ||
      evaluation.avgLostBlood < lowestLossWin.avgLostBlood ||
      (evaluation.avgLostBlood === lowestLossWin.avgLostBlood && compareEvaluations(evaluation, lowestLossWin) < 0)
    ) {
      lowestLossWin = evaluation;
    }

    if (dominatesForQuestion(evaluation, optimizerEval) &&
      (!bestDominator || compareEvaluations(evaluation, bestDominator) < 0)
    ) {
      bestDominator = evaluation;
    }
  });

  const exactVsOptimizer = compareEvaluations(exactBest, optimizerEval);
  const pointDelta = optimizerEval.avgUsedPoints - exactBest.avgUsedPoints;
  const lossDelta = optimizerEval.avgLostBlood - exactBest.avgLostBlood;

  console.log(`Scenario preset: ${options.preset}`);
  console.log(`Stage: ${scenario.stage} (point limit ${maxPoints})`);
  console.log(`Optimizer mode: ${options.mode}, batchRuns=${options.batchRuns}, diversity=${options.diversityMode}`);
  console.log(`Exact evaluation trials: ${options.exactTrials}, minWinRate=${options.minWinRate}`);
  console.log(`Total exhaustive candidates: ${totalCandidates}`);
  console.log(`Feasible exhaustive candidates: ${feasibleCount}`);
  console.log(`Optimizer searched candidates: ${optimizerRun.totalCandidates}`);
  console.log(`Optimizer simulation runs: ${optimizerRun.totalSimulationRuns}`);
  console.log("");
  console.log(summarizeEvaluation("Optimizer choice rechecked", optimizerEval));
  console.log("");
  console.log(summarizeEvaluation("Exact best by current scoring", exactBest));

  if (cheapestWin) {
    console.log("");
    console.log(summarizeEvaluation("Cheapest winning army", cheapestWin));
  }

  if (lowestLossWin) {
    console.log("");
    console.log(summarizeEvaluation("Lowest-loss winning army", lowestLossWin));
  }

  console.log("");
  console.log(`Exact-vs-optimizer verdict: ${exactVsOptimizer < 0 ? "optimizer missed a better army" : "optimizer matched the exact best"}`);
  console.log(`Point gap vs exact best: ${Number.isFinite(pointDelta) ? pointDelta.toFixed(2) : "n/a"}`);
  console.log(`Loss gap vs exact best: ${Number.isFinite(lossDelta) ? lossDelta.toFixed(2) : "n/a"}`);

  if (bestDominator) {
    console.log("");
    console.log("A strictly better answer exists with no more points and no more loss:");
    console.log(summarizeEvaluation("Dominating exact candidate", bestDominator));
  } else {
    console.log("");
    console.log("No exact candidate was found that beats the optimizer on both points and losses at the same time.");
  }
}

main();
