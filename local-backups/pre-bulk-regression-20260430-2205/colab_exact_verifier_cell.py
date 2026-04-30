# Colab tek hucre kodu.
# Bu dosyanin TUM icerigini tek bir Colab hucresine yapistirip calistir.
# CONFIG hazir dolduruldu: senin ekrandaki Stage 44 / limit 450 / tasli / min_loss senaryosu.

import json
import math
import subprocess
import urllib.request
from IPython.display import display, HTML
from tqdm.auto import tqdm

BATTLE_CORE_URL = "https://bt-analiz.web.app/battle-core.js"

CONFIG = {
    "stage": 48,
    "pointLimit": 490,
    "objective": "min_loss",   # "min_loss" veya "min_army"
    "stoneMode": False,
    "minWinRate": 0.75,
    "baseSeed": 42042,
    "reportEvery": 10000,

    # 2 asamali tarama:
    # 1. asama: tum kombinasyonlar hizli taranir
    # 2. asama: secilen kisa liste derin dogrulanir
    "stage1Trials": 2,
    "stage2Trials": 30,

    # Guvenlik icin birden fazla bucket tutuluyor.
    "shortlistPrimary": 4000,
    "shortlistByLoss": 4000,
    "shortlistByArmy": 2500,
    "shortlistByWinRate": 2500,
    "bucketBufferMultiplier": 4,

    # Bulunca durdurmak istersen:
    "stopOnTargetAfterStage2": False,
    "targetPermanentLoss": 600,

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

JS_CODE = r"""
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

const config = JSON.parse(fs.readFileSync(process.argv[2] || "config.json", "utf8"));

const pointLimit = Number.isFinite(config.pointLimit) ? config.pointLimit : getStagePointLimit(config.stage);
const objective = config.objective === "min_army" ? "min_army" : "min_loss";
const stoneMode = Boolean(config.stoneMode);
const minWinRate = Number.isFinite(config.minWinRate) ? config.minWinRate : 0.75;
const stage1Trials = Math.max(1, Math.floor(config.stage1Trials || 1));
const stage2Trials = Math.max(stage1Trials, Math.floor(config.stage2Trials || stage1Trials));
const reportEvery = Math.max(1, Math.floor(config.reportEvery || 10000));
const baseSeed = Math.floor(config.baseSeed || 42042);
const bucketBufferMultiplier = Math.max(2, Math.floor(config.bucketBufferMultiplier || 4));

const activeUnits = ALLY_UNITS.filter((unit) => (config.allyPool?.[unit.key] || 0) > 0);
const tierByKey = Object.fromEntries(ALLY_UNITS.map((unit, index) => [unit.key, index + 1]));

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function getSignature(counts) {
  return ALLY_UNITS.map((unit) => counts[unit.key] || 0).join("|");
}

function cloneCounts(counts) {
  return Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, counts[unit.key] || 0]));
}

function formatCounts(counts) {
  const parts = activeUnits
    .map((unit) => {
      const count = counts[unit.key] || 0;
      return count > 0 ? `T${tierByKey[unit.key]}:${count}` : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" ; ") : "(bos)";
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "inf";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function summarizeEntry(entry) {
  if (!entry) {
    return {
      loss: "-",
      points: "-",
      winRate: "-",
      stones: "-",
      counts: "-"
    };
  }
  return {
    loss: formatNumber(entry.displayedLoss),
    points: formatNumber(entry.avgUsedPoints),
    winRate: `%${Math.round((entry.winRate || 0) * 100)}`,
    stones: stoneMode ? formatNumber(entry.avgStoneCount || 0) : "-",
    counts: formatCounts(entry.counts || {})
  };
}

function countTotalCombinations() {
  const dp = Array(pointLimit + 1).fill(0n);
  dp[0] = 1n;
  for (const unit of activeUnits) {
    const cost = POINTS_BY_ALLY_KEY[unit.key];
    const maxCount = config.allyPool?.[unit.key] || 0;
    const next = Array(pointLimit + 1).fill(0n);
    for (let points = 0; points <= pointLimit; points += 1) {
      const current = dp[points];
      if (current === 0n) {
        continue;
      }
      const maxTake = Math.min(maxCount, Math.floor((pointLimit - points) / cost));
      for (let count = 0; count <= maxTake; count += 1) {
        next[points + count * cost] += current;
      }
    }
    for (let index = 0; index <= pointLimit; index += 1) {
      dp[index] = next[index];
    }
  }
  return dp.reduce((sum, value) => sum + value, 0n);
}

function evaluateCandidate(counts, trials) {
  const signature = getSignature(counts);
  let wins = 0;
  let rawLostBloodSum = 0;
  let rawLostUnitsSum = 0;
  let permanentLostBloodSum = 0;
  let permanentLostUnitsSum = 0;
  let stoneCountSum = 0;
  let usedPointsSum = 0;
  let usedCapacitySum = 0;
  let enemyRemainingHealthSum = 0;
  let enemyRemainingUnitsSum = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const seed = baseSeed + trial * 977;
    const result = simulateBattle(config.enemy, counts, { seed, collectLog: false });
    usedPointsSum += result.usedPoints;
    usedCapacitySum += result.usedCapacity;
    enemyRemainingHealthSum += result.enemyRemainingHealth;
    enemyRemainingUnitsSum += result.enemyRemainingUnits;

    if (result.winner === "ally") {
      wins += 1;
      rawLostBloodSum += result.lostBloodTotal;
      rawLostUnitsSum += result.lostUnitsTotal;
      const stoneProfile = getStoneAdjustedLossProfile(result.allyLosses || {});
      permanentLostBloodSum += stoneProfile.permanentLostBlood;
      permanentLostUnitsSum += stoneProfile.permanentLostUnits;
      stoneCountSum += stoneProfile.stoneCount;
    }
  }

  const winRate = wins / trials;
  const feasible = winRate >= minWinRate;
  const avgRawLostBlood = wins > 0 ? rawLostBloodSum / wins : Number.POSITIVE_INFINITY;
  const avgRawLostUnits = wins > 0 ? rawLostUnitsSum / wins : Number.POSITIVE_INFINITY;
  const avgPermanentLostBlood = wins > 0 ? permanentLostBloodSum / wins : Number.POSITIVE_INFINITY;
  const avgPermanentLostUnits = wins > 0 ? permanentLostUnitsSum / wins : Number.POSITIVE_INFINITY;
  const avgStoneCount = wins > 0 ? stoneCountSum / wins : 0;
  const displayedLoss = stoneMode ? avgPermanentLostBlood : avgRawLostBlood;

  return {
    counts: cloneCounts(counts),
    signature,
    trials,
    feasible,
    wins,
    winRate,
    avgUsedPoints: usedPointsSum / trials,
    avgUsedCapacity: usedCapacitySum / trials,
    avgEnemyRemainingHealth: enemyRemainingHealthSum / trials,
    avgEnemyRemainingUnits: enemyRemainingUnitsSum / trials,
    avgRawLostBlood,
    avgRawLostUnits,
    avgPermanentLostBlood,
    avgPermanentLostUnits,
    avgStoneCount,
    displayedLoss
  };
}

function comparePrimary(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }

  if (left.feasible) {
    if (left.winRate !== right.winRate) {
      return right.winRate - left.winRate;
    }
    if (objective === "min_army") {
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return left.avgUsedPoints - right.avgUsedPoints;
      }
      if (left.displayedLoss !== right.displayedLoss) {
        return left.displayedLoss - right.displayedLoss;
      }
    } else {
      if (left.displayedLoss !== right.displayedLoss) {
        return left.displayedLoss - right.displayedLoss;
      }
      if (left.avgUsedPoints !== right.avgUsedPoints) {
        return left.avgUsedPoints - right.avgUsedPoints;
      }
    }
    if (left.avgUsedCapacity !== right.avgUsedCapacity) {
      return left.avgUsedCapacity - right.avgUsedCapacity;
    }
    const leftUnits = stoneMode ? left.avgPermanentLostUnits : left.avgRawLostUnits;
    const rightUnits = stoneMode ? right.avgPermanentLostUnits : right.avgRawLostUnits;
    if (leftUnits !== rightUnits) {
      return leftUnits - rightUnits;
    }
    return left.signature.localeCompare(right.signature);
  }

  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }
  if (left.avgEnemyRemainingHealth !== right.avgEnemyRemainingHealth) {
    return left.avgEnemyRemainingHealth - right.avgEnemyRemainingHealth;
  }
  if (left.avgEnemyRemainingUnits !== right.avgEnemyRemainingUnits) {
    return left.avgEnemyRemainingUnits - right.avgEnemyRemainingUnits;
  }
  return left.signature.localeCompare(right.signature);
}

function compareLossBucket(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }
  if (left.displayedLoss !== right.displayedLoss) {
    return left.displayedLoss - right.displayedLoss;
  }
  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }
  if (left.avgUsedPoints !== right.avgUsedPoints) {
    return left.avgUsedPoints - right.avgUsedPoints;
  }
  return left.signature.localeCompare(right.signature);
}

function compareArmyBucket(left, right) {
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }
  if (left.avgUsedPoints !== right.avgUsedPoints) {
    return left.avgUsedPoints - right.avgUsedPoints;
  }
  if (left.displayedLoss !== right.displayedLoss) {
    return left.displayedLoss - right.displayedLoss;
  }
  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }
  return left.signature.localeCompare(right.signature);
}

function compareWinBucket(left, right) {
  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }
  if (left.feasible !== right.feasible) {
    return left.feasible ? -1 : 1;
  }
  if (left.displayedLoss !== right.displayedLoss) {
    return left.displayedLoss - right.displayedLoss;
  }
  if (left.avgUsedPoints !== right.avgUsedPoints) {
    return left.avgUsedPoints - right.avgUsedPoints;
  }
  return left.signature.localeCompare(right.signature);
}

function createBucket(name, limit, comparator) {
  return {
    name,
    limit: Math.max(1, limit),
    comparator,
    items: [],
    worst: null
  };
}

function pruneBucket(bucket) {
  const unique = new Map();
  for (const item of bucket.items) {
    const existing = unique.get(item.signature);
    if (!existing || bucket.comparator(item, existing) < 0) {
      unique.set(item.signature, item);
    }
  }
  bucket.items = [...unique.values()].sort(bucket.comparator).slice(0, bucket.limit);
  bucket.worst = bucket.items.length ? bucket.items[bucket.items.length - 1] : null;
}

function maybeAddToBucket(bucket, entry) {
  if (bucket.items.length < bucket.limit) {
    bucket.items.push(entry);
    if (bucket.items.length === bucket.limit) {
      pruneBucket(bucket);
    }
    return;
  }

  if (bucket.worst && bucket.comparator(entry, bucket.worst) >= 0) {
    return;
  }

  bucket.items.push(entry);
  if (bucket.items.length >= bucket.limit * bucketBufferMultiplier) {
    pruneBucket(bucket);
  }
}

function gatherShortlistEntries(buckets) {
  buckets.forEach(pruneBucket);
  const union = new Map();
  for (const bucket of buckets) {
    for (const item of bucket.items) {
      const existing = union.get(item.signature);
      if (!existing || comparePrimary(item, existing) < 0) {
        union.set(item.signature, item);
      }
    }
  }
  return [...union.values()].sort(comparePrimary);
}

const totalCombinations = countTotalCombinations();

emit({
  type: "start",
  total: totalCombinations.toString(),
  pointLimit,
  objective,
  stoneMode,
  stage1Trials,
  stage2Trials,
  activeUnits: activeUnits.map((unit) => ({
    key: unit.key,
    tier: tierByKey[unit.key],
    max: config.allyPool?.[unit.key] || 0
  }))
});

const buckets = [
  createBucket("primary", Math.max(1, Math.floor(config.shortlistPrimary || 4000)), comparePrimary),
  createBucket("loss", Math.max(1, Math.floor(config.shortlistByLoss || 4000)), compareLossBucket),
  createBucket("army", Math.max(1, Math.floor(config.shortlistByArmy || 2500)), compareArmyBucket),
  createBucket("win", Math.max(1, Math.floor(config.shortlistByWinRate || 2500)), compareWinBucket)
];

const partial = Object.fromEntries(ALLY_UNITS.map((unit) => [unit.key, 0]));
let stage1Checked = 0n;
let stage1Best = null;
let stage1Last = null;
const startedAt = Date.now();

function emitStage1Progress(force = false) {
  if (!force && stage1Checked % BigInt(reportEvery) !== 0n) {
    return;
  }
  emit({
    type: "progress",
    phase: "stage1",
    checked: stage1Checked.toString(),
    total: totalCombinations.toString(),
    elapsedMs: Date.now() - startedAt,
    last: summarizeEntry(stage1Last),
    best: summarizeEntry(stage1Best)
  });
}

function enumerate(index, remainingPoints) {
  if (index >= activeUnits.length) {
    stage1Checked += 1n;
    const evaluation = evaluateCandidate(partial, stage1Trials);
    stage1Last = evaluation;
    maybeAddToBucket(buckets[0], evaluation);
    maybeAddToBucket(buckets[1], evaluation);
    maybeAddToBucket(buckets[2], evaluation);
    maybeAddToBucket(buckets[3], evaluation);

    if (!stage1Best || comparePrimary(evaluation, stage1Best) < 0) {
      stage1Best = evaluation;
      emit({
        type: "best",
        phase: "stage1",
        checked: stage1Checked.toString(),
        total: totalCombinations.toString(),
        elapsedMs: Date.now() - startedAt,
        best: summarizeEntry(stage1Best)
      });
    }

    emitStage1Progress(false);
    return;
  }

  const unit = activeUnits[index];
  const cost = POINTS_BY_ALLY_KEY[unit.key];
  const maxCount = Math.min(config.allyPool?.[unit.key] || 0, Math.floor(remainingPoints / cost));

  for (let count = 0; count <= maxCount; count += 1) {
    partial[unit.key] = count;
    enumerate(index + 1, remainingPoints - count * cost);
  }
  partial[unit.key] = 0;
}

enumerate(0, pointLimit);
emitStage1Progress(true);

const shortlist = gatherShortlistEntries(buckets);
emit({
  type: "shortlist_ready",
  shortlistSize: shortlist.length,
  elapsedMs: Date.now() - startedAt,
  stage1Best: summarizeEntry(stage1Best)
});

let stage2Best = null;
let stage2Last = null;
let stage2Checked = 0;
for (const candidate of shortlist) {
  stage2Checked += 1;
  const reevaluated = evaluateCandidate(candidate.counts, stage2Trials);
  stage2Last = reevaluated;

  if (!stage2Best || comparePrimary(reevaluated, stage2Best) < 0) {
    stage2Best = reevaluated;
    emit({
      type: "best",
      phase: "stage2",
      checked: String(stage2Checked),
      total: String(shortlist.length),
      elapsedMs: Date.now() - startedAt,
      best: summarizeEntry(stage2Best)
    });
  }

  if (stage2Checked % Math.max(1, Math.floor(shortlist.length / 200)) === 0 || stage2Checked === shortlist.length) {
    emit({
      type: "progress",
      phase: "stage2",
      checked: String(stage2Checked),
      total: String(shortlist.length),
      elapsedMs: Date.now() - startedAt,
      last: summarizeEntry(stage2Last),
      best: summarizeEntry(stage2Best)
    });
  }

  if (
    Boolean(config.stopOnTargetAfterStage2) &&
    stage2Best &&
    stage2Best.feasible &&
    Number.isFinite(config.targetPermanentLoss) &&
    stage2Best.displayedLoss <= config.targetPermanentLoss
  ) {
    emit({
      type: "target_hit",
      phase: "stage2",
      checked: String(stage2Checked),
      total: String(shortlist.length),
      elapsedMs: Date.now() - startedAt,
      best: summarizeEntry(stage2Best)
    });
    break;
  }
}

emit({
  type: "done",
  elapsedMs: Date.now() - startedAt,
  stage1Checked: stage1Checked.toString(),
  totalCombinations: totalCombinations.toString(),
  shortlistSize: shortlist.length,
  best: summarizeEntry(stage2Best || stage1Best)
});
"""


def sh(cmd):
    return subprocess.run(cmd, shell=True, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


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


def build_line_1(payload):
    checked = int(payload["checked"])
    total = int(payload["total"])
    elapsed = payload["elapsedMs"] / 1000.0
    speed = checked / elapsed if elapsed > 0 else 0.0
    pct = (checked / total * 100.0) if total else 0.0
    eta = (total - checked) / speed if speed > 0 else math.inf
    phase = payload.get("phase", "-")
    last = payload.get("last") or {}
    return (
        f"Asama {phase} | sure {fmt_elapsed(elapsed)} | {fmt_int(checked)} / {fmt_int(total)} (%{pct:.5f}) "
        f"| hiz {speed:,.0f} aday/sn | ETA {fmt_elapsed(eta)} | anlik kayip {last.get('loss', '-')} "
        f"| puan {last.get('points', '-')} | win {last.get('winRate', '-')} | tas {last.get('stones', '-')} "
        f"| dizilis {last.get('counts', '-')}"
    )


def build_line_2(payload):
    best = payload.get("best") or {}
    return (
        f"En iyi sonuc | minimum kayip {best.get('loss', '-')} | puan {best.get('points', '-')} "
        f"| win {best.get('winRate', '-')} | tas {best.get('stones', '-')} | dizilis {best.get('counts', '-')}"
    )


# Node kontrolu
try:
    sh("command -v node >/dev/null 2>&1")
except Exception:
    sh("apt-get update -qq && apt-get install -y nodejs -qq")

urllib.request.urlretrieve(BATTLE_CORE_URL, "battle-core.js")
with open("exact_search.js", "w", encoding="utf-8") as f:
    f.write(JS_CODE)
with open("config.json", "w", encoding="utf-8") as f:
    json.dump(CONFIG, f, ensure_ascii=False, indent=2)

status_1 = display(HTML("<pre>Hazirlaniyor...</pre>"), display_id=True)
status_2 = display(HTML("<pre>En iyi sonuc bekleniyor...</pre>"), display_id=True)
main_bar = tqdm(total=1, desc="Asama 1 - Tum uzay", unit="aday", leave=True)
deep_bar = tqdm(total=1, desc="Asama 2 - Derin dogrulama", unit="aday", leave=True)
deep_bar.reset(total=1)
deep_bar.n = 0
deep_bar.refresh()

proc = subprocess.Popen(
    ["node", "exact_search.js", "config.json"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)

last_payload = None

for raw_line in proc.stdout:
    raw_line = raw_line.strip()
    if not raw_line:
        continue

    payload = json.loads(raw_line)
    last_payload = payload
    kind = payload.get("type")

    if kind == "start":
        total = int(payload["total"])
        main_bar.total = total
        main_bar.n = 0
        main_bar.refresh()
        active_text = ", ".join([f"T{item['tier']}<= {item['max']}" for item in payload["activeUnits"]])
        status_1.update(HTML(
            "<pre>"
            f"Basladi | stage {CONFIG['stage']} | limit {payload['pointLimit']} | hedef {payload['objective']} | "
            f"tasli {payload['stoneMode']} | stage1 trial {payload['stage1Trials']} | stage2 trial {payload['stage2Trials']} "
            f"| aktif birlikler: {active_text}"
            "</pre>"
        ))
        status_2.update(HTML("<pre>En iyi sonuc bekleniyor...</pre>"))
        continue

    if kind == "progress" and payload.get("phase") == "stage1":
        main_bar.n = int(payload["checked"])
        main_bar.refresh()
        status_1.update(HTML(f"<pre>{build_line_1(payload)}</pre>"))
        status_2.update(HTML(f"<pre>{build_line_2(payload)}</pre>"))
        continue

    if kind == "shortlist_ready":
        shortlist_size = int(payload["shortlistSize"])
        deep_bar.total = max(1, shortlist_size)
        deep_bar.n = 0
        deep_bar.refresh()
        status_1.update(HTML(
            "<pre>"
            f"Asama 1 bitti | shortlist hazir: {fmt_int(shortlist_size)} aday | "
            f"simdi derin dogrulama basliyor."
            "</pre>"
        ))
        status_2.update(HTML(f"<pre>{build_line_2({'best': payload.get('stage1Best')})}</pre>"))
        continue

    if kind == "progress" and payload.get("phase") == "stage2":
        deep_bar.n = int(payload["checked"])
        deep_bar.refresh()
        status_1.update(HTML(f"<pre>{build_line_1(payload)}</pre>"))
        status_2.update(HTML(f"<pre>{build_line_2(payload)}</pre>"))
        continue

    if kind == "best":
        phase = payload.get("phase")
        if phase == "stage1":
            main_bar.n = int(payload["checked"])
            main_bar.refresh()
        elif phase == "stage2":
            deep_bar.n = int(payload["checked"])
            deep_bar.refresh()
        status_2.update(HTML(f"<pre>{build_line_2(payload)}</pre>"))
        continue

    if kind == "target_hit":
        deep_bar.n = int(payload["checked"])
        deep_bar.refresh()
        status_1.update(HTML(f"<pre>{build_line_1(payload)}</pre>"))
        status_2.update(HTML(
            f"<pre>{build_line_2(payload)}\nHEDEF BULUNDU: belirledigin kayip esigi asildi veya esitlendi.</pre>"
        ))
        continue

    if kind == "done":
        status_1.update(HTML(
            "<pre>"
            f"Tamamlandi | tum kombinasyonlar: {fmt_int(payload['stage1Checked'])} / {fmt_int(payload['totalCombinations'])} "
            f"| shortlist: {fmt_int(payload['shortlistSize'])} | toplam sure {fmt_elapsed(payload['elapsedMs'] / 1000.0)}"
            "</pre>"
        ))
        status_2.update(HTML(f"<pre>{build_line_2(payload)}\n2 asamali tarama tamamlandi.</pre>"))
        continue

stderr = proc.stderr.read()
return_code = proc.wait()
main_bar.close()
deep_bar.close()

if return_code != 0:
    raise RuntimeError(stderr.strip() or "Node search failed.")

print("Colab exact verifier tamamlandi.")
