# Original Analyzer Restoration Status

## Current conclusion

The original analyzer can be rebuilt from the old implementation; recreation
from scratch is not necessary. Its domain model and assessment instructions
remain useful, but its orchestration, output validation, retrieval, and ranking
need to be ported selectively into the current application.

The first restored slice—evidence-backed gap analysis—is working end to end.
It should be treated as a calibrated beta rather than a finished regulatory
review product.

## Restored now

### Identified gaps and recommended next steps

- Ported the original eight-domain assessment approach.
- Added explicit incorporation, public-pivotal-evidence, and test-article bridge
  checks.
- Added gap type, analytical domain, confidence, evidence role, availability,
  target material, test article, and bridge assessment.
- Requires exact filing excerpts and one-based PDF page citations.
- Produces a specific corrective action for every finding.
- Ranks findings by severity and confidence and limits the report to ten.

### Safety signals

- Deep analysis replaces keyword-only safety signals.
- Signals require filing evidence and page-level citations.
- Output is limited to five prioritized signals.
- Prompt rules reject ordinary nutrient contribution and near-specification
  results unless a concrete hazard, exceedance, threshold conflict, or exposure
  concern is documented.

### Documentation benchmark

- Deep analysis now produces a nine-row evidence matrix covering identity,
  manufacturing, specifications, exposure, public pivotal evidence,
  independent synthesis, test-article comparability, literature search, and
  allergenicity.
- Every row records status, adequacy rationale, evidence summary, exact
  citations, unresolved questions, and linked findings.
- The documentation benchmark and filing diff are derived from this shared
  matrix rather than independent keyword checks.

### Amendment outline

- Findings are grouped into Parts 1 through 6 of the filing rather than copied
  into a flat list.
- Each section retains priority, domains, finding IDs, corrective actions,
  unresolved matrix questions, and deduplicated filing citations.
- The downloadable outline and report interface expose the same traceability.

### Evidence integrity and long-document handling

- PDF extraction preserves page boundaries.
- Long filings retain the core narrative, evidence-heavy pages, and ending
  appendices within the analysis budget.
- Anthropic structured output guarantees parseable JSON matching a closed
  schema.
- A deep-analysis failure preserves the minimum report and records a caveat
  rather than losing the whole analysis.
- Report construction now rejects finding citations outside the analyzed page
  set, downgrades unsupported present/weak evidence rows, removes dangling
  finding links, and prevents ungrounded safety gaps from reaching scoring or
  display.
- Research verification and comparator retrieval, assessment, and action
  synthesis fail independently. A failure retains the grounded core report and
  adds a visible caveat describing the missing enrichment.

### Report interface

- Findings and safety signals display exact excerpts and PDF page numbers.
- Filing diff and research references are visible.
- Comparable-filing differences are visible.
- All previously visible report modules remain available.
- Shareable report exports include the evidence matrix, comparator rationale and
  retrieved passages, filing diff, verified-reference status, amendment plan,
  and workbook notes.

## Corpus validation

### GRN 1160 positive control

- Recovered all three FDA-confirmed deficiencies.
- All three include exact filing excerpts, page references, and specific
  corrective actions.
- Confirmed-finding recall: 3/3.

### GRN 1256 resolution control

- Recognized independent incorporation as present rather than absent.
- Distinguished public pivotal evidence from unpublished supportive evidence.
- Recognized the Mankai-to-LLP bridge as present; residual strength concerns
  were classified as partial rather than missing.
- Citation pages are restricted to the pages actually supplied to the model.

The 1256 run still emits debatable minor findings. They are retained as
calibration observations and are not encoded as benchmark truth.

### Additional resubmission controls

Three additional explicit pairs are now fixed as calibration controls:
GRN 755→828 (D-psicose), GRN 867→882 (rebaudioside M), and GRN 866→908
(lipase). Deterministic page-level retrieval covers at least eight of nine
canonical requirements in every filing and all nine in three of the six.

All six deep runs are complete. GRN 755→828 improves exposure documentation;
GRN 866→908 improves exposure and test-article comparability; and GRN 867→882
reduces finding count without changing matrix status. The benchmark also
exposed a cross-version inconsistency in publication-status treatment and a
duplicate-incorporation pattern. Deterministic calibration now suppresses
low-value private-supportive minor findings and deduplicates incorporation
findings tied to the same prior GRN.

## Modules not yet fully restored

### Comparable filings

The legacy corpus has been packaged into a validated 670-record metadata index.
Comparable filings are ranked using explicit ingredient-family, substance,
production, organism, intended-use, population, evidence, and exposure-method
criteria. Results retain scores, differences, GRN numbers, statuses, and source
URLs.

Ranked results carry an explicit comparison strength and permitted research use.
Strong family-and-production matches may enter requirement-specific evidence
retrieval; moderate matches are labeled as documentation analogs; weak matches
remain context only and cannot enter model-based transferability assessment.

The top three local comparator PDFs now receive section-level retrieval against
all nine evidence-matrix requirements. Matches retain exact PDF pages and
bounded excerpts, and navigation pages are suppressed. The GRN 1256 benchmark
retrieved passages for 9/9 requirements from GRNs 1160, 1072, and 1151.

Those passages are now assessed against each unresolved subject question using
explicit transferability labels and citation validation. The GRN 1256 benchmark
produced 15/15 required judgments: four supportive with limitations, seven
contextual only, three not transferable, and one insufficient-information
fallback. None was classified as directly dispositive.

The judgments are synthesized into a distinct comparator-informed action
module. The GRN 1256 benchmark produces one traceable amendment and research
plan for each of its five unresolved questions. Each plan validates both
subject-notice pages and comparator-assessment pages, and it prioritizes
existing-record verification before new evidence generation. A retrieved or
assessed match remains a research waypoint, not a scientific-equivalence
conclusion.

Those five plans are now merged into the amendment outline as ordered work
packages with suggested owner roles, dependencies, deliverables, subject
citations, and comparator sources. The interface and Markdown download expose
the same execution metadata.

### Filing diff

The filing-to-requirement diff remains available as the default benchmark view.
Completed saved analyses can now be compared directly against another completed
filing owned by the same user. The revision comparison uses stable evidence-matrix
keys, retains exact citations from both documents, and classifies support as added,
removed, strengthened, weakened, modified, unchanged, or not comparable. Each
change also receives a materiality label and a plain-language explanation.

### Research references

Deep analysis now extracts up to 15 safety-relevant references explicitly cited
by the notifier, including printed metadata, filing pages, evidentiary role, and
provenance. Missing metadata is not completed from model memory, and extracted
references are visibly marked unverified.

Crossref metadata verification is now available as an opt-in stage. It
preserves notifier metadata, records matched bibliographic metadata separately,
and exposes conflicts. In the GRN 1160 fixture, all 15 prioritized references
matched and four metadata differences were retained for review.

Verified and extracted references are now deduplicated by normalized DOI or
title and publication year. The retained record preserves every filing page on
which the duplicate citations appeared and records the collapsed reference IDs.

Source verification now checks PMC full text first, PubMed abstracts second,
and controlled DOI resolution third. The report distinguishes full text,
abstract-only access, and landing-page resolution and preserves the resolved
identifier and trusted source URL. Future Greenlit-recommended research has a
separate origin and must not be mixed with notifier-cited evidence.

The minimum fallback no longer turns year-like tokens, DOI markers, or PMID
markers into synthetic research-reference records. It leaves the module empty
until a source can be identified by the grounded deep extractor.

### Readiness-score calibration

The readiness score is now calculated from the nine-domain evidence matrix
rather than only the count of findings. Safety-critical exposure and public
pivotal-evidence domains carry the largest weights; weak evidence earns partial
credit; not-applicable domains are excluded and the remaining weights are
normalized. Reports without an evidence matrix retain the legacy severity
fallback so minimum analysis remains available.

A blind-review package now includes finding-level expert labels, and the shared
calibration evaluator reports precision, recall, critical false positives,
score medians, and domain-level performance. Numerical calibration remains
provisional until reviewers complete those labels.

### Safety-signal calibration

Safety-signal post-processing now rejects ungrounded gap/watch signals,
deduplicates signals derived from the same cited passage, and prioritizes gaps
over watch items and clear observations. Expert review is still required to
establish thresholds for exposure margins, nutrient upper limits, contaminant
specifications, vulnerable populations, and study-finding relevance.

## Recommended next validation order

1. Run broader withdrawn/no-questions pairs to calibrate precision, not only
   recall.
2. Complete blind domain-expert labels and tune ranking and suppression against
   the recorded precision, recall, and critical-false-positive metrics.
3. Revisit the provisional domain weights only after the labeled review set is
   large enough to support defensible thresholds.

This order keeps every later module grounded in the same evidence model instead
of creating separate, inconsistent analyses.

## Cost controls

Exact-result caching, per-stage token accounting, report-level cost display, a
configurable preflight cost ceiling, and an explicit paid-rerun override are now
implemented. These controls do not alter model context or prompts. Cheaper
models and deferred modules remain shadow-mode experiments. Reduced context is
now limited to filings of 500 pages or fewer, where all seven eligible controls
passed the citation-recall gate. Longer filings automatically retain the full
evidence-context path; the 1,428-page GRN 1256 control verifies that fallback.
