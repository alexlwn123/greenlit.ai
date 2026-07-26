# Additional Resubmission-Pairs Calibration

## Selected controls

Three explicit withdrawn-to-resubmitted pairs were selected from the legacy
corpus:

| Baseline | Resubmission | Ingredient class |
| --- | --- | --- |
| GRN 755 | GRN 828 | D-allulose/D-psicose carbohydrate |
| GRN 867 | GRN 882 | Rebaudioside M sweetener |
| GRN 866 | GRN 908 | Lipase enzyme preparation |

The local PDFs are readable and the revised filenames or cover materials
identify them as resubmissions or replacements. A superficially similar rice
hull pair, GRNs 426 and 478, was rejected after PDF inspection showed different
notifiers and products.

## Deterministic passage baseline

Before model-based judgment, all six PDFs were tested against the nine canonical
evidence requirements:

| Pair | Baseline pages | Revised pages | Baseline rows with passages | Revised rows with passages |
| --- | ---: | ---: | ---: | ---: |
| GRN 755 → 828 | 37 | 44 | 8/9 | 8/9 |
| GRN 867 → 882 | 62 | 61 | 9/9 | 9/9 |
| GRN 866 → 908 | 28 | 83 | 8/9 | 9/9 |

The absent allergenicity passages in both D-psicose notices are expected for a
non-protein ingredient. The lipase resubmission adds retrievable independent
evidence-synthesis and stronger literature-search passages. Lexical passage
scores are intentionally not treated as adequacy or resolution judgments.

## GRN 755 exploratory deep result

The live deep analyzer completed the withdrawn GRN 755 filing before model
credits were exhausted. It returned:

- nine evidence-matrix rows: three present and six weak;
- six findings;
- three safety signals; and
- 15 notifier-cited research references.

All findings contain exact excerpts and filing pages. The run is an exploratory
precision-control fixture, not expert-labeled truth.

Three findings warrant particular human calibration before becoming benchmark
expectations:

- whether unconfirmed publication status of the cited human tolerance study is
  a material public-pivotal-evidence gap;
- whether a full-replacement exposure assumption creates a distinct cumulative
  exposure deficiency; and
- whether private production-organism studies merit a separate minor finding
  when they are not the pivotal safety foundation.

These are useful potential overcall signals because the restored prompt intends
to suppress speculative exposure findings, private supportive-study findings,
and low-value minor findings.

## Completed paired deep comparison

After API credits were restored, all six filings completed deep analysis.

| Pair | Raw findings | Calibrated findings | Matrix changes |
| --- | ---: | ---: | --- |
| GRN 755 → 828 | 6 → 6 | 5 → 6 | Intended-use/exposure improved |
| GRN 867 → 882 | 7 → 5 | 7 → 5 | No status changes |
| GRN 866 → 908 | 7 → 5 | 7 → 4 | Exposure and test-article bridge improved; public-pivotal evidence regressed |

The calibration layer now suppresses a minor finding when its sole basis is a
private supportive study, and collapses duplicate incorporation findings that
refer to the same prior GRN. This removes one GRN 755 finding and one GRN 908
finding from report scoring without altering the raw audit fixture.

## Precision observations

- GRN 828 improves exposure documentation but still receives six findings.
  This is a warning that approved/resubmitted notices may be over-flagged even
  when individual matrix rows improve.
- GRN 882 reduces finding count from seven to five, but no matrix status changes.
  Finding reduction and matrix resolution are therefore not interchangeable.
- GRN 908 resolves the intended-use/exposure and test-article documentation
  rows. The same pivotal Kondo study is nevertheless assessed as public in the
  baseline and uncertain in the revision, producing a regression. This is a
  cross-version consistency defect, not encoded as benchmark truth.
- The GRN 908 raw result emitted major and minor findings about incorporation of
  GRN 68. Deterministic same-GRN deduplication retains only the major root cause.

The pair-aware consistency pass now checks apparent regressions against shared
citation text. It suppresses a regression only when the revision cites
materially the same evidence and the weaker label is based solely on a fact not
being explicitly restated or reconfirmed. The raw revised status remains
visible, and the diff records the adjustment and reason.

This corrects the GRN 866 to GRN 908 Kondo-study comparison: the revised row
remains `weak` as a standalone assessment, but the cross-version change is
`unchanged` rather than `regressed`. New contradictory evidence, a different
study, or materially different citation text prevents the adjustment.
