# Cost Controls and Quality Gates

## Zero-loss controls now active

The first cost-control release does not reduce document context, change prompts,
or substitute a cheaper model. It adds:

- durable caching keyed to the filing content, model, and pipeline version;
- independent durable caches for comparator assessment and comparator-informed
  action synthesis;
- a zero-cost cache hit for an identical repeat analysis;
- per-stage input, output, cache-write, and cache-read token accounting;
- estimated USD cost in report metadata and the report interface;
- a preflight analysis-cost ceiling; and
- an explicit override for intentional paid reruns.

The standalone research-reference module has also been removed from new deep
analyses. It duplicated source material already cited in findings and the
evidence matrix, while requiring a second model call. Filing-profile extraction
now occurs in the core analysis so comparable-filings matching is preserved.
No external literature is used to substitute for evidence missing from a filing.

The default preflight ceiling is $1.25 per filing. It is configurable with
`GREENLIT_MAX_ANALYSIS_COST_USD`. Setting the value to zero disables the ceiling.
The preflight estimate covers both the core evidence analysis and the normal
combined comparator stage, using their configured maximum outputs and a
conservative reserve for comparator input. It therefore guards the expected
whole report rather than only the first request.
`GREENLIT_FORCE_PAID_RERUN=true` bypasses an existing result cache and should be
used only for intentional evaluation work.

Comparator-stage caches remain active during a forced core rerun, so unchanged
retrieval and assessment inputs do not incur duplicate charges. An intentional
comparator-stage refresh additionally requires
`GREENLIT_FORCE_MODEL_STAGE_RERUN=true`.

First-time comparator enrichment now requests transferability assessments and
comparator-informed actions together. The existing validators still require
exact question identity and supplied subject/comparator pages. If even one
required action is missing or invalid, processing automatically falls back to
the established two-stage pipeline rather than returning a thinner report.
The combined stage's provider-reported token counts and estimated cost are
included in report metadata and the displayed whole-analysis estimate.

The paid GRN 1256 combined-stage benchmark passed with all 15 comparator
judgments and all 5 tailored actions retained. All question and citation
validators passed without invoking the two-stage fallback.

Paid evaluation tests are disabled unless `GREENLIT_RUN_PAID_EVALS=true` is set.
Deep corpus evaluations also reuse an existing fixture ID by default; replacing
one requires both the paid-evaluation flag and the paid-rerun override. Merely
having an API key in the environment can no longer trigger a live benchmark.

## Pricing assumptions

Cost estimates default to $3 per million input tokens and $15 per million output
tokens. These values are configurable because provider pricing can change:

- `GREENLIT_INPUT_COST_PER_MTOK`
- `GREENLIT_OUTPUT_COST_PER_MTOK`

The API response remains the source of token counts. Cost is labeled estimated
because negotiated pricing, batch discounts, and provider billing adjustments
may differ.

## Quality-preserving rollout gates

No context reduction, model downgrade, or deferred module becomes a production
default unless it passes all of the following against the saved Lemna and three
additional resubmission-pair fixtures:

1. canonical evidence-matrix coverage remains 9/9;
2. confirmed GRN 1160 deficiency recall remains 3/3;
3. GRN 1256 does not regress resolved deficiency controls;
4. exact citation validity remains 100%;
5. no new unsupported critical or major finding appears;
6. calibrated finding precision is no worse on the additional pairs; and
7. median estimated cost falls materially.

Cheaper configurations should first run in shadow mode and save their results
alongside the full Sonnet fixtures. The full configuration remains authoritative
until the comparison passes.

## Next cost experiments

In expected order of safety:

1. use requirement-targeted retrieval to reduce deep-analysis pages;
2. escalate ambiguous rows to Sonnet while retaining deterministic or cheaper
   results for clearly documented rows; and
3. use the Batch API for non-interactive corpus evaluation.

Each experiment is feature-flagged and benchmarked independently so savings and
quality effects can be attributed correctly.

## Targeted-context shadow result

The first requirement-targeted page selector was tested without making model
calls against eight saved deep-analysis fixtures. It retained all cited pages
for seven filings and reduced selected characters by 12.5% in aggregate. The
largest filing, GRN 1256, retained only 83.3% of its cited pages and omitted four
important late-document citations (pages 257, 259, 274, and 281). Aggregate
citation recall was 97.0%, but the per-filing 95% gate was not met.

The failed filing is an exceptional 1,428-page, attachment-heavy resubmission.
The selector is therefore enabled only for filings of 500 pages or fewer, where
all seven eligible controls retained at least 95% of cited pages. Filings above
500 pages automatically use the established full-context selector. The
benchmark remains reproducible with `GREENLIT_CONTEXT_SHADOW=true` and retains
the long-filing failure as a regression guard for the fallback boundary.
