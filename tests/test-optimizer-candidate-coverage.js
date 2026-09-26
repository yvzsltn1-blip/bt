"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Expose candidate generation only in this VM, without changing the public API.
const source = fs.readFileSync(path.join(__dirname, "..", "battle-core.js"), "utf8")
  .replace("globalScope.BattleCore = {", "globalScope.BattleCore = { spreadSelectCandidates, buildStrategicGridCandidates, getBloodEfficiency, buildStrategicCandidates, buildJointNeighborCandidates, buildLossRecoveryCandidates,");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const core = context.window.BattleCore;
const signature = (counts) => core.ALLY_UNITS.map((unit) => counts[unit.key] || 0).join(",");

core.ALLY_UNITS.forEach((unit) => {
  assert(Number.isFinite(core.getBloodEfficiency(unit)) && core.getBloodEfficiency(unit) > 0,
    "Strategy scoring must use real unit attack and health");
});
const counterPool = Object.fromEntries(core.ALLY_UNITS.map((u) => [u.key, 20]));
assert.equal(core.buildStrategicCandidates(counterPool, { skeletons: 1 }, 120)[0].rotmaws, 4,
  "Counter candidates must use monster units against brute enemies");
assert.equal(core.buildStrategicCandidates(counterPool, { corpses: 1 }, 120)[0].thralls, 20,
  "Counter candidates must use occult units against monster enemies");

const jointBase = core.cloneCounts({ bats: 4, ghouls: 4, thralls: 2 }, core.ALLY_UNITS);
const jointPool = core.cloneCounts({ bats: 12, ghouls: 12, thralls: 2 }, core.ALLY_UNITS);
const joint = core.buildJointNeighborCandidates(jointBase, jointPool, 40);
assert(joint.some((counts) => counts.bats === 5 && counts.ghouls === 5 && counts.thralls === 2),
  "Search must cross a plateau requiring two simultaneous increases");
assert(joint.some((counts) => counts.bats === 3 && counts.ghouls === 3 && counts.thralls === 2),
  "Search must try two simultaneous reductions");
assert.equal(new Set(joint.map(signature)).size, joint.length);
joint.forEach((counts) => {
  assert(core.calculateArmyPoints(counts) <= 40);
  assert(core.ALLY_UNITS.filter((u) => counts[u.key] !== jointBase[u.key]).length <= 2,
    "Pair search must preserve all other unit counts");
  core.ALLY_UNITS.forEach((u) => assert(counts[u.key] >= 0 && counts[u.key] <= jointPool[u.key]));
});
const recovery = core.buildLossRecoveryCandidates(
  core.cloneCounts({ bats: 10, necromancers: 1, rotmaws: 1 }, core.ALLY_UNITS),
  { necromancers: 1 },
  core.cloneCounts({ bats: 20, necromancers: 2, rotmaws: 2 }, core.ALLY_UNITS), 90
);
assert(recovery.some((counts) => counts.bats === 12 && counts.necromancers === 0 && counts.rotmaws === 2),
  "Replace a lost unit type and rebuild two other types together");

const repeated = Array.from({ length: 40 }, () => ({ candidate: { bats: 1 }, score: 100 }));
const distinct = Array.from({ length: 30 }, (_, i) => ({ candidate: { bats: i + 2 }, score: 90 - i }));
const selected = core.spreadSelectCandidates([...repeated, ...distinct], 20);
assert.equal(selected.length, 20, "Duplicates must not consume the unique candidate budget");
assert.equal(new Set(selected.map(signature)).size, 20);
assert(selected.some((counts) => counts.bats === 1), "Keep the highest ranked candidate");
assert(selected.some((counts) => counts.bats >= 25), "Explore the lower ranked region too");
assert.equal(core.spreadSelectCandidates(repeated.slice(0, 3), 20).length, 1);
assert.equal(core.spreadSelectCandidates(distinct, 0).length, 0);

const pool = Object.fromEntries(core.ALLY_UNITS.map((unit) => [unit.key, 20]));
const enemy = { skeletons: 12, zombies: 43, cultists: 14, bonewings: 4 };
const grid = core.buildStrategicGridCandidates(pool, enemy, 120, { limit: 100, minimumPoints: 90 });
assert.equal(grid.length, 100, "Grid should fill its budget with eligible unique armies");
assert.equal(new Set(grid.map(signature)).size, grid.length);
grid.forEach((counts) => {
  const points = core.calculateArmyPoints(counts);
  assert(points >= 90 && points <= 120, "Out-of-band candidates must not consume grid slots");
  core.ALLY_UNITS.forEach((unit) => assert((counts[unit.key] || 0) <= pool[unit.key]));
});
const result = core.optimizeArmyUsage({ bats: 12, ghouls: 4 }, core.cloneCounts({ skeletons: 2 }, core.ENEMY_UNITS), {
  maxPoints: 30,
  minimumUsedPoints: 10,
  maximumUsedPoints: 25,
  minimumRequiredCounts: { bats: 2 },
  trialCount: 2,
  fullArmyTrials: 2,
  stabilityTrials: 2,
  beamWidth: 3,
  maxIterations: 1,
  exhaustiveCandidateLimit: 100,
  baseSeed: 42
});
assert(result.possible, "Optimizer must still find a winning army");
const counts = result.recommendation.counts;
assert(counts.bats >= 2 && counts.bats <= 12 && counts.ghouls <= 4);
assert(core.calculateArmyPoints(counts) >= 10 && core.calculateArmyPoints(counts) <= 25);
const recoveryEnemy = Object.fromEntries(core.ENEMY_UNITS.map((u, i) => [u.key, [16, 38, 19, 13, 1][i] || 0]));
const recoveryPool = Object.fromEntries(core.ALLY_UNITS.map((u, i) => [u.key, [80, 80, 60, 40, 12, 15, 10, 6][i]]));
const improved = core.optimizeArmyUsage(recoveryPool, recoveryEnemy, {
  maxPoints: 220, minimumUsedPoints: 165, maximumUsedPoints: 220,
  objective: "min_loss", minWinRate: 0.95, trialCount: 6, fullArmyTrials: 10,
  beamWidth: 10, maxIterations: 4, eliteCount: 6, stabilityTrials: 18,
  minVerifyTrials: 240, exploratoryCandidateCount: 100, exhaustiveCandidateLimit: 6000,
  baseSeed: 41017 + 21 * 31 + 7919 + 2603
});
assert(improved.possible);
assert(improved.recommendation.expectedLostBlood <= 50, "Recover the 50-loss army missed by the previous 60-loss search");
let heldOutLoss = 0;
for (let trial = 0; trial < 200; trial++) {
  const battle = core.simulateBattle(recoveryEnemy, improved.recommendation.counts, {
    seed: 92000001 + trial * 1013, collectLog: false
  });
  assert.equal(battle.winner, "ally");
  heldOutLoss += battle.lostBloodTotal;
}
assert(heldOutLoss / 200 <= 50, "Lower loss must hold on independent seeds");
console.log("Optimizer candidate coverage, constraints and loss recovery: passed");
