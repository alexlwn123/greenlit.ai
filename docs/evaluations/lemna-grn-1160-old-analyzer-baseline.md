# GRN 1160 Original Analyzer Baseline

## Result

The original Python/Claude analyzer is materially more capable than the
current deterministic rebuild and should be the implementation baseline for
the recovery work.

It completed its full five-stage pipeline:

1. PDF extraction
2. Claude deep analysis
3. Pinecone comparable-notice retrieval
4. Corpus scoring and benchmarking
5. Gap-report construction

The report itself was written successfully. The optional command-line summary
then raised a `KeyError` because it expected a legacy `gaps` property. That
printer defect did not affect the saved analysis.

## Top-line comparison

| Metric | Current rebuild | Original analyzer |
| --- | ---: | ---: |
| Readiness/health score | 95/100 | 43/100 |
| Detailed gaps | 1 generic minor item | 17 evidence-specific items |
| Safety signals | 3 keyword-derived statuses | 3 substantive signals |
| Recommended actions | Generic outline text | 5 gap-linked actions |
| Real comparables in top results | 0 | GRN 1256, GRN 742, GRN 1160, GRN 1072, GRN 984 |
| FDA-confirmed fixture findings recovered exactly | 0 of 3 | 1 of 3 |
| FDA-confirmed fixture concepts covered fully or partially | 0 of 3 | 2 of 3 |

The score comparison is directional only. The old health score is not yet
calibrated as a regulatory probability or submission outcome.

## Strong findings from the original analyzer

### Test-article read-across

The analyzer recovered the fixture's central confirmed deficiency:

- LLP is at least 80% protein while LENTEIN Complete is approximately 39-55%
  protein on a dry-matter basis.
- LLP has no more than 15% fiber while LENTEIN Complete has approximately
  30-45% fiber.
- No in vivo toxicology was conducted on Plantible's LLP itself.
- The notice's bridge was characterized as qualitative rather than a
  structured quantitative read-across assessment.

This maps directly to the fixture's `test-article-bridge` finding.

### Out-of-specification batch result

The analyzer identified that Batch 4 had an aerobic plate count of 22,000
CFU/g against a specification below 15,000 CFU/g and that the notice did not
explain the investigation, corrective action, or lot disposition.

This was verified directly on PDF page 15.

### Contrary NOAEL interpretation

The analyzer identified that:

- the notice reports 13.16 g/kg/day for the high-dose male Mankai group;
- EFSA selected the middle-dose male value of 6.5 g/kg/day as the NOAEL; and
- the notice's safety-margin discussion did not adequately reconcile that
  disagreement.

The two dose values and EFSA passage were verified directly on PDF page 38.

### Other useful findings

The report also identified:

- missing pepsin-digestibility data specific to LLP;
- incomplete nutrient-media disclosure;
- incomplete processing-aid quantities and residual information;
- absent filtration validation;
- exposure-estimate presentation issues;
- human-study test articles and doses that differ from Plantible's LLP;
- an unpublished expert-panel statement;
- incomplete fat testing across the five-batch analysis;
- possible standards-of-identity issues; and
- limitations caused by truncating the expert-panel appendix.

These need expert review before becoming fixture truth. They are plausible,
grounded candidates, not automatically confirmed deficiencies.

## Comparable-filing performance

The original retrieval system performed well on its top matches.

Top approved results included:

1. GRN 1256 - Lemna leaf protein resubmission
2. GRN 742 - Duckweed powder

Top withdrawn results included:

1. GRN 1160 - Lemna leaf protein
2. GRN 1072 - Lemnaceae fiber
3. GRN 984 - *Wolffia globosa*

Lower-ranked results became less relevant, which indicates that retrieval
ranking still needs a relevance threshold. Nevertheless, this is real corpus
retrieval and is substantially better than the current rebuild's generic
enzyme comparator.

## Fixture misses

The old analyzer is robust, but it should not be ported without repairs.

### Specific incorporation and independent conclusions

The report did not directly identify FDA's finding that reliance on other GRNs
was insufficiently specific and lacked independent conclusions.

The analyzer discussed read-across quality, but that is not the same as
checking whether incorporated data are identified and independently
synthesized.

**Fixture result:** Miss.

### Publicly available pivotal evidence

The report identified:

- an unpublished expert-panel statement; and
- a non-peer-reviewed nutritional digestibility source.

It correctly said unpublished material can be supportive rather than
independently establish the conclusion. However, it did not identify FDA's
more specific concern that pivotal safety evidence relied upon through other
GRNs must itself be publicly available and peer reviewed.

**Fixture result:** Partial concept coverage, not an exact recovery.

### Test-article bridge

The report directly identified the compositional differences between LLP and
the materials used in the pivotal studies and recommended a structured
read-across analysis.

**Fixture result:** Recovered.

## Modules to preserve

These parts of the original build should be ported or wrapped:

- the eight-domain deep-analysis prompt and structured result;
- evidence-specific gap generation;
- separate safety-signal output;
- gap-linked recommended actions;
- approved and withdrawn corpus retrieval;
- section-aware comparable selection;
- field-presence metadata;
- comparator rationale and material differences;
- corpus-calibrated severity signals; and
- explicit limitations and caveats.

## Modules to repair during the port

### Document selection and truncation

The analyzer extracted 473,780 characters and then retained only the first
400,000. First-N-character truncation can omit appendices and late evidence.

Replace this with section-aware selection:

- preserve the complete core narrative;
- index appendices separately;
- retrieve appendix excerpts relevant to each analysis question; and
- record exactly which pages were analyzed.

### Evidence provenance

Findings have section references but not immutable source excerpts and PDF page
numbers. Add exact excerpts, PDF pages, and source identifiers.

### Publication-role analysis

Represent pivotal versus supportive evidence and public, peer-reviewed,
private, or unknown availability explicitly. This closes one of the fixture
misses.

### Incorporation analysis

Add a specific pass that inventories every prior GRN or external dossier
incorporated by reference and tests whether the current notice:

- identifies the underlying information;
- explains its evidentiary role; and
- states an independent conclusion.

### Outcome prediction language

The old result includes `fda_pushback_probability` and statements about what
FDA will likely request. Preserve prioritization, but replace outcome
prediction with evidence-based review priority and confidence.

### Binary field presence

The old benchmark marks all seven fields present even when the report finds
their support inadequate. Presence and adequacy must be separate dimensions.

### Retrieval thresholds

Keep GRN 1256, GRN 742, GRN 1072, and GRN 984. Suppress low-relevance results
when they do not meet an auditable similarity threshold.

### Operational defects

- Repair the terminal-summary `KeyError`.
- Keep module failures independent.
- Record prompt, model, corpus, and retrieval versions.
- Remove self-matches when analyzing a historical filing unless the self-match
  is explicitly useful for validation.

## Recovery decision

Use the original analyzer as the product baseline.

Do not port it as a single opaque service. Recover it module by module behind
the current report contract:

1. deep gaps and recommendations;
2. evidence provenance;
3. documentation presence versus adequacy;
4. safety signals;
5. comparables and retrieval;
6. filing diff;
7. research references; and
8. amendment outline.

The first port should preserve the old gap-analysis prompt and structured
domain model, then add the two missing fixture checks for independent
incorporation and public pivotal evidence.
