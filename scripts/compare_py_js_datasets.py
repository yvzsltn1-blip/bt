import contextlib
import io
import pathlib
import re
from dataclasses import dataclass


ROOT = pathlib.Path(__file__).resolve().parents[1]
PY_SIM_PATH = pathlib.Path(r"C:\Users\YAVUZ\Downloads\simulate_vampire_v5.1.py")
WRONG_PATH = ROOT / "sonuc-arsivi" / "yanlislar.txt"
RIGHT_PATH = ROOT / "sonuc-arsivi" / "dogrular.txt"

ALLY_ORDER = [
    ("bats", "bats"),
    ("ghouls", "ghouls"),
    ("vampire thralls", "thralls"),
    ("banshees", "banshees"),
    ("necromancers", "necromancers"),
    ("gargoyles", "gargoyles"),
    ("blood witches", "witches"),
    ("rotmaws", "rotmaws"),
]

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

ALLY_KEYS = [key for _, key in ALLY_ORDER]


@dataclass
class Case:
    dataset: str
    case_id: int
    enemy: list[int]
    ally: list[int]
    expected_losses: list[int]
    expected_blood: int
    actual_losses: list[int]
    actual_blood: int


def parse_vector(text: str, pattern: str) -> list[int]:
    match = re.search(pattern, text)
    if not match:
        raise ValueError(f"Pattern not found: {pattern}")
    return [int(part) for part in match.group(1).split("-")]


def parse_int(text: str, pattern: str) -> int:
    match = re.search(pattern, text)
    if not match:
        raise ValueError(f"Pattern not found: {pattern}")
    return int(match.group(1))


def parse_wrong_cases() -> list[Case]:
    text = WRONG_PATH.read_text(encoding="utf-8")
    blocks = text.split("\nRapor ")
    cases: list[Case] = []
    for block in blocks[1:]:
        header, body = block.split("\n", 1)
        case_id = int(header.split()[0])
        enemy = parse_vector(body, r"Rakip dizilis \(T1-T10\):\s*([\d-]+)")
        ally = parse_vector(body, r"Bizim dizilis \(T1-T8\):\s*([\d-]+)")
        expected_losses = parse_vector(body, r"Beklenen kayiplar \(T1-T8\):\s*([\d-]+)")
        actual_losses = parse_vector(body, r"Gercek kayiplar \(T1-T8\):\s*([\d-]+)")
        expected_blood = parse_int(body, r"Beklenen toplam kan kaybi:\s*(\d+)")
        actual_blood = parse_int(body, r"Gercek toplam kan kaybi:\s*(\d+)")
        cases.append(
            Case(
                dataset="wrong",
                case_id=case_id,
                enemy=enemy,
                ally=ally,
                expected_losses=expected_losses,
                expected_blood=expected_blood,
                actual_losses=actual_losses,
                actual_blood=actual_blood,
            )
        )
    return cases


def parse_right_cases() -> list[Case]:
    text = RIGHT_PATH.read_text(encoding="utf-8")
    blocks = text.split("\nKayit ")
    cases: list[Case] = []
    for block in blocks[1:]:
        header, body = block.split("\n", 1)
        case_id = int(header.split()[0])
        enemy = parse_vector(body, r"Rakip dizilis \(T1-T10\):\s*([\d-]+)")
        ally = parse_vector(body, r"Bizim dizilis \(T1-T8\):\s*([\d-]+)")
        expected_losses = parse_vector(body, r"Beklenen kayiplar \(T1-T8\):\s*([\d-]+)")
        expected_blood = parse_int(body, r"Beklenen toplam kan kaybi:\s*(\d+)")
        cases.append(
            Case(
                dataset="right",
                case_id=case_id,
                enemy=enemy,
                ally=ally,
                expected_losses=expected_losses,
                expected_blood=expected_blood,
                actual_losses=expected_losses,
                actual_blood=expected_blood,
            )
        )
    return cases


def render_sim_source(case: Case, source: str) -> str:
    replacements = {key: value for key, value in zip(ENEMY_KEYS, case.enemy)}
    replacements.update({key: value for key, value in zip(ALLY_KEYS, case.ally)})
    rendered = source
    for key, value in replacements.items():
        rendered = re.sub(rf"^{key}\s*=\s*\d+", f"{key:<20}= {value:2d}", rendered, flags=re.M)
    return rendered


def run_python_sim(case: Case, source: str) -> tuple[str, int, list[int]]:
    sim_source = render_sim_source(case, source)
    scope = {"__name__": "__main__"}
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        exec(compile(sim_source, str(PY_SIM_PATH), "exec"), scope, scope)
    output = stdout.getvalue()
    winner = "enemy" if "ally lost" in output else ("ally" if "enemy lost" in output else "unknown")
    blood = parse_int(output, r"=\s*\d+\s+total\s+\(\s*(\d+)\s+blood\)")
    losses_by_key = {key: 0 for key in ALLY_KEYS}
    for line in output.splitlines():
        match = re.match(r"-\s*(\d+)\s+(.+?)\s+\(\s*\d+\s+blood\)", line)
        if not match:
            continue
        count = int(match.group(1))
        label = match.group(2).strip()
        for unit_label, unit_key in ALLY_ORDER:
            if unit_label == label:
                losses_by_key[unit_key] = count
                break
    losses = [losses_by_key[key] for key in ALLY_KEYS]
    return winner, blood, losses


def loss_diff(left: list[int], right: list[int]) -> int:
    return sum(abs(a - b) for a, b in zip(left, right))


def expected_winner(ally_counts: list[int], losses: list[int]) -> str:
    return "enemy" if list(ally_counts) == list(losses) else "ally"


def main() -> None:
    source = PY_SIM_PATH.read_text(encoding="utf-8")
    wrong_cases = parse_wrong_cases()
    right_cases = parse_right_cases()

    right_exact = 0
    right_failures = []
    for case in right_cases:
        winner, blood, losses = run_python_sim(case, source)
        exact = (
            winner == expected_winner(case.ally, case.expected_losses)
            and blood == case.expected_blood
            and losses == case.expected_losses
        )
        if exact:
            right_exact += 1
        else:
            right_failures.append(
                {
                    "id": case.case_id,
                    "winner": winner,
                    "blood": blood,
                    "expected_blood": case.expected_blood,
                    "losses": losses,
                    "expected_losses": case.expected_losses,
                    "loss_diff": loss_diff(losses, case.expected_losses),
                }
            )

    wrong_exact_actual = 0
    wrong_better_than_js = 0
    wrong_same_as_js = 0
    wrong_worse_than_js = 0
    wrong_details = []
    for case in wrong_cases:
        winner, blood, losses = run_python_sim(case, source)
        py_diff = loss_diff(losses, case.actual_losses)
        js_diff = loss_diff(case.expected_losses, case.actual_losses)
        if (
            winner == expected_winner(case.ally, case.actual_losses)
            and blood == case.actual_blood
            and losses == case.actual_losses
        ):
            wrong_exact_actual += 1
        if py_diff < js_diff:
            wrong_better_than_js += 1
        elif py_diff > js_diff:
            wrong_worse_than_js += 1
        else:
            wrong_same_as_js += 1
        wrong_details.append(
            {
                "id": case.case_id,
                "winner": winner,
                "blood": blood,
                "actual_blood": case.actual_blood,
                "losses": losses,
                "actual_losses": case.actual_losses,
                "js_losses": case.expected_losses,
                "py_diff": py_diff,
                "js_diff": js_diff,
                "blood_diff": abs(blood - case.actual_blood),
            }
        )

    print(f"RIGHT exact: {right_exact}/{len(right_cases)}")
    print(f"RIGHT failures: {len(right_failures)}")
    for item in right_failures[:15]:
        print(
            "RIGHT_FAIL",
            item["id"],
            item["winner"],
            item["blood"],
            item["expected_blood"],
            "-".join(map(str, item["losses"])),
            "-".join(map(str, item["expected_losses"])),
            item["loss_diff"],
        )

    print(f"WRONG exact actual: {wrong_exact_actual}/{len(wrong_cases)}")
    print(f"WRONG better/same/worse vs JS: {wrong_better_than_js}/{wrong_same_as_js}/{wrong_worse_than_js}")
    for item in wrong_details:
        print(
            "WRONG_CASE",
            item["id"],
            item["winner"],
            item["blood"],
            item["actual_blood"],
            "-".join(map(str, item["losses"])),
            "-".join(map(str, item["actual_losses"])),
            "-".join(map(str, item["js_losses"])),
            item["py_diff"],
            item["js_diff"],
            item["blood_diff"],
        )


if __name__ == "__main__":
    main()
