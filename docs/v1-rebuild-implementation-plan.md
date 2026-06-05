# greenlit.ai v1 MVP Rebuild Plan

This is the implementation checklist for an MVP rebuild of greenlit.ai v1. It follows the architecture direction in `docs/v1-rewrite-architecture.md`, but trims the work down to what is needed for a solid, complete first release.

MVP means the core workflow works end to end: a user can upload a GRAS notice, get a useful analysis, review the most important findings, save the result, return later, and track follow-up notes. Anything that does not directly support that workflow should wait.

## MVP Scope

Build:

- [ ] Clean `pnpm` TypeScript workspace.
- [ ] React app deployed on Vercel.
- [ ] Convex backend for saved work, analysis state, and workbook notes.
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

Purpose: decide the smallest complete version of the product before rebuilding.

- [ ] Choose the MVP report sections.
- [ ] Choose the required screens: submit filing, progress, report overview, findings detail, workbook, history.
- [ ] Choose one demo filing/result to use as the product fixture.
- [ ] Decide what saved work includes for MVP.
- [ ] Decide what can be deferred without making the product feel broken.
- [ ] Write one short acceptance checklist for the end-to-end user flow.

Done when:

- [ ] A reviewer can read the MVP scope and know exactly what v1 must do.
- [ ] The team agrees not to add deferred features until the core flow works.

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
- [ ] Save an analysis result.
- [ ] Reload saved analyses in history.
- [ ] Save and reload workbook notes.
- [ ] Add basic user scoping so saved work is private.
- [ ] Keep the persistence shape narrow and easy to change.
- [ ] Add a manual access-control check.

Done when:

- [ ] A signed-in user can save a demo analysis and reload it later.
- [ ] Workbook notes survive refresh.
- [ ] One user cannot read another user's saved work.

## Phase 5: Add Real Upload And AI Analysis

Purpose: replace the fixture-only path with the real MVP analysis path.

- [ ] Add PDF upload through the backend boundary.
- [ ] Add basic file validation and useful upload errors.
- [ ] Extract enough text from the PDF to support the MVP analysis.
- [ ] Run the first staged AI analysis behind the backend boundary.
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
