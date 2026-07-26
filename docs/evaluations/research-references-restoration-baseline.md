# Research References Restoration Baseline

## Scope

The restored first stage extracts references actually cited by the notifier. It
does not yet recommend additional research and does not silently complete
missing metadata from model memory.

Reference extraction runs as a separate, schema-constrained pass over the
filing's opening pages, reference-heavy pages, and ending appendices. A failure
in this additive pass does not discard the core gap analysis.

## Provenance model

Each reference can retain:

- title, source, year, authors, and printed citation;
- DOI or URL only when printed in the supplied filing pages;
- its role in the filing's evidence synthesis;
- how the notice characterizes or uses it;
- one-based PDF pages where it is cited;
- origin (`notifier_cited`); and
- verification status (`extracted_unverified`).

The interface links a DOI or URL when one was extracted and labels the
verification state. Independently recommended Greenlit research uses a
different origin and is not mixed into this list.

## GRN 1160 validation

The first live run produced 15 prioritized references. The set includes:

- the published Mankai genotoxicity and repeated-dose toxicity study;
- human Lemna and Mankai nutrition studies;
- pepsin-degradation methodology used in allergenicity assessment;
- EFSA opinions on Wolffia and Lemnaceae products;
- Lemna protein concentrate digestibility research;
- duckweed taxonomy and composition references; and
- supporting work concerning Rubisco.

All extracted references include filing page provenance and remain marked
unverified until an external metadata or source-resolution stage is run.

## Next step

Add deterministic DOI and bibliographic metadata verification against primary
sources. That stage should record the verification source and timestamp, flag
conflicts rather than overwrite notifier metadata, and remain separate from
future Greenlit-recommended research.
