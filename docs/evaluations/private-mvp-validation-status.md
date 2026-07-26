# Private MVP Validation Status

## Release gates exercised

- Authentication: account creation and authenticated workspace rendering passed in a real browser against the Convex development deployment.
- Authorization: API tests prove missing bearer tokens are rejected and browser-supplied session identifiers cannot override authenticated ownership.
- Data lifecycle: analysis deletion removes the source PDF, extracted-text artifact, metadata record, and associated workbook notes; cross-owner deletion returns not found.
- Upload boundary: direct hosted uploads now obtain an authenticated owner-scoped path from the API before a short-lived private Blob upload is authorized.
- Filing limits: the 40 MB upload limit and 500-page analysis limit are explicit and tested.
- Failure recovery: deep-analysis or optional enrichment failure preserves a saved minimum report; fatal extraction failures become visible failed records.
- Cost safety: paid evaluations remain opt-in, exact-result caches remain active, and the default preflight ceiling remains $1.25.

## Regulatory-quality controls

The fixture-backed regression suite covers the withdrawn GRN 1160 and approved GRN 1256 pair plus three additional withdrawn/resubmitted pairs (six shorter filings). It enforces:

- all nine evidence-matrix requirements;
- 3/3 recall for the FDA-confirmed GRN 1160 deficiencies;
- no regression on the corresponding GRN 1256 resolution controls;
- exact page citations inside the model-selected page set;
- conservative comparator transferability labels;
- one traceable action per unresolved comparator question; and
- citation-backed revision differences and amendment work packages.

These are strong engineering and calibration controls, but not a substitute for blind domain-expert labeling. Before general external release, a regulatory reviewer should score a held-out sample without seeing Greenlit's output first and label false positives, missed major gaps, citation correctness, and action usefulness.

## Corpus validation

The packaged index now contains 668 unique GRN records: 553 no-questions and 115 withdrawn. Validation found and removed two duplicate/mismatched records:

- a GRN 1284 mycoprotein record incorrectly attached to a bovine-lactoferrin PDF; and
- a second, conflicting GRN 1277 record for the same withdrawn notice.

Refresh, validation, automatic backup, and rollback commands are documented in the project README.
