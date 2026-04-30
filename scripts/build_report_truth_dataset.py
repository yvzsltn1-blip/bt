import argparse
import json
import re
from collections import Counter
from pathlib import Path


ENTRY_SPLIT_RE = re.compile(r"\n(?=(?:Rapor|Kayit) \d+ \[)")
ENTRY_HEADER_RE = re.compile(r"^(?:Rapor|Kayit) \d+ \[", re.M)


def parse_line(block, label):
    match = re.search(label + r":\s*([^\n]+)", block)
    return match.group(1).strip() if match else None


def parse_counts(raw, expected_len):
    values = [int(part) for part in raw.split("-")]
    if len(values) != expected_len:
        raise ValueError(f"Expected {expected_len} values, got {len(values)} from: {raw}")
    return values


def parse_report_file(path, label):
    text = Path(path).read_text(encoding="utf-8")
    rows = []
    for block in ENTRY_SPLIT_RE.split(text):
        if not ENTRY_HEADER_RE.search(block):
            continue
        enemy = parse_line(block, r"Rakip dizilis \(T1-T10\)")
        ally = parse_line(block, r"Bizim dizilis \(T1-T8\)")
        expected = parse_line(block, r"Beklenen kayiplar \(T1-T8\)")
        actual = parse_line(block, r"Gercek kayiplar \(T1-T8\)")
        expected_blood = parse_line(block, r"Beklenen toplam kan kaybi")
        actual_blood = parse_line(block, r"Gercek toplam kan kaybi")
        created_at = parse_line(block, r"Tarih")
        if not all([enemy, ally, expected, actual, expected_blood, actual_blood]):
            continue

        ally_counts = parse_counts(ally, 8)
        expected_losses = parse_counts(expected, 8)
        actual_losses = parse_counts(actual, 8)
        loss_diff = [actual_value - expected_value for actual_value, expected_value in zip(actual_losses, expected_losses)]

        rows.append({
            "label": label,
            "reportedAt": created_at,
            "enemyCounts": parse_counts(enemy, 10),
            "allyCounts": ally_counts,
            "expectedLosses": expected_losses,
            "actualLosses": actual_losses,
            "lossDiff": loss_diff,
            "expectedBlood": int(expected_blood),
            "actualBlood": int(actual_blood),
            "bloodDiff": int(actual_blood) - int(expected_blood),
            "wrongFlag": 1 if label == "wrong" else 0,
        })
    return rows


def build_summary(rows):
    wrong_rows = [row for row in rows if row["wrongFlag"] == 1]
    correct_rows = [row for row in rows if row["wrongFlag"] == 0]

    tier_error_counter = Counter()
    enemy_presence_wrong = Counter()
    enemy_presence_correct = Counter()
    ally_presence_wrong = Counter()
    ally_presence_correct = Counter()

    for row in wrong_rows:
        for index, value in enumerate(row["lossDiff"], start=1):
            if value != 0:
                tier_error_counter[index] += 1
        for index, value in enumerate(row["enemyCounts"], start=1):
            if value > 0:
                enemy_presence_wrong[index] += 1
        for index, value in enumerate(row["allyCounts"], start=1):
            if value > 0:
                ally_presence_wrong[index] += 1

    for row in correct_rows:
        for index, value in enumerate(row["enemyCounts"], start=1):
            if value > 0:
                enemy_presence_correct[index] += 1
        for index, value in enumerate(row["allyCounts"], start=1):
            if value > 0:
                ally_presence_correct[index] += 1

    wrong_blood_diffs = [row["bloodDiff"] for row in wrong_rows] or [0]
    return {
        "rowCount": len(rows),
        "wrongCount": len(wrong_rows),
        "correctCount": len(correct_rows),
        "wrongBloodDiffAvg": sum(wrong_blood_diffs) / len(wrong_blood_diffs),
        "wrongBloodDiffMin": min(wrong_blood_diffs),
        "wrongBloodDiffMax": max(wrong_blood_diffs),
        "wrongLossTierCounts": dict(sorted(tier_error_counter.items())),
        "enemyPresenceWrong": dict(sorted(enemy_presence_wrong.items())),
        "enemyPresenceCorrect": dict(sorted(enemy_presence_correct.items())),
        "allyPresenceWrong": dict(sorted(ally_presence_wrong.items())),
        "allyPresenceCorrect": dict(sorted(ally_presence_correct.items())),
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Build combined wrong/correct report dataset from text exports.")
    parser.add_argument("--wrong", required=True, help="Path to yanlis.txt")
    parser.add_argument("--correct", required=True, help="Path to dogru.txt")
    parser.add_argument("--output-jsonl", required=True, help="Target JSONL path")
    parser.add_argument("--output-summary", required=True, help="Target summary JSON path")
    return parser.parse_args()


def main():
    args = parse_args()
    wrong_rows = parse_report_file(args.wrong, "wrong")
    correct_rows = parse_report_file(args.correct, "correct")
    rows = wrong_rows + correct_rows

    output_jsonl = Path(args.output_jsonl)
    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with output_jsonl.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    summary = build_summary(rows)
    output_summary = Path(args.output_summary)
    output_summary.parent.mkdir(parents=True, exist_ok=True)
    output_summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "outputJsonl": str(output_jsonl),
        "outputSummary": str(output_summary),
        **summary,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
