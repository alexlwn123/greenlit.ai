# Comparable Substantive Assessment Baseline

## What is restored

Retrieved comparator passages are now assessed against the subject filing's
specific unresolved questions. The assessment distinguishes:

- directly supportive evidence;
- supportive evidence with limitations;
- contextual examples that do not transfer evidence;
- evidence that is not transferable;
- conflicting evidence; and
- insufficient information.

Each judgment explains potentially transferable elements, material
limitations, and the exact comparator pages used. A judgment is rejected if it
changes the subject question or cites a page outside the retrieved passages.
If the assessment omits a required question/comparator pair, the interface
shows `insufficient_information` rather than silently dropping it.

## GRN 1256 benchmark

GRN 1256 contains five unresolved questions across four evidence-matrix rows.
Each question was assessed against the three highest-ranked comparators,
producing 15 judgments:

| Conclusion | Count |
| --- | ---: |
| Supportive with limitations | 4 |
| Contextual only | 7 |
| Not transferable | 3 |
| Insufficient information | 1 |
| Directly supportive | 0 |
| Conflicting | 0 |

This distribution is appropriately conservative. The direct predecessor,
GRN 1160, supplies the most relevant context, but its passages do not by
themselves establish that GRN 1256's commercial-scale proteomics,
purification-related bioactive profile, young-child copper exposure analysis,
or independent-conclusion question is resolved. The more distant Lemnaceae
fiber and fava bean protein notices are primarily documentation examples or
non-transferable evidence.

## Safety boundaries

- A prior FDA response is never treated as approval or proof of equivalence.
- Metadata similarity does not establish material or test-article
  comparability.
- Documentation patterns may transfer as examples even when scientific
  evidence does not.
- The subject filing's own evidence remains controlling.
- `Directly supportive` requires an affirmative bridge across the dimensions
  relevant to the question; shared ingredient family alone is insufficient.

## Remaining limitations

- The benchmark covers one resubmission pair and two additional comparators.
- Judgment quality depends on the retrieved excerpts; relevant passages outside
  the top two pages may be missed.
- The system does not yet synthesize several comparator judgments into a single
  recommended amendment or research action.
- Domain-expert labels are still needed to calibrate transferability decisions
  across ingredient types.
