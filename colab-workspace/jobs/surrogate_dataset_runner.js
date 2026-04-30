"use strict";

const fs = require("fs");
const path = require("path");

require(path.resolve(__dirname, "..", "..", "battle-core.js"));

const {
  ENEMY_UNITS,
  ALLY_UNITS,
  POINTS_BY_ALLY_KEY,
  simulateBattle,
  getStagePointLimit
} = globalThis.BattleCore;

const ENEMY_TIER_BY_KEY = Object.fromEntries(ENEMY_UNITS.map((unit, index) => [unit.key, index + 1]));
const ALLY_TIER_BY_KEY = Object.fromEntries(ALLY_UNITS.map((unit, index) => [unit.key, index + 1]));

function parseInput() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Missing input JSON path.");
  }
  const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInt(minValue, maxValue, random) {
  return minValue + Math.floor(random() * (maxValue - minValue + 1));
}

function chooseDistinctUnits(units, desiredCount, random) {
  const shuffled = [...units];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, Math.max(1, Math.min(desiredCount, shuffled.length)));
}

function createZeroCounts(units) {
  return Object.fromEntries(units.map((unit) => [unit.key, 0]));
}

function sampleEnemyCounts(stage, random) {
  const counts = createZeroCounts(ENEMY_UNITS);
  const selected = chooseDistinctUnits(ENEMY_UNITS, randomInt(3, 7, random), random);
  selected.forEach((unit) => {
    const tier = ENEMY_TIER_BY_KEY[unit.key] || 1;
    const maxCount = Math.max(1, Math.floor((stage * (1.6 + random())) / Math.max(1, tier * 0.55)));
    const minCount = tier >= 8 ? 0 : 1;
    counts[unit.key] = randomInt(minCount, maxCount, random);
  });
  return counts;
}

function sampleAllyCounts(stage, random) {
  const counts = createZeroCounts(ALLY_UNITS);
  const maxPoints = getStagePointLimit(stage);
  let remainingPoints = maxPoints;
  const selected = chooseDistinctUnits(ALLY_UNITS, randomInt(2, 6, random), random);

  selected.forEach((unit, selectedIndex) => {
    const pointCost = POINTS_BY_ALLY_KEY[unit.key] || 1;
    if (remainingPoints < pointCost) {
      return;
    }
    const tier = ALLY_TIER_BY_KEY[unit.key] || 1;
    const softCap = Math.max(1, Math.floor((stage * (1.3 + random())) / Math.max(1, tier * 0.65)));
    const reserveSlots = selected.length - selectedIndex - 1;
    const reservePoints = reserveSlots * pointCost;
    const spendable = Math.max(pointCost, remainingPoints - reservePoints);
    const hardCap = Math.max(1, Math.floor(spendable / pointCost));
    const count = randomInt(1, Math.min(softCap, hardCap), random);
    counts[unit.key] = count;
    remainingPoints -= count * pointCost;
  });

  const fillerOrder = [...ALLY_UNITS].sort((left, right) => {
    return (POINTS_BY_ALLY_KEY[left.key] || 0) - (POINTS_BY_ALLY_KEY[right.key] || 0);
  });
  while (remainingPoints > 0) {
    const affordable = fillerOrder.filter((unit) => (POINTS_BY_ALLY_KEY[unit.key] || Infinity) <= remainingPoints);
    if (affordable.length === 0) {
      break;
    }
    const picked = affordable[Math.floor(random() * affordable.length)];
    counts[picked.key] += 1;
    remainingPoints -= POINTS_BY_ALLY_KEY[picked.key] || 0;
  }

  return counts;
}

function lossesToArray(losses) {
  return ALLY_UNITS.map((unit) => Number(losses?.[unit.key] || 0));
}

function countsToArray(counts, units) {
  return units.map((unit) => Number(counts?.[unit.key] || 0));
}

function main() {
  const input = parseInput();
  const sampleCount = Math.max(1, Math.floor(Number(input.sampleCount || 2500)));
  const minStage = Math.max(1, Math.floor(Number(input.minStage || 1)));
  const maxStage = Math.max(minStage, Math.floor(Number(input.maxStage || 120)));
  const baseSeed = Math.floor(Number(input.seed || 20260501));
  const outputPath = path.resolve(input.outputPath || path.join("colab-workspace", "runs", `surrogate-dataset-${Date.now()}.jsonl`));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const output = fs.createWriteStream(outputPath, { encoding: "utf8" });

  let allyWins = 0;
  let totalLostBlood = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const random = createSeededRandom((baseSeed + index * 104729) >>> 0);
    const stage = randomInt(minStage, maxStage, random);
    const enemyCounts = sampleEnemyCounts(stage, random);
    const allyCounts = sampleAllyCounts(stage, random);
    const battleSeed = (baseSeed + index * 977) >>> 0;
    const result = simulateBattle(enemyCounts, allyCounts, {
      seed: battleSeed,
      collectLog: false
    });

    if (result.winner === "ally") {
      allyWins += 1;
    }
    totalLostBlood += Number(result.lostBloodTotal || 0);

    const row = {
      stage,
      pointLimit: getStagePointLimit(stage),
      battleSeed,
      enemyCounts,
      allyCounts,
      enemyVector: countsToArray(enemyCounts, ENEMY_UNITS),
      allyVector: countsToArray(allyCounts, ALLY_UNITS),
      winner: result.winner,
      winLabel: result.winner === "ally" ? 1 : 0,
      lostBloodTotal: Number(result.lostBloodTotal || 0),
      usedPoints: Number(result.usedPoints || 0),
      usedCapacity: Number(result.usedCapacity || 0),
      enemyRemainingHealth: Number(result.enemyRemainingHealth || 0),
      allyLosses: result.allyLosses || {},
      allyLossVector: lossesToArray(result.allyLosses || {})
    };
    output.write(`${JSON.stringify(row)}\n`);
  }

  output.end();

  const payload = {
    ok: true,
    outputPath,
    sampleCount,
    minStage,
    maxStage,
    seed: baseSeed,
    winRate: sampleCount > 0 ? allyWins / sampleCount : 0,
    avgLostBlood: sampleCount > 0 ? totalLostBlood / sampleCount : 0
  };

  process.stdout.write(JSON.stringify(payload));
}

main();
