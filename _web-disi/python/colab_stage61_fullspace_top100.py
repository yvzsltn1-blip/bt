"""
Colab exhaustive search runner for the Stage 61 scenario from the screenshots.

What this does:
1. Enumerates the full army-composition space under the point cap.
2. Uses all configured CPU workers in parallel.
3. Keeps the current optimizer's known best lineup pinned and always re-evaluated.
4. Produces a final top-100 list with detailed metrics and outcome breakdowns.

Usage in Colab:
- Upload this file or paste it into a notebook cell with `%%writefile`.
- Run it.
- Final outputs are written to:
  - `stage61_fullspace_top100_results.json`
  - `stage61_fullspace_top100_results.txt`
  - `stage61_fullspace_top100_live_snapshot.json`

Notes:
- This script intentionally calls `battle-core.js` through Node so the combat
  logic stays aligned with the web simulator.
- Ranking uses the current simulator's expected-loss metric, not the older
  win-only average-loss metric.
- If you only want 100% winners, set `CONFIG["minWinRate"] = 1.0`.
"""

import json
import math
import os
import select
import subprocess
import sys
import time
import urllib.request

from IPython.display import HTML, display
from tqdm.auto import tqdm


BATTLE_CORE_URL = "https://bt-analiz.web.app/battle-core.js"

UNIT_ORDER = [
    ("bats", "Yarasa (T1)", 2),
    ("ghouls", "Gulyabani (T2)", 3),
    ("thralls", "Vampir Kole (T3)", 4),
    ("banshees", "Bansi (T4)", 7),
    ("necromancers", "Nekromant (T5)", 10),
    ("gargoyles", "Gargoyl (T6)", 15),
    ("witches", "Kan Cadisi (T7)", 18),
    ("rotmaws", "Curuk Cene (T8)", 30),
]

POINT_COSTS = {key: cost for key, _, cost in UNIT_ORDER}

CONFIG = {
    "scenarioName": "Stage 61 full-space top-100 search",
    "outputPrefix": "stage61_fullspace_top100",
    "stage": 61,
    "pointLimit": 620,
    "objective": "min_loss",   # "min_loss" or "min_army"
    "stoneMode": False,
    "minWinRate": 0.75,
    "seedStart": 1,
    "workers": 8,
    "partitionAxis": "bats",
    "stage1MaxTrials": 2,
    "stage2Trials": 72,
    "stage3Trials": 240,
    "shortlistPerWorker": 5000,
    "workerStage2TopK": 450,
    "stage3TopK": 1200,
    "topResultCount": 100,
    "topOutcomeCount": 8,
    "liveVerificationTrials": 240,
    "liveOutcomeCandidates": 1,
    "snapshotEverySeconds": 15,
    "enemy": {
        "skeletons": 23,
        "zombies": 31,
        "cultists": 18,
        "bonewings": 8,
        "corpses": 5,
        "wraiths": 7,
        "revenants": 8,
        "giants": 11,
        "broodmothers": 1,
        "liches": 0,
    },
    "allyPool": {
        "bats": 185,
        "ghouls": 45,
        "thralls": 105,
        "banshees": 100,
        "necromancers": 13,
        "gargoyles": 30,
        "witches": 0,
        "rotmaws": 0,
    },
    "knownCandidates": [
        {
            "label": "current_optimizer_best_from_ui",
            "note": (
                "UI reference candidate from the screenshots. "
                "Shown as 618/620 points, 157 units, ~868 expected loss, 240/240 wins."
            ),
            "counts": {
                "bats": 65,
                "ghouls": 41,
                "thralls": 33,
                "banshees": 4,
                "necromancers": 1,
                "gargoyles": 13,
                "witches": 0,
                "rotmaws": 0,
            },
        }
    ],
}

WORKER_JS = r"""
"use strict";

const fs = require("fs");
require("./battle-core.js");

const {
  ALLY_UNITS,
  POINTS_BY_ALLY_KEY,
  getStagePointLimit,
  simulateBattle,
  getStoneAdjustedLossProfile
} = globalThis.BattleCore;

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const partition = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

const pointLimit = Number.isFinite(config.pointLimit) ? config.pointLimit : getStagePointLimit(config.stage);
const objective = config.objective === "min_army" ? "min_army" : "min_loss";
const stoneMode = Boolean(config.stoneMode);
const minWinRate = Number.isFinite(config.minWinRate) ? config.minWinRate : 0.75;
const stage1MaxTrials = Math.max(1, Math.floor(config.stage1MaxTrials || 2));
const stage2Trials = Math.max(stage1MaxTrials, Math.floor(config.stage2Trials || 48));
const seedStart = Math.floor(config.seedStart || 1);
const shortlistSize = Math.max(1, Math.floor(config.shortlistPerWorker || 4000));
const stage2TopK = Math.max(1, Math.floor(config.workerStage2TopK || 300));
const topOutcomeCount = Math.max(1, Math.floor(config.topOutcomeCount || 8));
const liveVerificationTrials = Math.max(
  stage2Trials,
  Math.floor(config.liveVerificationTrials || config.stage3Trials || 240)
);
const liveOutcomeCandidates = Math.max(0, Math.floor(config.liveOutcomeCandidates || 1));

const activeUnits = ALLY_UNITS.filter((unit) => (config.allyPool?.[unit.key] || 0) > 0);
const partitionUnit = activeUnits.find((unit) => unit.key === partition.axis) || activeUnits[0];
const otherUnits = activeUnits.filter((unit) => unit.key !== partitionUnit.key);

function cloneCounts(counts) {
  return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, counts[unit.key] || 0]));
}

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function getDisplayedLoss(entry) {
  const value = stoneMode ? entry.expectedStoneAdjustedLostBlood : entry.expectedLostBlood;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getDisplayedLossUnits(entry) {
  const value = stoneMode ? entry.expectedStoneAdjustedLostUnits : entry.expectedLostUnits;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function comparePrimary(a, b) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (a.feasible) {
    if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    if (objective === "min_army") {
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
      if (getDisplayedLoss(a) !== getDisplayedLoss(b)) return getDisplayedLoss(a) - getDisplayedLoss(b);
    } else {
      if (getDisplayedLoss(a) !== getDisplayedLoss(b)) return getDisplayedLoss(a) - getDisplayedLoss(b);
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
    }
    if (a.avgUsedCapacity !== b.avgUsedCapacity) return a.avgUsedCapacity - b.avgUsedCapacity;
    if (getDisplayedLossUnits(a) !== getDisplayedLossUnits(b)) return getDisplayedLossUnits(a) - getDisplayedLossUnits(b);
    return a.signature.localeCompare(b.signature);
  }
  if (a.winRate !== b.winRate) return b.winRate - a.winRate;
  if (a.avgEnemyRemainingHealth !== b.avgEnemyRemainingHealth) return a.avgEnemyRemainingHealth - b.avgEnemyRemainingHealth;
  if (a.avgEnemyRemainingUnits !== b.avgEnemyRemainingUnits) return a.avgEnemyRemainingUnits - b.avgEnemyRemainingUnits;
  return a.signature.localeCompare(b.signature);
}

function buildOutcomeSummaryEntry(key, bucket, totalTrials) {
  return {
    key,
    winner: bucket.winner,
    count: bucket.count,
    probability: totalTrials > 0 ? bucket.count / totalTrials : 0,
    avgLossBlood: bucket.lossBloodTotal / Math.max(1, bucket.count),
    avgStoneLossBlood: bucket.stoneLossBloodTotal / Math.max(1, bucket.count),
    lossesByKey: bucket.lossesByKey,
    permanentLossesByKey: bucket.permanentLossesByKey,
    exampleSeeds: bucket.exampleSeeds
  };
}

let localIncumbent = Number.POSITIVE_INFINITY;

function evaluateAdaptive(counts) {
  const signature = getSignature(counts);
  let wins = 0;
  let trialsRun = 0;
  let usedPtsSum = 0;
  let usedCapSum = 0;
  let usedUnitsSum = 0;
  let enemyHpSum = 0;
  let enemyUnitsSum = 0;
  let totalLostBloodSum = 0;
  let totalLostUnitsSum = 0;
  let totalStoneLostBloodSum = 0;
  let totalStoneLostUnitsSum = 0;
  let totalStoneCountSum = 0;
  let winLostBloodSum = 0;
  let winLostUnitsSum = 0;
  let winStoneLostBloodSum = 0;
  let winStoneLostUnitsSum = 0;
  let winStoneCountSum = 0;
  const expectedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const expectedStoneAdjustedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgStoneAdjustedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));

  for (let trial = 0; trial < stage1MaxTrials; trial += 1) {
    const seed = seedStart + trial;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
    trialsRun += 1;
    usedPtsSum += result.usedPoints;
    usedCapSum += result.usedCapacity;
    usedUnitsSum += result.usedUnitsTotal;
    enemyHpSum += result.enemyRemainingHealth;
    enemyUnitsSum += result.enemyRemainingUnits;
    totalLostBloodSum += result.lostBloodTotal;
    totalLostUnitsSum += result.lostUnitsTotal;
    totalStoneLostBloodSum += stoneProfile.permanentLostBlood;
    totalStoneLostUnitsSum += stoneProfile.permanentLostUnits;
    totalStoneCountSum += stoneProfile.stoneCount;
    ALLY_UNITS.forEach((unit) => {
      expectedAllyLosses[unit.key] += result.allyLosses?.[unit.key] || 0;
      expectedStoneAdjustedAllyLosses[unit.key] += stoneProfile.permanentLossesByKey?.[unit.key] || 0;
    });

    if (result.winner === "ally") {
      wins += 1;
      winLostBloodSum += result.lostBloodTotal;
      winLostUnitsSum += result.lostUnitsTotal;
      winStoneLostBloodSum += stoneProfile.permanentLostBlood;
      winStoneLostUnitsSum += stoneProfile.permanentLostUnits;
      winStoneCountSum += stoneProfile.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        avgAllyLosses[unit.key] += result.allyLosses?.[unit.key] || 0;
        avgStoneAdjustedAllyLosses[unit.key] += stoneProfile.permanentLossesByKey?.[unit.key] || 0;
      });
    }

    if (trial === 0) {
      if (result.winner !== "ally") {
        break;
      }
      const oneTrialDisplayed = stoneMode ? stoneProfile.permanentLostBlood : result.lostBloodTotal;
      if (Number.isFinite(localIncumbent) && oneTrialDisplayed > localIncumbent * 1.5) {
        break;
      }
    }
  }

  const winRate = wins / trialsRun;
  const feasible = winRate >= minWinRate && trialsRun >= stage1MaxTrials;
  const evaluation = {
    counts: cloneCounts(counts),
    signature,
    trials: trialsRun,
    feasible,
    wins,
    winRate,
    avgUsedPoints: usedPtsSum / trialsRun,
    avgUsedCapacity: usedCapSum / trialsRun,
    avgUsedUnitsTotal: usedUnitsSum / trialsRun,
    avgEnemyRemainingHealth: enemyHpSum / trialsRun,
    avgEnemyRemainingUnits: enemyUnitsSum / trialsRun,
    expectedLostBlood: totalLostBloodSum / trialsRun,
    expectedLostUnits: totalLostUnitsSum / trialsRun,
    avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneAdjustedLostBlood: totalStoneLostBloodSum / trialsRun,
    expectedStoneAdjustedLostUnits: totalStoneLostUnitsSum / trialsRun,
    avgStoneAdjustedLostBlood: wins > 0 ? winStoneLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgStoneAdjustedLostUnits: wins > 0 ? winStoneLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneCount: totalStoneCountSum / trialsRun,
    avgStoneCount: wins > 0 ? winStoneCountSum / wins : 0,
    expectedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      expectedAllyLosses[unit.key] / trialsRun
    ])),
    expectedStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      expectedStoneAdjustedAllyLosses[unit.key] / trialsRun
    ])),
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgAllyLosses[unit.key] / wins : 0
    ])),
    avgStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgStoneAdjustedAllyLosses[unit.key] / wins : 0
    ])),
  };

  const displayedLoss = getDisplayedLoss(evaluation);
  if (feasible && Number.isFinite(displayedLoss) && displayedLoss < localIncumbent) {
    localIncumbent = displayedLoss;
  }

  return evaluation;
}

function evaluateFull(counts, trials, includeOutcomes = false) {
  const signature = getSignature(counts);
  let wins = 0;
  let usedPtsSum = 0;
  let usedCapSum = 0;
  let usedUnitsSum = 0;
  let enemyHpSum = 0;
  let enemyUnitsSum = 0;
  let totalLostBloodSum = 0;
  let totalLostUnitsSum = 0;
  let totalStoneLostBloodSum = 0;
  let totalStoneLostUnitsSum = 0;
  let totalStoneCountSum = 0;
  let winLostBloodSum = 0;
  let winLostUnitsSum = 0;
  let winStoneLostBloodSum = 0;
  let winStoneLostUnitsSum = 0;
  let winStoneCountSum = 0;
  let minLostBlood = Number.POSITIVE_INFINITY;
  let maxLostBlood = Number.NEGATIVE_INFINITY;
  let minStoneLostBlood = Number.POSITIVE_INFINITY;
  let maxStoneLostBlood = Number.NEGATIVE_INFINITY;
  const expectedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const expectedStoneAdjustedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgStoneAdjustedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const winningSeeds = [];
  const outcomeBuckets = includeOutcomes ? new Map() : null;

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = seedStart + trial;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
    usedPtsSum += result.usedPoints;
    usedCapSum += result.usedCapacity;
    usedUnitsSum += result.usedUnitsTotal;
    enemyHpSum += result.enemyRemainingHealth;
    enemyUnitsSum += result.enemyRemainingUnits;
    totalLostBloodSum += result.lostBloodTotal;
    totalLostUnitsSum += result.lostUnitsTotal;
    totalStoneLostBloodSum += stoneProfile.permanentLostBlood;
    totalStoneLostUnitsSum += stoneProfile.permanentLostUnits;
    totalStoneCountSum += stoneProfile.stoneCount;
    minLostBlood = Math.min(minLostBlood, result.lostBloodTotal);
    maxLostBlood = Math.max(maxLostBlood, result.lostBloodTotal);
    minStoneLostBlood = Math.min(minStoneLostBlood, stoneProfile.permanentLostBlood);
    maxStoneLostBlood = Math.max(maxStoneLostBlood, stoneProfile.permanentLostBlood);
    ALLY_UNITS.forEach((unit) => {
      expectedAllyLosses[unit.key] += result.allyLosses?.[unit.key] || 0;
      expectedStoneAdjustedAllyLosses[unit.key] += stoneProfile.permanentLossesByKey?.[unit.key] || 0;
    });

    if (includeOutcomes) {
      const rawLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(result.allyLosses?.[unit.key]) || 0)]));
      const permLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(stoneProfile.permanentLossesByKey?.[unit.key]) || 0)]));
      const outcomeKey = [result.winner, ...ALLY_UNITS.map((unit) => rawLosses[unit.key] || 0)].join("|");
      const existing = outcomeBuckets.get(outcomeKey) || {
        winner: result.winner,
        count: 0,
        lossBloodTotal: 0,
        stoneLossBloodTotal: 0,
        lossesByKey: rawLosses,
        permanentLossesByKey: permLosses,
        exampleSeeds: []
      };
      existing.count += 1;
      existing.lossBloodTotal += result.lostBloodTotal || 0;
      existing.stoneLossBloodTotal += stoneProfile.permanentLostBlood || 0;
      if (existing.exampleSeeds.length < 6) {
        existing.exampleSeeds.push(seed);
      }
      outcomeBuckets.set(outcomeKey, existing);
    }

    if (result.winner === "ally") {
      wins += 1;
      if (winningSeeds.length < 24) {
        winningSeeds.push(seed);
      }
      winLostBloodSum += result.lostBloodTotal;
      winLostUnitsSum += result.lostUnitsTotal;
      winStoneLostBloodSum += stoneProfile.permanentLostBlood;
      winStoneLostUnitsSum += stoneProfile.permanentLostUnits;
      winStoneCountSum += stoneProfile.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        avgAllyLosses[unit.key] += result.allyLosses?.[unit.key] || 0;
        avgStoneAdjustedAllyLosses[unit.key] += stoneProfile.permanentLossesByKey?.[unit.key] || 0;
      });
    }
  }

  const evaluation = {
    counts: cloneCounts(counts),
    signature,
    trials,
    feasible: wins / trials >= minWinRate,
    wins,
    winRate: wins / trials,
    avgUsedPoints: usedPtsSum / trials,
    avgUsedCapacity: usedCapSum / trials,
    avgUsedUnitsTotal: usedUnitsSum / trials,
    avgEnemyRemainingHealth: enemyHpSum / trials,
    avgEnemyRemainingUnits: enemyUnitsSum / trials,
    expectedLostBlood: totalLostBloodSum / trials,
    expectedLostUnits: totalLostUnitsSum / trials,
    avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneAdjustedLostBlood: totalStoneLostBloodSum / trials,
    expectedStoneAdjustedLostUnits: totalStoneLostUnitsSum / trials,
    avgStoneAdjustedLostBlood: wins > 0 ? winStoneLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgStoneAdjustedLostUnits: wins > 0 ? winStoneLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneCount: totalStoneCountSum / trials,
    avgStoneCount: wins > 0 ? winStoneCountSum / wins : 0,
    minLostBlood: Number.isFinite(minLostBlood) ? minLostBlood : null,
    maxLostBlood: Number.isFinite(maxLostBlood) ? maxLostBlood : null,
    minStoneAdjustedLostBlood: Number.isFinite(minStoneLostBlood) ? minStoneLostBlood : null,
    maxStoneAdjustedLostBlood: Number.isFinite(maxStoneLostBlood) ? maxStoneLostBlood : null,
    expectedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      expectedAllyLosses[unit.key] / trials
    ])),
    expectedStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      expectedStoneAdjustedAllyLosses[unit.key] / trials
    ])),
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgAllyLosses[unit.key] / wins : 0
    ])),
    avgStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgStoneAdjustedAllyLosses[unit.key] / wins : 0
    ])),
    winningSeeds,
  };

  if (includeOutcomes) {
    evaluation.topOutcomes = [...outcomeBuckets.entries()]
      .map(([key, bucket]) => buildOutcomeSummaryEntry(key, bucket, trials))
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        if (a.winner !== b.winner) return a.winner === "ally" ? -1 : 1;
        const lossA = stoneMode ? a.avgStoneLossBlood : a.avgLossBlood;
        const lossB = stoneMode ? b.avgStoneLossBlood : b.avgLossBlood;
        if (lossA !== lossB) return lossA - lossB;
        return a.key.localeCompare(b.key);
      })
      .slice(0, topOutcomeCount);
  }

  return evaluation;
}

class TopKShortlist {
  constructor(limit) {
    this.limit = limit;
    this.items = [];
    this.worst = null;
  }
  add(entry) {
    if (this.items.length < this.limit) {
      this.items.push(entry);
      if (this.items.length === this.limit) this.prune();
      return;
    }
    if (this.worst && comparePrimary(entry, this.worst) >= 0) {
      return;
    }
    this.items.push(entry);
    if (this.items.length >= this.limit * 4) {
      this.prune();
    }
  }
  prune() {
    const unique = new Map();
    for (const entry of this.items) {
      const existing = unique.get(entry.signature);
      if (!existing || comparePrimary(entry, existing) < 0) {
        unique.set(entry.signature, entry);
      }
    }
    this.items = [...unique.values()].sort(comparePrimary).slice(0, this.limit);
    this.worst = this.items.length ? this.items[this.items.length - 1] : null;
  }
  finalize() {
    this.prune();
    return this.items;
  }
}

const shortlist = new TopKShortlist(shortlistSize);
const partial = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
const partitionStart = Math.max(0, partition.start ?? 0);
const partitionEnd = Math.min(config.allyPool[partitionUnit.key] || 0, partition.end ?? (config.allyPool[partitionUnit.key] || 0));
const partitionCost = POINTS_BY_ALLY_KEY[partitionUnit.key];

let checked = 0;
let lastReport = Date.now();
const startTime = Date.now();

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function buildSnapshot(limit = 12) {
  const entries = shortlist.finalize().slice(0, limit);
  if (liveOutcomeCandidates <= 0 || liveVerificationTrials <= 0) {
    return entries;
  }
  return entries
    .slice(0, liveOutcomeCandidates)
    .map((entry) => evaluateFull(entry.counts, liveVerificationTrials, true));
}

function enumerate(index, remainingPoints) {
  if (index >= otherUnits.length) {
    checked += 1;
    shortlist.add(evaluateAdaptive(partial));
    if (Date.now() - lastReport > 2000) {
      lastReport = Date.now();
      emit({
        type: "progress",
        worker: partition.id,
        checked,
        elapsedMs: Date.now() - startTime,
        incumbent: Number.isFinite(localIncumbent) ? localIncumbent : null,
        topCandidates: buildSnapshot(12)
      });
    }
    return;
  }

  const unit = otherUnits[index];
  const cost = POINTS_BY_ALLY_KEY[unit.key];
  const maxCount = Math.min(config.allyPool?.[unit.key] || 0, Math.floor(remainingPoints / cost));
  for (let count = 0; count <= maxCount; count += 1) {
    partial[unit.key] = count;
    enumerate(index + 1, remainingPoints - count * cost);
  }
  partial[unit.key] = 0;
}

emit({ type: "start", worker: partition.id, partitionStart, partitionEnd });

for (let count = partitionStart; count <= partitionEnd; count += 1) {
  if (count * partitionCost > pointLimit) break;
  partial[partitionUnit.key] = count;
  enumerate(0, pointLimit - count * partitionCost);
}
partial[partitionUnit.key] = 0;

const finalShortlist = shortlist.finalize();
const stage2Pool = finalShortlist.slice(0, stage2TopK);
const stage2Verified = stage2Pool
  .map((entry, index) => evaluateFull(entry.counts, stage2Trials, index < liveOutcomeCandidates))
  .sort(comparePrimary);

emit({
  type: "done",
  worker: partition.id,
  checked,
  elapsedMs: Date.now() - startTime,
  shortlist: stage2Verified
});
"""

MASTER_JS = r"""
"use strict";

const fs = require("fs");
require("./battle-core.js");

const {
  ALLY_UNITS,
  simulateBattle,
  getStoneAdjustedLossProfile
} = globalThis.BattleCore;

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const merged = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

const objective = config.objective === "min_army" ? "min_army" : "min_loss";
const stoneMode = Boolean(config.stoneMode);
const minWinRate = Number.isFinite(config.minWinRate) ? config.minWinRate : 0.75;
const trials = Math.max(1, Math.floor(config.stage3Trials || 240));
const seedStart = Math.floor(config.seedStart || 1);
const topK = Math.max(1, Math.floor(config.stage3TopK || 600));
const topResultCount = Math.max(1, Math.floor(config.topResultCount || 100));
const topOutcomeCount = Math.max(1, Math.floor(config.topOutcomeCount || 8));
const knownCandidates = Array.isArray(config.knownCandidates) ? config.knownCandidates : [];

function cloneCounts(counts) {
  return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, counts?.[unit.key] || 0]));
}

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function normalizeKnownCandidate(candidate) {
  return {
    label: candidate.label || "known_candidate",
    note: candidate.note || "",
    counts: cloneCounts(candidate.counts || {})
  };
}

function getDisplayedLoss(entry) {
  const value = stoneMode ? entry.expectedStoneAdjustedLostBlood : entry.expectedLostBlood;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getDisplayedLossUnits(entry) {
  const value = stoneMode ? entry.expectedStoneAdjustedLostUnits : entry.expectedLostUnits;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function comparePrimary(a, b) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (a.feasible) {
    if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    if (objective === "min_army") {
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
      if (getDisplayedLoss(a) !== getDisplayedLoss(b)) return getDisplayedLoss(a) - getDisplayedLoss(b);
    } else {
      if (getDisplayedLoss(a) !== getDisplayedLoss(b)) return getDisplayedLoss(a) - getDisplayedLoss(b);
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
    }
    if (a.avgUsedCapacity !== b.avgUsedCapacity) return a.avgUsedCapacity - b.avgUsedCapacity;
    if (getDisplayedLossUnits(a) !== getDisplayedLossUnits(b)) return getDisplayedLossUnits(a) - getDisplayedLossUnits(b);
    return a.signature.localeCompare(b.signature);
  }
  if (a.winRate !== b.winRate) return b.winRate - a.winRate;
  if (a.avgEnemyRemainingHealth !== b.avgEnemyRemainingHealth) return a.avgEnemyRemainingHealth - b.avgEnemyRemainingHealth;
  if (a.avgEnemyRemainingUnits !== b.avgEnemyRemainingUnits) return a.avgEnemyRemainingUnits - b.avgEnemyRemainingUnits;
  return a.signature.localeCompare(b.signature);
}

function buildOutcomeSummaryEntry(key, bucket, totalTrials) {
  return {
    key,
    winner: bucket.winner,
    count: bucket.count,
    probability: totalTrials > 0 ? bucket.count / totalTrials : 0,
    avgLossBlood: bucket.lossBloodTotal / Math.max(1, bucket.count),
    avgStoneLossBlood: bucket.stoneLossBloodTotal / Math.max(1, bucket.count),
    lossesByKey: bucket.lossesByKey,
    permanentLossesByKey: bucket.permanentLossesByKey,
    exampleSeeds: bucket.exampleSeeds
  };
}

function evaluateFull(counts) {
  const signature = getSignature(counts);
  let wins = 0;
  let usedPtsSum = 0;
  let usedCapSum = 0;
  let enemyHpSum = 0;
  let enemyUnitsSum = 0;
  let totalLostBloodSum = 0;
  let totalLostUnitsSum = 0;
  let totalStoneLostBloodSum = 0;
  let totalStoneLostUnitsSum = 0;
  let totalStoneCountSum = 0;
  let winLostBloodSum = 0;
  let winLostUnitsSum = 0;
  let winStoneLostBloodSum = 0;
  let winStoneLostUnitsSum = 0;
  let winStoneCountSum = 0;
  let minLostBlood = Number.POSITIVE_INFINITY;
  let maxLostBlood = Number.NEGATIVE_INFINITY;
  let minStoneLostBlood = Number.POSITIVE_INFINITY;
  let maxStoneLostBlood = Number.NEGATIVE_INFINITY;
  const expectedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const expectedStoneAdjustedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgStoneAdjustedAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const winningSeeds = [];
  const outcomeBuckets = new Map();

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = seedStart + trial;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
    usedPtsSum += result.usedPoints;
    usedCapSum += result.usedCapacity;
    enemyHpSum += result.enemyRemainingHealth;
    enemyUnitsSum += result.enemyRemainingUnits;
    totalLostBloodSum += result.lostBloodTotal;
    totalLostUnitsSum += result.lostUnitsTotal;
    totalStoneLostBloodSum += stoneProfile.permanentLostBlood;
    totalStoneLostUnitsSum += stoneProfile.permanentLostUnits;
    totalStoneCountSum += stoneProfile.stoneCount;
    minLostBlood = Math.min(minLostBlood, result.lostBloodTotal);
    maxLostBlood = Math.max(maxLostBlood, result.lostBloodTotal);
    minStoneLostBlood = Math.min(minStoneLostBlood, stoneProfile.permanentLostBlood);
    maxStoneLostBlood = Math.max(maxStoneLostBlood, stoneProfile.permanentLostBlood);
    ALLY_UNITS.forEach((unit) => {
      expectedAllyLosses[unit.key] += result.allyLosses?.[unit.key] || 0;
      expectedStoneAdjustedAllyLosses[unit.key] += stoneProfile.permanentLossesByKey?.[unit.key] || 0;
    });

    const rawLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(result.allyLosses?.[unit.key]) || 0)]));
    const permLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(stoneProfile.permanentLossesByKey?.[unit.key]) || 0)]));
    const outcomeKey = [result.winner, ...ALLY_UNITS.map((unit) => rawLosses[unit.key] || 0)].join("|");
    const existing = outcomeBuckets.get(outcomeKey) || {
      winner: result.winner,
      count: 0,
      lossBloodTotal: 0,
      stoneLossBloodTotal: 0,
      lossesByKey: rawLosses,
      permanentLossesByKey: permLosses,
      exampleSeeds: []
    };
    existing.count += 1;
    existing.lossBloodTotal += result.lostBloodTotal || 0;
    existing.stoneLossBloodTotal += stoneProfile.permanentLostBlood || 0;
    if (existing.exampleSeeds.length < 6) {
      existing.exampleSeeds.push(seed);
    }
    outcomeBuckets.set(outcomeKey, existing);

    if (result.winner === "ally") {
      wins += 1;
      if (winningSeeds.length < 24) {
        winningSeeds.push(seed);
      }
      winLostBloodSum += result.lostBloodTotal;
      winLostUnitsSum += result.lostUnitsTotal;
      winStoneLostBloodSum += stoneProfile.permanentLostBlood;
      winStoneLostUnitsSum += stoneProfile.permanentLostUnits;
      winStoneCountSum += stoneProfile.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        avgAllyLosses[unit.key] += result.allyLosses?.[unit.key] || 0;
        avgStoneAdjustedAllyLosses[unit.key] += stoneProfile.permanentLossesByKey?.[unit.key] || 0;
      });
    }
  }

  return {
    counts: cloneCounts(counts),
    signature,
    trials,
    feasible: wins / trials >= minWinRate,
    wins,
    winRate: wins / trials,
    avgUsedPoints: usedPtsSum / trials,
    avgUsedCapacity: usedCapSum / trials,
    avgEnemyRemainingHealth: enemyHpSum / trials,
    avgEnemyRemainingUnits: enemyUnitsSum / trials,
    expectedLostBlood: totalLostBloodSum / trials,
    expectedLostUnits: totalLostUnitsSum / trials,
    avgLostBlood: wins > 0 ? winLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgLostUnits: wins > 0 ? winLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneAdjustedLostBlood: totalStoneLostBloodSum / trials,
    expectedStoneAdjustedLostUnits: totalStoneLostUnitsSum / trials,
    avgStoneAdjustedLostBlood: wins > 0 ? winStoneLostBloodSum / wins : Number.POSITIVE_INFINITY,
    avgStoneAdjustedLostUnits: wins > 0 ? winStoneLostUnitsSum / wins : Number.POSITIVE_INFINITY,
    expectedStoneCount: totalStoneCountSum / trials,
    avgStoneCount: wins > 0 ? winStoneCountSum / wins : 0,
    minLostBlood: Number.isFinite(minLostBlood) ? minLostBlood : null,
    maxLostBlood: Number.isFinite(maxLostBlood) ? maxLostBlood : null,
    minStoneAdjustedLostBlood: Number.isFinite(minStoneLostBlood) ? minStoneLostBlood : null,
    maxStoneAdjustedLostBlood: Number.isFinite(maxStoneLostBlood) ? maxStoneLostBlood : null,
    expectedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      expectedAllyLosses[unit.key] / trials
    ])),
    expectedStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      expectedStoneAdjustedAllyLosses[unit.key] / trials
    ])),
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgAllyLosses[unit.key] / wins : 0
    ])),
    avgStoneAdjustedAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgStoneAdjustedAllyLosses[unit.key] / wins : 0
    ])),
    winningSeeds,
    topOutcomes: [...outcomeBuckets.entries()]
      .map(([key, bucket]) => buildOutcomeSummaryEntry(key, bucket, trials))
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        if (a.winner !== b.winner) return a.winner === "ally" ? -1 : 1;
        const lossA = stoneMode ? a.avgStoneLossBlood : a.avgLossBlood;
        const lossB = stoneMode ? b.avgStoneLossBlood : b.avgLossBlood;
        if (lossA !== lossB) return lossA - lossB;
        return a.key.localeCompare(b.key);
      })
      .slice(0, topOutcomeCount)
  };
}

const mergedMap = new Map();
for (const entry of merged) {
  const existing = mergedMap.get(entry.signature);
  if (!existing || comparePrimary(entry, existing) < 0) {
    mergedMap.set(entry.signature, entry);
  }
}

const preliminary = [...mergedMap.values()].sort(comparePrimary).slice(0, topK);
const finalPoolMap = new Map(preliminary.map((entry) => [entry.signature, entry]));
const normalizedKnownCandidates = knownCandidates.map(normalizeKnownCandidate);
for (const known of normalizedKnownCandidates) {
  const signature = getSignature(known.counts);
  if (!finalPoolMap.has(signature)) {
    finalPoolMap.set(signature, {
      counts: cloneCounts(known.counts),
      signature,
      feasible: false,
      winRate: 0,
      avgUsedPoints: 0,
      avgUsedCapacity: 0,
      avgUsedUnitsTotal: 0,
      avgEnemyRemainingHealth: Number.POSITIVE_INFINITY,
      avgEnemyRemainingUnits: Number.POSITIVE_INFINITY,
      expectedLostBlood: Number.POSITIVE_INFINITY,
      expectedLostUnits: Number.POSITIVE_INFINITY,
      expectedStoneAdjustedLostBlood: Number.POSITIVE_INFINITY,
      expectedStoneAdjustedLostUnits: Number.POSITIVE_INFINITY
    });
  }
}

const verified = [...finalPoolMap.values()]
  .map((entry) => evaluateFull(entry.counts))
  .sort(comparePrimary);

const rankBySignature = new Map();
verified.forEach((entry, index) => rankBySignature.set(entry.signature, index + 1));

const knownCandidateResults = normalizedKnownCandidates.map((known) => {
  const signature = getSignature(known.counts);
  const found = verified.find((entry) => entry.signature === signature) || evaluateFull(known.counts);
  return {
    label: known.label,
    note: known.note,
    rank: rankBySignature.get(signature) || null,
    result: found
  };
});

process.stdout.write(JSON.stringify({
  totalMergedCandidates: merged.length,
  totalVerifiedCandidates: verified.length,
  best: verified[0] || null,
  topResults: verified.slice(0, topResultCount),
  knownCandidateResults
}, null, 2));
"""


def sh(cmd):
    return subprocess.run(
        cmd,
        shell=True,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def output_path(suffix):
    return f"{CONFIG['outputPrefix']}_{suffix}"


def fmt_int(value):
    try:
        return f"{int(value):,}".replace(",", ".")
    except Exception:
        return str(value)


def fmt_num(value, digits=1, default="-"):
    if value is None:
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(numeric):
        return default
    rounded = round(numeric, digits)
    if digits == 0:
        return str(int(round(rounded)))
    if abs(rounded - int(round(rounded))) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.{digits}f}"


def fmt_pct(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return "-"
    if not math.isfinite(numeric):
        return "-"
    return f"%{numeric * 100:.2f}"


def fmt_elapsed(seconds):
    if not math.isfinite(seconds):
        return "--:--:--"
    seconds = max(0, int(seconds))
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def unit_counts_to_text(counts):
    parts = []
    for index, (key, _, _) in enumerate(UNIT_ORDER, start=1):
        value = int((counts or {}).get(key, 0) or 0)
        if value > 0:
            parts.append(f"T{index}:{value}")
    return ", ".join(parts) if parts else "(bos)"


def unit_count_total(counts):
    return sum(int((counts or {}).get(key, 0) or 0) for key, _, _ in UNIT_ORDER)


def best_unit_rows(counts):
    rows = []
    for key, label, _ in UNIT_ORDER:
        value = int((counts or {}).get(key, 0) or 0)
        if value > 0:
            rows.append((label, value))
    return rows


def losses_to_text(losses):
    parts = []
    for index, (key, _, _) in enumerate(UNIT_ORDER, start=1):
        value = (losses or {}).get(key, 0)
        if value and value > 0:
            parts.append(f"T{index}:{fmt_num(value, 2, '0')}")
    return ", ".join(parts) if parts else "yok"


def approximate_loss_text(entry):
    losses = entry.get("expectedStoneAdjustedAllyLosses") if CONFIG.get("stoneMode") else entry.get("expectedAllyLosses")
    parts = []
    for key, label, _ in UNIT_ORDER:
        value = (losses or {}).get(key, 0)
        if value and value > 0:
            rounded = max(1, int(round(value)))
            parts.append(f"~{rounded} {label}")
    return ", ".join(parts) if parts else "yaklasik kayip yok"


def displayed_loss(entry):
    if not entry:
        return None
    if CONFIG.get("stoneMode"):
        return entry.get("expectedStoneAdjustedLostBlood")
    return entry.get("expectedLostBlood")


def displayed_loss_units(entry):
    if not entry:
        return None
    if CONFIG.get("stoneMode"):
        return entry.get("expectedStoneAdjustedLostUnits")
    return entry.get("expectedLostUnits")


def displayed_used_units(entry):
    if not entry:
        return None
    return entry.get("avgUsedUnitsTotal")


def displayed_used_capacity(entry):
    if not entry:
        return None
    return entry.get("avgUsedCapacity")


def live_compare_key(entry):
    feasible_rank = 0 if entry.get("feasible") else 1
    win_rank = -(entry.get("winRate") or 0)
    loss_rank = displayed_loss(entry)
    if loss_rank is None or not math.isfinite(loss_rank):
        loss_rank = float("inf")
    points_rank = entry.get("avgUsedPoints")
    if points_rank is None or not math.isfinite(points_rank):
        points_rank = float("inf")
    enemy_hp_rank = entry.get("avgEnemyRemainingHealth")
    if enemy_hp_rank is None or not math.isfinite(enemy_hp_rank):
        enemy_hp_rank = float("inf")
    enemy_units_rank = entry.get("avgEnemyRemainingUnits")
    if enemy_units_rank is None or not math.isfinite(enemy_units_rank):
        enemy_units_rank = float("inf")
    sig = entry.get("signature", "")
    if CONFIG.get("objective") == "min_army":
        return (feasible_rank, win_rank, points_rank, loss_rank, enemy_hp_rank, enemy_units_rank, sig)
    return (feasible_rank, win_rank, loss_rank, points_rank, enemy_hp_rank, enemy_units_rank, sig)


def count_combinations_for_partition(ally_pool, point_limit, axis, axis_start, axis_end):
    others = [(key, count) for key, count in ally_pool.items() if count > 0 and key != axis]
    axis_cost = POINT_COSTS[axis]
    total = 0

    for axis_count in range(axis_start, axis_end + 1):
        used = axis_count * axis_cost
        if used > point_limit:
            break
        remaining = point_limit - used
        dp = [0] * (remaining + 1)
        dp[0] = 1
        for key, max_count in others:
            cost = POINT_COSTS[key]
            next_dp = [0] * (remaining + 1)
            for points in range(remaining + 1):
                if dp[points] == 0:
                    continue
                max_take = min(max_count, (remaining - points) // cost)
                for count in range(max_take + 1):
                    next_dp[points + count * cost] += dp[points]
            dp = next_dp
        total += sum(dp)

    return total


def split_partitions(ally_pool, point_limit, axis, worker_count):
    axis_max = ally_pool[axis]
    total = count_combinations_for_partition(ally_pool, point_limit, axis, 0, axis_max)
    target_per_worker = total / worker_count
    others = [(key, count) for key, count in ally_pool.items() if count > 0 and key != axis]
    axis_cost = POINT_COSTS[axis]
    cumulative = []
    running_total = 0

    for axis_count in range(axis_max + 1):
        used = axis_count * axis_cost
        if used > point_limit:
            cumulative.append(running_total)
            continue
        remaining = point_limit - used
        dp = [0] * (remaining + 1)
        dp[0] = 1
        for key, max_count in others:
            cost = POINT_COSTS[key]
            next_dp = [0] * (remaining + 1)
            for points in range(remaining + 1):
                if dp[points] == 0:
                    continue
                max_take = min(max_count, (remaining - points) // cost)
                for count in range(max_take + 1):
                    next_dp[points + count * cost] += dp[points]
            dp = next_dp
        running_total += sum(dp)
        cumulative.append(running_total)

    partitions = []
    last_end = -1
    for index in range(worker_count):
        target = target_per_worker * (index + 1)
        pos = last_end + 1
        while pos < len(cumulative) and cumulative[pos] < target:
            pos += 1
        end = min(pos, axis_max)
        if index == worker_count - 1:
            end = axis_max
        if last_end + 1 <= end:
            partitions.append({
                "id": index,
                "axis": axis,
                "start": last_end + 1,
                "end": end,
            })
        last_end = end

    return partitions


def format_outcome_block(outcomes):
    if not outcomes:
        return ["      tekil outcome yok"]
    lines = []
    for index, outcome in enumerate(outcomes, start=1):
        winner = "zafer" if outcome.get("winner") == "ally" else "maglubiyet"
        probability = (outcome.get("probability") or 0) * 100
        loss_value = outcome.get("avgStoneLossBlood") if CONFIG.get("stoneMode") else outcome.get("avgLossBlood")
        losses = outcome.get("permanentLossesByKey") if CONFIG.get("stoneMode") else outcome.get("lossesByKey")
        lines.append(
            f"      {index:2}. {winner:<10} olasilik={probability:6.2f}%  "
            f"kan={fmt_num(loss_value, 1, '0'):>6}  {losses_to_text(losses)}"
        )
        seeds = outcome.get("exampleSeeds") or []
        if seeds:
            lines.append(f"          ornek seedler: {', '.join(str(seed) for seed in seeds)}")
    return lines


def build_text_report(final_payload, total_combos, elapsed_seconds):
    lines = []
    lines.append(CONFIG["scenarioName"])
    lines.append("=" * len(CONFIG["scenarioName"]))
    lines.append("")
    lines.append(f"Stage              : {CONFIG['stage']}")
    lines.append(f"Point limit        : {CONFIG['pointLimit']}")
    lines.append(f"Objective          : {CONFIG['objective']}")
    lines.append(f"Stone mode         : {CONFIG['stoneMode']}")
    lines.append(f"Min win rate       : {CONFIG['minWinRate']}")
    lines.append(f"Workers            : {CONFIG['workers']}")
    lines.append(f"Stage3 trials      : {CONFIG['stage3Trials']}")
    lines.append(f"Total combinations : {fmt_int(total_combos)}")
    lines.append(f"Elapsed            : {fmt_elapsed(elapsed_seconds)}")
    lines.append("")

    lines.append("Enemy")
    lines.append("-----")
    for key, value in CONFIG["enemy"].items():
        lines.append(f"{key:14s}: {value}")
    lines.append("")

    lines.append("Ally pool")
    lines.append("---------")
    for key, label, _ in UNIT_ORDER:
        lines.append(f"{key:14s}: {CONFIG['allyPool'].get(key, 0)}")
    lines.append("")

    known_results = final_payload.get("knownCandidateResults") or []
    if known_results:
        lines.append("Pinned reference candidates")
        lines.append("--------------------------")
        for item in known_results:
            result = item.get("result") or {}
            lines.append(f"Label        : {item.get('label')}")
            lines.append(f"Rank         : {item.get('rank') if item.get('rank') is not None else 'top pool disi'}")
            lines.append(f"Counts       : {unit_counts_to_text(result.get('counts') or {})}")
            lines.append(f"Win rate     : {fmt_pct(result.get('winRate'))}")
            lines.append(f"Exp. loss    : {fmt_num(displayed_loss(result), 1)}")
            lines.append(f"Used points  : {fmt_num(result.get('avgUsedPoints'), 1)}")
            lines.append(f"Used units   : {fmt_num(displayed_used_units(result), 1)}")
            lines.append(f"Used cap     : {fmt_num(displayed_used_capacity(result), 1)}")
            note = item.get("note")
            if note:
                lines.append(f"Note         : {note}")
            lines.append("")

    best = final_payload.get("best") or {}
    lines.append("ANA SONUC")
    lines.append("---------")
    lines.append("Kazanabilir dizilim" if best.get("feasible") else "Yetersiz dizilim")
    lines.append(f"Kazanma orani       : {fmt_pct(best.get('winRate'))}")
    lines.append(f"Ortalama kan kaybi  : {fmt_num(displayed_loss(best), 1)}")
    min_loss = best.get("minStoneAdjustedLostBlood") if CONFIG.get("stoneMode") else best.get("minLostBlood")
    max_loss = best.get("maxStoneAdjustedLostBlood") if CONFIG.get("stoneMode") else best.get("maxLostBlood")
    lines.append(f"Min / max kayip     : {fmt_num(min_loss, 1)} / {fmt_num(max_loss, 1)}")
    lines.append(f"Kullanilan puan     : {fmt_num(best.get('avgUsedPoints'), 1)} / {CONFIG['pointLimit']}")
    lines.append(f"Kullanilan birlik   : {fmt_num(displayed_used_units(best), 1)}")
    lines.append(f"Kullanilan kapasite : {fmt_num(displayed_used_capacity(best), 1)}")
    lines.append(f"Ortalama kayip birlik: {fmt_num(displayed_loss_units(best), 2)}")
    lines.append(f"Yaklasik kayip      : {approximate_loss_text(best)}")
    lines.append("")

    lines.append("BIRLIK DIZILISI")
    lines.append("--------------")
    for label, value in best_unit_rows(best.get("counts") or {}):
        lines.append(f"{label:20s}: {value}")
    lines.append("")

    lines.append("DETAY METRIKLERI")
    lines.append("----------------")
    lines.append(f"Ornek galibiyet    : {best.get('wins', 0)}")
    lines.append(f"Toplam trial       : {best.get('trials', 0)}")
    lines.append(f"Kullanilan birlik  : {fmt_num(displayed_used_units(best), 1)}")
    lines.append(f"Kullanilan kapasite: {fmt_num(displayed_used_capacity(best), 1)}")
    lines.append(f"Ortalama kayip birlik: {fmt_num(displayed_loss_units(best), 2)}")
    lines.append(f"Durum              : {'Kazanabilir' if best.get('feasible') else 'Yetersiz'}")
    lines.append(f"Expected losses    : {losses_to_text(best.get('expectedStoneAdjustedAllyLosses') if CONFIG.get('stoneMode') else best.get('expectedAllyLosses'))}")
    lines.append("")

    lines.append("EN OLASI SONUC DAGILIMI")
    lines.append("-----------------------")
    lines.extend(format_outcome_block(best.get("topOutcomes")))
    lines.append("")

    lines.append("Top 100")
    lines.append("-------")
    for index, entry in enumerate(final_payload.get("topResults") or [], start=1):
        lines.append(
            f"{index:3}. win={fmt_pct(entry.get('winRate')):>8}  "
            f"exp_loss={fmt_num(displayed_loss(entry), 1):>7}  "
            f"exp_units={fmt_num(displayed_loss_units(entry), 2):>7}  "
            f"pts={fmt_num(entry.get('avgUsedPoints'), 1):>6}  "
            f"units={fmt_num(displayed_used_units(entry), 1):>6}  "
            f"cap={fmt_num(displayed_used_capacity(entry), 1):>6}  "
            f"{unit_counts_to_text(entry.get('counts') or {})}"
        )
        lines.append(f"      expected losses: {losses_to_text(entry.get('expectedStoneAdjustedAllyLosses') if CONFIG.get('stoneMode') else entry.get('expectedAllyLosses'))}")
        lines.append(f"      avg win losses: {losses_to_text(entry.get('avgStoneAdjustedAllyLosses') if CONFIG.get('stoneMode') else entry.get('avgAllyLosses'))}")
        lines.extend(format_outcome_block(entry.get("topOutcomes")))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def build_live_html(active_workers, total_workers, elapsed, global_incumbent, entries):
    best = entries[0] if entries else None
    best_loss = displayed_loss(best) if best else global_incumbent
    summary = (
        f"sure {fmt_elapsed(elapsed)} | aktif worker {active_workers}/{total_workers} | "
        f"en iyi dogrulanmis kayip {fmt_num(best_loss, 1)}"
    )

    if not best:
        return f"""
        <div>
          <pre>{summary}</pre>
          <div style="padding:16px;border:1px solid #263142;border-radius:18px;background:#111722;color:#e5e7eb;font-family:system-ui;">
            Henuz canli sonuc yok.
          </div>
        </div>
        """

    unit_rows = "".join(
        f"""
        <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        """
        for label, value in best_unit_rows(best.get("counts") or {})
    )
    outcome_lines = "".join(
        f"<div style='margin-top:6px;color:#aeb9c9;'>{line}</div>"
        for line in format_outcome_block(best.get("topOutcomes"))[:6]
    )

    return f"""
    <div>
      <pre>{summary}</pre>
      <div style="background:#111722;color:#e5e7eb;border:1px solid #263142;border-radius:22px;padding:18px;font-family:system-ui;max-width:980px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
            <div>
            <div style="font-size:28px;font-weight:800;">Canli dogrulanmis sonuc</div>
            <div style="margin-top:4px;color:#9fb0c5;">{'Kazanabilir dizilim' if best.get('feasible') else 'Yetersiz dizilim'} | {best.get('trials', 0)} seed ile canli dogrulandi</div>
          </div>
          <div style="font-weight:700;color:#d8e1ef;">{'Kazanilir' if best.get('feasible') else 'Yetersiz'}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;">
          <div style="padding:16px;border:1px solid #253041;border-radius:16px;background:#121923;">
            <div style="color:#9fb0c5;">Kazanma orani</div>
            <div style="font-size:34px;font-weight:800;margin-top:8px;">{fmt_pct(best.get('winRate'))}</div>
          </div>
          <div style="padding:16px;border:1px solid #253041;border-radius:16px;background:#121923;">
            <div style="color:#9fb0c5;">Ortalama kan kaybi</div>
            <div style="font-size:34px;font-weight:800;margin-top:8px;">{fmt_num(displayed_loss(best), 1)}</div>
            <div style="margin-top:8px;color:#9fb0c5;">min {fmt_num(best.get('minStoneAdjustedLostBlood') if CONFIG.get('stoneMode') else best.get('minLostBlood'), 1)} / max {fmt_num(best.get('maxStoneAdjustedLostBlood') if CONFIG.get('stoneMode') else best.get('maxLostBlood'), 1)}</div>
            <div style="margin-top:8px;color:#c8d1dd;">{approximate_loss_text(best)}</div>
          </div>
          <div style="padding:16px;border:1px solid #253041;border-radius:16px;background:#121923;">
            <div style="color:#9fb0c5;">Kullanilan puan</div>
            <div style="font-size:28px;font-weight:800;margin-top:8px;">{fmt_num(best.get('avgUsedPoints'), 1)} / {CONFIG['pointLimit']}</div>
          </div>
          <div style="padding:16px;border:1px solid #253041;border-radius:16px;background:#121923;">
            <div style="color:#9fb0c5;">Kullanilan birlik</div>
            <div style="font-size:28px;font-weight:800;margin-top:8px;">{fmt_num(displayed_used_units(best), 1)}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;">
          <div style="padding:16px;border:1px solid #253041;border-radius:16px;background:#121923;">
            <div style="font-size:22px;font-weight:800;margin-bottom:12px;">Birlik Dizilisi</div>
            <div style="display:grid;gap:10px;">{unit_rows}</div>
          </div>
          <div style="padding:16px;border:1px solid #253041;border-radius:16px;background:#121923;">
            <div style="font-size:22px;font-weight:800;margin-bottom:12px;">Detay Metrikleri</div>
            <div style="display:grid;gap:10px;">
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Ornek galibiyet</span><strong>{best.get('wins', 0)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Toplam trial</span><strong>{best.get('trials', 0)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Kullanilan birlik</span><strong>{fmt_num(displayed_used_units(best), 1)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Kullanilan kapasite</span><strong>{fmt_num(displayed_used_capacity(best), 1)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Ortalama kayip birlik</span><strong>{fmt_num(displayed_loss_units(best), 2)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Durum</span><strong>{'Kazanabilir' if best.get('feasible') else 'Yetersiz'}</strong></div>
              <div style="padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;"><span>Yaklasik kayip</span><div style="margin-top:8px;font-weight:700;">{approximate_loss_text(best)}</div></div>
            </div>
            <div style="margin-top:14px;padding:10px 14px;border:1px solid #253041;border-radius:12px;background:#171f2b;">
              <div style="font-weight:700;">En olasi sonuc dagilimi</div>
              {outcome_lines}
            </div>
          </div>
        </div>
      </div>
    </div>
    """


def run_smoke_test():
    known = CONFIG["knownCandidates"][0]["counts"]
    sample_best = {
        "counts": known,
        "feasible": True,
        "wins": 240,
        "trials": 240,
        "winRate": 1.0,
        "expectedLostBlood": 868.0,
        "expectedLostUnits": 49.0,
        "avgLostBlood": 868.0,
        "avgLostUnits": 49.0,
        "avgUsedPoints": 618.0,
        "avgUsedCapacity": 157.0,
        "avgUsedUnitsTotal": 157.0,
        "avgEnemyRemainingHealth": 0.0,
        "avgEnemyRemainingUnits": 0.0,
        "minLostBlood": 565.0,
        "maxLostBlood": 1675.0,
        "expectedAllyLosses": {
            "bats": 5.0,
            "ghouls": 39.0,
            "thralls": 1.0,
            "banshees": 3.0,
            "necromancers": 1.0,
            "gargoyles": 1.0,
            "witches": 0.0,
            "rotmaws": 0.0,
        },
        "avgAllyLosses": {
            "bats": 5.0,
            "ghouls": 39.0,
            "thralls": 1.0,
            "banshees": 3.0,
            "necromancers": 1.0,
            "gargoyles": 1.0,
            "witches": 0.0,
            "rotmaws": 0.0,
        },
        "topOutcomes": [
            {
                "winner": "ally",
                "count": 191,
                "probability": 191 / 240,
                "avgLossBlood": 825.0,
                "avgStoneLossBlood": 825.0,
                "lossesByKey": {
                    "bats": 0,
                    "ghouls": 41,
                    "thralls": 1,
                    "banshees": 4,
                    "necromancers": 1,
                    "gargoyles": 0,
                    "witches": 0,
                    "rotmaws": 0,
                },
                "permanentLossesByKey": {
                    "bats": 0,
                    "ghouls": 41,
                    "thralls": 1,
                    "banshees": 4,
                    "necromancers": 1,
                    "gargoyles": 0,
                    "witches": 0,
                    "rotmaws": 0,
                },
                "exampleSeeds": [8, 16, 18, 20, 28],
            }
        ],
    }
    sample_payload = {
        "best": sample_best,
        "topResults": [sample_best],
        "knownCandidateResults": [
            {
                "label": CONFIG["knownCandidates"][0]["label"],
                "note": CONFIG["knownCandidates"][0]["note"],
                "rank": 1,
                "result": sample_best,
            }
        ],
    }
    text = build_text_report(sample_payload, total_combos=123456, elapsed_seconds=12.3)
    html = build_live_html(active_workers=1, total_workers=16, elapsed=12.3, global_incumbent=868.0, entries=[sample_best])
    smoke_txt_path = output_path("smoke_test.txt")
    smoke_html_path = output_path("smoke_test.html")
    with open(smoke_txt_path, "w", encoding="utf-8") as file:
        file.write(text)
    with open(smoke_html_path, "w", encoding="utf-8") as file:
        file.write(html)
    print("SMOKE TEST OK")
    print(f"TXT : {smoke_txt_path}")
    print(f"HTML: {smoke_html_path}")


if os.environ.get("BT_SMOKE_TEST") == "1":
    run_smoke_test()
    raise SystemExit(0)


print("Hazirlaniyor...")

try:
    sh("command -v node >/dev/null 2>&1")
except Exception:
    print("Node bulunamadi, kuruluyor...")
    sh("apt-get update -qq && apt-get install -y nodejs -qq")

if not os.path.exists("battle-core.js"):
    urllib.request.urlretrieve(BATTLE_CORE_URL, "battle-core.js")

with open("worker.js", "w", encoding="utf-8") as file:
    file.write(WORKER_JS)
with open("master.js", "w", encoding="utf-8") as file:
    file.write(MASTER_JS)
with open("config.json", "w", encoding="utf-8") as file:
    json.dump(CONFIG, file, ensure_ascii=False, indent=2)

available_cpu_count = os.cpu_count() or 2
requested_worker_count = CONFIG.get("workers")
worker_count = min(requested_worker_count, available_cpu_count) if requested_worker_count else available_cpu_count
partitions = split_partitions(CONFIG["allyPool"], CONFIG["pointLimit"], CONFIG["partitionAxis"], worker_count)
total_combinations = count_combinations_for_partition(
    CONFIG["allyPool"],
    CONFIG["pointLimit"],
    CONFIG["partitionAxis"],
    0,
    CONFIG["allyPool"][CONFIG["partitionAxis"]],
)

print(f"CPU cores           : {available_cpu_count}")
print(f"Workers             : {worker_count}")
print(f"Partition axis      : {CONFIG['partitionAxis']}")
print(f"Total combinations  : {fmt_int(total_combinations)}")
print(f"Partitions          : {len(partitions)}")
for partition in partitions:
    partition_total = count_combinations_for_partition(
        CONFIG["allyPool"],
        CONFIG["pointLimit"],
        CONFIG["partitionAxis"],
        partition["start"],
        partition["end"],
    )
    print(
        f"  worker {partition['id']:2d}: {CONFIG['partitionAxis']} "
        f"[{partition['start']}..{partition['end']}] -> {fmt_int(partition_total)}"
    )

processes = []
for partition in partitions:
    partition_file = f"partition_{partition['id']}.json"
    with open(partition_file, "w", encoding="utf-8") as file:
        json.dump(partition, file)
    proc = subprocess.Popen(
        ["node", "--max-old-space-size=4096", "worker.js", "config.json", partition_file],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    processes.append({
        "partition": partition,
        "proc": proc,
        "checked": 0,
        "incumbent": None,
        "shortlist": None,
        "live_top": [],
        "done": False,
    })

progress_bar = tqdm(total=total_combinations, desc="Tum uzay taraniyor", unit="aday", smoothing=0.05)
status_display = display(HTML("<pre>Worker'lar baslatildi</pre>"), display_id=True)
start_time = time.time()
last_status_update = 0.0
last_snapshot_write = 0.0
live_snapshot_path = output_path("live_snapshot.json")
best_verified_live = None


def read_available_lines(proc):
    lines = []
    try:
        if sys.platform != "win32":
            while True:
                ready, _, _ = select.select([proc.stdout], [], [], 0)
                if not ready:
                    break
                line = proc.stdout.readline()
                if not line:
                    break
                lines.append(line)
        else:
            line = proc.stdout.readline()
            if line:
                lines.append(line)
    except Exception:
        pass
    return lines


while any(not worker["done"] for worker in processes):
    for worker in processes:
        if worker["done"]:
            continue

        for line in read_available_lines(worker["proc"]):
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except Exception:
                continue
            message_type = payload.get("type")
            if message_type == "progress":
                delta = payload["checked"] - worker["checked"]
                worker["checked"] = payload["checked"]
                worker["incumbent"] = payload.get("incumbent")
                worker["live_top"] = payload.get("topCandidates") or worker["live_top"]
                progress_bar.update(delta)
            elif message_type == "done":
                delta = payload["checked"] - worker["checked"]
                worker["checked"] = payload["checked"]
                worker["shortlist"] = payload.get("shortlist") or []
                worker["live_top"] = payload.get("shortlist") or worker["live_top"]
                worker["done"] = True
                progress_bar.update(delta)

        if worker["proc"].poll() is not None and not worker["done"]:
            stdout_data, stderr_data = worker["proc"].communicate()
            for line in (stdout_data or "").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except Exception:
                    continue
                if payload.get("type") == "done":
                    delta = payload["checked"] - worker["checked"]
                    worker["checked"] = payload["checked"]
                    worker["shortlist"] = payload.get("shortlist") or []
                    worker["live_top"] = payload.get("shortlist") or worker["live_top"]
                    worker["done"] = True
                    progress_bar.update(delta)
            if not worker["done"] and stderr_data:
                raise RuntimeError(
                    f"Worker {worker['partition']['id']} failed without done payload.\n{stderr_data}"
                )

    now = time.time()
    if now - last_status_update >= 2:
        last_status_update = now
        elapsed = now - start_time
        incumbents = [worker["incumbent"] for worker in processes if worker["incumbent"] is not None]
        global_incumbent = min(incumbents) if incumbents else None
        merged_live = {}
        for worker in processes:
            for entry in worker.get("live_top") or []:
                signature = entry.get("signature")
                if not signature:
                    continue
                existing = merged_live.get(signature)
                if existing is None or live_compare_key(entry) < live_compare_key(existing):
                    merged_live[signature] = entry
        current_live_entries = sorted(merged_live.values(), key=live_compare_key)
        if current_live_entries:
            current_best_live = current_live_entries[0]
            if best_verified_live is None or live_compare_key(current_best_live) < live_compare_key(best_verified_live):
                best_verified_live = current_best_live
        live_entries = [best_verified_live] if best_verified_live else []
        active_workers = sum(1 for worker in processes if not worker["done"])
        status_display.update(HTML(build_live_html(active_workers, len(processes), elapsed, global_incumbent, live_entries)))

        if now - last_snapshot_write >= CONFIG.get("snapshotEverySeconds", 15):
            last_snapshot_write = now
            snapshot_payload = {
                "updatedAtUnix": now,
                "elapsedSeconds": elapsed,
                "activeWorkers": active_workers,
                "globalIncumbent": global_incumbent,
                "entries": live_entries,
            }
            with open(live_snapshot_path, "w", encoding="utf-8") as file:
                json.dump(snapshot_payload, file, ensure_ascii=False, indent=2)

    if not any(not worker["done"] for worker in processes):
        break
    time.sleep(0.1)

progress_bar.close()
elapsed_seconds = time.time() - start_time
print(f"\nTum worker'lar tamamlandi. Sure: {fmt_elapsed(elapsed_seconds)}")

merged_shortlist = []
for worker in processes:
    if worker["shortlist"]:
        merged_shortlist.extend(worker["shortlist"])
print(f"Birlesik shortlist boyutu: {len(merged_shortlist)}")

with open("merged_shortlist.json", "w", encoding="utf-8") as file:
    json.dump(merged_shortlist, file, ensure_ascii=False)

print(
    f"Master final dogrulama: top {CONFIG['stage3TopK']} aday, "
    f"{CONFIG['stage3Trials']} trial, hedef cikti top {CONFIG['topResultCount']}"
)
master_result = subprocess.run(
    ["node", "master.js", "config.json", "merged_shortlist.json"],
    check=True,
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
final_payload = json.loads(master_result.stdout)

results_payload = {
    "config": CONFIG,
    "totalCombinations": total_combinations,
    "elapsedSeconds": elapsed_seconds,
    "generatedAtUnix": time.time(),
    "final": final_payload,
}

json_output_path = output_path("results.json")
txt_output_path = output_path("results.txt")

with open(json_output_path, "w", encoding="utf-8") as file:
    json.dump(results_payload, file, ensure_ascii=False, indent=2)

with open(txt_output_path, "w", encoding="utf-8") as file:
    file.write(build_text_report(final_payload, total_combinations, elapsed_seconds))

best = final_payload.get("best") or {}
print("\n" + "=" * 72)
print("EXHAUSTIVE SEARCH TAMAMLANDI")
print("=" * 72)
print(f"Toplam kombinasyon : {fmt_int(total_combinations)}")
print(f"Toplam sure        : {fmt_elapsed(elapsed_seconds)}")
print(f"En iyi dizilis     : {unit_counts_to_text(best.get('counts') or {})}")
print(f"Win rate           : {fmt_pct(best.get('winRate'))}")
print(f"Beklenen kayip     : {fmt_num(displayed_loss(best), 1)}")
print(f"Beklenen kayip birim: {fmt_num(displayed_loss_units(best), 2)}")
print(f"Kullanilan puan    : {fmt_num(best.get('avgUsedPoints'), 1)} / {CONFIG['pointLimit']}")
print(f"Kullanilan birlik  : {fmt_num(displayed_used_units(best), 1)}")
print(f"Kullanilan kapasite: {fmt_num(displayed_used_capacity(best), 1)}")
print(f"JSON cikti         : {json_output_path}")
print(f"TXT cikti          : {txt_output_path}")
print(f"Canli snapshot     : {live_snapshot_path}")

known_results = final_payload.get("knownCandidateResults") or []
if known_results:
    print("\nReferans adaylar:")
    for item in known_results:
        result = item.get("result") or {}
        print(
            f"  - {item.get('label')}: rank={item.get('rank')}  "
            f"win={fmt_pct(result.get('winRate'))}  "
            f"loss={fmt_num(displayed_loss(result), 1)}  "
            f"counts={unit_counts_to_text(result.get('counts') or {})}"
        )

print("\nIlk 10 sonuc:")
for index, entry in enumerate((final_payload.get("topResults") or [])[:10], start=1):
    print(
        f"{index:2}. win={fmt_pct(entry.get('winRate')):>8}  "
        f"loss={fmt_num(displayed_loss(entry), 1):>7}  "
        f"pts={fmt_num(entry.get('avgUsedPoints'), 1):>6}  "
        f"{unit_counts_to_text(entry.get('counts') or {})}"
    )
