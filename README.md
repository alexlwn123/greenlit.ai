# greenlit.ai

MVP rebuild workspace for greenlit.ai.

## Local Setup

Install dependencies from the repo root:

```sh
pnpm install
```

Start the local MVP stack:

```sh
pnpm dev
```

This starts:

- Local API: `http://localhost:8787`
- React app: `http://localhost:5173`

Run the standard checks:

```sh
pnpm check
```

Convex is the hosted backend boundary for saved work, analysis state, and workbook notes. For local Convex development, run the backend separately with:

```sh
pnpm dev:convex
```

Copy `.env.example` to `.env.local` and fill in provider credentials when working on real upload, storage, or AI analysis paths.

Local MVP uploads and analysis records are stored under `.local-data` unless you explicitly enable the Convex metadata driver. That directory is ignored by git and can be deleted whenever you want to reset local saved analyses.

## Local MVP Behavior

The current local stack does not require AI credentials. It saves uploaded PDFs, extracts text with the local API, produces a deterministic readiness score, and writes generated report modules into the saved analysis record.

Post-analysis modules are built behind the shared report contract. If a module fails, the upload and minimum-score result should still be saved so the user is not blocked from reviewing the core report.

## Environment Variables

Local variables:

- `GREENLIT_LOCAL_DATA_DIR`: optional path for local API records and artifacts. Defaults to `.local-data`.
- `GREENLIT_METADATA_DRIVER`: set to `convex` in hosted environments so saved analyses and workbook notes use Convex.
- `GREENLIT_STORAGE_DRIVER`: set to `vercel-blob` in hosted environments so uploaded PDFs and generated text artifacts use Vercel Blob.
- `GREENLIT_ANALYSIS_MODE`: set to `inline` for serverless deployments. Local development leaves this empty and processes analysis asynchronously.
- `VITE_API_BASE_URL`: web app API base URL. Defaults to `/api`, which Vite proxies to the local API during development.

Reserved for hosted or AI-backed work:

- `CONVEX_DEPLOYMENT`
- `CONVEX_URL`
- `VITE_CONVEX_URL`
- `OPENAI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

Do not expose server-side provider keys through `VITE_` variables.

## Vercel Deployment

The repo includes a root `vercel.json` that builds the Vite app from `apps/web` and deploys the Hono API as Vercel Functions under `/api/*`.

Required Vercel environment variables for the hosted local-MVP path:

- `GREENLIT_METADATA_DRIVER=convex`
- `GREENLIT_STORAGE_DRIVER=vercel-blob`
- `GREENLIT_ANALYSIS_MODE=inline`
- `CONVEX_URL`
- `BLOB_READ_WRITE_TOKEN`

`VITE_API_BASE_URL` can stay unset in Vercel because the app calls the same-origin `/api` route by default.

The hosted MVP stores saved-work metadata, analysis state, and workbook notes in Convex. Uploaded PDFs and generated text artifacts remain private Vercel Blob objects referenced from Convex records.

## Local Data And Retention

The local API stores uploads, extracted text, generated reports, and workbook notes on disk under `.local-data` unless `GREENLIT_LOCAL_DATA_DIR` points somewhere else. This data remains until you delete that directory.

For confidential filings, use a trusted local machine and remove `.local-data` when the review is done. Hosted retention policy, object storage lifecycle, and production deletion controls still need to be finalized before real user uploads.
