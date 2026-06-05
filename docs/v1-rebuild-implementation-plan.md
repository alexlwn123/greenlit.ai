# greenlit.ai v1 MVP Rebuild Plan

This is the implementation checklist for an MVP rebuild of greenlit.ai v1. It follows the architecture direction in `docs/v1-rewrite-architecture.md`, but trims the work down to what is needed for a solid, complete first release.

MVP means the core workflow works end to end: a user can upload a GRAS notice, get a useful analysis, review the most important findings, save the result, return later, and track follow-up notes. Anything that does not directly support that workflow should wait.

The rebuild should ship in two feature categories:

1. Upload and analysis backbone: upload a document, save it, extract enough content, produce a minimum readiness score, and persist/reload the result.
2. Post-analysis tools: gap analysis, comparable filings, safety signals, documentation benchmarking, filing diff, research references, amendment outline, export, and workbook follow-up.

The architecture should not require every analysis tool to run at once. It should require a stable report contract and modular analysis outputs so post-analysis tools can be added one by one without rebuilding upload, storage, job state, ownership, or saved-report plumbing.

## MVP Scope

Build:

- [x] Clean `pnpm` TypeScript workspace.
- [ ] React app deployed on Vercel.
- [ ] Convex backend for saved-work metadata, analysis state, and workbook notes.
- [ ] Blob/S3-class artifact storage for uploaded PDFs, extracted text, generated outlines, exports, and large result JSON/report payloads that may be many megabytes or larger.
- [ ] PDF upload and text extraction path.
- [ ] AI analysis pipeline with a minimum readiness score first and modular report outputs later.
- [ ] Demo result that works without signing in.
- [ ] Signed-in save, history, and reload flow.
- [ ] Basic workbook notes for follow-up tracking.
- [ ] Minimal tests and evals that protect the MVP workflow.

Do not build yet:

- [ ] Team workspaces or organization management.
- [ ] Full data warehouse or analytics platform.
- [ ] Complex operator dashboard.
- [ ] Large historical data migration unless production data already matters.
- [ ] Multiple AI-provider comparison UI.
- [ ] Advanced corpus refresh automation.
- [ ] Fine-grained admin tooling.
- [ ] Exhaustive report sections that are not useful or reliable yet.

## Progress Overview

- [x] Phase 1: Lock the MVP product contract
- [x] Phase 2: Create the clean app foundation
- [ ] Phase 3: Build the upload, save, and minimum-score backbone
- [ ] Phase 4: Build the saved report experience
- [ ] Phase 5: Add post-analysis tools as modules
- [ ] Phase 6: Harden, deploy, and cut over

## Phase 1: Lock The MVP Product Contract

Purpose: define the current product surfaces v1 will carry forward so the rewrite does not accidentally drop differentiated behavior.

- [x] Confirm the current product surface list below is complete.
- [x] Write acceptance criteria for each surface.
- [x] Choose the required MVP screens: submit filing, progress, report overview, findings detail, workbook, history.
- [x] Choose the MVP report sections based on the current product surface list.
- [x] Choose one demo filing/result to use as the product fixture.
- [x] Decide what saved work includes for MVP.
- [x] Write one short acceptance checklist for the end-to-end user flow.

Current product surfaces to include:

- [x] PDF upload and validation. A valid draft PDF can be accepted and invalid files fail clearly.
- [x] Analysis progress. The user sees queued, running, success, and failure states in plain language.
- [x] Readiness summary and health score. The report provides a concise readiness signal and enough context to interpret it.
- [x] Identified gaps by severity/topic. The user can review the most important issues first.
- [x] Comparable filings. The report shows relevant historical comparables with enough rationale to be useful.
- [x] Safety signals. Safety-related concerns are separated from general documentation gaps.
- [x] Documentation-field benchmarking. Expected filing fields are shown as present, weak, or missing.
- [x] Filing diff. The user can compare their draft against a relevant baseline or comparable filing.
- [x] PubMed/research references. The report includes relevant research with source context.
- [x] Amendment outline download. The user can download a useful remediation outline.
- [x] Print/PDF export. The user can export the report in a shareable format.
- [x] Saved analyses. Signed-in users can save an analysis.
- [x] History. Signed-in users can reload saved analyses.
- [x] Workbook notes. Signed-in users can add and revisit follow-up notes.

Feature delivery order:

- [x] The first implementation milestone is the upload and analysis backbone: PDF upload, artifact storage, analysis record, status updates, text extraction, minimum readiness score, and persisted result.
- [x] Post-analysis tools are locked as MVP surfaces but should be implemented as separate modules after the backbone works.
- [x] The readiness score can start narrow, but it must be grounded in the uploaded document and saved with enough explanation to be useful.
- [x] Later modules should add evidence and scoring signals without forcing a rewrite of upload, persistence, ownership, status, or saved-report plumbing.

Acceptance criteria by surface:

- [x] Upload and validation: accepts a valid draft PDF, rejects invalid files clearly, and saves the upload as a private artifact.
- [x] Progress: exposes queued, running, complete, and failed states that survive refresh.
- [x] Minimum readiness score: produces a saved score, confidence/caveat text, and short rationale from extracted filing content.
- [x] Gap analysis: shows prioritized gaps with severity, rationale, and recommended action.
- [x] Comparable filings: shows relevant comparables with why they match and how they differ.
- [x] Safety signals: separates safety-specific concerns from general documentation issues.
- [x] Documentation benchmarking: marks key expected fields as present, weak, or missing.
- [x] Filing diff: compares the draft against a relevant baseline or comparable filing without hiding material differences.
- [x] Research references: shows relevant sources with enough context for review.
- [x] Amendment outline: produces a useful remediation outline that can be downloaded.
- [x] Export: creates a shareable report export from the saved report state.
- [x] Saved analyses and history: lets a signed-in user save, reload, and privately view prior analyses.
- [x] Workbook notes: lets a signed-in user add and revisit follow-up notes for a saved analysis.

Done when:

- [x] A reviewer can read the MVP scope and know exactly what v1 must do.
- [x] The team agrees not to add new surfaces until the current product surfaces work.
- [x] Every current surface has product-level acceptance criteria.

## Phase 2: Create The Clean App Foundation

Purpose: set up the rebuild so the rest of the work lands on stable ground.

- [x] Create a clean `pnpm` workspace with one lockfile.
- [x] Add React, TypeScript, Vitest, and Biome.
- [x] Add server-side TypeScript support for backend work.
- [x] Add basic Biome format/lint, typecheck, test, and build commands.
- [x] Add minimal `.env.example` files.
- [x] Add a short local setup guide.
- [x] Remove or archive stale v0 docs and starter files that would confuse the MVP rebuild.

Done when:

- [x] A new developer can install, run, test, typecheck, and build from the repo root.
- [x] There is one obvious way to run the app locally.

## Phase 3: Build The Upload, Save, And Minimum-Score Backbone

Purpose: prove the real product backbone before adding richer report tools.

- [ ] Connect the React app to Convex.
- [ ] Add session or authentication support for private saved work.
- [ ] Add PDF upload through the backend boundary.
- [ ] Store uploaded PDFs in blob/S3-class artifact storage.
- [ ] Create an analysis record with owner/session binding, status, upload artifact reference, and timestamps.
- [ ] Add basic file validation and useful upload errors.
- [ ] Extract enough text from the PDF to support a first-pass score.
- [ ] Decide whether OCR or heavy PDF processing needs a narrow TypeScript worker.
- [ ] Run the first narrow analysis behind the backend boundary.
- [ ] Produce a minimum readiness score with short rationale and caveats.
- [ ] Return and persist the result through the same report contract later modules will extend.
- [ ] Save enough run metadata to debug prompt/model changes.
- [ ] Add loading, queued, running, complete, and failed states for the upload flow.
- [ ] Add basic tests for upload validation, prompt input construction, and output parsing.

Done when:

- [ ] A real uploaded PDF is saved as a private artifact.
- [ ] A real uploaded PDF produces a saved minimum readiness score.
- [ ] Failed uploads or analysis failures produce recoverable user-facing errors.
- [ ] The team can reload a saved minimum-score result after refresh.
- [ ] The upload, storage, status, ownership, and report-contract plumbing can support later modules without redesign.

## Phase 4: Build The Saved Report Experience

Purpose: make the saved analysis useful to review before the richer analysis modules are complete.

- [ ] Build the submit filing screen with upload and demo-result paths.
- [ ] Build analysis progress states from real analysis status.
- [ ] Build the report overview from the saved minimum-score result and demo fixture.
- [ ] Build the findings detail view for the first narrow score rationale.
- [ ] Build history and unauthenticated save prompts.
- [ ] Reload saved analyses in history.
- [ ] Add basic user scoping so saved work is private.
- [ ] Require authenticated ownership or explicit session binding for upload, status, result, saved report, notes, and outline access.
- [ ] Store large result JSON/report payloads, uploaded files, generated outlines, and extracted text in blob/S3-class storage rather than Convex documents.
- [ ] Treat artifact access as reference-based and chunk/stream large files instead of assuming they fit in server memory.
- [ ] Keep the persistence shape narrow and easy to change.
- [ ] Add a manual access-control check.
- [ ] Add a small test around rendering a saved report.

Done when:

- [ ] A signed-in user can reload a saved analysis later.
- [ ] One user cannot read another user's saved work.
- [ ] Private artifacts are accessible only through authorized backend-controlled references.
- [ ] The report UI does not depend on placeholder sections that are not implemented yet.

## Phase 5: Add Post-Analysis Tools As Modules

Purpose: add the locked MVP report tools one at a time on top of the saved analysis backbone.

- [ ] Classify each v0 analysis subsystem as port, wrap, replace, defer, or delete before removing the old path.
- [ ] Add gap analysis with severity, rationale, and recommended action.
- [ ] Add comparable filings with match rationale and material differences.
- [ ] Add safety signals separated from general documentation gaps.
- [ ] Add documentation-field benchmarking.
- [ ] Add filing diff against a relevant baseline or comparable.
- [ ] Add PubMed/research references with source context.
- [ ] Add amendment outline download.
- [ ] Add print/PDF export.
- [ ] Build the workbook UI and save/reload workbook notes.
- [ ] Pass only needed filing text and selected retrieved chunks to model providers for each module.
- [ ] Persist module outputs through the shared report contract.
- [ ] Add deterministic cleanup for display ordering and missing fields.
- [ ] Add representative AI fixtures for each module as it lands.
- [ ] Add module-level tests for prompt input construction and output parsing.
- [ ] Add a small eval checklist for whether each module is useful, grounded, and complete enough for MVP.

Done when:

- [ ] Each post-analysis tool can be added, changed, or disabled without breaking upload/save/minimum-score flow.
- [ ] A real uploaded PDF produces a useful MVP report composed from the enabled modules.
- [ ] The team can rerun representative fixtures before changing prompts or models.
- [ ] Each preserved v0 subsystem has an MVP acceptance check or an intentional replacement.

## Phase 6: Harden, Deploy, And Cut Over

Purpose: make the MVP safe and reviewable.

- [ ] Deploy the React app on Vercel.
- [ ] Pair the deployed app with the correct Convex environment.
- [ ] Document required production and preview environment variables.
- [ ] Confirm secrets are not exposed to the browser.
- [ ] Define uploaded-file and generated-report retention for MVP.
- [ ] Review logs for accidental confidential filing content.
- [ ] Run the end-to-end MVP checklist in preview.
- [ ] Fix critical UI, auth, upload, analysis, and save/reload bugs.
- [ ] Confirm each post-analysis module can fail independently without blocking the saved minimum-score result.
- [ ] Archive v0 code and docs only after the v1 path is verified.

Done when:

- [ ] A reviewer can complete the MVP workflow from a hosted URL.
- [ ] Save, reload, workbook notes, and private access all work in preview.
- [ ] The team has a clear rollback or v0 fallback plan.

## MVP Quality Gates

- [ ] Local setup works from a fresh checkout.
- [ ] Typecheck, tests, and build pass.
- [ ] Demo mode works without AI credentials.
- [ ] Real upload mode works with configured credentials.
- [ ] The minimum-score report is useful before post-analysis modules are enabled.
- [ ] The full MVP report is useful without relying on placeholder sections.
- [ ] AI failures do not crash the app or leave the user stuck.
- [ ] Post-analysis module failures do not block saved upload or minimum-score results.
- [ ] Saved work survives refresh.
- [ ] User-scoped data is private.
- [ ] Retention expectations are documented before real user uploads.

## Decisions To Make Only When Needed

- [ ] Exact persistence shape.
- [ ] Exact report contract details beyond the minimum-score backbone.
- [ ] Auth provider details beyond MVP needs.
- [ ] Whether any PDF or OCR work needs a separate TypeScript worker.
- [ ] Whether corpus automation is needed for MVP.
- [ ] Whether existing v0 saved data needs migration.

## Suggested First PRs

- [ ] MVP scope note and demo fixture.
- [x] Clean `pnpm` workspace with React, TypeScript, Vitest, and Biome.
- [ ] Convex upload/save/minimum-score backbone.
- [ ] Saved report overview and basic test.
- [ ] First post-analysis module wired into the MVP report.
- [ ] Additional post-analysis modules added one by one.
