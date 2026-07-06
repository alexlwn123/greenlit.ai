# GRAS-sy
AI tool for improving, expediting, and evaluating FDA GRAS (Generally Recognized as Safe) filings.

Upload a draft GRAS notice PDF and receive an AI-powered gap analysis — completeness scoring, comparisons against approved/withdrawn notices, and actionable recommendations.

## How it works
1. User uploads a PDF notice
2. Backend extracts text and metadata via Claude (Anthropic)
3. Semantic search retrieves similar historical notices from a ChromaDB vector store
4. Claude runs a deep gap analysis across 8 regulatory domains
5. A scored report with recommendations is returned to the frontend

## Tech stack
- **Backend:** Python, FastAPI, Claude (Anthropic), ChromaDB, OpenAI embeddings, pdfplumber
- **Frontend:** React 19, Vite, Tailwind CSS 4

## Setup on Replit

### 1. Add secrets
In the Replit **Secrets** tab, add:
- `ANTHROPIC_API_KEY` — used for Claude analysis and metadata extraction
- `OPENAI_API_KEY` — used for generating embeddings (semantic search)

### 2. Install dependencies
Replit will install Python packages from `requirements.txt` and Node packages automatically when you run the project.

### 3. Run the project
Two workflows run in parallel:
- **Backend API** — FastAPI server on port 8000
- **Start application** — Vite dev server on port 5000 (proxies API calls to backend)

Click **Run** to start both.

### 4. Rebuild the vector database (optional)
The ChromaDB vector store is not included in the repository. To populate it from the historical notice data:
```bash
python -m backend.embed
```
This reads `data/chunks.jsonl` and indexes it into `data/chroma/`. Requires `OPENAI_API_KEY` to be set.

## Project structure
```
backend/        FastAPI app, analysis pipeline, retrieval logic
frontend/       React + Vite UI
data/
  Notices/      JSON metadata for approved and withdrawn GRAS notices
  Guidance/     FDA guidance PDFs
  chunks.jsonl  Pre-processed text chunks for embedding
constants/      Scoring weights and regulatory domain enums
pipeline/       Scripts for extracting and chunking notice PDFs
prompts/        Claude prompt templates
instructions/   Internal analysis instructions
```

## Deployment
The app is configured for Replit VM deployment. The build step compiles the frontend (`vite build`) and the run step serves everything from FastAPI on port 8000, including the built frontend static files.
