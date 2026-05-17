"""FastAPI layer for the GRAS gap analysis tool."""

import os
import sys
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from typing import Any

from dotenv import load_dotenv

load_dotenv()
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPEN_AI_KEY"):
    os.environ["OPENAI_API_KEY"] = os.environ["OPEN_AI_KEY"]

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))
from backend.analyze import analyze

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

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


class JobStatus(str, Enum):
    pending  = "pending"
    running  = "running"
    complete = "complete"
    failed   = "failed"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    result: Any = None
    error:  str | None = None


def _run_analysis(job_id: str, pdf_path: Path) -> None:
    """Runs in a thread pool — updates job store when done."""
    _jobs[job_id]["status"] = JobStatus.running
    try:
        result = analyze(pdf_path)
        _jobs[job_id]["status"] = JobStatus.complete
        _jobs[job_id]["result"] = result
    except Exception as exc:
        _jobs[job_id]["status"] = JobStatus.failed
        _jobs[job_id]["error"]  = str(exc)
    finally:
        # Clean up the uploaded file
        try:
            pdf_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/analyze", response_model=JobResponse, status_code=202)
async def submit_analysis(file: UploadFile = File(...)):
    """Accept a PDF upload and start analysis. Returns a job_id to poll."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    job_id  = str(uuid.uuid4())
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    pdf_path.write_bytes(await file.read())

    _jobs[job_id] = {"status": JobStatus.pending, "result": None, "error": None}
    _executor.submit(_run_analysis, job_id, pdf_path)

    return JobResponse(job_id=job_id, status=JobStatus.pending)


@app.get("/status/{job_id}", response_model=JobResponse)
async def get_status(job_id: str):
    """Poll for job status. Result is included when status == complete."""
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobResponse(
        job_id  = job_id,
        status  = job["status"],
        result  = job["result"],
        error   = job["error"],
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
