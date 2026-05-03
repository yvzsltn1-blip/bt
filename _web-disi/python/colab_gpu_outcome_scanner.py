"""
Colab GPU outcome scanner for one fixed battle.

What it does
- Uses PyTorch on CUDA when available.
- Simulates the last fixed battle state in large GPU batches.
- Aggregates outcome frequencies by winner + ally losses.
- Updates a live top-10 table while running.

Important
- This is a GPU Monte Carlo scanner, not a mathematically exact branch enumerator.
- It mirrors the relevant `battle-core.js` rules for this specific battle only:
  skeletons, zombies, cultists, bonewings, corpses, wraiths, revenants
  vs bats, ghouls, thralls, banshees, necromancers.
- It intentionally excludes units and mechanics not present in this battle.
"""

from __future__ import annotations

import math
import time
from collections import Counter
from html import escape
from typing import Dict, Tuple

import numpy as np
import torch
from IPython.display import HTML, display
from tqdm.auto import tqdm


CONFIG = {
    "seed": 42042,
    "num_samples": 2_000_000,
    "chunk_size": 262_144,
    "top_result_count": 10,
    "max_rounds": 40,
    "report_every_chunks": 1,
}


# Fixed battle from the last screenshot.
ENEMY_COUNTS = {
    "skeletons": 38,
    "zombies": 33,
    "cultists": 13,
    "bonewings": 13,
    "corpses": 20,
    "wraiths": 9,
    "revenants": 11,
    "giants": 0,
    "broodmothers": 0,
    "liches": 0,
}

ALLY_COUNTS = {
    "bats": 47,
    "ghouls": 43,
    "thralls": 23,
    "banshees": 16,
    "necromancers": 1,
    "gargoyles": 0,
    "witches": 0,
    "rotmaws": 0,
}


UNIT_ORDER = [
    "skeletons",
    "zombies",
    "cultists",
    "bonewings",
    "corpses",
    "wraiths",
    "revenants",
    "bats",
    "ghouls",
    "thralls",
    "banshees",
    "necromancers",
    "revived_zombies",
]

IDX = {name: index for index, name in enumerate(UNIT_ORDER)}

ALLY_KEYS = ["bats", "ghouls", "thralls", "banshees", "necromancers"]
ALLY_IDX = [IDX[key] for key in ALLY_KEYS]
ENEMY_IDX = [IDX[key] for key in ["skeletons", "zombies", "cultists", "bonewings", "corpses", "wraiths", "revenants", "revived_zombies"]]

ATTACK = torch.tensor([3, 2, 5, 6, 1, 7, 8, 8, 3, 6, 7, 9, 2], dtype=torch.float32)
HEALTH = torch.tensor([4, 7, 1, 3, 10, 2, 12, 2, 5, 6, 4, 5, 1], dtype=torch.float32)
SPEED = torch.tensor([3, 2, 1, 4, 1, 4, 4, 5, 2, 4, 4, 2, 2], dtype=torch.int64)
SIDE = torch.tensor([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0], dtype=torch.int64)  # 0 enemy, 1 ally
POS = torch.tensor([0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0], dtype=torch.int64)   # 0 front, 1 rear
TYPE = torch.tensor([0, 0, 1, 1, 2, 1, 0, 0, 0, 1, 2, 1, 0], dtype=torch.int64)  # 0 brute, 1 occult, 2 monster
ALLY_BLOOD = {
    "bats": 10,
    "ghouls": 15,
    "thralls": 20,
    "banshees": 35,
    "necromancers": 50,
}

BLOOD = torch.tensor([0, 0, 0, 0, 0, 0, 0, 10, 15, 20, 35, 50, 0], dtype=torch.float32)
DEVICE_TENSORS: dict[str, dict[str, torch.Tensor]] = {}

INITIAL_COUNTS = torch.tensor(
    [
        ENEMY_COUNTS["skeletons"],
        ENEMY_COUNTS["zombies"],
        ENEMY_COUNTS["cultists"],
        ENEMY_COUNTS["bonewings"],
        ENEMY_COUNTS["corpses"],
        ENEMY_COUNTS["wraiths"],
        ENEMY_COUNTS["revenants"],
        ALLY_COUNTS["bats"],
        ALLY_COUNTS["ghouls"],
        ALLY_COUNTS["thralls"],
        ALLY_COUNTS["banshees"],
        ALLY_COUNTS["necromancers"],
        0,
    ],
    dtype=torch.int64,
)

# Matches battle-core's attacker order for the units present in this fight.
ATTACKER_ORDER = [
    IDX["bats"],
    IDX["wraiths"],
    IDX["bonewings"],
    IDX["banshees"],
    IDX["thralls"],
    IDX["revenants"],
    IDX["skeletons"],
    IDX["necromancers"],
    IDX["ghouls"],
    IDX["zombies"],
    IDX["revived_zombies"],
    IDX["cultists"],
    IDX["corpses"],
]


def build_defender_orders() -> Tuple[list[int], list[int]]:
    min_speed = int(torch.min(SPEED).item())
    max_speed = int(torch.max(SPEED).item())
    defender_front: list[int] = []
    defender_rear: list[int] = []
    for speed in range(min_speed, max_speed + 1):
        for index in range(len(UNIT_ORDER)):
            if int(SPEED[index].item()) == speed and int(POS[index].item()) == 0:
                defender_front.append(index)
        for index in range(len(UNIT_ORDER)):
            if int(SPEED[index].item()) == speed and int(POS[index].item()) == 1:
                defender_rear.append(index)
    return defender_front + defender_rear, defender_rear + defender_front


DEFENDER_ORDER_FRONT_FIRST, DEFENDER_ORDER_REAR_FIRST = build_defender_orders()
ORDER_RANK_FRONT = {index: rank for rank, index in enumerate(DEFENDER_ORDER_FRONT_FIRST)}
ORDER_RANK_REAR = {index: rank for rank, index in enumerate(DEFENDER_ORDER_REAR_FIRST)}


def ceil_combat(value: torch.Tensor) -> torch.Tensor:
    return torch.ceil(torch.clamp(value, min=0.0) - 1e-9)


def get_device_tensors(device: torch.device) -> Dict[str, torch.Tensor]:
    key = str(device)
    cached = DEVICE_TENSORS.get(key)
    if cached is None:
        cached = {
            "attack": ATTACK.to(device),
            "health": HEALTH.to(device),
            "speed": SPEED.to(device),
            "side": SIDE.to(device),
            "pos": POS.to(device),
            "type": TYPE.to(device),
            "initial_counts": INITIAL_COUNTS.to(device),
        }
        DEVICE_TENSORS[key] = cached
    return cached


def pick_defender(
    attacker_idx: int,
    counts: torch.Tensor,
    health: torch.Tensor,
    round_no: int,
    device: torch.device,
) -> torch.Tensor:
    tensors = get_device_tensors(device)
    attacker_side = int(SIDE[attacker_idx].item())
    defender_side = 1 - attacker_side
    rows = counts.shape[0]
    if rows == 0:
        return torch.empty((0,), dtype=torch.int64, device=device)

    prefer_rear = torch.zeros(rows, dtype=torch.bool, device=device)
    custom_order_rank = torch.full((rows, len(UNIT_ORDER)), -1, dtype=torch.int64, device=device)

    if attacker_idx in (IDX["bonewings"], IDX["banshees"]):
        prefer_rear[:] = True
    elif attacker_idx == IDX["wraiths"] and round_no >= 2:
        can_force_banshee = (
            (counts[:, IDX["ghouls"]] > 0)
            & (counts[:, IDX["ghouls"]] < counts[:, IDX["wraiths"]])
            & (counts[:, IDX["banshees"]] > 0)
            & ((counts[:, IDX["wraiths"]].to(torch.float32) * tensors["attack"][IDX["wraiths"]]) >= health[:, IDX["banshees"]])
        )
        prefer_rear = can_force_banshee
        if torch.any(can_force_banshee):
            for index, unit in enumerate([IDX["banshees"], *[i for i in DEFENDER_ORDER_REAR_FIRST if i != IDX["banshees"]]]):
                custom_order_rank[can_force_banshee, unit] = index

    alive = counts > 0
    correct_side = tensors["side"].unsqueeze(0) == defender_side
    valid = alive & correct_side

    pos = tensors["pos"].unsqueeze(0).expand(rows, -1)
    speed = tensors["speed"].unsqueeze(0).expand(rows, -1)
    preferred_pos = torch.where(prefer_rear, 1, 0).unsqueeze(1)
    position_rank = torch.where(pos == preferred_pos, 0, 1)

    default_rank_front = torch.tensor([ORDER_RANK_FRONT[i] for i in range(len(UNIT_ORDER))], device=device, dtype=torch.int64)
    default_rank_rear = torch.tensor([ORDER_RANK_REAR[i] for i in range(len(UNIT_ORDER))], device=device, dtype=torch.int64)
    default_rank = torch.where(prefer_rear.unsqueeze(1), default_rank_rear.unsqueeze(0), default_rank_front.unsqueeze(0))
    order_rank = torch.where(custom_order_rank >= 0, custom_order_rank, default_rank)

    invalid_score = torch.full((rows, len(UNIT_ORDER)), 9_999_999_999, dtype=torch.int64, device=device)
    score = (
        position_rank.to(torch.int64) * 1_000_000_000
        + speed.to(torch.int64) * 1_000_000
        - counts.to(torch.int64) * 1_000
        + order_rank.to(torch.int64)
    )
    score = torch.where(valid, score, invalid_score)
    defender = torch.argmin(score, dim=1)
    has_target = torch.any(valid, dim=1)
    defender = torch.where(has_target, defender, torch.full_like(defender, -1))
    return defender


def apply_type_multiplier(attacker_idx: int, defender_idx: torch.Tensor, counts: torch.Tensor) -> torch.Tensor:
    device = defender_idx.device
    tensors = get_device_tensors(device)
    defender_type = tensors["type"][defender_idx].to(torch.int64)
    mult = torch.ones_like(defender_idx, dtype=torch.float32)
    attacker_type = int(TYPE[attacker_idx].item())

    if attacker_idx == IDX["wraiths"]:
        mult.fill_(1.0)
    elif attacker_type == 0:
        mult = torch.where(defender_type == 1, 1.5, mult)
        mult = torch.where(defender_type == 2, 0.5, mult)
    elif attacker_type == 1:
        mult = torch.where((defender_type == 0) & (defender_idx != IDX["ghouls"]), 0.5, mult)
        mult = torch.where(defender_type == 2, 1.5, mult)
    elif attacker_type == 2:
        mult = torch.where((defender_type == 0) & (defender_idx != IDX["ghouls"]), 1.5, mult)
        mult = torch.where(defender_type == 1, 0.5, mult)

    mult = torch.where(defender_idx == IDX["ghouls"], 0.5, mult)

    if attacker_idx == IDX["wraiths"]:
        wraiths = counts[:, IDX["wraiths"]].to(torch.float32)
        defender_counts = counts.gather(1, defender_idx.unsqueeze(1)).squeeze(1).to(torch.float32)
        ratio = torch.floor(defender_counts / torch.clamp(wraiths, min=1.0))
        bonus_steps = torch.clamp(ratio - 1.0, min=0.0)
        mult = 1.0 + bonus_steps * 0.5

    return mult


def sample_alive_enemy_target(counts: torch.Tensor, device: torch.device, generator: torch.Generator) -> torch.Tensor:
    tensors = get_device_tensors(device)
    eligible = (counts > 0) & (tensors["side"].unsqueeze(0) == 0)
    eligible[:, IDX["cultists"]] = False
    rows = counts.shape[0]
    if rows == 0:
        return torch.empty((0,), dtype=torch.int64, device=device)
    has_choice = torch.any(eligible, dim=1)
    rand = torch.rand((rows, len(UNIT_ORDER)), device=device, generator=generator)
    rand = torch.where(eligible, rand, torch.full_like(rand, -1.0))
    target = torch.argmax(rand, dim=1)
    target = torch.where(has_choice, target, torch.full_like(target, -1))
    return target


def simulate_chunk(batch_size: int, seed: int, device: torch.device) -> Tuple[np.ndarray, np.ndarray]:
    tensors = get_device_tensors(device)
    generator = torch.Generator(device=device)
    generator.manual_seed(seed)

    counts = tensors["initial_counts"].unsqueeze(0).repeat(batch_size, 1)
    health = counts.to(torch.float32) * tensors["health"].unsqueeze(0)
    buffs = torch.ones((batch_size, len(UNIT_ORDER)), device=device, dtype=torch.float32)
    turn_counter = torch.zeros(batch_size, device=device, dtype=torch.int64)
    zombies_original = int(ENEMY_COUNTS["zombies"])
    corpses_revenge = math.ceil(ENEMY_COUNTS["corpses"] * 10 * 0.2)

    for round_no in range(1, int(CONFIG["max_rounds"]) + 1):
        enemy_alive = torch.any(counts[:, ENEMY_IDX] > 0, dim=1)
        ally_alive = torch.any(counts[:, ALLY_IDX] > 0, dim=1)
        battle_active = enemy_alive & ally_alive
        if not torch.any(battle_active):
            break

        turn_counter.zero_()
        banshee_reduce_target = torch.full((batch_size,), -1, device=device, dtype=torch.int64)

        for attacker_idx in ATTACKER_ORDER:
            active = battle_active & (counts[:, attacker_idx] > 0)
            if not torch.any(active):
                continue

            active_rows = torch.nonzero(active, as_tuple=False).squeeze(1)
            sub_counts = counts[active_rows]
            sub_health = health[active_rows]
            defender_idx = pick_defender(attacker_idx, sub_counts, sub_health, round_no, device)
            valid = defender_idx >= 0
            if not torch.any(valid):
                continue

            rows = active_rows[valid]
            defender_idx = defender_idx[valid]
            before_counts = counts[rows].clone()
            turn_counter[rows] += 1

            mult = apply_type_multiplier(attacker_idx, defender_idx, counts[rows])

            if attacker_idx == IDX["bonewings"]:
                mult = torch.where(turn_counter[rows] == 1, mult * 1.2, mult)

            if attacker_idx in (IDX["bats"], IDX["banshees"], IDX["necromancers"]) and torch.any(counts[rows, IDX["revenants"]] > 0):
                mult = torch.where(counts[rows, IDX["revenants"]] > 0, mult * 0.85, mult)

            if attacker_idx == IDX["bats"] and round_no == 1:
                mult = mult * 1.25

            if attacker_idx == IDX["thralls"]:
                defender_speed = tensors["speed"][defender_idx].to(torch.int64)
                mult = torch.where(defender_speed < 3, mult * 1.33, mult)

            if attacker_idx == IDX["banshees"]:
                banshee_reduce_target[rows] = defender_idx

            mult = torch.where(banshee_reduce_target[rows] == attacker_idx, mult * 0.75, mult)

            attacker_counts = counts[rows, attacker_idx].to(torch.float32)
            damage = ceil_combat(attacker_counts * tensors["attack"][attacker_idx] * mult * buffs[rows, attacker_idx])

            health[rows, defender_idx] = torch.clamp(health[rows, defender_idx] - damage, min=0.0)
            defender_health_per_unit = tensors["health"][defender_idx].to(torch.float32)
            counts[rows, defender_idx] = torch.ceil(health[rows, defender_idx] / defender_health_per_unit).to(torch.int64)

            zombies_were_killed = (
                (before_counts[:, IDX["zombies"]] > counts[rows, IDX["zombies"]])
                & (counts[rows, IDX["zombies"]] == 0)
            )
            if torch.any(zombies_were_killed):
                zrows = rows[zombies_were_killed]
                counts[zrows, IDX["revived_zombies"]] = zombies_original
                health[zrows, IDX["revived_zombies"]] = float(zombies_original) * tensors["health"][IDX["revived_zombies"]]

            if attacker_idx == IDX["cultists"] and torch.any(counts[rows, IDX["cultists"]] > 0):
                target_idx = sample_alive_enemy_target(counts[rows], device, generator)
                has_target = target_idx >= 0
                if torch.any(has_target):
                    target_rows = rows[has_target]
                    target_idx = target_idx[has_target]
                    buffs[target_rows, target_idx] += 0.1

            corpses_were_killed = (
                (before_counts[:, IDX["corpses"]] > counts[rows, IDX["corpses"]])
                & (counts[rows, IDX["corpses"]] == 0)
            )
            if torch.any(corpses_were_killed):
                crows = rows[corpses_were_killed]
                health[crows, attacker_idx] = torch.clamp(health[crows, attacker_idx] - corpses_revenge, min=0.0)
                counts[crows, attacker_idx] = torch.ceil(health[crows, attacker_idx] / tensors["health"][attacker_idx]).to(torch.int64)

            if torch.any(counts[rows, IDX["necromancers"]] > 0):
                after_counts = counts[rows]
                destroyed = (before_counts > 0) & (after_counts == 0)
                destroyed_count = torch.sum(destroyed.to(torch.int64), dim=1).to(torch.float32)
                has_necro = counts[rows, IDX["necromancers"]] > 0
                buffs[rows, IDX["necromancers"]] += torch.where(has_necro, destroyed_count * 0.1, 0.0)

    enemy_alive = torch.any(counts[:, ENEMY_IDX] > 0, dim=1)
    ally_alive = torch.any(counts[:, ALLY_IDX] > 0, dim=1)
    winners = torch.where(ally_alive & ~enemy_alive, 1, 0).to(torch.int64)
    ally_losses = tensors["initial_counts"][ALLY_IDX].unsqueeze(0) - counts[:, ALLY_IDX]
    return winners.detach().cpu().numpy(), ally_losses.detach().cpu().numpy()


def format_outcome_row(row_key: Tuple[int, int, int, int, int, int], total: int) -> Dict[str, str]:
    winner = "Zafer" if row_key[0] == 1 else "Maglubiyet"
    losses = dict(zip(ALLY_KEYS, row_key[1:]))
    loss_blood = sum(losses[key] * ALLY_BLOOD[key] for key in ALLY_KEYS)
    losses_text = ", ".join(f"{key}:{value}" for key, value in losses.items() if value > 0) or "kayip yok"
    return {
        "winner": winner,
        "prob": f"%{(total * 100):.4f}",
        "blood": str(loss_blood),
        "losses": losses_text,
    }


def build_live_html(
    outcome_counter: Counter,
    processed_samples: int,
    elapsed: float,
    device: torch.device,
) -> str:
    rows = []
    for rank, (key, count) in enumerate(outcome_counter.most_common(int(CONFIG["top_result_count"])), start=1):
        formatted = format_outcome_row(key, count / max(processed_samples, 1))
        rows.append(
            "<tr>"
            f"<td>{rank}</td>"
            f"<td>{formatted['winner']}</td>"
            f"<td>{count:,}</td>"
            f"<td>{formatted['prob']}</td>"
            f"<td>{formatted['blood']}</td>"
            f"<td>{escape(formatted['losses'])}</td>"
            "</tr>"
        )

    if not rows:
        rows.append("<tr><td colspan='6'>Henuz sonuc yok.</td></tr>")

    return f"""
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">
      <div style="margin: 0 0 12px 0;">
        <strong>Cihaz:</strong> {escape(str(device))} |
        <strong>Islenen sample:</strong> {processed_samples:,} |
        <strong>Sure:</strong> {elapsed:0.1f}s |
        <strong>Samples/s:</strong> {processed_samples / max(elapsed, 1e-9):,.0f}
      </div>
      <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
        <thead>
          <tr>
            <th style="text-align:left; border-bottom:1px solid #888; padding:4px;">#</th>
            <th style="text-align:left; border-bottom:1px solid #888; padding:4px;">Sonuc</th>
            <th style="text-align:left; border-bottom:1px solid #888; padding:4px;">Adet</th>
            <th style="text-align:left; border-bottom:1px solid #888; padding:4px;">Olasilik</th>
            <th style="text-align:left; border-bottom:1px solid #888; padding:4px;">Kan Kaybi</th>
            <th style="text-align:left; border-bottom:1px solid #888; padding:4px;">Kaybedilen Birlikler</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows)}
        </tbody>
      </table>
    </div>
    """


def aggregate_chunk(outcome_counter: Counter, winners: np.ndarray, ally_losses: np.ndarray) -> None:
    joined = np.concatenate([winners.reshape(-1, 1), ally_losses], axis=1)
    unique_rows, counts = np.unique(joined, axis=0, return_counts=True)
    for row, count in zip(unique_rows, counts):
        outcome_counter[tuple(int(value) for value in row.tolist())] += int(count)


def print_final_summary(outcome_counter: Counter, total_samples: int, elapsed: float) -> None:
    print("")
    print("NIHAI TOP 10 OUTCOME")
    print(f"Toplam sample: {total_samples:,}")
    print(f"Toplam sure: {elapsed:0.2f}s")
    print("")
    for rank, (key, count) in enumerate(outcome_counter.most_common(int(CONFIG["top_result_count"])), start=1):
        winner = "Zafer" if key[0] == 1 else "Maglubiyet"
        losses = dict(zip(ALLY_KEYS, key[1:]))
        loss_blood = sum(losses[name] * ALLY_BLOOD[name] for name in ALLY_KEYS)
        prob = count / max(total_samples, 1)
        losses_text = ", ".join(f"{name}:{value}" for name, value in losses.items() if value > 0) or "kayip yok"
        print(
            f"{rank:>2}. {winner:<10} | olasilik=%{prob * 100:0.4f} | adet={count:,} | kan={loss_blood} | {losses_text}"
        )


def main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

    print(f"Cihaz: {device}")
    if device.type == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"GPU: {gpu_name} | VRAM: {gpu_mem:0.1f} GB")
    else:
        print("CUDA bulunamadi; script CPU'da calisacak.")

    total_samples = int(CONFIG["num_samples"])
    chunk_size = int(CONFIG["chunk_size"])
    num_chunks = math.ceil(total_samples / chunk_size)
    outcome_counter: Counter = Counter()
    processed = 0
    start_time = time.time()

    live_display = display(HTML(build_live_html(outcome_counter, 0, 0.0, device)), display_id=True)
    progress = tqdm(total=total_samples, desc="GPU outcome taramasi", unit="sample")

    for chunk_index in range(num_chunks):
        this_chunk = min(chunk_size, total_samples - processed)
        chunk_seed = int(CONFIG["seed"]) + chunk_index * 10_000_019
        winners, ally_losses = simulate_chunk(this_chunk, chunk_seed, device)
        aggregate_chunk(outcome_counter, winners, ally_losses)
        processed += this_chunk
        progress.update(this_chunk)

        if ((chunk_index + 1) % int(CONFIG["report_every_chunks"])) == 0:
            live_display.update(HTML(build_live_html(outcome_counter, processed, time.time() - start_time, device)))

    progress.close()
    elapsed = time.time() - start_time
    live_display.update(HTML(build_live_html(outcome_counter, processed, elapsed, device)))
    print_final_summary(outcome_counter, processed, elapsed)


if __name__ == "__main__":
    main()
