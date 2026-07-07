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
- `GREENLIT_AUTH_DRIVER`: set to `clerk` in hosted environments to require Clerk auth for API access. Local development leaves this empty and uses the local session header.
- `GREENLIT_CONVEX_API_SECRET`: shared server-only secret used by the Hono API when calling Convex metadata functions.
- `VITE_API_BASE_URL`: web app API base URL. Defaults to `/api`, which Vite proxies to the local API during development.
- `VITE_GREENLIT_AUTH_DRIVER`: set to `clerk` in hosted environments so the web app renders Clerk auth.

Reserved for hosted or AI-backed work:

- `CONVEX_DEPLOYMENT`
- `CONVEX_URL`
- `VITE_CONVEX_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_FRONTEND_API_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

Do not expose server-side provider keys through `VITE_` variables. Only Clerk publishable keys and browser-safe URLs should use `VITE_`.

## Vercel Deployment

The repo includes a root `vercel.json` that builds the Vite app from `apps/web` and deploys the Hono API as Vercel Functions under `/api/*`.

Required Vercel environment variables for the hosted local-MVP path:

- `GREENLIT_METADATA_DRIVER=convex`
- `GREENLIT_STORAGE_DRIVER=vercel-blob`
- `GREENLIT_ANALYSIS_MODE=inline`
- `GREENLIT_AUTH_DRIVER=clerk`
- `GREENLIT_CONVEX_API_SECRET`
- `CONVEX_URL`
- `BLOB_READ_WRITE_TOKEN`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VITE_GREENLIT_AUTH_DRIVER=clerk`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CONVEX_URL`

`VITE_API_BASE_URL` can stay unset in Vercel because the app calls the same-origin `/api` route by default.

The hosted MVP stores saved-work metadata, analysis state, and workbook notes in Convex. Uploaded PDFs and generated text artifacts remain private Vercel Blob objects referenced from Convex records. The browser subscribes to signed-in user history through Convex; upload, export, and note writes still go through the Hono API so files remain behind server-side checks.

Required Convex environment variables:

- `GREENLIT_CONVEX_API_SECRET`: same value as Vercel.
- `CLERK_FRONTEND_API_URL`: Clerk issuer/front-end API URL for the Clerk instance connected to this app.

Deploy order for auth changes:

1. Set `GREENLIT_CONVEX_API_SECRET` in both Vercel and Convex.
2. Set `CLERK_FRONTEND_API_URL` in Convex.
3. Deploy Convex functions.
4. Set Clerk publishable/secret keys and auth driver vars in Vercel.
5. Deploy Vercel.

## Local Data And Retention

The local API stores uploads, extracted text, generated reports, and workbook notes on disk under `.local-data` unless `GREENLIT_LOCAL_DATA_DIR` points somewhere else. This data remains until you delete that directory.

For confidential filings, use a trusted local machine and remove `.local-data` when the review is done. Hosted retention policy, object storage lifecycle, and production deletion controls still need to be finalized before real user uploads.
