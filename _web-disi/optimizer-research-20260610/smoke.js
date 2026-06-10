"use strict";

// Secenek yollarinin duman testi: tekil, diversity, min kisit, kayip kisiti,
// hedefler (min_army/safe_win), exact (actual guard) ve stone mode.
// Amac: istisna firlatmadan makul sonuc donmesi.

const path = require("path");
if (process.argv.includes("--baseline")) {
  require(path.join(__dirname, "battle-core-baseline.js"));
} else {
  require(path.join(__dirname, "..", "..", "battle-core.js"));
}

const BC = globalThis.BattleCore;
const { ENEMY_UNITS, ALLY_UNITS, optimizeArmyUsage } = BC;

const enemy = Object.fromEntries(ENEMY_UNITS.map((u) => [u.key, 0]));
Object.assign(enemy, { skeletons: 19, zombies: 27, cultists: 31, bonewings: 12, corpses: 9, wraiths: 13, revenants: 7 });
const pool = Object.fromEntries(ALLY_UNITS.map((u) => [u.key, u.key === "rotmaws" ? 0 : 99]));
const sig = (c) => ALLY_UNITS.map((u) => c[u.key] || 0).join("/");

const base = {
  maxPoints: 490,
  minimumUsedPoints: 367,
  maximumUsedPoints: 490,
  minWinRate: 0.75,
  objective: "min_loss",
  roundingMode: "legacy",
  trialCount: 6,
  fullArmyTrials: 10,
  beamWidth: 10,
  maxIterations: 4,
  eliteCount: 6,
  stabilityTrials: 18,
  exploratoryCandidateCount: 100,
  exhaustiveCandidateLimit: 6000,
  baseSeed: 41017 + 48 * 31 + 7919 + 2603,
  timeBudgetMs: 2500,
  knownSignatures: []
};

const cases = [
  ["min_loss", {}],
  ["min_army", { objective: "min_army" }],
  ["safe_win", { objective: "safe_win", minWinRate: 0.9 }],
  ["diversity", { diversityMode: true, diversityCandidateCount: 40 }],
  ["tekil", { tekilMode: true, tekilCandidateCount: 80 }],
  ["tekilV2", { tekilMode: true, tekilV2Mode: true }],
  ["stone", { stoneMode: true }],
  ["exact-guard", { roundingMode: "exact" }],
  ["safe-rounding", { roundingMode: "safe" }],
  ["simulat-rounding", { roundingMode: "simulat" }],
  ["min-kisit", { minimumRequiredCounts: { thralls: 20, banshees: 5 } }],
  ["kayip-kisiti", { requiredLossCounts: { bats: 5 } }],
  ["kayip-exact", { requiredLossCounts: { bats: 5 }, requiredLossExactFlags: { bats: true } }],
  ["imkansiz-min", { minimumRequiredCounts: { rotmaws: 5 } }],
  ["dar-bant", { minimumUsedPoints: 480, maximumUsedPoints: 490 }],
  ["butcesiz", { timeBudgetMs: 0 }]
];

let failures = 0;
for (const [name, overrides] of cases) {
  const t0 = Date.now();
  try {
    const r = optimizeArmyUsage(pool, enemy, { ...base, ...overrides });
    const src = r.recommendation || r.fallback || r.fullArmyEvaluation;
    const ok = r.possible === false || (src && Number.isFinite(src.winRate));
    if (!ok) {
      failures += 1;
      console.log(`FAIL ${name}: sonuc yapisi bozuk`);
      continue;
    }
    console.log(
      `ok   ${name.padEnd(16)} ${String(Date.now() - t0).padStart(5)}ms possible=${r.possible} ` +
      (src ? `win=${(src.winRate * 100).toFixed(0)}% eB=${Number.isFinite(src.expectedLostBlood) ? src.expectedLostBlood.toFixed(1) : "inf"} pts=${src.avgUsedPoints?.toFixed(0)} ${sig(src.counts)}` : "(sonuc yok)") +
      (r.constraintIssue ? ` issue=${r.constraintIssue}` : "")
    );
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
console.log(failures === 0 ? "\nTUM DUMAN TESTLERI GECTI" : `\n${failures} HATA`);
