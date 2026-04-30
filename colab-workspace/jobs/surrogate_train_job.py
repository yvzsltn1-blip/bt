import json
import math
import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
RUNS_DIR = Path(os.environ.get("BT_COLAB_RUNS_DIR", ROOT_DIR / "colab-workspace" / "runs"))
JOB_ID = os.environ.get("BT_COLAB_JOB_ID", "unknown-job")


def load_job_args():
    raw = os.environ.get("BT_COLAB_JOB_ARGS", "{}")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("BT_COLAB_JOB_ARGS must decode to a JSON object.")
    return payload


def load_rows(dataset_path):
    rows = []
    with open(dataset_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    if not rows:
        raise ValueError(f"Dataset is empty: {dataset_path}")
    return rows


def build_features(rows):
    import torch

    features = []
    win_targets = []
    blood_targets = []

    max_stage = max(float(row.get("stage", 1)) for row in rows)
    max_points = max(float(row.get("pointLimit", 1)) for row in rows)
    max_blood = max(float(row.get("lostBloodTotal", 0)) for row in rows)

    for row in rows:
        enemy_vector = [float(value) for value in row.get("enemyVector", [])]
        ally_vector = [float(value) for value in row.get("allyVector", [])]
        feature_row = [
            float(row.get("stage", 1)) / max(1.0, max_stage),
            float(row.get("pointLimit", 0)) / max(1.0, max_points),
            float(row.get("usedPoints", 0)) / max(1.0, max_points),
            *enemy_vector,
            *ally_vector,
        ]
        features.append(feature_row)
        win_targets.append([float(row.get("winLabel", 0))])
        blood_targets.append([float(row.get("lostBloodTotal", 0)) / max(1.0, max_blood)])

    return {
        "x": torch.tensor(features, dtype=torch.float32),
        "y_win": torch.tensor(win_targets, dtype=torch.float32),
        "y_blood": torch.tensor(blood_targets, dtype=torch.float32),
        "feature_count": len(features[0]),
        "max_stage": max_stage,
        "max_points": max_points,
        "max_blood": max_blood,
    }


class SurrogateModel:
    def __init__(self, input_size, hidden_sizes):
        import torch.nn as nn

        layers = []
        last_size = input_size
        for hidden_size in hidden_sizes:
            layers.append(nn.Linear(last_size, hidden_size))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(0.05))
            last_size = hidden_size
        self.backbone = nn.Sequential(*layers)
        self.win_head = nn.Linear(last_size, 1)
        self.blood_head = nn.Linear(last_size, 1)

    def to_module(self):
        import torch.nn as nn

        backbone = self.backbone
        win_head = self.win_head
        blood_head = self.blood_head

        class Module(nn.Module):
            def __init__(self):
                super().__init__()
                self.backbone = backbone
                self.win_head = win_head
                self.blood_head = blood_head

            def forward(self, x):
                base = self.backbone(x)
                return self.win_head(base), self.blood_head(base)

        return Module()


def split_tensors(tensors, val_ratio):
    import torch

    total = tensors["x"].shape[0]
    order = torch.randperm(total)
    val_count = max(1, int(total * val_ratio))
    train_idx = order[val_count:]
    val_idx = order[:val_count]
    return {
        "train": {
            "x": tensors["x"][train_idx],
            "y_win": tensors["y_win"][train_idx],
            "y_blood": tensors["y_blood"][train_idx],
        },
        "val": {
            "x": tensors["x"][val_idx],
            "y_win": tensors["y_win"][val_idx],
            "y_blood": tensors["y_blood"][val_idx],
        }
    }


def evaluate(model, split, device):
    import torch
    import torch.nn.functional as F

    model.eval()
    with torch.no_grad():
        x = split["x"].to(device)
        y_win = split["y_win"].to(device)
        y_blood = split["y_blood"].to(device)
        win_logits, blood_pred = model(x)
        win_loss = F.binary_cross_entropy_with_logits(win_logits, y_win)
        blood_loss = F.smooth_l1_loss(torch.sigmoid(blood_pred), y_blood)
        win_accuracy = ((torch.sigmoid(win_logits) >= 0.5) == (y_win >= 0.5)).float().mean().item()
    return {
        "loss": float((win_loss + blood_loss).item()),
        "win_loss": float(win_loss.item()),
        "blood_loss": float(blood_loss.item()),
        "win_accuracy": win_accuracy,
    }


def main():
    import torch
    import torch.nn.functional as F

    args = load_job_args()
    dataset_value = str(args.get("datasetPath") or args.get("dataset_path") or "").strip()
    if not dataset_value:
        raise ValueError("datasetPath is required.")
    dataset_path = Path(dataset_value)
    if not dataset_path.is_absolute():
        dataset_path = (ROOT_DIR / dataset_path).resolve()
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    rows = load_rows(dataset_path)
    if len(rows) < 2:
        raise ValueError("Dataset must contain at least 2 rows for train/validation split.")
    tensors = build_features(rows)
    splits = split_tensors(tensors, float(args.get("valRatio", 0.1)))

    hidden_sizes = args.get("hiddenSizes") or [128, 128, 64]
    hidden_sizes = [int(size) for size in hidden_sizes]
    epochs = max(1, int(args.get("epochs", 12)))
    batch_size = max(16, int(args.get("batchSize", 512)))
    learning_rate = float(args.get("learningRate", 1e-3))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = SurrogateModel(tensors["feature_count"], hidden_sizes).to_module().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    train_x = splits["train"]["x"]
    train_y_win = splits["train"]["y_win"]
    train_y_blood = splits["train"]["y_blood"]
    steps_per_epoch = max(1, math.ceil(train_x.shape[0] / batch_size))
    history = []

    for epoch in range(1, epochs + 1):
        model.train()
        order = torch.randperm(train_x.shape[0])
        epoch_loss = 0.0
        for step in range(steps_per_epoch):
            start = step * batch_size
            end = min(train_x.shape[0], start + batch_size)
            batch_idx = order[start:end]
            x = train_x[batch_idx].to(device)
            y_win = train_y_win[batch_idx].to(device)
            y_blood = train_y_blood[batch_idx].to(device)

            optimizer.zero_grad()
            win_logits, blood_pred = model(x)
            win_loss = F.binary_cross_entropy_with_logits(win_logits, y_win)
            blood_loss = F.smooth_l1_loss(torch.sigmoid(blood_pred), y_blood)
            loss = win_loss + blood_loss
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.item())

        val_metrics = evaluate(model, splits["val"], device)
        history.append({
            "epoch": epoch,
            "train_loss": epoch_loss / steps_per_epoch,
            **val_metrics,
        })

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = RUNS_DIR / f"surrogate-model-{JOB_ID}.pt"
    metrics_path = RUNS_DIR / f"surrogate-metrics-{JOB_ID}.json"

    torch.save({
        "state_dict": model.state_dict(),
        "feature_count": tensors["feature_count"],
        "hidden_sizes": hidden_sizes,
        "max_stage": tensors["max_stage"],
        "max_points": tensors["max_points"],
        "max_blood": tensors["max_blood"],
    }, model_path)

    metrics = {
        "ok": True,
        "job_id": JOB_ID,
        "datasetPath": str(dataset_path),
        "modelPath": str(model_path),
        "metricsPath": str(metrics_path),
        "device": str(device),
        "rowCount": len(rows),
        "epochs": epochs,
        "batchSize": batch_size,
        "learningRate": learning_rate,
        "hiddenSizes": hidden_sizes,
        "finalValidation": history[-1] if history else {},
        "history": history[-5:],
    }

    with metrics_path.open("w", encoding="utf-8") as handle:
        json.dump(metrics, handle, ensure_ascii=True, indent=2)

    print(json.dumps(metrics, ensure_ascii=True))


if __name__ == "__main__":
    main()
