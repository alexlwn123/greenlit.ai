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
- `VITE_CONVEX_URL`: public Convex client URL used by the browser authentication provider.
- `GREENLIT_ALLOWED_EMAILS`: comma-separated exact email addresses allowed to create private-MVP accounts. Configure this on each Convex deployment.
- `AUTH_RESEND_KEY`: Resend API key used by Convex Auth for password-reset codes.
- `AUTH_EMAIL_FROM`: verified sender identity for password-reset email; the Resend onboarding sender can be used during private preview testing.
- `GREENLIT_VERIFY_REFERENCES`: set to `true` to verify extracted references against Crossref and trusted NCBI sources.
- `GREENLIT_CROSSREF_MAILTO`: contact email sent to Crossref for its polite API pool.
- `GREENLIT_NCBI_EMAIL`: contact email sent to NCBI reference services; falls back to `GREENLIT_CROSSREF_MAILTO` when unset.

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
- `VITE_CONVEX_URL`
- `BLOB_READ_WRITE_TOKEN`

`VITE_API_BASE_URL` can stay unset in Vercel because the app calls the same-origin `/api` route by default.

The hosted MVP stores saved-work metadata, analysis state, and workbook notes in Convex. Uploaded PDFs and generated text artifacts remain private Vercel Blob objects referenced from Convex records.

In production, the browser uploads PDFs directly to private Vercel Blob storage using a short-lived, server-authorized upload token. The API verifies the resulting object before creating the analysis. This keeps files up to 40 MB out of the Vercel Function request body and avoids Vercel's function upload-size limit.

## Data Retention And Deletion

The local API stores uploads, extracted text, generated reports, and workbook notes on disk under `.local-data` unless `GREENLIT_LOCAL_DATA_DIR` points somewhere else. This data remains until you delete that directory.

Hosted analyses are retained until the workspace owner deletes them. The **Delete** action on a saved analysis permanently removes its uploaded PDF, extracted-text artifact, analysis record, and associated workbook notes. There is no automatic expiry in the private MVP, which avoids silently deleting active regulatory work; this policy should be revisited before a broader launch.

API responses containing private workspace data are marked `no-store`, private objects are never made public, ownership is derived from the authenticated account rather than browser-supplied identifiers, and analysis metadata queries and mutations enforce that ownership again in Convex.

For confidential local work, use a trusted machine and remove `.local-data` when the review is done. Never commit `.env.local`, `.local-data`, provider keys, uploaded filings, or generated reports.

The application trust boundaries, implemented protections, and production follow-ups are documented
in [`docs/security.md`](docs/security.md).

## Corpus Operations

Validate the packaged comparator index before a release:

```sh
pnpm corpus:validate
```

Refresh it from an old-tool `Notices` folder containing `Approved` and `Withdrawn` sidecars:

```sh
pnpm corpus:refresh "C:\path\to\Notices"
```

A refresh validates the entire candidate index first, blocks duplicate GRN numbers or malformed records, and saves the previous index under `.local-data/corpus-backups` before replacing it. Restore the latest backup with `pnpm corpus:rollback`, or pass a specific backup filename as the final argument.
