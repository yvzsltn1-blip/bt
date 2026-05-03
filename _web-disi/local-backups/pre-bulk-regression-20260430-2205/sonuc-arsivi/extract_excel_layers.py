import json
from pathlib import Path

import openpyxl


ROOT_DIR = Path(__file__).resolve().parent
WORKBOOK_PATH = ROOT_DIR / "_v21-101.xlsx"
EXPORT_PATH = ROOT_DIR / "layers_1_101_export.json"


def num(value):
    if value in (None, "", "-"):
        return 0
    return int(value)


def main():
    workbook = openpyxl.load_workbook(WORKBOOK_PATH, data_only=True)
    sheet = workbook["Layers 1->101"]
    rows = []

    for row in sheet.iter_rows(min_row=2, values_only=True):
        layer = row[0]
        if not isinstance(layer, int):
            continue
        rows.append(
            {
                "layer": int(layer),
                "armyPower": num(row[1]),
                "armyPowerUsed": num(row[2]),
                "allyCounts": [num(value) for value in row[3:11]],
                "frontlineEnemies": str(row[12] or "").strip(),
                "backlineEnemies": str(row[13] or "").strip(),
                "totalEnemies": num(row[14]),
                "expectedLosses": [num(value) for value in row[15:23]],
                "expectedLostBlood": num(row[23]),
            }
        )

    EXPORT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf8")
    print(
        json.dumps(
            {
                "exportPath": str(EXPORT_PATH),
                "rowCount": len(rows),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
