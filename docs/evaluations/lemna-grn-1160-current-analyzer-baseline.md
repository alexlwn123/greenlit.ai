# GRN 1160 Current Analyzer Baseline

## Result

The current production extraction path successfully read GRN 1160, but the
current deterministic analyzer failed the Lemna evaluation fixture.

| Metric | Result |
| --- | ---: |
| PDF pages extracted | 230 |
| Extracted characters before scorer normalization | 496,452 |
| Normalized characters scored | 474,595 |
| Reported readiness score | 95/100 |
| FDA-confirmed findings recovered | 0 of 3 |
| Confirmed-finding recall | 0% |
| Fixture benchmark statuses matched exactly | 3 of 9 |
| Expected safety concepts meaningfully identified | 1 of 5 |
| Findings with page-level or excerpt grounding | 0 |
| Fixture pass | No |

The production code path exercised was:

1. `extractPdfText` from `apps/api/src/pdf.ts`
2. `createMinimumReadinessReport` from
   `packages/core/src/minimumScore.ts`
3. the standard `ReadinessReport` contract

The input source was verified by SHA-256 against the fixture:
`8eff49d11b3d9557018e590866dcb7405026056afe989cf25c3593a728935c78`.

## What the analyzer returned

The report:

- scored the notice 95/100;
- summarized it as structurally ready for deeper review;
- produced one minor finding named `Ready for deeper module review`;
- marked all seven generic documentation fields `present`;
- classified safety-evidence presence as `clear`;
- classified adverse-endpoint language as `clear`;
- returned a generic enzyme-preparation filing as its comparable;
- marked all generic filing-diff rows `aligned`; and
- generated a generic amendment outline.

## Required findings missed

### 1. Specific incorporation and independent conclusions

**Expected:** A major finding that GRN 1160 relies on other GRNs without
specific incorporation and sufficient independent synthesis.

**Actual:** No finding. The analyzer treats references and citation language as
positive source-support signals.

**Cause:** The scorer tests whether reference-related words are present. It
does not evaluate what evidence is being incorporated, whether the underlying
evidence is identified, or whether the notifier states an independent
conclusion.

### 2. Publicly available pivotal safety evidence

**Expected:** A critical or major finding distinguishing public,
peer-reviewed pivotal evidence from supportive or indirectly referenced
information.

**Actual:** No finding. `Safety evidence` and `References` are both marked
`present`.

**Cause:** Any occurrence of terms such as `safety`, `toxicology`, `journal`,
`study`, and `publication` increases the score. Publication status and the
pivotal/supportive role of evidence are not represented.

### 3. Test-article comparability bridge

**Expected:** A critical finding that the notice does not sufficiently
demonstrate why results from Mankai, LENTEIN Complete, and other duckweed
materials extrapolate to Plantible's LLP.

**Actual:** No finding. The report marks safety and exposure as present and
the related filing-diff rows as aligned.

**Cause:** The current analyzer has no representation of a study test article,
target material, comparator relationship, or extrapolation rationale.

## Documentation benchmark failures

The current benchmark is a keyword-presence checklist, not a documentation
quality benchmark.

| Fixture field | Expected for GRN 1160 | Current output | Assessment |
| --- | --- | --- | --- |
| Identity and composition | Present | Present | Correct |
| Manufacturing | Present | Present | Correct |
| Specifications and batch analysis | Present | Present | Correct |
| Intended uses and exposure | Weak | Present | False clear |
| Public pivotal safety evidence | Weak | Not represented; generic safety marked present | Missing capability |
| Independent evidence synthesis | Weak | Not represented | Missing capability |
| Test-article comparability | Weak | Not represented | Missing capability |
| Self-contained literature search | Weak | Generic references marked present | False clear |
| Allergenicity assessment | Weak | Not represented | Missing capability |

The distinction between `weak` and `present` cannot work reliably while status
is derived from keyword counts.

## Safety-signal failures

The fixture expects review of:

- cross-species and cross-product extrapolation;
- test-article composition and processing comparability;
- study-dose relationship to intended exposure;
- potential allergenicity and cross-reactivity; and
- minor-constituent and anti-nutrient controls.

The current output identifies only a generic exposure-linkage watch item. It
does not identify the comparator materials, relevant species, product forms,
or the missing bridge. Its `clear` classifications mean only that safety words
and endpoint words occur in the PDF.

This is unsafe product behavior: the presence of adverse-effect terminology
does not demonstrate that adverse endpoints were adequately evaluated.

## Unsupported and misleading output

### Comparable filing

The analyzer selected `Enzyme preparation GRAS notice` even though LLP is a
plant-derived protein ingredient. The current comparator is selected through a
small keyword heuristic and is not retrieved from the historical corpus.

### Research references

The analyzer emitted:

- generic DOI and PMID detection records without resolving a source;
- `Reference year 1951`;
- `Reference year 2085`;
- `Reference year 2095`; and
- `Reference year 2033`.

Future years were misclassified as research references because any text
matching a four-digit year pattern can become a reference record. These are not
valid citations and violate the fixture's no-fabrication rule.

### Filing diff

All seven rows were marked `aligned` because their associated keywords were
present. No baseline filing was selected and no two-source comparison occurred.
This is a checklist restatement, not a filing diff.

### Amendment outline

The outline recommends adding evidence and cross-references even while the
report says every section is present and aligned. It is generic and is not
traceable to a substantive finding.

## Root cause

The scorer conflates four different questions:

1. Is text extractable?
2. Does the notice mention an expected topic?
3. Is the topic supported adequately?
4. Does the support justify the notice's conclusion?

The current implementation answers only the first two, then presents the
result as if it answered all four.

Document length, citation-like markers, and topic keywords account for the
95/100 score. A long notice can therefore receive a near-perfect score while
containing the exact deficiencies FDA identified.

## First rebuild change

Do not adjust keyword weights or lower the readiness score threshold. That
would preserve the underlying failure.

The first implementation slice should introduce an evidence-oriented finding
contract for the three confirmed gaps:

- `claim`: the filing's relevant assertion;
- `sourceEvidence`: exact excerpt and PDF page;
- `supportingMaterial`: study, prior GRN, or comparator being relied upon;
- `evidenceRole`: pivotal or supportive;
- `availability`: public peer-reviewed, public non-peer-reviewed, private, or
  unknown;
- `targetMaterial`: the ingredient being evaluated;
- `testArticle`: the material actually studied;
- `bridgeAssessment`: supported, partial, missing, or unknown;
- `gapRationale`;
- `recommendedAction`; and
- `confidence`.

The first rebuilt analyzer should operate on the safety narrative and source
support sections, produce these three finding types, and be evaluated against
GRN 1160 and GRN 1256 before any broader scoring changes.

## Acceptance gate for the next implementation

The replacement slice is ready to integrate when:

1. GRN 1160 returns all three FDA-confirmed findings.
2. Each finding includes a real excerpt and PDF page.
3. GRN 1256 does not return any of the three as wholly missing.
4. The analyzer distinguishes an unsupported bridge from a bridge it merely
   disagrees with.
5. Missing publication metadata remains `unknown`; it is never invented.
6. A module failure does not change extraction or saved-report availability.
