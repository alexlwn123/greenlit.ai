# greenlit.ai v1 MVP Rebuild Plan

This is the implementation checklist for an MVP rebuild of greenlit.ai v1. It follows the architecture direction in `docs/v1-rewrite-architecture.md`, but trims the work down to what is needed for a solid, complete first release.

MVP means the core workflow works end to end: a user can upload a GRAS notice, get a useful analysis, review the most important findings, save the result, return later, and track follow-up notes. Anything that does not directly support that workflow should wait.

## MVP Scope

Build:

- [ ] Clean `pnpm` TypeScript workspace.
- [ ] React app deployed on Vercel.
- [ ] Convex backend for saved-work metadata, analysis state, and workbook notes.
- [ ] Blob/S3-class artifact storage for uploaded PDFs, extracted text, generated outlines, exports, and large result JSON/report payloads that may be many megabytes or larger.
- [ ] PDF upload and text extraction path.
- [ ] AI analysis pipeline with structured, reviewable output.
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

- [ ] Phase 1: Lock the MVP product contract
- [ ] Phase 2: Create the clean app foundation
- [ ] Phase 3: Build the fixture-driven product experience
- [ ] Phase 4: Add Convex saved work
- [ ] Phase 5: Add real upload and AI analysis
- [ ] Phase 6: Harden, deploy, and cut over

## Phase 1: Lock The MVP Product Contract

Purpose: define the current product surfaces v1 will carry forward so the rewrite does not accidentally drop differentiated behavior.

- [ ] Confirm the current product surface list below is complete.
- [ ] Write acceptance criteria for each surface.
- [ ] Choose the required MVP screens: submit filing, progress, report overview, findings detail, workbook, history.
- [ ] Choose the MVP report sections based on the current product surface list.
- [ ] Choose one demo filing/result to use as the product fixture.
- [ ] Decide what saved work includes for MVP.
- [ ] Write one short acceptance checklist for the end-to-end user flow.

Current product surfaces to include:

- [ ] PDF upload and validation. A valid draft PDF can be accepted and invalid files fail clearly.
- [ ] Analysis progress. The user sees queued, running, success, and failure states in plain language.
- [ ] Readiness summary and health score. The report provides a concise readiness signal and enough context to interpret it.
- [ ] Identified gaps by severity/topic. The user can review the most important issues first.
- [ ] Comparable filings. The report shows relevant historical comparables with enough rationale to be useful.
- [ ] Safety signals. Safety-related concerns are separated from general documentation gaps.
- [ ] Documentation-field benchmarking. Expected filing fields are shown as present, weak, or missing.
- [ ] Filing diff. The user can compare their draft against a relevant baseline or comparable filing.
- [ ] PubMed/research references. The report includes relevant research with source context.
- [ ] Amendment outline download. The user can download a useful remediation outline.
- [ ] Print/PDF export. The user can export the report in a shareable format.
- [ ] Saved analyses. Signed-in users can save an analysis.
- [ ] History. Signed-in users can reload saved analyses.
- [ ] Workbook notes. Signed-in users can add and revisit follow-up notes.

Done when:

- [ ] A reviewer can read the MVP scope and know exactly what v1 must do.
- [ ] The team agrees not to add new surfaces until the current product surfaces work.
- [ ] Every current surface has product-level acceptance criteria.

## Phase 2: Create The Clean App Foundation

Purpose: set up the rebuild so the rest of the work lands on stable ground.

- [ ] Create a clean `pnpm` workspace with one lockfile.
- [ ] Add React, TypeScript, and Vitest.
- [ ] Add server-side TypeScript support for backend work.
- [ ] Add basic format, lint, typecheck, test, and build commands.
- [ ] Add minimal `.env.example` files.
- [ ] Add a short local setup guide.
- [ ] Remove or archive stale v0 docs and starter files that would confuse the MVP rebuild.

Done when:

- [ ] A new developer can install, run, test, typecheck, and build from the repo root.
- [ ] There is one obvious way to run the app locally.

## Phase 3: Build The Fixture-Driven Product Experience

Purpose: rebuild the product UI before wiring in real backend and AI complexity.

- [ ] Build the submit filing screen with upload and demo-result paths.
- [ ] Build analysis progress states using mock data.
- [ ] Build the report overview from the demo fixture.
- [ ] Build the findings detail view for the highest-value gap review workflow.
- [ ] Build the workbook UI with local-only note state.
- [ ] Build history and unauthenticated save prompts.
- [ ] Add loading, empty, and error states for the MVP flow.
- [ ] Add a small test around rendering the demo result.

Done when:

- [ ] The full MVP workflow can be clicked through without live backend or AI.
- [ ] The UI does not show placeholder sections that are not part of MVP.
- [ ] The demo fixture renders consistently in local development and tests.

## Phase 4: Add Convex Saved Work

Purpose: make the fixture workflow persistent without over-designing the data model.

- [ ] Connect the React app to Convex.
- [ ] Add authentication for saved work.
- [ ] Save analysis metadata and summary fields in Convex.
- [ ] Store large result JSON/report payloads, uploaded files, generated outlines, and extracted text in blob/S3-class storage rather than Convex documents.
- [ ] Treat artifact access as reference-based and chunk/stream large files instead of assuming they fit in server memory.
- [ ] Reload saved analyses in history.
- [ ] Save and reload workbook notes.
- [ ] Add basic user scoping so saved work is private.
- [ ] Require authenticated ownership or explicit session binding for upload, status, result, saved report, notes, and outline access.
- [ ] Keep the persistence shape narrow and easy to change.
- [ ] Add a manual access-control check.

Done when:

- [ ] A signed-in user can save a demo analysis and reload it later.
- [ ] Workbook notes survive refresh.
- [ ] One user cannot read another user's saved work.
- [ ] Private artifacts are accessible only through authorized backend-controlled references.

## Phase 5: Add Real Upload And AI Analysis

Purpose: replace the fixture-only path with the real MVP analysis path.

- [ ] Classify each v0 analysis subsystem as port, wrap, replace, defer, or delete before removing the old path.
- [ ] Add PDF upload through the backend boundary.
- [ ] Add basic file validation and useful upload errors.
- [ ] Extract enough text from the PDF to support the MVP analysis.
- [ ] Decide whether OCR or heavy PDF processing needs a narrow TypeScript worker.
- [ ] Run the first staged AI analysis behind the backend boundary.
- [ ] Pass only needed filing text and selected retrieved chunks to model providers.
- [ ] Return the AI result through the same report contract used by the fixture.
- [ ] Save enough run metadata to debug prompt/model changes.
- [ ] Add deterministic cleanup for display ordering and missing fields.
- [ ] Add one or two representative AI fixtures.
- [ ] Add basic tests for prompt input construction and output parsing.
- [ ] Add a small eval checklist for whether the report is useful, grounded, and complete enough for MVP.

Done when:

- [ ] A real uploaded PDF produces a useful MVP report.
- [ ] Failed uploads or AI failures produce recoverable user-facing errors.
- [ ] The team can rerun at least one fixture before changing prompts or models.
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
- [ ] The MVP report is useful without relying on placeholder sections.
- [ ] AI failures do not crash the app or leave the user stuck.
- [ ] Saved work survives refresh.
- [ ] User-scoped data is private.
- [ ] Retention expectations are documented before real user uploads.

## Decisions To Make Only When Needed

- [ ] Exact persistence shape.
- [ ] Exact report contract details.
- [ ] Auth provider details beyond MVP needs.
- [ ] Whether any PDF or OCR work needs a separate TypeScript worker.
- [ ] Whether corpus automation is needed for MVP.
- [ ] Whether existing v0 saved data needs migration.

## Suggested First PRs

- [ ] MVP scope note and demo fixture.
- [ ] Clean `pnpm` workspace with React, TypeScript, and Vitest.
- [ ] Fixture-driven report overview and basic test.
- [ ] Convex saved-work spike.
- [ ] Real upload and extraction spike.
- [ ] First AI analysis path wired into the MVP report.
