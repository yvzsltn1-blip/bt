import json
import math
import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
RUNS_DIR = Path(os.environ.get("BT_COLAB_RUNS_DIR", ROOT_DIR / "colab-workspace" / "runs"))
JOB_ID = os.environ.get("BT_COLAB_JOB_ID", "unknown-job")


FEATURE_NAMES = (
    [f"enemy_t{i}" for i in range(1, 11)]
    + [f"ally_t{i}" for i in range(1, 9)]
    + [f"expected_loss_rate_t{i}" for i in range(1, 9)]
    + ["expected_blood_norm"]
)


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


def build_feature_matrix(rows):
    import torch

    max_enemy = [max(float(row["enemyCounts"][index]) for row in rows) for index in range(10)]
    max_ally = [max(float(row["allyCounts"][index]) for row in rows) for index in range(8)]
    max_expected_blood = max(float(row.get("expectedBlood", 0)) for row in rows)

    features = []
    labels = []

    for row in rows:
        enemy = [
            float(row["enemyCounts"][index]) / max(1.0, max_enemy[index])
            for index in range(10)
        ]
        ally = [
            float(row["allyCounts"][index]) / max(1.0, max_ally[index])
            for index in range(8)
        ]
        expected_loss_rate = []
        for index in range(8):
            ally_count = float(row["allyCounts"][index])
            expected_loss = float(row["expectedLosses"][index])
            expected_loss_rate.append(expected_loss / max(1.0, ally_count))
        expected_blood = float(row.get("expectedBlood", 0)) / max(1.0, max_expected_blood)

        features.append(enemy + ally + expected_loss_rate + [expected_blood])
        labels.append(float(row["wrongFlag"]))

    return {
        "x": torch.tensor(features, dtype=torch.float32),
        "y": torch.tensor(labels, dtype=torch.float32).unsqueeze(1),
        "maxEnemy": max_enemy,
        "maxAlly": max_ally,
        "maxExpectedBlood": max_expected_blood,
    }


def stratified_split(labels, val_ratio, seed):
    import torch

    wrong_idx = torch.nonzero(labels.squeeze(1) >= 0.5, as_tuple=False).squeeze(1)
    correct_idx = torch.nonzero(labels.squeeze(1) < 0.5, as_tuple=False).squeeze(1)

    generator = torch.Generator().manual_seed(seed)
    wrong_idx = wrong_idx[torch.randperm(len(wrong_idx), generator=generator)]
    correct_idx = correct_idx[torch.randperm(len(correct_idx), generator=generator)]

    wrong_val = max(1, int(len(wrong_idx) * val_ratio))
    correct_val = max(1, int(len(correct_idx) * val_ratio))

    val_idx = torch.cat([wrong_idx[:wrong_val], correct_idx[:correct_val]])
    train_idx = torch.cat([wrong_idx[wrong_val:], correct_idx[correct_val:]])
    return train_idx, val_idx


def binary_auc(y_true, y_score):
    positives = [(score, label) for score, label in zip(y_score, y_true) if label == 1]
    negatives = [(score, label) for score, label in zip(y_score, y_true) if label == 0]
    if not positives or not negatives:
        return 0.5
    wins = 0.0
    total = 0.0
    for pos_score, _ in positives:
        for neg_score, _ in negatives:
            total += 1.0
            if pos_score > neg_score:
                wins += 1.0
            elif pos_score == neg_score:
                wins += 0.5
    return wins / max(1.0, total)


def evaluate(model, x, y, device):
    import torch
    import torch.nn.functional as F

    model.eval()
    with torch.no_grad():
        logits = model(x.to(device))
        loss = F.binary_cross_entropy_with_logits(logits, y.to(device))
        probs = torch.sigmoid(logits).cpu().squeeze(1)
        y_cpu = y.cpu().squeeze(1)
        preds = (probs >= 0.5).float()
        accuracy = (preds == y_cpu).float().mean().item()
        true_positive = float(((preds == 1) & (y_cpu == 1)).sum().item())
        false_positive = float(((preds == 1) & (y_cpu == 0)).sum().item())
        false_negative = float(((preds == 0) & (y_cpu == 1)).sum().item())
        precision = true_positive / max(1.0, true_positive + false_positive)
        recall = true_positive / max(1.0, true_positive + false_negative)
        auc = binary_auc(y_cpu.tolist(), probs.tolist())
    return {
        "loss": float(loss.item()),
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "auc": float(auc),
    }


def train_once(x, y, seed, epochs, learning_rate, val_ratio, device):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    train_idx, val_idx = stratified_split(y, val_ratio, seed)
    train_x = x[train_idx].to(device)
    train_y = y[train_idx].to(device)
    val_x = x[val_idx]
    val_y = y[val_idx]

    model = nn.Linear(x.shape[1], 1).to(device)
    wrong_count = float(train_y.sum().item())
    correct_count = float(train_y.shape[0] - wrong_count)
    pos_weight = torch.tensor([correct_count / max(1.0, wrong_count)], dtype=torch.float32, device=device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    for _ in range(epochs):
        model.train()
        optimizer.zero_grad()
        logits = model(train_x)
        loss = F.binary_cross_entropy_with_logits(logits, train_y, pos_weight=pos_weight)
        loss.backward()
        optimizer.step()

    metrics = evaluate(model, val_x, val_y, device)
    weights = model.weight.detach().cpu().squeeze(0)
    bias = float(model.bias.detach().cpu().item())
    return model, metrics, weights, bias


def train_final_model(x, y, epochs, learning_rate, device):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    model = nn.Linear(x.shape[1], 1).to(device)
    wrong_count = float(y.sum().item())
    correct_count = float(y.shape[0] - wrong_count)
    pos_weight = torch.tensor([correct_count / max(1.0, wrong_count)], dtype=torch.float32, device=device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    train_x = x.to(device)
    train_y = y.to(device)

    for _ in range(epochs):
        model.train()
        optimizer.zero_grad()
        logits = model(train_x)
        loss = F.binary_cross_entropy_with_logits(logits, train_y, pos_weight=pos_weight)
        loss.backward()
        optimizer.step()
    return model


def summarize_weights(model):
    import torch

    weights = model.weight.detach().cpu().squeeze(0)
    top_indices = torch.argsort(weights, descending=True)[:10].tolist()
    top_negative_indices = torch.argsort(weights, descending=False)[:10].tolist()
    return {
        "topPositive": [
            {"feature": FEATURE_NAMES[index], "weight": float(weights[index].item())}
            for index in top_indices
        ],
        "topNegative": [
            {"feature": FEATURE_NAMES[index], "weight": float(weights[index].item())}
            for index in top_negative_indices
        ],
    }


def main():
    import torch

    args = load_job_args()
    dataset_value = str(args.get("datasetPath") or "").strip()
    if not dataset_value:
        raise ValueError("datasetPath is required.")

    dataset_path = Path(dataset_value)
    if not dataset_path.is_absolute():
        dataset_path = (ROOT_DIR / dataset_path).resolve()
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    rows = load_rows(dataset_path)
    if len(rows) < 8:
        raise ValueError("Dataset is too small for report risk training.")

    tensors = build_feature_matrix(rows)
    x = tensors["x"]
    y = tensors["y"]

    epochs = max(20, int(args.get("epochs", 160)))
    learning_rate = float(args.get("learningRate", 0.03))
    repeats = max(4, int(args.get("repeats", 24)))
    val_ratio = float(args.get("valRatio", 0.25))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    metrics_history = []
    for repeat in range(repeats):
        _, metrics, _, _ = train_once(
            x=x,
            y=y,
            seed=20260501 + repeat * 37,
            epochs=epochs,
            learning_rate=learning_rate,
            val_ratio=val_ratio,
            device=device,
        )
        metrics_history.append(metrics)

    final_model = train_final_model(x, y, epochs=epochs, learning_rate=learning_rate, device=device)
    full_metrics = evaluate(final_model, x, y, device)
    weight_summary = summarize_weights(final_model)

    averages = {
        key: sum(item[key] for item in metrics_history) / len(metrics_history)
        for key in metrics_history[0]
    }

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = RUNS_DIR / f"report-risk-model-{JOB_ID}.pt"
    metrics_path = RUNS_DIR / f"report-risk-metrics-{JOB_ID}.json"

    torch.save(
        {
            "state_dict": final_model.state_dict(),
            "feature_names": FEATURE_NAMES,
        },
        model_path,
    )

    payload = {
        "ok": True,
        "job_id": JOB_ID,
        "datasetPath": str(dataset_path),
        "modelPath": str(model_path),
        "metricsPath": str(metrics_path),
        "device": str(device),
        "rowCount": len(rows),
        "wrongCount": int(y.sum().item()),
        "correctCount": int(y.shape[0] - y.sum().item()),
        "epochs": epochs,
        "repeats": repeats,
        "learningRate": learning_rate,
        "valRatio": val_ratio,
        "averageValidation": averages,
        "fullDatasetMetrics": full_metrics,
        **weight_summary,
    }

    metrics_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=True))


if __name__ == "__main__":
    main()
