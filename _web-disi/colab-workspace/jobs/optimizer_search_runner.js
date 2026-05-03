"use strict";

const fs = require("fs");
const path = require("path");

require(path.resolve(__dirname, "..", "..", "battle-core.js"));

const {
  ALLY_UNITS,
  ENEMY_UNITS,
  optimizeArmyUsage,
  simulateBattle,
  getStagePointLimit,
  getStoneAdjustedLossProfile,
  cloneCounts
} = globalThis.BattleCore;

function parseInput() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Missing input JSON path.");
  }
  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

function normalizeCounts(source, units) {
  const result = {};
  units.forEach((unit) => {
    result[unit.key] = Math.max(0, Math.floor(Number(source?.[unit.key] || 0)));
  });
  return result;
}

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts?.[unit.key] || 0).join("|");
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
      ? Math.min(Math.max(24, Math.floor((beamWidth || 0) * 3)), 144)
      : 0,
    baseSeed: 41017 + stage * 31 + runIndex * 7919 + preset.seedOffset + (diversityMode ? 170003 : 0)
  };
}

function getDisplayedLossValue(entry) {
  if (!entry) {
    return Number.POSITIVE_INFINITY;
  }
  const value = entry.stoneMode
    ? (entry.expectedStoneAdjustedLostBlood ?? entry.avgStoneAdjustedLostBlood)
    : (entry.expectedLostBlood ?? entry.avgLostBlood);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function compareEvaluations(left, right, options) {
  const objective = options.objective === "min_army" ? "min_army" : "min_loss";
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }

  if (left.feasible) {
    if ((left.winRate || 0) !== (right.winRate || 0)) {
      return (right.winRate || 0) - (left.winRate || 0);
    }
    if (objective === "min_army") {
      if ((left.avgUsedPoints || 0) !== (right.avgUsedPoints || 0)) {
        return (left.avgUsedPoints || 0) - (right.avgUsedPoints || 0);
      }
      if (getDisplayedLossValue(left) !== getDisplayedLossValue(right)) {
        return getDisplayedLossValue(left) - getDisplayedLossValue(right);
      }
    } else {
      if (getDisplayedLossValue(left) !== getDisplayedLossValue(right)) {
        return getDisplayedLossValue(left) - getDisplayedLossValue(right);
      }
      if ((left.avgUsedPoints || 0) !== (right.avgUsedPoints || 0)) {
        return (left.avgUsedPoints || 0) - (right.avgUsedPoints || 0);
      }
    }
    return (left.avgUsedCapacity || 0) - (right.avgUsedCapacity || 0);
  }

  if ((left.winRate || 0) !== (right.winRate || 0)) {
    return (right.winRate || 0) - (left.winRate || 0);
  }
  if ((left.avgEnemyRemainingHealth || 0) !== (right.avgEnemyRemainingHealth || 0)) {
    return (left.avgEnemyRemainingHealth || 0) - (right.avgEnemyRemainingHealth || 0);
  }
  return (left.avgEnemyRemainingUnits || 0) - (right.avgEnemyRemainingUnits || 0);
}

function pickBetterOptimizerResult(left, right) {
  const leftSource = left.possible ? left.recommendation : left.fallback || left.fullArmyEvaluation;
  const rightSource = right.possible ? right.recommendation : right.fallback || right.fullArmyEvaluation;
  return compareEvaluations(leftSource, rightSource, {
    objective: rightSource?.objective || leftSource?.objective || "min_loss"
  }) <= 0 ? left : right;
}

function mergeTopEvaluations(existingEntries, incomingEntries, options) {
  const limit = Math.max(1, options.limit || 40);
  const merged = new Map();

  [...(existingEntries || []), ...(incomingEntries || [])].forEach((entry) => {
    if (!entry?.counts) {
      return;
    }
    const signature = entry.signature || getSignature(entry.counts);
    const current = merged.get(signature);
    if (!current || compareEvaluations(entry, current, options) < 0) {
      merged.set(signature, entry);
    }
  });

  return [...merged.values()]
    .sort((left, right) => compareEvaluations(left, right, options))
    .slice(0, limit);
}

function evaluateCounts(enemyCounts, counts, options) {
  const trials = Math.max(1, Math.floor(options.trials || 120));
  const baseSeed = Math.floor(options.baseSeed || 42042);
  const stoneMode = Boolean(options.stoneMode);
  const minWinRate = Number.isFinite(options.minWinRate) ? options.minWinRate : 0.75;
  const objective = options.objective === "min_army" ? "min_army" : "min_loss";

  let wins = 0;
  let totalLostBloodSum = 0;
  let totalLostUnitsSum = 0;
  let winLostBloodSum = 0;
  let winLostUnitsSum = 0;
  let totalStoneAdjustedLostBloodSum = 0;
  let totalStoneAdjustedLostUnitsSum = 0;
  let totalStoneCountSum = 0;
  let stoneAdjustedLostBloodSum = 0;
  let stoneAdjustedLostUnitsSum = 0;
  let stoneCountSum = 0;
  let usedCapacitySum = 0;
  let usedPointsSum = 0;
  let enemyRemainingHealthSum = 0;
  let enemyRemainingUnitsSum = 0;
  const totalAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const totalStoneAdjustedAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const allyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const stoneAdjustedAllyLossesSum = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const winningSeeds = [];

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const result = simulateBattle(enemyCounts, counts, { seed, collectLog: false });
    usedCapacitySum += result.usedCapacity;
    usedPointsSum += result.usedPoints;
    enemyRemainingHealthSum += result.enemyRemainingHealth;
    enemyRemainingUnitsSum += result.enemyRemainingUnits;
    totalLostBloodSum += result.lostBloodTotal;
    totalLostUnitsSum += result.lostUnitsTotal;
    const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
    totalStoneAdjustedLostBloodSum += stoneProfile.permanentLostBlood;
    totalStoneAdjustedLostUnitsSum += stoneProfile.permanentLostUnits;
    totalStoneCountSum += stoneProfile.stoneCount;
    ALLY_UNITS.forEach((unit) => {
      totalAllyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
      totalStoneAdjustedAllyLossesSum[unit.key] += stoneProfile.permanentLossesByKey[unit.key] || 0;
    });
    if (result.winner === "ally") {
      wins += 1;
      winLostBloodSum += result.lostBloodTotal;
      winLostUnitsSum += result.lostUnitsTotal;
      stoneAdjustedLostBloodSum += stoneProfile.permanentLostBlood;
      stoneAdjustedLostUnitsSum += stoneProfile.permanentLostUnits;
      stoneCountSum += stoneProfile.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        allyLossesSum[unit.key] += result.allyLosses?.[unit.key] || 0;
        stoneAdjustedAllyLossesSum[unit.key] += stoneProfile.permanentLossesByKey[unit.key] || 0;
      });
      winningSeeds.push(seed);
    }
  }

  return {
    counts: cloneCounts(counts, ALLY_UNITS),
    signature: getSignature(counts),
    trials,
    wins,
    winRate: wins / trials,
    feasible: (wins / trials) >= minWinRate,
    expectedLostBlood: totalLostBloodSum / trials,
    expectedLostUnits: totalLostUnitsSum / trials,
    avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneAdjustedLostBlood: totalStoneAdjustedLostBloodSum / trials,
    expectedStoneAdjustedLostUnits: totalStoneAdjustedLostUnitsSum / trials,
    avgStoneAdjustedLostBlood: wins > 0 ? stoneAdjustedLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgStoneAdjustedLostUnits: wins > 0 ? stoneAdjustedLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneCount: totalStoneCountSum / trials,
    avgStoneCount: wins > 0 ? stoneCountSum / wins : 0,
    avgUsedCapacity: usedCapacitySum / trials,
    avgUsedPoints: usedPointsSum / trials,
    avgEnemyRemainingHealth: enemyRemainingHealthSum / trials,
    avgEnemyRemainingUnits: enemyRemainingUnitsSum / trials,
    expectedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, totalAllyLossesSum[unit.key] / trials])),
    expectedStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, totalStoneAdjustedAllyLossesSum[unit.key] / trials])),
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? allyLossesSum[unit.key] / wins : 0])),
    avgStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, wins > 0 ? stoneAdjustedAllyLossesSum[unit.key] / wins : 0])),
    objective,
    stoneMode,
    winningSeeds
  };
}

function sanitizeEvaluation(entry) {
  if (!entry) {
    return null;
  }
  return {
    counts: cloneCounts(entry.counts, ALLY_UNITS),
    signature: entry.signature || getSignature(entry.counts),
    trials: entry.trials,
    wins: entry.wins,
    winRate: entry.winRate,
    feasible: entry.feasible,
    displayedLoss: getDisplayedLossValue(entry),
    expectedLostBlood: entry.expectedLostBlood,
    avgLostBlood: entry.avgLostBlood,
    expectedStoneAdjustedLostBlood: entry.expectedStoneAdjustedLostBlood,
    avgStoneAdjustedLostBlood: entry.avgStoneAdjustedLostBlood,
    avgUsedPoints: entry.avgUsedPoints,
    avgUsedCapacity: entry.avgUsedCapacity,
    avgEnemyRemainingHealth: entry.avgEnemyRemainingHealth,
    avgEnemyRemainingUnits: entry.avgEnemyRemainingUnits,
    expectedAllyLosses: entry.expectedAllyLosses || {},
    avgAllyLosses: entry.avgAllyLosses || {},
    expectedStoneAdjustedAllyLosses: entry.expectedStoneAdjustedAllyLosses || {},
    avgStoneAdjustedAllyLosses: entry.avgStoneAdjustedAllyLosses || {},
    objective: entry.objective,
    stoneMode: entry.stoneMode,
    winningSeeds: [...(entry.winningSeeds || [])]
  };
}

function main() {
  const args = parseInput();
  const stage = Math.max(1, Math.floor(Number(args.stage || 1)));
  const mode = args.mode === "fast" || args.mode === "deep" ? args.mode : "balanced";
  const objective = args.objective === "min_army" ? "min_army" : "min_loss";
  const stoneMode = Boolean(args.stoneMode);
  const diversityMode = Boolean(args.diversityMode);
  const minWinRate = Number.isFinite(args.minWinRate) ? args.minWinRate : 0.75;
  const allyPool = normalizeCounts(args.allyPool || {}, ALLY_UNITS);
  const enemyCounts = normalizeCounts(args.enemyCounts || {}, ENEMY_UNITS);
  const maxPoints = Number.isFinite(args.maxPoints) ? Math.floor(args.maxPoints) : getStagePointLimit(stage);
  const maxBatchRuns = Math.max(1, Math.floor(Number(args.maxBatchRuns || args.batchRuns || 24)));
  const maxSeconds = Math.max(30, Math.floor(Number(args.maxSeconds || 1800)));
  const finalValidationTrials = Math.max(20, Math.floor(Number(args.finalValidationTrials || 160)));
  const topCandidateLimit = Math.max(5, Math.floor(Number(args.topCandidateLimit || 40)));
  const seedCandidateLimit = Math.max(0, Math.floor(Number(args.seedCandidateLimit || 20)));
  const targetDisplayedLoss = Number.isFinite(args.targetDisplayedLoss) ? Number(args.targetDisplayedLoss) : null;

  const startedAt = Date.now();
  let runIndex = 0;
  let bestResult = null;
  let topCandidates = [];
  let totalCandidates = 0;
  let totalSimulationRuns = 0;
  const uniqueSignatures = new Set();
  const runSummaries = [];

  while (runIndex < maxBatchRuns && ((Date.now() - startedAt) / 1000) < maxSeconds) {
    runIndex += 1;
    const runConfig = getRunConfig(stage, runIndex, mode, diversityMode);
    const seedCandidates = topCandidates.slice(0, seedCandidateLimit).map((entry) => entry.counts);
    const result = optimizeArmyUsage(allyPool, enemyCounts, {
      maxPoints,
      minWinRate,
      trialCount: runConfig.trialCount,
      fullArmyTrials: runConfig.fullArmyTrials,
      beamWidth: runConfig.beamWidth,
      maxIterations: runConfig.maxIterations,
      eliteCount: runConfig.eliteCount,
      stabilityTrials: runConfig.stabilityTrials,
      baseSeed: runConfig.baseSeed,
      objective,
      stoneMode,
      diversityMode,
      exploratoryCandidateCount: runConfig.exploratoryCandidateCount,
      exhaustiveCandidateLimit: runConfig.exhaustiveCandidateLimit,
      diversityCandidateCount: runConfig.diversityCandidateCount,
      knownSignatures: [...uniqueSignatures],
      seedCandidates
    });

    bestResult = bestResult ? pickBetterOptimizerResult(bestResult, result) : result;
    totalCandidates += result.searchedCandidates || 0;
    totalSimulationRuns += result.simulationRuns || 0;
    (result.uniqueCandidateSignatures || []).forEach((signature) => uniqueSignatures.add(signature));
    topCandidates = mergeTopEvaluations(
      topCandidates,
      [
        ...(result.topCandidates || []),
        result.recommendation || null,
        result.fallback || null,
        result.fullArmyEvaluation || null
      ].filter(Boolean),
      { objective, stoneMode, limit: topCandidateLimit }
    );

    const bestSource = result.possible ? result.recommendation : result.fallback || result.fullArmyEvaluation;
    runSummaries.push({
      runIndex,
      searchedCandidates: result.searchedCandidates || 0,
      simulationRuns: result.simulationRuns || 0,
      uniqueCandidateCount: result.uniqueCandidateCount || 0,
      possible: Boolean(result.possible),
      displayedLoss: getDisplayedLossValue(bestSource),
      winRate: bestSource?.winRate || 0,
      avgUsedPoints: bestSource?.avgUsedPoints || 0,
      baseSeed: runConfig.baseSeed
    });

    if (
      targetDisplayedLoss !== null &&
      bestResult?.possible &&
      getDisplayedLossValue(bestResult.recommendation) <= targetDisplayedLoss
    ) {
      break;
    }
  }

  const validationPool = mergeTopEvaluations(
    [],
    [
      ...(topCandidates || []),
      bestResult?.recommendation || null,
      bestResult?.fallback || null,
      bestResult?.fullArmyEvaluation || null
    ].filter(Boolean),
    { objective, stoneMode, limit: Math.max(topCandidateLimit, 12) }
  );

  const validated = validationPool
    .map((entry, index) => evaluateCounts(enemyCounts, entry.counts, {
      trials: finalValidationTrials,
      baseSeed: 910001 + index * 104729,
      stoneMode,
      minWinRate,
      objective
    }))
    .sort((left, right) => compareEvaluations(left, right, { objective, stoneMode }));

  const bestValidated = validated[0] || null;
  const replaySeed = bestValidated?.winningSeeds?.[0] ?? (41017 + stage * 31 + 999);
  const sampleBattle = bestValidated
    ? simulateBattle(enemyCounts, bestValidated.counts, { seed: replaySeed, collectLog: false })
    : null;

  const payload = {
    ok: true,
    input: {
      stage,
      maxPoints,
      mode,
      objective,
      stoneMode,
      diversityMode,
      minWinRate,
      allyPool,
      enemyCounts
    },
    search: {
      completedRuns: runIndex,
      maxBatchRuns,
      maxSeconds,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 10) / 100,
      totalCandidates,
      totalSimulationRuns,
      uniqueCandidateCount: uniqueSignatures.size,
      finalValidationTrials
    },
    best: sanitizeEvaluation(bestValidated),
    replay: bestValidated ? {
      seed: replaySeed,
      winner: sampleBattle?.winner || null,
      lostBloodTotal: sampleBattle?.lostBloodTotal ?? null,
      usedPoints: sampleBattle?.usedPoints ?? null,
      usedCapacity: sampleBattle?.usedCapacity ?? null,
      allyLosses: sampleBattle?.allyLosses || {}
    } : null,
    topValidated: validated.slice(0, 10).map(sanitizeEvaluation),
    topSearchCandidates: topCandidates.slice(0, 10).map(sanitizeEvaluation),
    runSummaries
  };

  process.stdout.write(JSON.stringify(payload));
}

main();
