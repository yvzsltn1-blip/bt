"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "battle-core.js"), "utf8")
  .replace("globalScope.BattleCore = {", "globalScope.BattleCore = { compareEvaluations, buildHomogeneousRecoveryCandidates,");
const context = {};
vm.createContext(context);
vm.runInContext(source, context);
const core = context.BattleCore;

const balancedLosses = Object.fromEntries(core.ALLY_UNITS.map((unit, i) =>
  [unit.key, [60, 36, 18, 12, 9, 6, 4, 1][i]]));
assert.equal(core.calculateRecoveryMinutes(balancedLosses), 180);
assert.equal(core.calculateRecoveryMinutes({ ghouls: 95, bats: 15, rotmaws: 1 }), 475);
assert.equal(core.calculateRecoveryMinutes({}), 0);
const fast = { feasible: true, expectedRecoveryMinutes: 180, worstRecoveryMinutes: 210,
  winRate: 0.95, expectedLostBlood: 2000, avgUsedPoints: 900, avgUsedCapacity: 100, signature: "fast" };
const slow = { ...fast, expectedRecoveryMinutes: 475, winRate: 1, expectedLostBlood: 10 };
assert(core.compareEvaluations(fast, slow, { objective: "min_time", tekilMode: true }) < 0,
  "Recovery must beat blood and extra win rate once both meet the selected threshold");
assert(core.compareEvaluations(fast, { ...slow, feasible: false }, { objective: "min_time" }) < 0);
assert(core.compareRecoveryEvaluations(fast, { ...fast, expectedLostBlood: 1 }) > 0,
  "Blood loss breaks recovery ties");
assert(core.compareRecoveryEvaluations({ ...fast, expectedRecoveryMinutes: 180.3 }, { ...fast, expectedLostBlood: 1 }) > 0,
  "Sub-minute recovery differences count as ties");
assert(core.compareEvaluations(fast, slow, { objective: "min_loss" }) > 0,
  "Existing objectives retain their ordering");

const pool = core.cloneCounts({ bats: 30, ghouls: 30, thralls: 10 }, core.ALLY_UNITS);
const base = core.cloneCounts({ bats: 10, ghouls: 20, thralls: 2 }, core.ALLY_UNITS);
const candidates = core.buildHomogeneousRecoveryCandidates(base, { ghouls: 18, bats: 1 }, pool, 100,
  { bats: 3, ghouls: 5, thralls: 10, banshees: 15, necromancers: 20, gargoyles: 30, witches: 45, rotmaws: 180 });
assert(candidates.some((army) => army.ghouls < base.ghouls && army.bats > base.bats));
candidates.forEach((army) => {
  assert(core.calculateArmyPoints(army) <= 100);
  core.ALLY_UNITS.forEach((unit) => assert(army[unit.key] >= 0 && army[unit.key] <= pool[unit.key]));
});

const enemy = core.cloneCounts({ skeletons: 4, zombies: 3 }, core.ENEMY_UNITS);
const result = core.optimizeArmyUsage(pool, enemy, {
  objective: "min_time", maxPoints: 80, minimumUsedPoints: 30, maximumUsedPoints: 80,
  minimumRequiredCounts: { bats: 2 }, minWinRate: 0.9,
  trialCount: 4, fullArmyTrials: 4, stabilityTrials: 8,
  beamWidth: 3, maxIterations: 2, eliteCount: 3, exhaustiveCandidateLimit: 800, baseSeed: 123
});
assert(result.possible);
const recommendation = result.recommendation;
assert(recommendation.winRate >= 0.9);
assert(recommendation.counts.bats >= 2);
assert(recommendation.avgUsedPoints >= 30 && recommendation.avgUsedPoints <= 80);
let sum = 0;
let worst = 0;
for (let i = 0; i < recommendation.trials; i++) {
  const battle = core.simulateBattle(enemy, recommendation.counts, {
    seed: 123 + i * 977, collectLog: false, roundingMode: recommendation.roundingMode
  });
  const duration = core.calculateRecoveryMinutes(battle.allyLosses);
  sum += duration;
  worst = Math.max(worst, duration);
}
assert.equal(recommendation.expectedRecoveryMinutes, sum / recommendation.trials);
assert.equal(recommendation.worstRecoveryMinutes, worst);

const stoneResult = core.optimizeArmyUsage(pool, enemy, {
  objective: "min_time", stoneMode: true, maxPoints: 80, minWinRate: 0.9,
  trialCount: 4, fullArmyTrials: 4, stabilityTrials: 8, beamWidth: 3,
  maxIterations: 2, eliteCount: 3, exhaustiveCandidateLimit: 800, baseSeed: 123
});
assert(stoneResult.possible);
const stoneRecommendation = stoneResult.recommendation;
assert.equal(stoneRecommendation.stoneMode, true);
let stoneSum = 0;
let stoneWorst = 0;
for (let i = 0; i < stoneRecommendation.trials; i++) {
  const battle = core.simulateBattle(enemy, stoneRecommendation.counts, {
    seed: 123 + i * 977, collectLog: false, roundingMode: stoneRecommendation.roundingMode
  });
  const duration = core.calculateRecoveryMinutes(core.getStoneAdjustedLossProfile(battle.allyLosses).permanentLossesByKey);
  stoneSum += duration;
  stoneWorst = Math.max(stoneWorst, duration);
}
assert.equal(stoneRecommendation.expectedRecoveryMinutes, stoneSum / stoneRecommendation.trials);
assert.equal(stoneRecommendation.worstRecoveryMinutes, stoneWorst);

// Exercise the browser's result comparators without requiring a DOM.
const ui = fs.readFileSync(path.join(root, "optimizer.js"), "utf8");
const uiContext = { compareRecoveryEvaluations: core.compareRecoveryEvaluations,
  calculateRecoveryMinutes: core.calculateRecoveryMinutes, ALLY_UNITS: core.ALLY_UNITS,
  simulateBattle: core.simulateBattle, getStoneAdjustedLossProfile: core.getStoneAdjustedLossProfile,
  optimizerActiveMinWinRate: 0.9, optimizerVariant: "quick", isQuickVariant: () => true,
  getDisplayedLossValue: (entry) => entry.expectedLostBlood };
vm.createContext(uiContext);
for (const name of ["normalizeOptimizerObjective", "getObjectiveLabel", "compareResultSnapshots", "compareOptimizerCandidates", "pickBetterOptimizerResult", "evaluateComparisonSnapshot"]) {
  const start = ui.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const end = ui.indexOf("\nfunction ", start + 1);
  vm.runInContext(ui.slice(start, end < 0 ? undefined : end), uiContext);
}
assert.equal(uiContext.normalizeOptimizerObjective("min_army"), "min_time");
assert.equal(uiContext.getObjectiveLabel("min_time"), "Homojen Kazan");
assert(uiContext.compareResultSnapshots({ ...fast, objective: "min_time" }, slow) < 0);
assert(uiContext.compareOptimizerCandidates({ ...fast, objective: "min_time" }, slow) < 0);
const fastResult = { possible: true, recommendation: { ...fast, objective: "min_time" } };
assert.equal(uiContext.pickBetterOptimizerResult(fastResult, { possible: true, recommendation: slow }), fastResult);
for (const stoneMode of [false, true]) {
  const snapshot = { ...recommendation, objective: "min_time", stoneMode };
  const seeds = [901, 902, 903, 904];
  const measured = uiContext.evaluateComparisonSnapshot(enemy, snapshot, seeds);
  const durations = seeds.map((seed) => {
    const battle = core.simulateBattle(enemy, snapshot.counts, { seed, collectLog: false, roundingMode: snapshot.roundingMode });
    return core.calculateRecoveryMinutes(stoneMode ? core.getStoneAdjustedLossProfile(battle.allyLosses).permanentLossesByKey : battle.allyLosses);
  });
  assert.equal(measured.expectedRecoveryMinutes, durations.reduce((a, b) => a + b, 0) / seeds.length);
  assert.equal(measured.worstRecoveryMinutes, Math.max(...durations));
}
assert(fs.readFileSync(path.join(root, "quick.html"), "utf8").includes('value="min_time">Homojen Kazan'));
console.log("PASS: homogeneous recovery calculation, ranking, search constraints and browser ordering");
