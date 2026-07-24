# MVP User Flow Parity

This maps the old app's user-facing flow to the local v1 MVP implementation.

## Old App Routes

- `/`: submit a GRAS notice PDF, validate PDF-only input, show queued/running progress, poll analysis, or load demo result.
- `/evaluation`: report overview with score, gap counts, save nudge, section cards, export, and start-new action.
- `/evaluation/:section`: detail views for comparables, safety signals, identified gaps, documentation benchmark, recommended next steps, research, amendment outline, and filing diff.
- `/workbook`: general notes, filing status, section-note rollup, and link to history.
- `/history`: saved analyses list and reopen flow.

## New Local MVP Coverage

| Old flow | New MVP representation | Status |
| --- | --- | --- |
| Submit filing | Upload panel with PDF validation, local API upload, artifact save, analysis record creation | Covered |
| Analysis progress | Queued/running/complete/failed status callout and polling-backed history updates | Covered |
| Demo result | `Open demo` loads fixture report without API credentials | Covered |
| Evaluation overview | Readiness score, summary, score signals, findings, module sections | Covered |
| Identified gaps detail | `Identified Gaps` section with severity, rationale, recommended action, and evidence | Covered |
| Recommended next steps | `Recommended Next Steps` section generated from prioritized findings | Covered |
| Comparable filings | `Comparable Filings` report module | Covered locally with heuristic comparators |
| Safety signals | `Safety Signals` report module | Covered |
| Documentation fields | `Documentation Benchmark` report module | Covered |
| Research | `Research References` report module | Covered locally with citation/reference signals; PubMed retrieval deferred |
| Amendment outline | Inline `Amendment Outline` section plus markdown outline download | Covered locally; Word `.docx` generation deferred |
| Filing diff | `Filing Diff` report module | Covered locally against expected baseline fields; retrieved sidecar diff deferred |
| Export | Markdown report export from saved report state | Covered locally; browser print/PDF polish deferred |
| Workbook | Follow-up notes panel scoped to completed saved analyses | Covered locally |
| History | Saved analyses list with reopen flow | Covered locally |
| Auth-gated save | Local session ownership replaces Supabase auth for MVP | Covered locally; real auth deferred |

## Intentional Differences

- The old app used separate routes for report section detail. The local MVP keeps the flow on one screen with explicit report sections so upload, result review, workbook, and history can be verified quickly.
- The old app depended on Claude, OpenAI embeddings, Pinecone/sidecars, PubMed, Supabase, and Word generation. The local MVP uses deterministic analysis modules and local storage so the end-to-end product path works without external credentials.
- Production auth, hosted persistence, corpus retrieval, PubMed lookup, sidecar-backed diffing, and `.docx` outline generation remain post-local-MVP work.
