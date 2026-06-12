"use strict";
// Kat botu hesap adiminin Node reprosu: dump 2'deki girdilerle optimizeArmyUsage.
require("../../battle-core.js");
const core = globalThis.BattleCore;

function getQuickRunConfig(stage) {
  const seedOffsets = { fast: 1301, balanced: 2603, deep: 5209, ultra: 9203 };
  const seedBase = 41017 + stage * 31 + 7919;
  return {
    trialCount: 6,
    fullArmyTrials: 10,
    beamWidth: 10,
    maxIterations: 4,
    eliteCount: 6,
    stabilityTrials: 18,
    exploratoryCandidateCount: 100,
    exhaustiveCandidateLimit: 6000,
    diversityCandidateCount: 0,
    tekilCandidateCount: 0,
    baseSeed: seedBase + seedOffsets.balanced,
    timeBudgetMs: 0,
    alternateBaseSeeds: [seedOffsets.fast, seedOffsets.deep, seedOffsets.ultra].map((o) => seedBase + o)
  };
}

const stage = 1;
const enemy = { skeletons: 2, zombies: 9, cultists: 0, bonewings: 0, corpses: 0, wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0 };
const pool = { bats: 99, ghouls: 99, thralls: 99, banshees: 99, necromancers: 99, gargoyles: 99, witches: 99, rotmaws: 0 };
const maxPoints = 20;
const runConfig = getQuickRunConfig(stage);

const t0 = Date.now();
const result = core.optimizeArmyUsage(pool, enemy, {
  maxPoints,
  minimumUsedPoints: Math.max(0, Math.ceil(maxPoints * 0.75)),
  maximumUsedPoints: maxPoints,
  minimumRequiredCounts: {},
  requiredLossCounts: {},
  requiredLossExactFlags: {},
  minWinRate: 0.75,
  trialCount: runConfig.trialCount,
  fullArmyTrials: runConfig.fullArmyTrials,
  beamWidth: runConfig.beamWidth,
  maxIterations: runConfig.maxIterations,
  eliteCount: runConfig.eliteCount,
  stabilityTrials: runConfig.stabilityTrials,
  baseSeed: runConfig.baseSeed,
  objective: "min_loss",
  roundingMode: "legacy",
  stoneMode: false,
  diversityMode: false,
  tekilMode: false,
  tekilV2Mode: true,
  exploratoryCandidateCount: runConfig.exploratoryCandidateCount,
  exhaustiveCandidateLimit: runConfig.exhaustiveCandidateLimit,
  timeBudgetMs: runConfig.timeBudgetMs,
  alternateBaseSeeds: runConfig.alternateBaseSeeds,
  diversityCandidateCount: runConfig.diversityCandidateCount,
  tekilCandidateCount: runConfig.tekilCandidateCount,
  knownSignatures: [],
  seedCandidates: []
});
const elapsed = Date.now() - t0;

const source = result.possible ? result.recommendation : null;
console.log("sure(ms):", elapsed);
console.log("possible:", result.possible);
console.log("winRate:", source ? source.winRate : null);
console.log("counts:", source ? JSON.stringify(source.counts) : null);
console.log("usedPoints:", source ? source.avgUsedPoints : null);
