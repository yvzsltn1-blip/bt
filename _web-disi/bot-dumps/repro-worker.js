"use strict";
// Worker kaynaginin (battle-core + onmessage) vm icinde uctan uca dogrulamasi.
const fs = require("fs");
const vm = require("vm");

const coreSource = fs.readFileSync(`${__dirname}/../../battle-core.js`, "utf8");
const workerSource = `${coreSource}
self.onmessage = (event) => {
  const message = event.data || {};
  try {
    const result = self.BattleCore.optimizeArmyUsage(message.pool, message.enemy, message.options);
    const source = result.possible ? result.recommendation : null;
    self.postMessage({
      ok: true,
      possible: !!result.possible,
      counts: source ? source.counts : null,
      winRate: source ? source.winRate : 0,
      avgUsedPoints: source ? source.avgUsedPoints : 0
    });
  } catch (error) {
    self.postMessage({ ok: false, message: String((error && error.message) || error) });
  }
};`;

let reply = null;
const self = { postMessage: (data) => { reply = data; } };
self.self = self;
const context = vm.createContext(self);
new vm.Script(workerSource).runInContext(context);

const stage = 23;
const seedOffsets = { fast: 1301, balanced: 2603, deep: 5209, ultra: 9203 };
const seedBase = 41017 + stage * 31 + 7919;
const options = {
  maxPoints: 240,
  minimumUsedPoints: 180,
  maximumUsedPoints: 240,
  minimumRequiredCounts: {}, requiredLossCounts: {}, requiredLossExactFlags: {},
  minWinRate: 0.75,
  trialCount: 6, fullArmyTrials: 10, beamWidth: 10, maxIterations: 4, eliteCount: 6,
  stabilityTrials: 18, baseSeed: seedBase + seedOffsets.balanced,
  objective: "min_loss", roundingMode: "legacy",
  stoneMode: false, diversityMode: false, tekilMode: false, tekilV2Mode: true,
  exploratoryCandidateCount: 100, exhaustiveCandidateLimit: 6000, timeBudgetMs: 0,
  alternateBaseSeeds: [seedOffsets.fast, seedOffsets.deep, seedOffsets.ultra].map((o) => seedBase + o),
  diversityCandidateCount: 0, tekilCandidateCount: 0,
  knownSignatures: [], seedCandidates: []
};

const t0 = Date.now();
context.onmessage({ data: {
  pool: { bats: 99, ghouls: 99, thralls: 99, banshees: 99, necromancers: 99, gargoyles: 99, witches: 99, rotmaws: 1 },
  enemy: { skeletons: 16, zombies: 37, cultists: 19, bonewings: 15, corpses: 3, wraiths: 0, revenants: 0, giants: 0, broodmothers: 0, liches: 0 },
  options
} });
console.log("sure(ms):", Date.now() - t0);
console.log("cevap:", JSON.stringify(reply));
