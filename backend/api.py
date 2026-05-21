"""FastAPI layer for the GRAS gap analysis tool."""

import json
import os
import sys
import time
import uuid
import threading
from collections import defaultdict, deque
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from typing import Any

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

_REQUIRED_ENV = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
_missing_env = [k for k in _REQUIRED_ENV if not os.environ.get(k)]
if _missing_env:
    raise RuntimeError(
        f"Missing required environment variables: {', '.join(_missing_env)}. "
        "Set them in your .env file or shell before starting the server."
    )

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from backend.analyze import analyze, AnalysisError

UPLOAD_DIR  = Path("data/uploads")
RESULTS_DIR = Path("data/results")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Abuse-control constants
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES    = 50 * 1024 * 1024   # 50 MB hard cap on uploaded file
MAX_PENDING_JOBS    = 20                  # global queue-depth cap
MAX_JOBS_STORED     = 200                 # evict completed/failed records above this
RATE_LIMIT_WINDOW   = 60                  # seconds per rate-limit window
RATE_LIMIT_MAX      = 5                   # max /analyze submissions per IP per window
JOB_TIMEOUT_SECONDS    = 660       # fail jobs still running after this long
RESULTS_TTL_SECONDS    = 24 * 3600  # delete persisted result files older than this
STATUS_RATE_LIMIT_MAX  = 120   # max /status polls per IP per RATE_LIMIT_WINDOW

app = FastAPI(title="GRAS Gap Analysis API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store — replace with Redis or a DB for multi-worker deploys
_jobs: dict[str, dict] = {}
_executor = ThreadPoolExecutor(max_workers=4)

# Single lock protecting both _jobs and _rate_store from concurrent access
# by the async request path and the ThreadPoolExecutor workers.
_store_lock = threading.Lock()

# Per-IP sliding-window rate-limit stores (submit and status use separate limits)
_rate_store:        dict[str, deque] = defaultdict(deque)
_status_rate_store: dict[str, deque] = defaultdict(deque)


class JobStatus(str, Enum):
    pending  = "pending"
    running  = "running"
    complete = "complete"
    failed   = "failed"


class JobResponse(BaseModel):
    job_id:        str
    status:        JobStatus
    result:        Any = None
    error:         str | None = None
    error_code:    str | None = None
    progress_step: str | None = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_rate_limit(client_ip: str) -> None:
    """Sliding-window rate limiter. Must be called with _store_lock held."""
    now = time.monotonic()
    window = _rate_store[client_ip]
    while window and window[0] < now - RATE_LIMIT_WINDOW:
        window.popleft()
    if len(window) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many requests. You may submit at most {RATE_LIMIT_MAX} "
                f"analyses per {RATE_LIMIT_WINDOW} seconds."
            ),
        )
    window.append(now)


def _count_pending_locked() -> int:
    """Count pending jobs. Must be called with _store_lock held."""
    return sum(1 for j in _jobs.values() if j["status"] == JobStatus.pending)


def _evict_old_jobs_locked() -> None:
    """Remove completed/failed jobs when store exceeds MAX_JOBS_STORED.
    Must be called with _store_lock held."""
    if len(_jobs) <= MAX_JOBS_STORED:
        return
    evictable = [
        jid for jid, j in list(_jobs.items())
        if j["status"] in (JobStatus.complete, JobStatus.failed)
    ]
    for jid in evictable[: len(_jobs) - MAX_JOBS_STORED]:
        _jobs.pop(jid, None)


def _watchdog() -> None:
    """Background thread: timeout stale jobs and sweep expired result files from disk."""
    while True:
        time.sleep(30)
        now = time.monotonic()
        with _store_lock:
            for job in _jobs.values():
                if job["status"] == JobStatus.running:
                    started = job.get("started_at")
                    if started and now - started > JOB_TIMEOUT_SECONDS:
                        job["status"] = JobStatus.failed
                        job["error"]  = "Analysis timed out — the job ran longer than the allowed limit."

        # Sweep old result files without holding the lock (I/O, not in-memory state)
        cutoff = time.time() - RESULTS_TTL_SECONDS
        for result_file in RESULTS_DIR.glob("*.json"):
            try:
                if result_file.stat().st_mtime < cutoff:
                    result_file.unlink(missing_ok=True)
            except Exception:
                pass


_watchdog_thread = threading.Thread(target=_watchdog, daemon=True)
_watchdog_thread.start()


def _run_analysis(job_id: str, pdf_path: Path) -> None:
    """Runs in a thread pool — updates job store when done."""
    with _store_lock:
        _jobs[job_id]["status"]     = JobStatus.running
        _jobs[job_id]["started_at"] = time.monotonic()

    def on_progress(step: str):
        with _store_lock:
            if job_id in _jobs:
                _jobs[job_id]["progress_step"] = step

    try:
        result = analyze(pdf_path, on_progress=on_progress)
        result_path = RESULTS_DIR / f"{job_id}.json"
        result_path.write_text(json.dumps(result), encoding="utf-8")
        with _store_lock:
            _jobs[job_id]["status"] = JobStatus.complete
            _jobs[job_id]["result"] = result
    except AnalysisError as exc:
        with _store_lock:
            _jobs[job_id]["status"]     = JobStatus.failed
            _jobs[job_id]["error"]      = exc.message
            _jobs[job_id]["error_code"] = exc.code
    except Exception as exc:
        with _store_lock:
            _jobs[job_id]["status"]     = JobStatus.failed
            _jobs[job_id]["error"]      = str(exc)
            _jobs[job_id]["error_code"] = "internal_error"
    finally:
        try:
            pdf_path.unlink(missing_ok=True)
        except Exception:
            pass
        with _store_lock:
            _evict_old_jobs_locked()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/analyze", response_model=JobResponse, status_code=202)
async def submit_analysis(request: Request, file: UploadFile = File(...)):
    """Accept a PDF upload and start analysis. Returns a job_id to poll."""
    client_ip = request.client.host if request.client else "unknown"

    # Filename validation (cheap — do before acquiring lock)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Rate limit + queue-depth check — both under the same lock so they are
    # atomic with respect to thread-pool workers updating job statuses.
    with _store_lock:
        _check_rate_limit(client_ip)      # raises 429 if over limit
        if _count_pending_locked() >= MAX_PENDING_JOBS:
            raise HTTPException(
                status_code=503,
                detail="Server is busy. Too many analyses are queued. Please try again later.",
            )

    # Stream upload directly to disk — never accumulate the full body in RAM.
    # Each chunk is written immediately; we reject as soon as the byte count
    # exceeds the cap and delete the partial file.
    job_id   = str(uuid.uuid4())
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    total_bytes = 0
    chunk_size  = 256 * 1024  # 256 KB per read

    try:
        with pdf_path.open("wb") as fh:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"File too large. Maximum allowed size is "
                            f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
                        ),
                    )
                fh.write(chunk)
    except HTTPException:
        pdf_path.unlink(missing_ok=True)
        raise

    with _store_lock:
        _jobs[job_id] = {"status": JobStatus.pending, "result": None, "error": None}
    _executor.submit(_run_analysis, job_id, pdf_path)

    return JobResponse(job_id=job_id, status=JobStatus.pending)


@app.get("/status/{job_id}", response_model=JobResponse)
async def get_status(request: Request, job_id: str):
    """Poll for job status. Result is included when status == complete."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _store_lock:
        window = _status_rate_store[client_ip]
        while window and window[0] < now - RATE_LIMIT_WINDOW:
            window.popleft()
        if len(window) >= STATUS_RATE_LIMIT_MAX:
            raise HTTPException(status_code=429, detail="Too many status requests. Please slow down polling.")
        window.append(now)

        job = _jobs.get(job_id)
        if job is None:
            snapshot = None
        else:
            snapshot = dict(job)

    if snapshot is None:
        # Try persisted result on disk (survives server restarts)
        result_path = RESULTS_DIR / f"{job_id}.json"
        if result_path.exists():
            try:
                result = json.loads(result_path.read_text(encoding="utf-8"))
                return JobResponse(job_id=job_id, status=JobStatus.complete, result=result)
            except Exception:
                pass
        raise HTTPException(status_code=404, detail="Job not found.")

    return JobResponse(
        job_id        = job_id,
        status        = snapshot["status"],
        result        = snapshot.get("result"),
        error         = snapshot.get("error"),
        error_code    = snapshot.get("error_code"),
        progress_step = snapshot.get("progress_step"),
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/research")
async def get_research(substance: str, method: str = "", organism: str = ""):
    """Fetch top PubMed papers relevant to a substance and return relevance summaries."""
    import asyncio
    from backend.research import fetch_research
    try:
        papers = await asyncio.to_thread(fetch_research, substance, method, organism)
        return {"papers": papers}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Research fetch failed: {exc}")


FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")
