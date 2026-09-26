"use strict";

// Run with an optional older battle-core.js path to compare identical searches.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
function load(file) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return context.window.BattleCore;
}
const versions = process.argv[2]
  ? [["before", load(process.argv[2])], ["after", load(path.join(__dirname, "..", "battle-core.js"))]]
  : [["current", load(path.join(__dirname, "..", "battle-core.js"))]];
const cases = [
  [6, [4, 24, 6]],
  [9, [8, 34, 8]],
  [15, [12, 43, 14, 4]],
  [19, [18, 38, 22, 8]],
  [21, [16, 38, 19, 13, 1]],
  [34, [18, 34, 17, 13, 18, 4]],
  [37, [26, 28, 21, 17, 15, 6]],
  [91, [9, 14, 9, 26, 21, 5, 5, 9, 4, 7]]
];
for (const [stage, enemyValues] of cases) {
  for (const [version, core] of versions) {
    const pool = Object.fromEntries(core.ALLY_UNITS.map((u, i) => [u.key, [80, 80, 60, 40, 12, 15, 10, 6][i]]));
    const enemy = Object.fromEntries(core.ENEMY_UNITS.map((u, i) => [u.key, enemyValues[i] || 0]));
    const maxPoints = core.getStagePointLimit(stage);
    const start = Date.now();
    const result = core.optimizeArmyUsage(pool, enemy, {
      maxPoints, minimumUsedPoints: Math.ceil(maxPoints * 0.75), maximumUsedPoints: maxPoints,
      objective: "min_loss", minWinRate: 0.95, trialCount: 6, fullArmyTrials: 10,
      beamWidth: 10, maxIterations: 4, eliteCount: 6, stabilityTrials: 18,
      minVerifyTrials: 240, exploratoryCandidateCount: 100, exhaustiveCandidateLimit: 6000,
      baseSeed: 41017 + stage * 31 + 7919 + 2603
    });
    const elapsedMs = Date.now() - start;
    const candidate = result.recommendation || result.fallback;
    let wins = 0;
    let loss = 0;
    // Same held-out seeds for both versions; these never guide the search.
    for (let trial = 0; trial < 200; trial++) {
      const battle = core.simulateBattle(enemy, candidate.counts, { seed: 92000001 + trial * 1013, collectLog: false });
      wins += battle.winner === "ally" ? 1 : 0;
      loss += battle.lostBloodTotal;
    }
    console.log(JSON.stringify({ stage, version, loss: loss / 200, winRate: wins / 200,
      elapsedMs, candidates: result.uniqueCandidateCount, counts: candidate.counts }));
  }
}
