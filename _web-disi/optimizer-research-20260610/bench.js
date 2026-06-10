"use strict";

// Optimizer kalite/sure benchmark'i.
// Kullanim: node bench.js [--modes fast,balanced,deep] [--layers 30,48,65,80,95,101] [--runs 1]
// Gercek katman verisiyle (layers_1_101_export.json) quick.html'in tek-tik akisini taklit eder:
//   pool = T1-T7 x99, band = %75-%100, objective = min_loss, rounding = legacy, runIndex = 1.

const path = require("path");
if (process.argv.includes("--baseline")) {
  require(path.join(__dirname, "battle-core-baseline.js"));
} else {
  require(path.join(__dirname, "..", "..", "battle-core.js"));
}

const BC = globalThis.BattleCore;
const {
  ENEMY_UNITS,
  ALLY_UNITS,
  getStagePointLimit,
  simulateBattle,
  optimizeArmyUsage
} = BC;

const LAYERS = require(path.join(
  __dirname, "..", "local-backups", "pre-bulk-regression-20260430-2205", "sonuc-arsivi", "layers_1_101_export.json"
));

const ENEMY_NAME_MAP = [
  [/skeleton/i, "skeletons"],
  [/zombie/i, "zombies"],
  [/cultist/i, "cultists"],
  [/bone\s*wing/i, "bonewings"],
  [/obese/i, "corpses"],
  [/wraith/i, "wraiths"],
  [/revenant/i, "revenants"],
  [/giant/i, "giants"],
  [/broodmoth/i, "broodmothers"],
  [/lich/i, "liches"]
];

function parseEnemyText(text) {
  const counts = Object.fromEntries(ENEMY_UNITS.map((u) => [u.key, 0]));
  if (!text) return counts;
  text.split(",").forEach((part) => {
    const m = part.trim().match(/^(\d+)\s*(.+)$/);
    if (!m) return;
    const count = parseInt(m[1], 10);
    const name = m[2];
    const hit = ENEMY_NAME_MAP.find(([re]) => re.test(name));
    if (hit) counts[hit[1]] += count;
  });
  return counts;
}

function getScenario(layer) {
  const entry = LAYERS.find((x) => x.layer === layer);
  if (!entry) throw new Error(`layer ${layer} yok`);
  const enemy = parseEnemyText(entry.frontlineEnemies);
  const back = parseEnemyText(entry.backlineEnemies);
  ENEMY_UNITS.forEach((u) => { enemy[u.key] += back[u.key]; });
  const allyPool = Object.fromEntries(ALLY_UNITS.map((u) => [u.key, u.key === "rotmaws" ? 0 : 99]));
  return { stage: layer, enemy, allyPool };
}

// optimizer.js getRunConfig kopyasi (tekil/diversity kapalI, runIndex=1)
function getRunConfig(stage, runIndex, mode) {
  const presets = {
    fast: { trialStart: 4, trialStep: 1, trialMax: 12, fullStart: 6, fullStep: 2, fullMax: 20, beamStart: 7, beamStep: 2, beamMax: 18, iterStart: 3, iterStep: 1, iterMax: 6, eliteCount: 4, stabilityMultiplier: 2, exploratoryMultiplier: 6, exhaustiveLimit: 1500, seedOffset: 1301 },
    balanced: { trialStart: 6, trialStep: 2, trialMax: 20, fullStart: 10, fullStep: 4, fullMax: 36, beamStart: 10, beamStep: 3, beamMax: 28, iterStart: 4, iterStep: 1, iterMax: 8, eliteCount: 6, stabilityMultiplier: 3, exploratoryMultiplier: 10, exhaustiveLimit: 6000, seedOffset: 2603 },
    deep: { trialStart: 10, trialStep: 3, trialMax: 30, fullStart: 16, fullStep: 6, fullMax: 48, beamStart: 14, beamStep: 4, beamMax: 36, iterStart: 5, iterStep: 1, iterMax: 10, eliteCount: 8, stabilityMultiplier: 4, exploratoryMultiplier: 16, exhaustiveLimit: 20000, seedOffset: 5209 },
    ultra: { trialStart: 12, trialStep: 4, trialMax: 36, fullStart: 20, fullStep: 8, fullMax: 60, beamStart: 18, beamStep: 5, beamMax: 44, iterStart: 6, iterStep: 1, iterMax: 12, eliteCount: 10, stabilityMultiplier: 5, exploratoryMultiplier: 22, exhaustiveLimit: 40000, seedOffset: 9203 }
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
    exploratoryCandidateCount: Math.min(Math.max(60, beamWidth * preset.exploratoryMultiplier), mode === "ultra" ? 880 : 640),
    exhaustiveCandidateLimit: preset.exhaustiveLimit,
    baseSeed: 41017 + stage * 31 + runIndex * 7919 + preset.seedOffset,
    alternateBaseSeeds: Object.values(presets)
      .filter((p) => p !== preset)
      .map((p) => 41017 + stage * 31 + runIndex * 7919 + p.seedOffset)
  };
}

const TIME_BUDGETS = { fast: 3200, balanced: 7000, deep: 10500, ultra: 20000 };

// Bagimsiz seed setiyle yuksek-trial dogrulama (kalite olcumu)
function exactEval(enemy, counts, trials = 200) {
  let wins = 0;
  let totalBlood = 0;
  let winBlood = 0;
  for (let t = 0; t < trials; t += 1) {
    const r = simulateBattle(enemy, counts, { seed: 900001 + t * 7717, collectLog: false, roundingMode: "legacy" });
    totalBlood += r.lostBloodTotal;
    if (r.winner === "ally") { wins += 1; winBlood += r.lostBloodTotal; }
  }
  return {
    winRate: wins / trials,
    expectedLostBlood: totalBlood / trials,
    avgLostBlood: wins > 0 ? winBlood / wins : Infinity
  };
}

function fmtCounts(counts) {
  return ALLY_UNITS.map((u) => counts[u.key] || 0).join("/");
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const modes = getArg("--modes", "fast,balanced,deep").split(",");
  const layers = getArg("--layers", "30,48,65,80,95,101").split(",").map(Number);
  const useBudget = args.includes("--budget");

  console.log(`node bench | modes=${modes.join(",")} layers=${layers.join(",")} budget=${useBudget}`);
  console.log("");

  for (const layer of layers) {
    const sc = getScenario(layer);
    const maxPoints = getStagePointLimit(sc.stage);
    const minUsed = Math.floor(maxPoints * 0.75);
    console.log(`=== Kat ${layer} (limit ${maxPoints}, band ${minUsed}-${maxPoints}) enemy=${JSON.stringify(Object.fromEntries(Object.entries(sc.enemy).filter(([, v]) => v > 0)))}`);
    for (const mode of modes) {
      const rc = getRunConfig(sc.stage, 1, mode);
      const t0 = Date.now();
      const result = optimizeArmyUsage(sc.allyPool, sc.enemy, {
        maxPoints,
        minimumUsedPoints: minUsed,
        maximumUsedPoints: maxPoints,
        minWinRate: 0.75,
        trialCount: rc.trialCount,
        fullArmyTrials: rc.fullArmyTrials,
        beamWidth: rc.beamWidth,
        maxIterations: rc.maxIterations,
        eliteCount: rc.eliteCount,
        stabilityTrials: rc.stabilityTrials,
        baseSeed: rc.baseSeed,
        objective: "min_loss",
        roundingMode: "legacy",
        exploratoryCandidateCount: rc.exploratoryCandidateCount,
        exhaustiveCandidateLimit: rc.exhaustiveCandidateLimit,
        alternateBaseSeeds: rc.alternateBaseSeeds,
        timeBudgetMs: useBudget ? TIME_BUDGETS[mode] : 0,
        knownSignatures: []
      });
      const elapsed = Date.now() - t0;
      const src = result.possible ? result.recommendation : (result.fallback || result.fullArmyEvaluation);
      const exact = exactEval(sc.enemy, src.counts);
      console.log(
        `  ${mode.padEnd(8)} ${String(elapsed).padStart(6)}ms sims=${String(result.simulationRuns).padStart(7)} ` +
        `cand=${String(result.uniqueCandidateCount).padStart(6)} ` +
        `| sec: win=${(src.winRate * 100).toFixed(0)}% eBlood=${src.expectedLostBlood.toFixed(1)} ` +
        `| dogrulama(200): win=${(exact.winRate * 100).toFixed(1)}% eBlood=${exact.expectedLostBlood.toFixed(1)} ` +
        `| ${fmtCounts(src.counts)}`
      );
    }
    console.log("");
  }
}

main();
