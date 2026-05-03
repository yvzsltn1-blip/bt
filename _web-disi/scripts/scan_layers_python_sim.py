import json
import pathlib
import re
import textwrap


ROOT = pathlib.Path(__file__).resolve().parents[1]
EXPORT_PATH = ROOT / "sonuc-arsivi" / "layers_1_101_export.json"
PY_SIM_PATH = pathlib.Path(r"C:\Users\YAVUZ\Downloads\simulate_vampire_v5.1.py")
MAX_SEEDS = 512

ENEMY_KEY_BY_NAME = {
    "skeleton": "skeletons",
    "skeletons": "skeletons",
    "skeeton": "skeletons",
    "zombie": "zombies",
    "zombies": "zombies",
    "cultist": "cultists",
    "cultists": "cultists",
    "bone wing": "bonewings",
    "bone wings": "bonewings",
    "bonewing": "bonewings",
    "bonewings": "bonewings",
    "obese": "corpses",
    "corpse": "corpses",
    "corpses": "corpses",
    "wraith": "wraiths",
    "wraiths": "wraiths",
    "revenant": "revenants",
    "revenants": "revenants",
    "bone giant": "giants",
    "bone giants": "giants",
    "bonegiant": "giants",
    "bonegiants": "giants",
    "broodmother": "broodmothers",
    "broodmothers": "broodmothers",
    "broodmothr": "broodmothers",
    "lich": "liches",
    "liches": "liches",
}

ENEMY_KEYS = [
    "skeletons",
    "zombies",
    "cultists",
    "bonewings",
    "corpses",
    "wraiths",
    "revenants",
    "giants",
    "broodmothers",
    "liches",
]

ALLY_KEYS = [
    "bats",
    "ghouls",
    "thralls",
    "banshees",
    "necromancers",
    "gargoyles",
    "witches",
    "rotmaws",
]


def build_runner():
    source = PY_SIM_PATH.read_text(encoding="utf-8")
    body = source.split("########## the code ##########", 1)[1]
    body = textwrap.indent(body.strip("\n"), "    ")
    runner_source = f"""
import math
import random

def run_sim(enemy_counts, ally_counts, seed):
    if seed is not None:
        random.seed(seed)
    skeletons = enemy_counts["skeletons"]
    zombies = enemy_counts["zombies"]
    cultists = enemy_counts["cultists"]
    bonewings = enemy_counts["bonewings"]
    corpses = enemy_counts["corpses"]
    wraiths = enemy_counts["wraiths"]
    revenants = enemy_counts["revenants"]
    giants = enemy_counts["giants"]
    broodmothers = enemy_counts["broodmothers"]
    liches = enemy_counts["liches"]
    bats = ally_counts["bats"]
    ghouls = ally_counts["ghouls"]
    thralls = ally_counts["thralls"]
    banshees = ally_counts["banshees"]
    necromancers = ally_counts["necromancers"]
    gargoyles = ally_counts["gargoyles"]
    witches = ally_counts["witches"]
    rotmaws = ally_counts["rotmaws"]
    print = lambda *args, **kwargs: None
{body}
    ally_remaining = sum(unit_size[bats_index:])
    enemy_remaining = sum(unit_size[:bats_index])
    winner = "ally" if enemy_remaining == 0 else ("enemy" if ally_remaining == 0 else "unknown")
    losses = [
        unit_size_initial[bats_index] - unit_size[bats_index],
        unit_size_initial[ghouls_index] - unit_size[ghouls_index],
        unit_size_initial[thralls_index] - unit_size[thralls_index],
        unit_size_initial[banshees_index] - unit_size[banshees_index],
        unit_size_initial[necromancers_index] - unit_size[necromancers_index],
        unit_size_initial[gargoyles_index] - unit_size[gargoyles_index],
        unit_size_initial[witches_index] - unit_size[witches_index],
        unit_size_initial[rotmaws_index] - unit_size[rotmaws_index],
    ]
    lost_blood = 0
    for idx in range(bats_index, len(unit_desc)):
        lost_units = unit_size_initial[idx] - unit_size[idx]
        if lost_units > 0:
            lost_blood += lost_units * unit_desc[idx][blood_index]
    return winner, lost_blood, losses
"""
    scope = {}
    exec(runner_source, scope, scope)
    return scope["run_sim"]


RUN_SIM = build_runner()


def normalize_enemy_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower().replace(".", ""))


def parse_enemy_counts(row):
    counts = {key: 0 for key in ENEMY_KEYS}
    for source in [row.get("frontlineEnemies"), row.get("backlineEnemies")]:
        if not source:
            continue
        for part in str(source).split(","):
            part = part.strip()
            if not part:
                continue
            match = re.match(r"^(\d+)\s*(.+)$", part)
            if not match:
                raise ValueError(f"Layer {row['layer']} enemy parse failed: {part}")
            amount = int(match.group(1))
            key = ENEMY_KEY_BY_NAME.get(normalize_enemy_name(match.group(2)))
            if not key:
                raise ValueError(f"Layer {row['layer']} unknown enemy: {match.group(2)}")
            counts[key] += amount
    return counts


def build_ally_counts(row):
    return {key: int(row["allyCounts"][idx] or 0) for idx, key in enumerate(ALLY_KEYS)}


def loss_diff(actual, expected):
    return sum(abs(a - b) for a, b in zip(actual, expected))


def scan_row(row):
    enemy_counts = parse_enemy_counts(row)
    ally_counts = build_ally_counts(row)
    expected_losses = [int(x or 0) for x in row["expectedLosses"]]
    expected_blood = int(row["expectedLostBlood"])
    is_random = enemy_counts["cultists"] > 0
    max_seeds = MAX_SEEDS if is_random else 1

    exact = None
    blood_match = None
    best = None

    for seed in range(1, max_seeds + 1):
        winner, blood, losses = RUN_SIM(enemy_counts, ally_counts, seed)
        diff = loss_diff(losses, expected_losses)
        blood_diff = abs(blood - expected_blood)
        winner_penalty = 0 if winner == "ally" else 1000000
        score = winner_penalty + blood_diff * 100 + diff
        summary = {
            "seed": seed,
            "winner": winner,
            "blood": blood,
            "losses": losses,
            "diff": diff,
            "bloodDiff": blood_diff,
        }
        if best is None or score < best["score"]:
            best = {**summary, "score": score}
        if winner == "ally" and blood == expected_blood and blood_match is None:
            blood_match = summary
        if winner == "ally" and blood == expected_blood and diff == 0:
            exact = summary
            break

    return {
        "layer": row["layer"],
        "isRandom": is_random,
        "expectedBlood": expected_blood,
        "expectedLosses": expected_losses,
        "exact": exact,
        "bloodMatch": blood_match,
        "best": best,
    }


def main():
    rows = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    results = [scan_row(row) for row in rows]
    exact_count = sum(1 for item in results if item["exact"] is not None)
    blood_count = sum(1 for item in results if item["bloodMatch"] is not None)
    print(json.dumps({
        "engine": "python-v5.1",
        "exactCount": exact_count,
        "bloodCount": blood_count,
        "total": len(results),
        "results": results,
    }))


if __name__ == "__main__":
    main()
