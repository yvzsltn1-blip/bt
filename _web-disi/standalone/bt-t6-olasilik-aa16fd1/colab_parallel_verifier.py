# Colab tek hucre kodu - PARALEL HIZLI VERIFIER.
# 3 hizlandirma:
#  1) Multi-process: 99.4M kombinasyon N worker'a bolunur (CPU cekirdek sayisi).
#  2) Adaptif trial: Trial 1 kaybederse veya kayip >> yerel incumbent ise
#     Trial 2 atlanir (zayif/imkansiz adaylar tek simulasyonla elenir).
#  3) Worker-ici stage 2: her worker kendi shortlist'ini 30-trial dogrular,
#     sadece top-K dondurur; master sadece final birlestirme + 60-trial.

import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from IPython.display import display, HTML
from tqdm.auto import tqdm

BATTLE_CORE_URL = "https://bt-analiz.web.app/battle-core.js"

CONFIG = {
    "stage": 48,
    "pointLimit": 490,
    "objective": "min_loss",
    "stoneMode": False,
    "minWinRate": 0.75,
    "baseSeed": 42042,

    # Adaptif trial sinirleri
    "stage1MaxTrials": 2,    # gercekte 1 yada 2 (adaptif); 2 = guvenli ust sinir
    "stage2Trials": 30,      # worker-ici dogrulama
    "stage3Trials": 60,      # master final dogrulama
    "stage3TopK": 50,        # master sadece top-50'yi 60 trial ile dogrular

    # Worker basina shortlist boyutu
    "shortlistPerWorker": 800,
    "workerStage2TopK": 80,  # her worker stage1'den stage2'ye 80 aday tasir

    # Paralelizm
    "workers": None,  # None = os.cpu_count() (Colab free ~2, Pro ~8)
    "partitionAxis": "bats",  # ilk aktif birim, en buyuk maxCount

    # Erken durdurma
    "stopOnTargetAfterStage3": False,
    "targetLoss": 639,

    "enemy": {
        "skeletons": 29,
        "zombies": 7,
        "cultists": 28,
        "bonewings": 13,
        "corpses": 17,
        "wraiths": 10,
        "revenants": 8,
        "giants": 0,
        "broodmothers": 0,
        "liches": 0
    },
    "allyPool": {
        "bats": 136,
        "ghouls": 84,
        "thralls": 57,
        "banshees": 60,
        "necromancers": 10,
        "gargoyles": 0,
        "witches": 0,
        "rotmaws": 0
    }
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
    displayedLoss: displayed
  };
}

// Tam degerlendirme (stage 2 ve sonrasi) - tum trial'lari kosar, erken cikis yok
function evaluateFull(counts, trials) {
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

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
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
    }
  }

  const winRate = wins / trials;
  const feasible = winRate >= minWinRate;
  const avgRaw = wins > 0 ? rawLossSum / wins : Number.POSITIVE_INFINITY;
  const avgPerm = wins > 0 ? permLossSum / wins : Number.POSITIVE_INFINITY;
  const displayed = stoneMode ? avgPerm : avgRaw;

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
    displayedLoss: displayed
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
        incumbent: Number.isFinite(localIncumbent) ? localIncumbent : null
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
  .map((entry) => evaluateFull(entry.counts, stage2Trials))
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

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function evaluateFull(counts) {
  const signature = getSignature(counts);
  let wins = 0;
  let rawLossSum = 0, rawUnitsSum = 0;
  let permLossSum = 0, permUnitsSum = 0, stoneSum = 0;
  let usedPtsSum = 0, usedCapSum = 0;
  let enemyHpSum = 0, enemyUnitsSum = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const r = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    usedPtsSum += r.usedPoints;
    usedCapSum += r.usedCapacity;
    enemyHpSum += r.enemyRemainingHealth;
    enemyUnitsSum += r.enemyRemainingUnits;
    if (r.winner === "ally") {
      wins += 1;
      rawLossSum += r.lostBloodTotal;
      rawUnitsSum += r.lostUnitsTotal;
      const sp = getStoneAdjustedLossProfile(r.allyLosses || {});
      permLossSum += sp.permanentLostBlood;
      permUnitsSum += sp.permanentLostUnits;
      stoneSum += sp.stoneCount;
    }
  }
  const winRate = wins / trials;
  const avgRaw = wins > 0 ? rawLossSum / wins : Number.POSITIVE_INFINITY;
  const avgPerm = wins > 0 ? permLossSum / wins : Number.POSITIVE_INFINITY;
  const displayed = stoneMode ? avgPerm : avgRaw;
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
    displayedLoss: displayed
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
  top10: verified.slice(0, 10)
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
                      "incumbent": None, "shortlist": None, "done": False})

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
                pbar.update(delta)
            elif kind == "done":
                delta = payload["checked"] - w["checked"]
                w["checked"] = payload["checked"]
                w["shortlist"] = payload["shortlist"]
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
        status_display.update(HTML(
            f"<pre>sure {fmt_elapsed(elapsed)} | aktif worker {active}/{len(processes)} "
            f"| en iyi yerel kayip {global_inc if global_inc is not None else '-'}</pre>"
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
print()
print("TOP 10:")
for i, e in enumerate(final["top10"]):
    cs = ", ".join([
        f"T{j+1}:{e['counts'][u]}"
        for j, u in enumerate(["bats", "ghouls", "thralls", "banshees", "necromancers",
                               "gargoyles", "witches", "rotmaws"])
        if e["counts"][u] > 0
    ])
    print(f"  {i+1:2}. kayip={e['displayedLoss']:6.1f}  win=%{e['winRate']*100:3.0f}  pts={e['avgUsedPoints']:5.1f}  {cs}")
