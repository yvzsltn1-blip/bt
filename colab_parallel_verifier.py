# Colab tek hucre kodu - PARALEL TAM TARAMA VERIFIER.
# Bu dosya mevcut savas icin tum aday ordulari exhaustively enumerate eder.
# Pro Colab icin optimize edildi:
#  1) Multi-process: kombinasyon uzayi worker'lara bolunur.
#  2) Adaptif stage 1: kotu adaylar tek/iki trial'da elenir.
#  3) Worker ici stage 2 + master stage 3 ile top adaylar daha derin dogrulanir.
# Final cikti:
#  - En iyi 10 aday
#  - Her aday icin win rate / puan / kayip
#  - Hangi birlikten ortalama kac adet oldugu

import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from html import escape
from IPython.display import display, HTML
from tqdm.auto import tqdm

BATTLE_CORE_URL = "https://bt-analiz.web.app/battle-core.js"

CONFIG = {
    "stage": 55,
    "pointLimit": 560,
    "objective": "min_loss",
    "stoneMode": False,
    "minWinRate": 0.75,
    "baseSeed": 42042,

    # Adaptif trial sinirleri
    "stage1MaxTrials": 2,    # gercekte 1 yada 2 (adaptif); 2 = guvenli ust sinir
    "stage2Trials": 40,      # worker-ici dogrulama
    "stage3Trials": 100,     # master final dogrulama
    "stage3TopK": 100,       # master sadece top-100'u final dogrular
    "topOutcomeCount": 10,   # her top ordu icin yazdirilacak tekil outcome sayisi
    "liveOutcomeTrials": 20,  # canli tabloda ilk aday icin hizli outcome taramasi
    "liveOutcomeCandidates": 1,  # canlida outcome zenginlestirilecek aday sayisi

    # Worker basina shortlist boyutu
    "shortlistPerWorker": 1200,
    "workerStage2TopK": 120,  # her worker stage1'den stage2'ye aday tasir

    # Paralelizm
    "workers": None,  # None = os.cpu_count() (Colab Pro cekirdeklerini kullanir)
    "partitionAxis": "bats",

    # Erken durdurma
    "stopOnTargetAfterStage3": False,
    "targetLoss": 0,

    "enemy": {
        "skeletons": 24,
        "zombies": 25,
        "cultists": 21,
        "bonewings": 11,
        "corpses": 7,
        "wraiths": 7,
        "revenants": 13,
        "giants": 5,
        "broodmothers": 0,
        "liches": 0
    },
    "allyPool": {
        "bats": 50,
        "ghouls": 50,
        "thralls": 60,
        "banshees": 70,
        "necromancers": 12,
        "gargoyles": 12,
        "witches": 0,
        "rotmaws": 0
    },
    "topResultCount": 10
}

# ---------------------------------------------------------------------------
# WORKER JS - tek partition icin enumerate + adaptif trial + worker-ici stage 2
# ---------------------------------------------------------------------------
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
const partition = JSON.parse(process.argv[3]);

const pointLimit = Number.isFinite(config.pointLimit) ? config.pointLimit : getStagePointLimit(config.stage);
const objective = config.objective === "min_army" ? "min_army" : "min_loss";
const stoneMode = Boolean(config.stoneMode);
const minWinRate = Number.isFinite(config.minWinRate) ? config.minWinRate : 0.75;
const stage1MaxTrials = Math.max(1, Math.floor(config.stage1MaxTrials || 2));
const stage2Trials = Math.max(stage1MaxTrials, Math.floor(config.stage2Trials || 30));
const baseSeed = Math.floor(config.baseSeed || 42042);
const shortlistSize = Math.max(1, Math.floor(config.shortlistPerWorker || 800));
const stage2TopK = Math.max(1, Math.floor(config.workerStage2TopK || 80));
const topOutcomeCount = Math.max(1, Math.floor(config.topOutcomeCount || 10));
const liveOutcomeTrials = Math.max(stage1MaxTrials, Math.floor(config.liveOutcomeTrials || 20));
const liveOutcomeCandidates = Math.max(0, Math.floor(config.liveOutcomeCandidates || 1));

const activeUnits = ALLY_UNITS.filter((unit) => (config.allyPool?.[unit.key] || 0) > 0);
const partitionUnit = activeUnits.find((unit) => unit.key === partition.axis) || activeUnits[0];
const otherUnits = activeUnits.filter((unit) => unit.key !== partitionUnit.key);

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function cloneCounts(counts) {
  return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, counts[unit.key] || 0]));
}

let localIncumbent = Number.POSITIVE_INFINITY;

function buildOutcomeSummaryEntry(key, bucket, totalTrials) {
  const probability = totalTrials > 0 ? bucket.count / totalTrials : 0;
  const lossBlood = bucket.lossBloodTotal / Math.max(1, bucket.count);
  const stoneLossBlood = bucket.stoneLossBloodTotal / Math.max(1, bucket.count);
  return {
    key,
    winner: bucket.winner,
    count: bucket.count,
    probability,
    avgLossBlood: lossBlood,
    avgStoneLossBlood: stoneLossBlood,
    lossesByKey: bucket.lossesByKey,
    permanentLossesByKey: bucket.permanentLossesByKey,
    exampleSeeds: bucket.exampleSeeds
  };
}

// Adaptif degerlendirme: trial 1 kaybederse veya kayip >> incumbent ise dur
function evaluateAdaptive(counts) {
  const signature = getSignature(counts);
  let wins = 0;
  let rawLossSum = 0;
  let rawUnitsSum = 0;
  let permLossSum = 0;
  let permUnitsSum = 0;
  let stoneSum = 0;
  let usedPtsSum = 0;
  let usedCapSum = 0;
  let enemyHpSum = 0;
  let enemyUnitsSum = 0;
  let trialsRun = 0;
  const avgAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgPermanentAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));

  for (let trial = 0; trial < stage1MaxTrials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    trialsRun += 1;
    usedPtsSum += result.usedPoints;
    usedCapSum += result.usedCapacity;
    enemyHpSum += result.enemyRemainingHealth;
    enemyUnitsSum += result.enemyRemainingUnits;

    if (result.winner === "ally") {
      wins += 1;
      rawLossSum += result.lostBloodTotal;
      rawUnitsSum += result.lostUnitsTotal;
      const sp = getStoneAdjustedLossProfile(result.allyLosses || {});
      permLossSum += sp.permanentLostBlood;
      permUnitsSum += sp.permanentLostUnits;
      stoneSum += sp.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        avgAllyLosses[unit.key] += (result.allyLosses?.[unit.key] || 0);
        avgPermanentAllyLosses[unit.key] += (sp.permanentLossesByKey?.[unit.key] || 0);
      });
    }

    // Adaptif erken sonlandirma sadece trial 0'dan sonra
    if (trial === 0) {
      // Kaybetti -> minWinRate=0.75 icin diger trial'lar tek basina kurtaramaz; cok
      // muhtemelen feasible degil. Yine de trial 2'yi atlayip sonuc dondur.
      if (result.winner !== "ally") {
        break;
      }
      // Kazandi ama kayip yerel incumbent'i asla yenemez -> trial 2'yi atla
      const lossEstimate = stoneMode
        ? getStoneAdjustedLossProfile(result.allyLosses || {}).permanentLostBlood
        : result.lostBloodTotal;
      if (Number.isFinite(localIncumbent) && lossEstimate > localIncumbent * 1.5) {
        break;
      }
    }
  }

  const winRate = wins / trialsRun;
  const feasible = winRate >= minWinRate && trialsRun >= stage1MaxTrials;
  const avgRaw = wins > 0 ? rawLossSum / wins : Number.POSITIVE_INFINITY;
  const avgPerm = wins > 0 ? permLossSum / wins : Number.POSITIVE_INFINITY;
  const displayed = stoneMode ? avgPerm : avgRaw;

  if (feasible && Number.isFinite(displayed) && displayed < localIncumbent) {
    localIncumbent = displayed;
  }

  return {
    counts: cloneCounts(counts),
    signature,
    trials: trialsRun,
    feasible,
    wins,
    winRate,
    avgUsedPoints: usedPtsSum / trialsRun,
    avgUsedCapacity: usedCapSum / trialsRun,
    avgEnemyRemainingHealth: enemyHpSum / trialsRun,
    avgEnemyRemainingUnits: enemyUnitsSum / trialsRun,
    avgRawLostBlood: avgRaw,
    avgRawLostUnits: wins > 0 ? rawUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgPermanentLostBlood: avgPerm,
    avgPermanentLostUnits: wins > 0 ? permUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgStoneCount: wins > 0 ? stoneSum / wins : 0,
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgAllyLosses[unit.key] / wins : 0
    ])),
    avgPermanentAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgPermanentAllyLosses[unit.key] / wins : 0
    ])),
    displayedLoss: displayed
  };
}

// Tam degerlendirme (stage 2 ve sonrasi) - tum trial'lari kosar, erken cikis yok
function evaluateFull(counts, trials, includeOutcomes = false) {
  const signature = getSignature(counts);
  let wins = 0;
  let rawLossSum = 0;
  let rawUnitsSum = 0;
  let permLossSum = 0;
  let permUnitsSum = 0;
  let stoneSum = 0;
  let usedPtsSum = 0;
  let usedCapSum = 0;
  let enemyHpSum = 0;
  let enemyUnitsSum = 0;
  const avgAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgPermanentAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const outcomeBuckets = includeOutcomes ? new Map() : null;

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    usedPtsSum += result.usedPoints;
    usedCapSum += result.usedCapacity;
    enemyHpSum += result.enemyRemainingHealth;
    enemyUnitsSum += result.enemyRemainingUnits;
    const sp = getStoneAdjustedLossProfile(result.allyLosses || {});
    if (includeOutcomes) {
      const rawLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(result.allyLosses?.[unit.key]) || 0)]));
      const permLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(sp.permanentLossesByKey?.[unit.key]) || 0)]));
      const outcomeKey = [
        result.winner,
        ...ALLY_UNITS.map((unit) => rawLosses[unit.key] || 0)
      ].join("|");
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
      existing.stoneLossBloodTotal += sp.permanentLostBlood || 0;
      if (existing.exampleSeeds.length < 5) {
        existing.exampleSeeds.push(seed);
      }
      outcomeBuckets.set(outcomeKey, existing);
    }

    if (result.winner === "ally") {
      wins += 1;
      rawLossSum += result.lostBloodTotal;
      rawUnitsSum += result.lostUnitsTotal;
      permLossSum += sp.permanentLostBlood;
      permUnitsSum += sp.permanentLostUnits;
      stoneSum += sp.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        avgAllyLosses[unit.key] += (result.allyLosses?.[unit.key] || 0);
        avgPermanentAllyLosses[unit.key] += (sp.permanentLossesByKey?.[unit.key] || 0);
      });
    }
  }

  const winRate = wins / trials;
  const feasible = winRate >= minWinRate;
  const avgRaw = wins > 0 ? rawLossSum / wins : Number.POSITIVE_INFINITY;
  const avgPerm = wins > 0 ? permLossSum / wins : Number.POSITIVE_INFINITY;
  const displayed = stoneMode ? avgPerm : avgRaw;
  const topOutcomes = includeOutcomes
    ? [...outcomeBuckets.entries()]
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
    : undefined;

  return {
    counts: cloneCounts(counts),
    signature,
    trials,
    feasible,
    wins,
    winRate,
    avgUsedPoints: usedPtsSum / trials,
    avgUsedCapacity: usedCapSum / trials,
    avgEnemyRemainingHealth: enemyHpSum / trials,
    avgEnemyRemainingUnits: enemyUnitsSum / trials,
    avgRawLostBlood: avgRaw,
    avgRawLostUnits: wins > 0 ? rawUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgPermanentLostBlood: avgPerm,
    avgPermanentLostUnits: wins > 0 ? permUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgStoneCount: wins > 0 ? stoneSum / wins : 0,
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgAllyLosses[unit.key] / wins : 0
    ])),
    avgPermanentAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgPermanentAllyLosses[unit.key] / wins : 0
    ])),
    displayedLoss: displayed,
    topOutcomes
  };
}

function comparePrimary(a, b) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (a.feasible) {
    if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    if (objective === "min_army") {
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
      if (a.displayedLoss !== b.displayedLoss) return a.displayedLoss - b.displayedLoss;
    } else {
      if (a.displayedLoss !== b.displayedLoss) return a.displayedLoss - b.displayedLoss;
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
    }
    return a.signature.localeCompare(b.signature);
  }
  if (a.winRate !== b.winRate) return b.winRate - a.winRate;
  if (a.avgEnemyRemainingHealth !== b.avgEnemyRemainingHealth) return a.avgEnemyRemainingHealth - b.avgEnemyRemainingHealth;
  return a.signature.localeCompare(b.signature);
}

// Topk shortlist (heap olmadan basit array sort)
class TopKShortlist {
  constructor(limit) {
    this.limit = limit;
    this.items = [];
    this.worst = null;
  }
  add(entry) {
    if (this.items.length < this.limit) {
      this.items.push(entry);
      if (this.items.length === this.limit) this._prune();
      return;
    }
    if (this.worst && comparePrimary(entry, this.worst) >= 0) return;
    this.items.push(entry);
    if (this.items.length >= this.limit * 4) this._prune();
  }
  _prune() {
    const seen = new Map();
    for (const x of this.items) {
      const ex = seen.get(x.signature);
      if (!ex || comparePrimary(x, ex) < 0) seen.set(x.signature, x);
    }
    this.items = [...seen.values()].sort(comparePrimary).slice(0, this.limit);
    this.worst = this.items.length ? this.items[this.items.length - 1] : null;
  }
  finalize() {
    this._prune();
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

function buildSnapshot(limit = 10) {
  const entries = shortlist.finalize().slice(0, limit);
  if (liveOutcomeCandidates <= 0 || liveOutcomeTrials <= 0) {
    return entries;
  }
  return entries.map((entry, index) => {
    if (index >= liveOutcomeCandidates) return entry;
    return evaluateFull(entry.counts, liveOutcomeTrials, true);
  });
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function enumerate(index, remainingPoints) {
  if (index >= otherUnits.length) {
    checked += 1;
    const evaluation = evaluateAdaptive(partial);
    shortlist.add(evaluation);
    if (Date.now() - lastReport > 2000) {
      lastReport = Date.now();
      emit({
        type: "progress",
        worker: partition.id,
        checked,
        elapsedMs: Date.now() - startTime,
        incumbent: Number.isFinite(localIncumbent) ? localIncumbent : null,
        topCandidates: buildSnapshot(10)
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

// Worker-ici Stage 2: shortlist'in en iyi K adayini stage2Trials ile dogrula
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

# ---------------------------------------------------------------------------
# Yardimcilar
# ---------------------------------------------------------------------------
def sh(cmd):
    return subprocess.run(cmd, shell=True, check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def fmt_int(value):
    try:
        return f"{int(value):,}".replace(",", ".")
    except Exception:
        return str(value)


def fmt_elapsed(seconds):
    if not math.isfinite(seconds):
        return "--:--:--"
    seconds = max(0, int(seconds))
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def live_compare_key(entry):
    objective = CONFIG.get("objective", "min_loss")
    feasible_rank = 0 if entry.get("feasible") else 1
    win_rank = -(entry.get("winRate") or 0)
    loss_rank = safe_metric(entry.get("displayedLoss"))
    points_rank = safe_metric(entry.get("avgUsedPoints"))
    enemy_hp_rank = safe_metric(entry.get("avgEnemyRemainingHealth"))
    sig = entry.get("signature", "")
    if objective == "min_army":
        return (feasible_rank, win_rank, points_rank, loss_rank, enemy_hp_rank, sig)
    return (feasible_rank, win_rank, loss_rank, points_rank, enemy_hp_rank, sig)


def safe_metric(value, default=float("inf")):
    if value is None:
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(numeric):
        return default
    return numeric


def format_metric_cell(value, digits=1, default="inf"):
    numeric = safe_metric(value, default=None)
    if numeric is None:
        return default
    return f"{numeric:.{digits}f}"


def format_live_counts(entry):
    counts = entry.get("counts") or {}
    order = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"]
    labels = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]
    parts = []
    for unit_key, label in zip(order, labels):
        value = counts.get(unit_key, 0)
        if value > 0:
            parts.append(f"{label}:{value}")
    return ", ".join(parts) if parts else "-"


def format_live_losses(entry):
    losses = entry.get("avgAllyLosses") or {}
    order = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"]
    labels = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]
    parts = []
    for unit_key, label in zip(order, labels):
        value = losses.get(unit_key, 0)
        if value and value > 0:
            parts.append(f"{label}:{value:.2f}")
    return ", ".join(parts) if parts else "yok"


def format_outcome_losses(losses_by_key):
    order = ["bats", "ghouls", "thralls", "banshees", "necromancers", "gargoyles", "witches", "rotmaws"]
    labels = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]
    parts = []
    for unit_key, label in zip(order, labels):
        value = (losses_by_key or {}).get(unit_key, 0)
        if value and value > 0:
            parts.append(f"{label}:{value}")
    return ", ".join(parts) if parts else "kayip yok"


def print_outcome_block(outcomes, stone_mode=False, indent="      "):
    if not outcomes:
        print(f"{indent}tekil outcome yok")
        return
    for idx, outcome in enumerate(outcomes, start=1):
        winner_label = "zafer" if outcome.get("winner") == "ally" else "maglubiyet"
        probability = (outcome.get("probability") or 0) * 100
        loss_value = outcome.get("avgStoneLossBlood") if stone_mode else outcome.get("avgLossBlood")
        loss_value = safe_metric(loss_value, default=0.0)
        losses = outcome.get("permanentLossesByKey") if stone_mode else outcome.get("lossesByKey")
        print(
            f"{indent}{idx:2}. {winner_label:<10} olasilik=%{probability:5.2f}  "
            f"kan={loss_value:6.1f}  {format_outcome_losses(losses)}"
        )
        seeds = outcome.get("exampleSeeds") or []
        if seeds:
            print(f"{indent}    ornek seedler -> {', '.join(str(seed) for seed in seeds)}")


def build_live_outcome_html(entry):
    if not entry:
        return ""
    outcomes = entry.get("topOutcomes") or []
    if not outcomes:
        return ""
    lines = []
    lines.append("<div style='margin-top:12px;font-family:monospace;font-size:12px;'>")
    lines.append("<div><strong>Canli 1. aday detay</strong></div>")
    lines.append(
        f"<div>1. kayip={format_metric_cell(entry.get('displayedLoss'), 1, '-')}  "
        f"win=%{(entry.get('winRate', 0) * 100):.0f}  "
        f"pts={format_metric_cell(entry.get('avgUsedPoints'), 1, '-')}  "
        f"{escape(format_live_counts(entry))}</div>"
    )
    lines.append(f"<div>&nbsp;&nbsp;&nbsp;&nbsp;ort. kayiplar -&gt; {escape(format_live_losses(entry))}</div>")
    lines.append("<div>&nbsp;&nbsp;&nbsp;&nbsp;tekil outcome'lar -&gt;</div>")
    for idx, outcome in enumerate(outcomes, start=1):
        winner_label = "zafer" if outcome.get("winner") == "ally" else "maglubiyet"
        probability = (outcome.get("probability") or 0) * 100
        loss_value = safe_metric(outcome.get("avgLossBlood"), default=0.0)
        lines.append(
            f"<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{idx:2}. {winner_label:<10} "
            f"olasilik=%{probability:5.2f}  kan={loss_value:6.1f}  "
            f"{escape(format_outcome_losses(outcome.get('lossesByKey')))}</div>"
        )
        seeds = outcome.get("exampleSeeds") or []
        if seeds:
            lines.append(
                f"<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ornek seedler -&gt; "
                f"{escape(', '.join(str(seed) for seed in seeds))}</div>"
            )
    lines.append("</div>")
    return "".join(lines)


def build_live_top_html(active, total_workers, elapsed, global_incumbent, entries):
    rows = []
    for idx, entry in enumerate(entries[:10], start=1):
        rows.append(
            "<tr>"
            f"<td>{idx}</td>"
            f"<td>{'evet' if entry.get('feasible') else 'hayir'}</td>"
            f"<td>%{(entry.get('winRate', 0) * 100):.0f}</td>"
            f"<td>{format_metric_cell(entry.get('displayedLoss'), 1, '-')}</td>"
            f"<td>{format_metric_cell(entry.get('avgUsedPoints'), 1, '-')}</td>"
            f"<td>{escape(format_live_counts(entry))}</td>"
            f"<td>{escape(format_live_losses(entry))}</td>"
            "</tr>"
        )
    if not rows:
        rows.append('<tr><td colspan="7">Henuz canli top sonuc yok.</td></tr>')

    summary = (
        f"sure {fmt_elapsed(elapsed)} | aktif worker {active}/{total_workers} | "
        f"en iyi yerel kayip {global_incumbent if global_incumbent is not None else '-'}"
    )
    detail_html = build_live_outcome_html(entries[0] if entries else None)
    return f"""
    <div>
      <pre>{escape(summary)}</pre>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:monospace;font-size:12px;">
        <thead>
          <tr>
            <th>#</th><th>Feasible</th><th>Win</th><th>Kayip</th><th>Puan</th><th>Dizilis</th><th>Ort. kayiplar</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows)}
        </tbody>
      </table>
      {detail_html}
    </div>
    """


def has_live_outcomes(entry):
    return bool((entry or {}).get("topOutcomes"))


def count_combinations_for_partition(allyPool, pointLimit, axis, axis_start, axis_end):
    """Verilen partition icindeki kombinasyon sayisini hesaplar."""
    POINT_COSTS = {"bats": 2, "ghouls": 3, "thralls": 4, "banshees": 7,
                   "necromancers": 10, "gargoyles": 15, "witches": 18, "rotmaws": 30}
    active = [(k, v) for k, v in allyPool.items() if v > 0]
    others = [(k, v) for k, v in active if k != axis]
    axis_cost = POINT_COSTS[axis]

    total = 0
    for axis_count in range(axis_start, axis_end + 1):
        used = axis_count * axis_cost
        if used > pointLimit:
            break
        remaining = pointLimit - used
        # DP: kac kombinasyon kalan icin
        dp = [0] * (remaining + 1)
        dp[0] = 1
        for k, mx in others:
            cost = POINT_COSTS[k]
            nxt = [0] * (remaining + 1)
            for p in range(remaining + 1):
                if dp[p] == 0:
                    continue
                mt = min(mx, (remaining - p) // cost)
                for c in range(mt + 1):
                    nxt[p + c * cost] += dp[p]
            dp = nxt
        total += sum(dp)
    return total


def split_partitions(allyPool, pointLimit, axis, n_workers):
    """N worker icin yaklasik dengeli partition listesi."""
    axis_max = allyPool[axis]
    total = count_combinations_for_partition(allyPool, pointLimit, axis, 0, axis_max)
    target_per_worker = total / n_workers

    # Tum axis_count icin combinasyonlari kumulatif say, esit boyutta dilimle
    POINT_COSTS = {"bats": 2, "ghouls": 3, "thralls": 4, "banshees": 7,
                   "necromancers": 10, "gargoyles": 15, "witches": 18, "rotmaws": 30}
    others = [(k, v) for k, v in allyPool.items() if v > 0 and k != axis]
    axis_cost = POINT_COSTS[axis]

    cum_per_axis_count = []
    cum_total = 0
    for axis_count in range(axis_max + 1):
        used = axis_count * axis_cost
        if used > pointLimit:
            cum_per_axis_count.append(cum_total)
            continue
        remaining = pointLimit - used
        dp = [0] * (remaining + 1)
        dp[0] = 1
        for k, mx in others:
            cost = POINT_COSTS[k]
            nxt = [0] * (remaining + 1)
            for p in range(remaining + 1):
                if dp[p] == 0:
                    continue
                mt = min(mx, (remaining - p) // cost)
                for c in range(mt + 1):
                    nxt[p + c * cost] += dp[p]
            dp = nxt
        cum_total += sum(dp)
        cum_per_axis_count.append(cum_total)

    partitions = []
    last_end = -1
    for i in range(n_workers):
        target = target_per_worker * (i + 1)
        # cum_per_axis_count icinde target'i ilk asan index
        idx = last_end + 1
        while idx < len(cum_per_axis_count) and cum_per_axis_count[idx] < target:
            idx += 1
        end = min(idx, axis_max)
        if i == n_workers - 1:
            end = axis_max
        partitions.append({"id": i, "axis": axis, "start": last_end + 1, "end": end})
        last_end = end
    return [p for p in partitions if p["start"] <= p["end"]]


# ---------------------------------------------------------------------------
# Master JS - tum worker shortlist'lerini birlestirip stage 3 dogrulamasi yapar
# ---------------------------------------------------------------------------
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
const trials = Math.max(1, Math.floor(config.stage3Trials || 60));
const baseSeed = Math.floor(config.baseSeed || 42042);
const topK = Math.max(1, Math.floor(config.stage3TopK || 50));
const topResultCount = Math.max(1, Math.floor(config.topResultCount || 10));
const topOutcomeCount = Math.max(1, Math.floor(config.topOutcomeCount || 10));

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function getCountsLossString(lossesByKey) {
  return ALLY_UNITS
    .map((unit, index) => {
      const val = Math.max(0, Number(lossesByKey?.[unit.key]) || 0);
      return val > 0 ? `T${index + 1}:${val}` : null;
    })
    .filter(Boolean)
    .join(", ");
}

function buildOutcomeSummaryEntry(key, bucket, totalTrials) {
  const probability = totalTrials > 0 ? bucket.count / totalTrials : 0;
  const lossBlood = bucket.lossBloodTotal / Math.max(1, bucket.count);
  const stoneLossBlood = bucket.stoneLossBloodTotal / Math.max(1, bucket.count);
  return {
    key,
    winner: bucket.winner,
    count: bucket.count,
    probability,
    avgLossBlood: lossBlood,
    avgStoneLossBlood: stoneLossBlood,
    lossesByKey: bucket.lossesByKey,
    permanentLossesByKey: bucket.permanentLossesByKey,
    exampleSeeds: bucket.exampleSeeds
  };
}

function evaluateFull(counts) {
  const signature = getSignature(counts);
  let wins = 0;
  let rawLossSum = 0, rawUnitsSum = 0;
  let permLossSum = 0, permUnitsSum = 0, stoneSum = 0;
  let usedPtsSum = 0, usedCapSum = 0;
  let enemyHpSum = 0, enemyUnitsSum = 0;
  const avgAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const avgPermanentAllyLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
  const outcomeBuckets = new Map();
  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const r = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    usedPtsSum += r.usedPoints;
    usedCapSum += r.usedCapacity;
    enemyHpSum += r.enemyRemainingHealth;
    enemyUnitsSum += r.enemyRemainingUnits;
    const sp = getStoneAdjustedLossProfile(r.allyLosses || {});
    const rawLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(r.allyLosses?.[unit.key]) || 0)]));
    const permLosses = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, Math.max(0, Number(sp.permanentLossesByKey?.[unit.key]) || 0)]));
    const outcomeKey = [
      r.winner,
      ...ALLY_UNITS.map((unit) => rawLosses[unit.key] || 0)
    ].join("|");
    const existing = outcomeBuckets.get(outcomeKey) || {
      winner: r.winner,
      count: 0,
      lossBloodTotal: 0,
      stoneLossBloodTotal: 0,
      lossesByKey: rawLosses,
      permanentLossesByKey: permLosses,
      exampleSeeds: []
    };
    existing.count += 1;
    existing.lossBloodTotal += r.lostBloodTotal || 0;
    existing.stoneLossBloodTotal += sp.permanentLostBlood || 0;
    if (existing.exampleSeeds.length < 5) {
      existing.exampleSeeds.push(seed);
    }
    outcomeBuckets.set(outcomeKey, existing);
    if (r.winner === "ally") {
      wins += 1;
      rawLossSum += r.lostBloodTotal;
      rawUnitsSum += r.lostUnitsTotal;
      permLossSum += sp.permanentLostBlood;
      permUnitsSum += sp.permanentLostUnits;
      stoneSum += sp.stoneCount;
      ALLY_UNITS.forEach((unit) => {
        avgAllyLosses[unit.key] += (r.allyLosses?.[unit.key] || 0);
        avgPermanentAllyLosses[unit.key] += (sp.permanentLossesByKey?.[unit.key] || 0);
      });
    }
  }
  const winRate = wins / trials;
  const avgRaw = wins > 0 ? rawLossSum / wins : Number.POSITIVE_INFINITY;
  const avgPerm = wins > 0 ? permLossSum / wins : Number.POSITIVE_INFINITY;
  const displayed = stoneMode ? avgPerm : avgRaw;
  const topOutcomes = [...outcomeBuckets.entries()]
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
  return {
    counts, signature, trials,
    feasible: winRate >= minWinRate,
    wins, winRate,
    avgUsedPoints: usedPtsSum / trials,
    avgUsedCapacity: usedCapSum / trials,
    avgEnemyRemainingHealth: enemyHpSum / trials,
    avgEnemyRemainingUnits: enemyUnitsSum / trials,
    avgRawLostBlood: avgRaw,
    avgRawLostUnits: wins > 0 ? rawUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgPermanentLostBlood: avgPerm,
    avgPermanentLostUnits: wins > 0 ? permUnitsSum / wins : Number.POSITIVE_INFINITY,
    avgStoneCount: wins > 0 ? stoneSum / wins : 0,
    avgAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgAllyLosses[unit.key] / wins : 0
    ])),
    avgPermanentAllyLosses: Object.fromEntries(ALLY_UNITS.map((unit) => [
      unit.key,
      wins > 0 ? avgPermanentAllyLosses[unit.key] / wins : 0
    ])),
    displayedLoss: displayed,
    topOutcomes
  };
}

function comparePrimary(a, b) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (a.feasible) {
    if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    if (objective === "min_army") {
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
      if (a.displayedLoss !== b.displayedLoss) return a.displayedLoss - b.displayedLoss;
    } else {
      if (a.displayedLoss !== b.displayedLoss) return a.displayedLoss - b.displayedLoss;
      if (a.avgUsedPoints !== b.avgUsedPoints) return a.avgUsedPoints - b.avgUsedPoints;
    }
    return a.signature.localeCompare(b.signature);
  }
  if (a.winRate !== b.winRate) return b.winRate - a.winRate;
  return a.signature.localeCompare(b.signature);
}

// Birlestirilmis shortlist'in en iyi topK'sini al
const seen = new Map();
for (const x of merged) {
  const ex = seen.get(x.signature);
  if (!ex || comparePrimary(x, ex) < 0) seen.set(x.signature, x);
}
const candidates = [...seen.values()].sort(comparePrimary).slice(0, topK);

const verified = candidates.map((c) => evaluateFull(c.counts)).sort(comparePrimary);

process.stdout.write(JSON.stringify({
  totalEvaluated: candidates.length,
  best: verified[0],
  top10: verified.slice(0, topResultCount)
}, null, 2));
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
print("Hazirlaniyor...")

# Node kontrolu
try:
    sh("command -v node >/dev/null 2>&1")
except Exception:
    print("Node yok, kuruluyor...")
    sh("apt-get update -qq && apt-get install -y nodejs -qq")

# Battle-core indir (deploy edilmemisse lokalden yukleyin - bkz README)
if not os.path.exists("battle-core.js"):
    urllib.request.urlretrieve(BATTLE_CORE_URL, "battle-core.js")

with open("worker.js", "w", encoding="utf-8") as f:
    f.write(WORKER_JS)
with open("master.js", "w", encoding="utf-8") as f:
    f.write(MASTER_JS)
with open("config.json", "w", encoding="utf-8") as f:
    json.dump(CONFIG, f, ensure_ascii=False, indent=2)

n_workers = CONFIG.get("workers") or os.cpu_count() or 2
print(f"CPU cekirdek sayisi: {os.cpu_count()}, kullanilacak worker: {n_workers}")

partitions = split_partitions(
    CONFIG["allyPool"], CONFIG["pointLimit"], CONFIG["partitionAxis"], n_workers
)
print(f"Partition sayisi: {len(partitions)}")
for p in partitions:
    cnt = count_combinations_for_partition(
        CONFIG["allyPool"], CONFIG["pointLimit"],
        CONFIG["partitionAxis"], p["start"], p["end"]
    )
    print(f"  worker {p['id']}: {CONFIG['partitionAxis']} [{p['start']}..{p['end']}] = {fmt_int(cnt)} kombinasyon")

total_combos = count_combinations_for_partition(
    CONFIG["allyPool"], CONFIG["pointLimit"], CONFIG["partitionAxis"], 0, CONFIG["allyPool"][CONFIG["partitionAxis"]]
)
print(f"Toplam: {fmt_int(total_combos)} kombinasyon")

# Worker'lari paralel baslat
print("\nWorker'lar baslatiliyor...")
processes = []
for partition in partitions:
    p = subprocess.Popen(
        ["node", "--max-old-space-size=4096", "worker.js", "config.json", json.dumps(partition)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1
    )
    processes.append({"partition": partition, "proc": p, "checked": 0,
                      "incumbent": None, "shortlist": None, "live_top": [], "done": False})

# Progress bar
pbar = tqdm(total=total_combos, desc="Tum worker'lar", unit="aday", smoothing=0.05)
status_display = display(HTML("<pre>Baslatildi</pre>"), display_id=True)
start_time = time.time()

# Stream stdout'u poll
import select
try:
    use_select = hasattr(select, "select") and sys.platform != "win32"
except Exception:
    use_select = False

def read_available(proc):
    """Non-blocking read of available lines."""
    lines = []
    try:
        if use_select:
            while True:
                r, _, _ = select.select([proc.stdout], [], [], 0)
                if not r:
                    break
                line = proc.stdout.readline()
                if not line:
                    break
                lines.append(line)
        else:
            # Windows: readline blocks; just try one
            line = proc.stdout.readline()
            if line:
                lines.append(line)
    except Exception:
        pass
    return lines

last_pbar_update = 0
while any(not w["done"] for w in processes):
    for w in processes:
        if w["done"]:
            continue
        for line in read_available(w["proc"]):
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except Exception:
                continue
            kind = payload.get("type")
            if kind == "progress":
                delta = payload["checked"] - w["checked"]
                w["checked"] = payload["checked"]
                w["incumbent"] = payload.get("incumbent")
                w["live_top"] = payload.get("topCandidates") or w["live_top"]
                pbar.update(delta)
            elif kind == "done":
                delta = payload["checked"] - w["checked"]
                w["checked"] = payload["checked"]
                w["shortlist"] = payload["shortlist"]
                w["live_top"] = payload.get("shortlist") or w["live_top"]
                w["done"] = True
                pbar.update(delta)
        if w["proc"].poll() is not None and not w["done"]:
            # Worker sonlandi ama done mesaji okunmadi -> kalanlari oku
            remainder, _ = w["proc"].communicate()
            for line in (remainder or "").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except Exception:
                    continue
                if payload.get("type") == "done":
                    w["shortlist"] = payload["shortlist"]
                    w["live_top"] = payload.get("shortlist") or w["live_top"]
                    w["done"] = True
                    delta = payload["checked"] - w["checked"]
                    w["checked"] = payload["checked"]
                    pbar.update(delta)

    # Status guncelle
    if time.time() - last_pbar_update > 2:
        last_pbar_update = time.time()
        elapsed = time.time() - start_time
        incumbents = [w["incumbent"] for w in processes if w["incumbent"] is not None]
        global_inc = min(incumbents) if incumbents else None
        active = sum(1 for w in processes if not w["done"])
        merged_live = {}
        for w in processes:
            for entry in (w.get("live_top") or []):
                signature = entry.get("signature")
                if not signature:
                    continue
                existing = merged_live.get(signature)
                should_replace = existing is None or live_compare_key(entry) < live_compare_key(existing)
                if (
                    not should_replace
                    and existing is not None
                    and live_compare_key(entry) == live_compare_key(existing)
                    and has_live_outcomes(entry)
                    and not has_live_outcomes(existing)
                ):
                    should_replace = True
                if should_replace:
                    merged_live[signature] = entry
        live_entries = sorted(merged_live.values(), key=live_compare_key)[:10]
        status_display.update(HTML(
            build_live_top_html(active, len(processes), elapsed, global_inc, live_entries)
        ))

    if not any(not w["done"] for w in processes):
        break
    time.sleep(0.1)

pbar.close()
print(f"\nTum worker'lar bitti. Toplam sure: {fmt_elapsed(time.time() - start_time)}")

# Tum shortlist'leri birlestir
merged = []
for w in processes:
    if w["shortlist"]:
        merged.extend(w["shortlist"])
print(f"Birlesik shortlist: {len(merged)} aday")

with open("merged_shortlist.json", "w", encoding="utf-8") as f:
    json.dump(merged, f)

# Master final dogrulama (60 trial, top 50)
print(f"Master final dogrulama ({CONFIG['stage3Trials']} trial x top {CONFIG['stage3TopK']})...")
result = sh("node master.js config.json merged_shortlist.json")
final = json.loads(result.stdout)

print("\n" + "=" * 70)
print(f"NIHAI SONUC ({CONFIG['stage3Trials']} trial dogrulamasi)")
print("=" * 70)
best = final["best"]
counts_str = ", ".join([
    f"T{i+1}:{best['counts'][unit]}"
    for i, unit in enumerate(["bats", "ghouls", "thralls", "banshees", "necromancers",
                              "gargoyles", "witches", "rotmaws"])
    if best["counts"][unit] > 0
])
print(f"En iyi kayip: {best['displayedLoss']:.1f}")
print(f"Win rate: %{best['winRate']*100:.0f}")
print(f"Puan: {best['avgUsedPoints']:.0f} / {CONFIG['pointLimit']}")
print(f"Dizilis: {counts_str}")
best_losses = []
for unit_key, label in [
    ("bats", "Yarasa (T1)"),
    ("ghouls", "Gulyabani (T2)"),
    ("thralls", "Vampir Kole (T3)"),
    ("banshees", "Bansi (T4)"),
    ("necromancers", "Nekromant (T5)"),
    ("gargoyles", "Gargoyl (T6)"),
    ("witches", "Kan Cadisi (T7)"),
    ("rotmaws", "Curuk Cene (T8)")
]:
    loss_value = (best.get("avgAllyLosses") or {}).get(unit_key, 0)
    if loss_value > 0:
        best_losses.append(f"{label}: {loss_value:.2f}")
print("Ortalama kayip birlikler: " + (", ".join(best_losses) if best_losses else "yok"))
print("En olasi tekil outcome'lar:")
print_outcome_block(best.get("topOutcomes"), stone_mode=CONFIG.get("stoneMode", False))
print()
print("TOP 10:")
for i, e in enumerate(final["top10"]):
    cs = ", ".join([
        f"T{j+1}:{e['counts'][u]}"
        for j, u in enumerate(["bats", "ghouls", "thralls", "banshees", "necromancers",
                               "gargoyles", "witches", "rotmaws"])
        if e["counts"][u] > 0
    ])
    loss_parts = []
    for unit_key, short_label in [
        ("bats", "T1"),
        ("ghouls", "T2"),
        ("thralls", "T3"),
        ("banshees", "T4"),
        ("necromancers", "T5"),
        ("gargoyles", "T6"),
        ("witches", "T7"),
        ("rotmaws", "T8")
    ]:
        loss_value = (e.get("avgAllyLosses") or {}).get(unit_key, 0)
        if loss_value > 0:
            loss_parts.append(f"{short_label}:{loss_value:.2f}")
    print(f"  {i+1:2}. kayip={e['displayedLoss']:6.1f}  win=%{e['winRate']*100:3.0f}  pts={e['avgUsedPoints']:5.1f}  {cs}")
    print(f"      ort. kayiplar -> {', '.join(loss_parts) if loss_parts else 'yok'}")
    print("      tekil outcome'lar ->")
    print_outcome_block(e.get("topOutcomes"), stone_mode=CONFIG.get("stoneMode", False), indent="        ")
