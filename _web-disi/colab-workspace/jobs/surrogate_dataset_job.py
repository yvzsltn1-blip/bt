import json
import os
import shutil
import subprocess
import sys
import tempfile
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


def ensure_node():
    node_path = shutil.which("node")
    if not node_path:
        raise RuntimeError("node executable not found in PATH.")
    return node_path


def main():
    job_args = load_job_args()
    node_path = ensure_node()
    script_path = ROOT_DIR / "colab-workspace" / "jobs" / "surrogate_dataset_runner.js"
    if not script_path.exists():
        raise FileNotFoundError(f"Node runner not found: {script_path}")

    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    default_output = RUNS_DIR / f"surrogate-dataset-{JOB_ID}.jsonl"
    job_args.setdefault("outputPath", str(default_output))

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as handle:
        json.dump(job_args, handle, ensure_ascii=True, indent=2)
        input_path = Path(handle.name)

    try:
        completed = subprocess.run(
            [node_path, str(script_path), str(input_path)],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                "surrogate_dataset_runner.js failed.\n"
                f"stdout:\n{completed.stdout[-12000:]}\n"
                f"stderr:\n{completed.stderr[-12000:]}"
            )

        payload = json.loads(completed.stdout)
        payload["job_id"] = JOB_ID
        payload["node_path"] = node_path
        print(json.dumps(payload, ensure_ascii=True))
    finally:
        input_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
