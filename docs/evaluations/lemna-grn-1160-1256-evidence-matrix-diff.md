# GRN 1160 to GRN 1256 Evidence-Matrix Diff

## Purpose

This is the first true revision comparison produced from the shared
evidence-matrix model. Each row has exact citations in both saved analysis
fixtures; the table below summarizes the status transition.

| Requirement | GRN 1160 | GRN 1256 | Change |
| --- | --- | --- | --- |
| Identity, source, composition, and specifications | Present | Present | Unchanged |
| Process description and process-related controls | Weak | Present | Improved |
| Specifications and representative batch results | Weak | Present | Improved |
| Intended uses, use levels, and dietary exposure | Present | Present | Unchanged |
| Public availability and peer review of pivotal evidence | Weak | Present | Improved |
| Specific incorporation and independent conclusions | Weak | Weak | Unchanged residual concern |
| Target/test-article bridge | Weak | Weak | Unchanged residual concern |
| Search methods, scope, and unfavorable information | Weak | Present | Improved |
| Protein allergenicity and cross-reactivity assessment | Present | Present | Unchanged |

## Interpretation

The comparison identifies four clear documentation improvements: manufacturing
controls, batch/specification support, public pivotal evidence, and the
self-contained literature search.

The analyzer retains two scientific judgment issues in GRN 1256:

- whether the expert panel statement is sufficiently independent from its
  substantial-equivalence framing around GRN 742; and
- whether the cross-species Mankai-to-LLP bridge is strong enough for the
  pivotal subchronic evidence.

Those rows remain `weak`, not `missing`. This is a transparent analyzer
judgment rather than a claim that FDA identified a remaining deficiency.

## Regression behavior

The paired-diff implementation:

- joins filings on stable evidence-requirement IDs;
- classifies each row as improved, unchanged, regressed, or not comparable;
- retains the baseline and revised status and assessment;
- retains exact citations from both filings; and
- generates an action based on the revised row's unresolved questions.
