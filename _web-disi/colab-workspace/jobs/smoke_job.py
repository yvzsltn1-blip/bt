import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone


def run_command(command):
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        return {
            "command": command,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-12000:],
            "stderr": completed.stderr[-12000:],
        }
    except Exception as error:
        return {
            "command": command,
            "error": str(error),
        }


def main():
    root = os.getcwd()
    repo_markers = [
        "battle-core.js",
        "saved.html",
        "wrong.html",
        "colab-workspace/worker/colab_http_worker.py",
    ]
    marker_status = {marker: os.path.exists(os.path.join(root, marker)) for marker in repo_markers}

    payload = {
        "ok": True,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "python_version": sys.version,
        "platform": platform.platform(),
        "cwd": root,
        "env": {
            "COLAB_RELEASE_TAG": os.environ.get("COLAB_RELEASE_TAG"),
            "COLAB_GPU": os.environ.get("COLAB_GPU"),
            "PYTHONPATH": os.environ.get("PYTHONPATH"),
        },
        "repo_markers": marker_status,
        "executables": {
            "python": shutil.which("python"),
            "python3": shutil.which("python3"),
            "node": shutil.which("node"),
            "nvidia-smi": shutil.which("nvidia-smi"),
        },
        "commands": {
            "python_version": run_command([sys.executable, "--version"]),
            "nvidia_smi": run_command(["nvidia-smi"]),
        },
    }

    print(json.dumps(payload, ensure_ascii=True))


if __name__ == "__main__":
    main()
