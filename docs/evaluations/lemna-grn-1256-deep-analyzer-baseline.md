# GRN 1256 Deep-Analyzer Baseline

## Purpose

GRN 1256 is the resolution control for the withdrawn GRN 1160 notice. It tests
whether the restored analyzer can distinguish an absent evidentiary foundation
from a present but debatable scientific bridge.

## Result

The appendix-aware, schema-constrained run reviewed 116 selected pages across
the 1,428-page filing. Selection retained the core narrative, high-value
evidence pages, and final appendices within a 400,000-character budget.

The run passed the three required resolution checks:

1. It recognized that the notice identifies incorporated evidence and states an
   independent conclusion. A residual concern was classified as minor and the
   bridge as supported, not missing.
2. It identified the Mankai 90-day study as public and peer reviewed. It
   correctly classified the unpublished LENTEIN Complete study as supportive,
   not pivotal.
3. It recognized that a structured Mankai-to-LLP bridge is present. It assessed
   the bridge as partial rather than absent.

## Evidence-matrix result

The second-generation run produced all nine canonical evidence requirements
with exact citations. Seven were assessed as present. Independent evidence
synthesis and test-article comparability were assessed as weak rather than
missing because the model retained concerns about the expert panel's
substantial-equivalence framing and the strength of the cross-species bridge.

This is intentionally preserved as an expert-review disagreement. The
regression requirement is that these rows must not be called missing; an FDA
no-questions response is not used as an instruction to suppress a grounded
scientific concern.

## Residual findings requiring expert calibration

The model retained ten findings and five safety signals. The most substantive
residual issues concern the selected NOAEL, resulting exposure margin, and the
strength of the cross-species compositional bridge.

Several minor outputs should not yet be treated as benchmark truth:

- age of the five analyzed production lots;
- absence of an LLP-specific human clinical study;
- use of surrogate age data in the copper intake calculation;
- operational treatment of excluded toddler-food uses;
- reliance on specifications when distinguishing EFSA manganese concerns; and
- arsenic results described as near, but below, the notice specification.

These remain review candidates, not confirmed deficiencies. The fixture locks
in only the resolved-versus-absent distinctions and citation integrity.

## Reliability improvement

The model response is now constrained by a JSON Schema through Anthropic's
structured-output API. This prevents malformed JSON from entering the report
pipeline. The expensive corpus test is opt-in and ordinary test runs do not call
the model.
