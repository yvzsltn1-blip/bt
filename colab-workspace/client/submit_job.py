import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path


def load_config(config_path):
    if not config_path:
        return {}
    with open(config_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def http_json(url, method="GET", payload=None, timeout=30):
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def save_json(target_dir, prefix, payload):
    Path(target_dir).mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    path = Path(target_dir) / f"{prefix}-{stamp}.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
    return str(path)


def parse_args():
    parser = argparse.ArgumentParser(description="Submit a job to the Colab worker")
    parser.add_argument("--config", help="Path to config JSON", default=None)
    parser.add_argument("--endpoint", help="Worker base URL", default=None)
    parser.add_argument("--token", help="Worker auth token", default=None)
    parser.add_argument("--job", help="Job name", default=None)
    parser.add_argument("--job-id", help="Existing remote job id to query", default=None)
    parser.add_argument("--args-json", help="Inline JSON object passed to the job", default="{}")
    parser.add_argument("--wait", action="store_true", help="Poll until job finishes")
    parser.add_argument("--poll-interval", type=float, default=3.0)
    parser.add_argument("--timeout-seconds", type=float, default=600.0)
    parser.add_argument("--save-dir", default=None)
    return parser.parse_args()


def main():
    args = parse_args()
    config = load_config(args.config)

    endpoint = (args.endpoint or config.get("endpoint") or "").rstrip("/")
    token = args.token or config.get("token") or ""
    job = args.job or config.get("default_job") or ""
    save_dir = args.save_dir or config.get("save_dir") or "colab-workspace/runs"
    job_id = (args.job_id or "").strip()

    if not endpoint:
        raise SystemExit("endpoint is required.")
    if not token:
        raise SystemExit("token is required.")

    if job_id:
        submitted = {"ok": True, "job_id": job_id, "status": "query"}
        print(json.dumps(submitted, ensure_ascii=True, indent=2))
    else:
        if not job:
            raise SystemExit("job is required when --job-id is not provided.")

        try:
            job_args = json.loads(args.args_json)
        except json.JSONDecodeError as error:
            raise SystemExit(f"Invalid --args-json: {error}")

        submitted = http_json(
            f"{endpoint}/run",
            method="POST",
            payload={"token": token, "job": job, "args": job_args},
        )
        print(json.dumps(submitted, ensure_ascii=True, indent=2))

        if not args.wait:
            saved = save_json(save_dir, "submitted-job", submitted)
            print(saved)
            return

    if not submitted.get("ok") or not submitted.get("job_id"):
        saved = save_json(save_dir, "job-error", submitted)
        print(saved)
        return

    job_id = submitted["job_id"]
    deadline = time.time() + args.timeout_seconds

    while True:
        if time.time() > deadline:
            raise SystemExit("Timed out while waiting for job completion.")
        snapshot = http_json(f"{endpoint}/jobs/{job_id}")
        status = snapshot.get("job", {}).get("status")
        print(f"job={job_id} status={status}")
        if status in {"completed", "failed"}:
            saved = save_json(save_dir, f"job-{job_id}", snapshot)
            print(saved)
            if status == "failed":
                raise SystemExit(1)
            return
        time.sleep(args.poll_interval)


if __name__ == "__main__":
    main()
