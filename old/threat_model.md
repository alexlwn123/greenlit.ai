# Threat Model

## Project Overview

This project is a GRAS filing analysis application with a public React/Vite frontend and a Python/FastAPI backend. Users upload GRAS notice PDFs to the backend, which extracts text, sends parts of the notice to Anthropic for analysis, queries a local ChromaDB collection using OpenAI embeddings, and returns a structured report. In production, the primary exposed service is the FastAPI app in `backend/api.py`; the frontend is built static content served by that backend.

Production assumptions for future scans: the Replit deployment terminates TLS automatically, `NODE_ENV` is `production`, and mockup/sandbox-only surfaces are not deployed. Offline corpus-building scripts and local data preparation flows should be treated as dev/admin-only unless they become reachable from `backend/api.py` or another production entry point.

## Assets

- **Uploaded GRAS filings** — user-submitted PDFs may contain confidential commercial, regulatory, or scientific information.
- **Generated analysis results** — structured findings derived from uploaded filings may expose the substance identity, notifier, safety gaps, or other sensitive business context.
- **Provider credentials** — `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` authorize billable third-party API usage.
- **Service availability and budget** — the public upload/analysis API can trigger expensive LLM and embedding requests plus PDF parsing and retrieval work.
- **Local notice corpus and ChromaDB data** — local GRAS notice metadata and embeddings inform comparative analysis and should not be corrupted by untrusted inputs.

## Trust Boundaries

- **Browser to FastAPI backend** — all uploaded files and polling requests cross this boundary; clients are untrusted.
- **FastAPI backend to local filesystem** — uploaded files are written to `data/uploads`, read by PDF extraction code, and removed after processing.
- **FastAPI backend to third-party AI providers** — extracted filing text and semantic queries are sent to Anthropic and OpenAI using server-side API keys.
- **FastAPI backend to local ChromaDB** — backend code queries a persistent ChromaDB store under `data/chroma`.
- **Public production API vs offline/admin scripts** — `backend/api.py` is production-facing; `backend/embed.py` and `pipeline/extract.py` batch-processing entrypoints are normally dev/admin-only.

## Scan Anchors

- **Production entry point:** `backend/api.py` (`/analyze`, `/status/{job_id}`, `/health`, static frontend serving).
- **Highest-risk code areas:** file upload handling in `backend/api.py`, PDF parsing and LLM invocation in `backend/analyze.py` and `pipeline/extract.py`, outbound provider calls in `backend/analyze.py` and `backend/retrieve.py`.
- **Public vs authenticated vs admin surfaces:** the current production API is entirely public and unauthenticated; there is no separate authenticated or admin surface in code.
- **Usually dev-only:** `backend/embed.py`, `pipeline/extract.py` batch-mode `run()`, local dataset generation under `data/notices/` and `data/chunks.jsonl` unless wired into a production route.

## Threat Categories

### Spoofing

There is no built-in user authentication, so the service currently operates as a public tool. The security guarantee is not identity-based access control, but that public endpoints must not rely on client identity for confidentiality or abuse prevention. If future versions add privileged or tenant-specific behavior, server-side authentication and binding of results to the authenticated principal will become mandatory.

### Tampering

Untrusted users can upload arbitrary files and control request frequency. The service must validate uploaded content as actual PDFs before expensive downstream processing, prevent user input from altering files or records outside the intended upload area, and ensure untrusted document text cannot corrupt the local corpus or application state.

### Information Disclosure

Uploaded filings and generated analyses may contain confidential commercial information. The system must ensure one user cannot retrieve another user’s results, provider credentials never appear in client responses or logs, and error handling does not expose sensitive internals. Any third-party data sharing with AI providers must be limited to the minimum necessary for the application’s intended function.

### Denial of Service

The largest risk in this project is abuse of the public upload/analysis pipeline. The backend must bound upload sizes, request rates, job concurrency, retention of in-memory results, and third-party API fan-out so unauthenticated users cannot exhaust memory, CPU, threadpool capacity, or paid API quotas.

### Elevation of Privilege

The app has no explicit role model, but code execution, filesystem escape, arbitrary outbound access using stored API keys, or corruption of the local corpus would all represent privilege escalation. The required guarantees are that uploads remain data-only, PDF parsing and provider calls do not become a path to arbitrary file access or code execution, and dev/admin-only scripts stay unreachable from production routes.
