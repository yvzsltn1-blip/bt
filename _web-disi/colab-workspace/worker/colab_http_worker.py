import argparse
import json
import os
import subprocess
import sys
import threading
import traceback
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT_DIR = Path(__file__).resolve().parents[2]
WORKSPACE_DIR = ROOT_DIR / "colab-workspace"
RUNS_DIR = WORKSPACE_DIR / "runs"
ALLOWED_JOBS_PATH = WORKSPACE_DIR / "worker" / "allowed_jobs.json"

JOB_STORE = {}
JOB_LOCK = threading.Lock()
WORKER_TOKEN = ""


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def load_allowed_jobs():
    with ALLOWED_JOBS_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def read_json_body(handler):
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(content_length) if content_length > 0 else b"{}"
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def write_json(handler, status_code, payload):
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def normalize_job_request(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    token = str(payload.get("token", ""))
    job_name = str(payload.get("job", "")).strip()
    args = payload.get("args", {})
    if not job_name:
        raise ValueError("Missing job name.")
    if args is None:
        args = {}
    if not isinstance(args, dict):
        raise ValueError("args must be an object.")
    return token, job_name, args


def build_job_record(job_id, job_name, args):
    return {
        "id": job_id,
        "job": job_name,
        "args": args,
        "status": "queued",
        "created_at": utc_now(),
        "started_at": None,
        "finished_at": None,
        "result": None,
        "error": None,
    }


def save_job_snapshot(job_record):
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    target = RUNS_DIR / f"{job_record['id']}.json"
    with target.open("w", encoding="utf-8") as handle:
        json.dump(job_record, handle, ensure_ascii=True, indent=2)
    return str(target)


def update_job(job_id, **changes):
    with JOB_LOCK:
        current = JOB_STORE[job_id]
        current.update(changes)
        snapshot_path = save_job_snapshot(current)
        current["snapshot_path"] = snapshot_path
        return dict(current)


def run_job_in_background(job_id, job_name, args):
    try:
        allowed = load_allowed_jobs()
        job_info = allowed[job_name]
        script_path = ROOT_DIR / job_info["script"]
        timeout_seconds = int(job_info.get("timeout_seconds", 60 * 30))
        if not script_path.exists():
            raise FileNotFoundError(f"Job script not found: {script_path}")

        update_job(job_id, status="running", started_at=utc_now())

        env = os.environ.copy()
        env["BT_COLAB_JOB_ARGS"] = json.dumps(args, ensure_ascii=True)
        env["BT_COLAB_JOB_ID"] = job_id
        env["BT_COLAB_RUNS_DIR"] = str(RUNS_DIR)

        completed = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
            env=env,
        )

        stdout = completed.stdout.strip()
        stderr = completed.stderr.strip()

        parsed_result = None
        if stdout:
            try:
                parsed_result = json.loads(stdout)
            except json.JSONDecodeError:
                parsed_result = {"raw_stdout": stdout}
        else:
            parsed_result = {}

        status = "completed" if completed.returncode == 0 else "failed"
        update_job(
            job_id,
            status=status,
            finished_at=utc_now(),
            result=parsed_result,
            error=None if completed.returncode == 0 else {
                "returncode": completed.returncode,
                "stderr": stderr,
                "stdout": stdout[-12000:],
            },
        )
    except Exception as error:
        update_job(
            job_id,
            status="failed",
            finished_at=utc_now(),
            error={
                "message": str(error),
                "traceback": traceback.format_exc()[-20000:],
            },
        )


class ColabWorkerHandler(BaseHTTPRequestHandler):
    server_version = "BTColabWorker/0.1"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            write_json(self, 200, {
                "ok": True,
                "service": "bt-colab-worker",
                "time": utc_now(),
                "root_dir": str(ROOT_DIR),
            })
            return

        if parsed.path.startswith("/jobs/"):
            job_id = parsed.path.split("/")[-1].strip()
            with JOB_LOCK:
                job_record = JOB_STORE.get(job_id)
            if not job_record:
                write_json(self, 404, {"ok": False, "error": "Job not found."})
                return
            write_json(self, 200, {"ok": True, "job": job_record})
            return

        write_json(self, 404, {"ok": False, "error": "Not found."})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/run":
            write_json(self, 404, {"ok": False, "error": "Not found."})
            return

        try:
            payload = read_json_body(self)
            token, job_name, args = normalize_job_request(payload)
            if token != WORKER_TOKEN:
                write_json(self, 403, {"ok": False, "error": "Invalid token."})
                return

            allowed = load_allowed_jobs()
            if job_name not in allowed:
                write_json(self, 400, {"ok": False, "error": f"Unsupported job: {job_name}"})
                return

            job_id = uuid.uuid4().hex[:16]
            job_record = build_job_record(job_id, job_name, args)
            with JOB_LOCK:
                JOB_STORE[job_id] = job_record
                save_job_snapshot(job_record)

            thread = threading.Thread(
                target=run_job_in_background,
                args=(job_id, job_name, args),
                daemon=True,
            )
            thread.start()

            write_json(self, 202, {"ok": True, "job_id": job_id, "status": "queued"})
        except Exception as error:
            write_json(self, 400, {"ok": False, "error": str(error)})

    def log_message(self, format_string, *args):
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format_string % args))


def parse_args():
    parser = argparse.ArgumentParser(description="BT Colab HTTP worker")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8787, type=int)
    parser.add_argument("--token", required=True)
    return parser.parse_args()


def main():
    global WORKER_TOKEN
    args = parse_args()
    WORKER_TOKEN = args.token
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), ColabWorkerHandler)
    print(json.dumps({
        "ok": True,
        "service": "bt-colab-worker",
        "host": args.host,
        "port": args.port,
        "root_dir": str(ROOT_DIR),
        "runs_dir": str(RUNS_DIR),
    }, ensure_ascii=True))
    server.serve_forever()


if __name__ == "__main__":
    main()
