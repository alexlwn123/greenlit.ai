# Refactor And Cleanup TODOs

This is a high-impact cleanup list for greenlit.ai. The goal is to make the app easier to run, safer to change, and less fragile without rewriting the product or changing the core analysis behavior.

## Working Principles

- Prefer small pull requests that fix one class of issue at a time.
- Avoid changing Claude prompts, scoring weights, retrieval ranking, or UI copy in the same PR as plumbing cleanup.
- Add a smoke test or manual verification note for each change.
- Preserve existing generated data unless a task explicitly says to rebuild it.
- Treat uploaded GRAS filings and generated reports as confidential user data.

## Progress Tracker

- [ ] Align Supabase schema with frontend usage
- [ ] Plan and phase Supabase to Convex migration
- [ ] Standardize `data/Notices` path casing
- [ ] Clarify Pinecone vs ChromaDB
- [ ] Convert to a true pnpm workspace monorepo
- [ ] Introduce TypeScript to the frontend
- [ ] Add a minimal `.env.example`
- [ ] Clean up `requirements.txt`
- [ ] Add backend smoke tests
- [ ] Add one frontend smoke test or at least clean lint
- [ ] Add an API contract fixture
- [ ] Bind jobs/results to a user or session before production use
- [ ] Tighten CORS and deployment assumptions
- [ ] Make result retention explicit
- [ ] Separate app code from generated corpus/data
- [ ] Remove stale starter assets and docs
- [ ] Add a short architecture map
- [ ] Audit, archive, or delete stale docs and instruction files
- [ ] Consolidate generated artifacts and scratch files
- [ ] Add lightweight repo conventions

## Priority 1: Make Fresh Setup Work

### 1. Align Supabase schema with frontend usage

Impact: High  
Risk: Low if done as schema/docs only  
Area: `SUPABASE_SETUP.md`, Supabase tables

The frontend already expects:

- `analyses.filing_id`
- `analyses.health_score`
- `filing_notes` table with `user_id`, `filing_id`, `section`, `content`, `status`, `updated_at`

But the setup doc only creates a partial `analyses` table and does not create `filing_notes`.

Safe path:

- [ ] Update `SUPABASE_SETUP.md` with the missing columns and notes table.
- [ ] Include row-level security policies for notes, matching the current `user_id` checks.
- [ ] Do not change frontend behavior in the same PR unless the current schema cannot support it.

Done when:

- A new Supabase project can run the documented SQL.
- Signing in, saving an analysis, opening History, adding a section note, and opening Workbook all work.

### 2. Plan and phase Supabase to Convex migration

Impact: High  
Risk: Medium because it changes persistence/auth boundaries  
Area: `frontend/src/context/AuthContext.jsx`, `frontend/src/lib/supabase.js`, `frontend/src/lib/notes.js`, `frontend/src/pages/History.jsx`, `frontend/src/pages/Evaluation.jsx`, new `convex/` directory

The app currently uses Supabase only from the browser for auth, saved analyses, history, and notes. The Python/FastAPI backend does not depend on Supabase. That means the safest migration is to replace the user workspace layer first while keeping PDF analysis and Claude/Pinecone retrieval unchanged.

Useful Convex docs:

- React client: https://docs.convex.dev/client/react/
- Schemas: https://docs.convex.dev/database/schemas
- Auth overview: https://docs.convex.dev/auth/overview
- Convex Auth: https://docs.convex.dev/auth/convex-auth
- Data import: https://docs.convex.dev/database/import-export/import
- File storage: https://docs.convex.dev/file-storage

Safe path:

- [ ] Decide migration scope: replace only Supabase database first, or replace both Supabase database and auth.
- [ ] Keep FastAPI as the analysis engine for the first migration phase.
- [ ] Add Convex as a pnpm workspace dependency after the monorepo conversion, or do both in one carefully scoped infra PR.
- [ ] Create a `convex/` directory with schema and functions for saved analyses and filing notes.
- [ ] Model `analyses` with fields equivalent to current Supabase usage: user identity, `filingId`, `substanceName`, `healthScore`, `resultJson`, and creation time.
- [ ] Model `filingNotes` with user identity, `filingId`, `section`, `content`, `status`, and update time.
- [ ] Add indexes for the exact UI reads: analyses by user and created time; notes by user plus filing ID; note by user, filing ID, and section.
- [ ] Replace `supabase.from('analyses')` calls with Convex queries/mutations behind a small local adapter.
- [ ] Replace `loadNotes` and `upsertNote` with Convex functions while keeping the `NotesContext` public API stable.
- [ ] Replace `AuthContext` last, after data reads/writes work against Convex in local dev.
- [ ] Choose an auth strategy: Convex Auth for a lightweight all-Convex app, or a third-party OIDC provider if production auth requirements are stricter.
- [ ] Keep Supabase code behind a temporary feature flag only if existing user data must be supported during migration.
- [ ] Remove Supabase packages, env vars, docs, and setup SQL only after Convex history/save/notes are verified.

Data migration plan:

- [ ] Export existing Supabase `analyses` and `filing_notes` data to JSON or JSONL.
- [ ] Define a mapping from Supabase user IDs to the new Convex auth identity.
- [ ] Import only non-sensitive test data into Convex dev first.
- [ ] Use Convex CLI import for seed/dev data if it fits the shape; otherwise write a one-off admin mutation/script.
- [ ] Run a production migration dry run against a preview/dev deployment before touching production.
- [ ] Keep a rollback plan: leave Supabase read-only until Convex data is verified.

File and job-state decision:

- [ ] Do not move raw PDF upload flow to Convex in phase 1; keep current FastAPI upload/delete behavior.
- [ ] Decide later whether generated reports, outlines, or uploaded PDFs should be stored in Convex file storage.
- [ ] If using Convex file storage, document retention and access rules before storing confidential filing PDFs.
- [ ] Consider moving backend job metadata/results from in-memory/disk to Convex only after user identity is settled.

Done when:

- Saving an analysis no longer writes to Supabase.
- History loads saved analyses from Convex.
- Workbook and section notes read/write through Convex.
- A signed-in user cannot read another user's saved analyses or notes.
- Supabase can be removed from frontend dependencies and env docs.

### 3. Standardize `data/Notices` path casing

Impact: High  
Risk: Medium because it touches backend/data scripts  
Area: `backend/`, `pipeline/`, `data/`

The committed corpus uses `data/Notices`, but several scripts use lowercase `data/notices`. This may work on macOS but fail on Linux/Replit.

Safe path:

- [ ] Pick one spelling. Since the repo already has `data/Notices`, use that unless there is a strong reason to rename the directory.
- [ ] Replace lowercase path constants in backend and pipeline code.
- [ ] Add a small path existence check in startup or tests so this does not regress.

Likely files:

- `backend/api.py`
- `backend/analyze.py`
- `backend/embed.py`
- `backend/embed_pinecone.py`
- `pipeline/extract.py`
- `.gitignore`
- `README.md`

Done when:

- Sidecar lookup for a known GRN works on a case-sensitive filesystem.
- Corpus benchmark loads nonzero approved and withdrawn sidecars.
- No code references `data/notices` unless that directory actually exists.

### 4. Clarify Pinecone vs ChromaDB

Impact: High  
Risk: Low to Medium  
Area: README, retrieval code, embedding scripts

The README says semantic search uses ChromaDB, but the live retrieval path uses Pinecone and the API requires `PINECONE_API_KEY`.

Safe path:

- [ ] Decide which vector store is current.
- [ ] If Pinecone is current, update README setup, deployment secrets, and rebuild instructions around `backend.embed_pinecone`.
- [ ] If ChromaDB is intended, change `backend.retrieve` back to Chroma and remove `PINECONE_API_KEY` from required startup env.
- [ ] Keep the non-current implementation clearly marked as legacy or delete it after confirming it is not needed.

Done when:

- README setup matches the backend startup requirements.
- A new developer knows exactly which embedding command to run.
- `/analyze` cannot start with docs-approved env vars missing a required runtime secret.

## Priority 2: Make The App Easy To Run Locally

### 5. Convert to a true pnpm workspace monorepo

Impact: High  
Risk: Medium because it changes install/build workflow  
Area: root `package.json`, `frontend/package.json`, `pnpm-workspace.yaml`, lockfiles, `start.sh`

The actual frontend app lives in `frontend/`, but the root `package.json` duplicates frontend dependencies and has no useful scripts. `start.sh` currently calls `../node_modules/.bin/vite`, which assumes root dependencies are installed. A real monorepo should have one package manager, one lockfile, and root scripts that delegate cleanly.

Safe path:

- [ ] Add `pnpm-workspace.yaml` with `frontend` as the first workspace package.
- [ ] Make the root `package.json` a workspace command hub, not a duplicate frontend dependency manifest.
- [ ] Move frontend-only dependencies into `frontend/package.json`.
- [ ] Remove `package-lock.json` files only after confirming `pnpm install --frozen-lockfile` works from a clean checkout.
- [ ] Commit exactly one JavaScript lockfile: `pnpm-lock.yaml`.
- [ ] Add a checked-in Node version file, such as `.node-version`, set to a Node 22 LTS-compatible runtime.
- [ ] Add `engines.node` and `packageManager` metadata so contributors use the expected Node/pnpm versions.
- [ ] Update `start.sh` and README commands to use `pnpm --filter frontend ...` or root scripts that delegate into `frontend`.
- [ ] Keep the directory layout stable at first; do not move `frontend/` to `apps/frontend/` until the workspace conversion is already working.

Done when:

- `pnpm install --frozen-lockfile` works from repo root.
- `pnpm --filter frontend build` works from repo root.
- `./start.sh` works without relying on accidental root `node_modules`.
- There is one obvious command for local frontend dev.
- A fresh checkout does not contain competing npm and pnpm lockfiles.

### 6. Introduce TypeScript to the frontend

Impact: High  
Risk: Medium because it touches many files if rushed  
Area: `frontend/src`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/eslint.config.js`, new TypeScript config

The frontend is currently JavaScript/JSX, but the app depends on a large structured analysis result. TypeScript would be most valuable at the API/result boundary, saved-analysis shape, notes shape, and Convex migration layer. Do this incrementally so it improves confidence without becoming a full rewrite.

Safe path:

- [ ] Add TypeScript config and dependencies without converting every file immediately.
- [ ] Allow JS during the first phase with `allowJs` so migration can happen file by file.
- [ ] Define shared frontend types for `AnalysisResult`, `EngagementSummary`, `Gap`, `Benchmark`, `SavedAnalysis`, and `FilingNote`.
- [ ] Type the API wrappers in `frontend/src/lib/api.js` first, then rename to `.ts`.
- [ ] Type helper modules such as `evaluationHelpers` and `notes` before page components.
- [ ] Convert context files after shared types exist: `AnalysisContext`, `AuthContext`, `NotesContext`, `ThemeContext`.
- [ ] Convert page components gradually from low-risk to high-risk, keeping route behavior unchanged.
- [ ] Add type-aware linting only after the initial conversion is stable.
- [ ] Avoid changing visual design, routing, or business logic in the same PR as file renames.
- [ ] Coordinate this with the Convex migration so Convex schema types and frontend types do not drift.

Done when:

- `pnpm --filter frontend build` type-checks the frontend.
- API/result data is typed at the boundary instead of passed as `any`-like objects.
- Context hooks expose typed values.
- Demo result and live analysis result satisfy the same frontend type.
- Remaining JavaScript files, if any, are intentional and tracked.

### 7. Add a minimal `.env.example`

Impact: Medium  
Risk: Low  
Area: repo root, frontend docs

Developers need to know which env vars are required for backend, frontend, and optional Supabase features.

Safe path:

- [ ] Create `.env.example` for backend env vars.
- [ ] Create `frontend/.env.example` for frontend env vars.
- [ ] Document which vars are optional for local demo mode.

Backend vars likely include:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX`

Frontend vars likely include:

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Done when:

- A new developer can copy example env files and know what values to fill in.
- Missing optional Supabase vars do not look like a broken install.

### 8. Clean up `requirements.txt`

Impact: Medium  
Risk: Low  
Area: Python dependency setup

`requirements.txt` contains duplicate and mixed pinned/unpinned entries. This makes installs less predictable.

Safe path:

- [ ] Remove exact duplicate lines.
- [ ] Prefer pinned versions for app runtime dependencies.
- [ ] Consider a separate dev requirements file for `pytest` and lint tooling.
- [ ] Do not upgrade major dependencies in the same PR.

Done when:

- `python3 -m pip install -r requirements.txt` is deterministic enough for local and deployment usage.
- `python3 -m pytest` can be installed via documented dev requirements.

## Priority 3: Add Safety Nets Before Bigger Refactors

### 9. Add backend smoke tests

Impact: High  
Risk: Low  
Area: `tests/`

The current test file is a diagnostic script, not an automated test. Add a small automated suite that does not call paid APIs.

Good first tests:

- [ ] Path constants resolve to real corpus directories.
- [ ] `_validate_gras_notice` accepts a minimal GRAS-like document.
- [ ] `_validate_gras_notice` rejects unrelated text.
- [ ] `_check_field_presence` detects a few key fields from synthetic snippets.
- [ ] `/health` can be tested without requiring provider keys, if startup env validation is moved out of import time or made test-configurable.

Done when:

- `python3 -m pytest` runs without calling Anthropic, OpenAI, or Pinecone.
- Tests fail if path casing regresses.

### 10. Add one frontend smoke test or at least clean lint

Impact: Medium  
Risk: Low to Medium  
Area: `frontend/src`

ESLint currently reports many errors, mostly unused imports/vars and hook rule issues. This makes it harder to spot real issues.

Safe path:

- [ ] First PR: remove unused imports/vars only.
- [ ] Second PR: address React hook lint issues.
- [ ] Avoid changing page layout or behavior while cleaning lint.
- [ ] Consider adding a simple Playwright or Vitest smoke test later.

Done when:

- `npm run lint` passes.
- `npm run build` still passes.
- Upload page and demo result navigation still work manually.

### 11. Add an API contract fixture

Impact: Medium  
Risk: Low  
Area: backend/frontend boundary

The frontend assumes a large nested analysis JSON shape. A fixture makes it easier to refactor UI or backend without breaking the report.

Safe path:

- [ ] Save a small sanitized analysis result fixture under `tests/fixtures/` or `frontend/src/lib/`.
- [ ] Use it in frontend demo mode and backend schema tests.
- [ ] Avoid using confidential filings.

Done when:

- The demo result shape matches the live API shape closely enough to catch missing fields.
- Frontend pages can render the fixture without runtime errors.

## Priority 4: Improve Security And Data Handling

### 12. Bind jobs/results to a user or session before production use

Impact: High for real users  
Risk: Medium  
Area: `backend/api.py`, auth architecture

Results are currently retrievable by `job_id` only. UUIDs are hard to guess, but this is not enough for confidential commercial filings once the app has real users.

Safe path:

- [ ] Decide whether backend auth should use Supabase JWTs or a backend-only session cookie.
- [ ] Store job owner metadata when `/analyze` starts.
- [ ] Require the same owner for `/status/{job_id}` and `/outline/{job_id}`.
- [ ] Keep demo/local mode explicit if unauthenticated use is still desired.

Done when:

- One authenticated user cannot fetch another user's result by job ID.
- Local demo mode behavior is intentional and documented.

### 13. Tighten CORS and deployment assumptions

Impact: Medium  
Risk: Low  
Area: `backend/api.py`, deployment config

CORS currently allows all origins. That is fine for early local development but not for a production app handling confidential uploads.

Safe path:

- [ ] Add an env var such as `ALLOWED_ORIGINS`.
- [ ] Default to localhost origins in development.
- [ ] Require explicit production origins in deployment.

Done when:

- Production CORS is not `*`.
- Local Vite dev still works.

### 14. Make result retention explicit

Impact: Medium  
Risk: Low  
Area: `backend/api.py`, README

The API deletes result files after 24 hours and removes uploaded PDFs after analysis. This is good, but it should be documented because filings may be confidential.

Safe path:

- [ ] Document upload/result retention in README.
- [ ] Consider making `RESULTS_TTL_SECONDS` configurable.
- [ ] Log deletion failures enough for operators to notice, without logging sensitive filenames beyond job IDs.

Done when:

- Users and developers know how long uploaded files and generated reports remain on disk.

## Priority 5: Reduce Confusing Repo Noise

### 15. Separate app code from generated corpus/data

Impact: Medium  
Risk: Medium  
Area: `data/`, README

The repo mixes app source with hundreds of corpus JSON files. That is okay for now, but make the boundary clear.

Safe path:

- [ ] Document which data files are source-of-truth inputs and which are generated.
- [ ] Keep generated vector stores, uploads, PDFs, and chunks ignored.
- [ ] Consider moving large or regenerated corpus artifacts to a release asset or object storage later.

Done when:

- New contributors know whether changing a data file is expected or accidental.
- Rebuilding embeddings has a documented input/output flow.

### 16. Remove stale starter assets and docs

Impact: Low to Medium  
Risk: Low  
Area: `frontend/README.md`, `frontend/src/assets`

The frontend README is still the Vite template, and there are unused React/Vite starter assets.

Safe path:

- [ ] Replace `frontend/README.md` with app-specific commands.
- [ ] Remove unused starter assets only after confirming no imports reference them.
- [ ] Keep the product UI unchanged.

Done when:

- `rg "react.svg|vite.svg"` returns no live references or the files are intentionally kept.
- Frontend docs describe this app, not the template.

### 17. Add a short architecture map

Impact: Medium  
Risk: Low  
Area: `docs/`

This will help your friend and future helpers avoid random-drive-by refactors.

Suggested sections:

- [ ] User-facing flow
- [ ] Backend endpoints
- [ ] Analysis pipeline steps
- [ ] External services
- [ ] Stored data and retention
- [ ] What not to change casually

Done when:

- A new developer can understand the product flow in 10 minutes.
- The doc points to the files that own each major behavior.

### 18. Audit, archive, or delete stale docs and instruction files

Impact: Medium  
Risk: Low if done as docs-only cleanup  
Area: `README.md`, `frontend/README.md`, `SUPABASE_SETUP.md`, `instructions/`, `prompts/`, `.claude/`, existing reports

There are several docs and instruction-like files from different phases of the project. Some are useful; some appear stale or template-generated. Stale docs are risky because a new helper will follow the wrong instructions and make cleanup harder.

Safe path:

- [ ] Make an inventory of every doc/instruction file and mark it as current, stale, generated, or unknown.
- [ ] Keep one root README as the source of truth for setup and product overview.
- [ ] Move deeper technical notes into `docs/` with clear names.
- [ ] Delete template docs that no longer describe the app, such as generic Vite README content.
- [ ] Archive uncertain files under `docs/archive/` before deleting if ownership is unclear.
- [ ] Ask before deleting prompt or instruction files that may still affect the analysis quality.

Done when:

- New contributors can tell which docs to read first.
- No README gives setup instructions that contradict the code.
- Old reports or generated outputs are clearly marked or removed from the active documentation path.

### 19. Consolidate generated artifacts and scratch files

Impact: Medium  
Risk: Medium because generated files can look important  
Area: `data/`, `report.json`, temporary scripts, `.gitignore`

The repo contains application code, generated analysis outputs, corpus sidecars, ignored/generated vector data, and scratch-style paths in `.gitignore`. That makes it hard to know what should be reviewed in a PR.

Safe path:

- [ ] Identify checked-in generated outputs, including `report.json`, summaries, and any analysis result JSON that is not part of the corpus.
- [ ] Decide which generated files are fixtures, which are corpus source data, and which should be ignored.
- [ ] Move reusable fixtures into `tests/fixtures/` with sanitized names.
- [ ] Move generated reports that are useful examples into `docs/examples/` or delete them.
- [ ] Clean odd scratch entries from `.gitignore` once the corresponding files are gone.
- [ ] Keep upload directories, vector stores, chunks, PDFs, caches, and local env files ignored.

Done when:

- A normal feature PR does not mix app source changes with accidental generated output changes.
- `git status` after running the app locally stays clean except for intentional edits.
- `.gitignore` reads like project policy, not a pile of one-off accidents.

### 20. Add lightweight repo conventions

Impact: Medium  
Risk: Low  
Area: repo root, docs

Small conventions reduce accidental churn without imposing a heavy process on a work-in-progress app.

Safe path:

- [ ] Add a short `CONTRIBUTING.md` or `docs/contributing.md` focused on local setup, PR size, and verification commands.
- [ ] Add a repo map that explains which directories are app code, generated data, corpus data, docs, and scripts.
- [ ] Add formatting expectations only after deciding whether to use Prettier/Ruff/etc.
- [ ] Add a short "do not casually change" list for prompts, scoring weights, and corpus generation.
- [ ] Document the preferred branch/PR flow if more than one person is helping.

Done when:

- A helpful contributor can make a cleanup PR without asking which command to run.
- Prompt/scoring changes are treated as product changes, not casual cleanup.
- The repo has a clear place for future docs.

## Suggested Order

- [ ] Supabase schema docs.
- [ ] Supabase to Convex migration plan and data model.
- [ ] Path casing fix.
- [ ] Pinecone/Chroma decision and README update.
- [ ] pnpm workspace monorepo conversion.
- [ ] Frontend TypeScript foundation and shared result types.
- [ ] Python requirements cleanup.
- [ ] Stale docs and generated artifact cleanup.
- [ ] Backend smoke tests.
- [ ] Frontend lint cleanup.
- [ ] Job ownership/security hardening.

This order keeps early work mostly mechanical and low-conflict, then adds tests before deeper behavior or security changes.

## Things To Avoid For Now

- Do not rewrite the analysis prompt until there are fixtures or acceptance examples.
- Do not change scoring weights and UI labels in the same PR.
- Do not replace the frontend design system while fixing setup issues.
- Do not move the whole repo into a new framework just to clean up scripts.
- Do not rebuild or re-embed the corpus unless the current vector store decision is settled.
