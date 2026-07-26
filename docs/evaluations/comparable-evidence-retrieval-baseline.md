# Comparable Evidence Retrieval Baseline

## What is restored

Comparable filings now advance beyond metadata ranking. For the three
highest-ranked local comparators, the application opens the filing PDF and
retrieves up to two page-specific passages for each of the nine evidence-matrix
requirements.

The retrieval remains deterministic and auditable:

- each match identifies the matrix requirement;
- each citation retains its exact PDF page and a bounded filing excerpt;
- table-of-contents and other navigation pages are strongly penalized; and
- missing or unreadable local PDFs leave the metadata result intact rather than
  failing the report.

This is evidence retrieval, not a conclusion that two ingredients or safety
packages are scientifically equivalent.

## GRN 1256 benchmark

The top three comparators remained stable after passage retrieval:

| Rank | Filing | Matrix rows with passages | Citations |
| ---: | --- | ---: | ---: |
| 1 | GRN 1160 — Lemna leaf protein | 9/9 | 18 |
| 2 | GRN 1072 — Lemnaceae fiber | 9/9 | 18 |
| 3 | GRN 1151 — Fava bean protein | 9/9 | 17 |

Representative pages were rendered and visually checked:

- GRN 1160, PDF page 10: identity, source background, composition framing, and
  the notifier's stated weight-of-evidence approach;
- GRN 1072, PDF page 22: manufacturing sequence, contaminant controls,
  pasteurization, packaging, and preventive-control framing; and
- GRN 1151, PDF page 12: product specifications, analytical methods, and
  multi-lot batch support.

The rendered pages confirmed that the PDF page numbers align with the visible
source material and that the selected passages are substantive sections rather
than contents pages.

## Remaining limitations

- Ranking is lexical within each matrix requirement; it does not yet assess
  whether a comparator passage resolves the subject filing's exact scientific
  question.
- The first three comparators receive section-level retrieval by default to
  bound latency.
- Scanned filings still depend on the quality of their embedded text layer.
- Scientific comparability, study quality, and test-article bridging still
  require analysis after retrieval.
