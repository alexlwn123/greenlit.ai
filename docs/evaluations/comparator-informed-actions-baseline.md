# Comparator-Informed Actions Baseline

## What is restored

The comparable-filings module now consolidates the individual transferability
judgments into one action plan for each unresolved evidence-matrix question.
Every plan separates:

- the filing amendment to make;
- the smallest research, verification, or evidence-generation step needed;
- the evidence that should be assembled;
- the subject-notice pages being addressed; and
- the comparator filings, assessment labels, and PDF pages that informed the
  recommendation.

Actions are discarded if they change the unresolved question, cite an
unreviewed subject page, or cite a comparator page or conclusion that was not
validated in the preceding assessment stage.

## GRN 1256 benchmark

Five unresolved questions produced five action plans:

| Requirement | Priority | Primary first step |
| --- | --- | --- |
| Identity and composition | Major | Verify the lot and production scale used for LC-MS/MS proteomics |
| Intended uses and exposure | Major | Confirm the available young-child consumption data and compile a conservative calculation |
| Independent evidence synthesis | Critical | Reframe and document the panel's independent scientific reasoning |
| Test-article comparability: purification | Major | Compile existing process and composition records before considering new testing |
| Test-article comparability: proteomics | Major | Verify commercial-lot provenance and assemble an existing-data bridge |

The calibrated output generally checks existing production, analytical, and
panel records before recommending new evidence generation. It recommends a new
analytical step only when the records cannot establish the point.

## Grounding boundaries

- Recommendations may use comparator filings as documentation examples but not
  as proof that the subject evidence is adequate.
- Numerical thresholds, legal interpretations, studies, and factual premises
  may not be introduced unless present in the supplied subject evidence.
- Every action cites at least one reviewed subject page.
- Every comparator citation must match a validated transferability assessment.
- Amendment work and new evidence generation remain separate so that a
  documentation gap does not automatically become a new-study recommendation.

## Remaining limitations

- The action plan has not yet been merged into the downloadable amendment
  outline.
- Dependencies, owners, effort, and sequencing are not yet estimated.
- Broader corpus calibration is needed to determine priority consistency across
  ingredient categories.
