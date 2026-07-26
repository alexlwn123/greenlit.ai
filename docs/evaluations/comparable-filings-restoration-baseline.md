# Comparable Filings Restoration Baseline

## Corpus

The original project contained 873 metadata sidecars:

- 715 in the approved/no-questions folder; and
- 158 in the withdrawn folder.

After schema validation, 670 records contain enough normalized metadata for
deterministic comparison. Those records are packaged with the current project
in a consolidated index. Invalid or materially incomplete legacy sidecars are
skipped rather than allowed to distort matching.

## Matching method

The first-stage matcher is deliberately transparent. It scores:

- ingredient family, when a recognized family can be identified;
- substance type;
- production method;
- source-organism type;
- intended-use overlap;
- target population;
- GRAS basis;
- safety-evidence overlap; and
- dietary-exposure method.

Every result retains its score, matched criteria, material differences, GRN
number, status, and source URL. The subject filing is excluded.

This is a metadata baseline, not a scientific equivalence conclusion. A future
semantic reranker may improve recall, but it should rerank this auditable
candidate set rather than replace the explicit criteria.

## GRN 1256 result

The five highest-ranked records are:

| Rank | Filing | Similarity |
| ---: | --- | ---: |
| 1 | GRN 1160 — Lemna leaf protein | 92.9% |
| 2 | GRN 1072 — Lemnaceae fiber | 66.4% |
| 3 | GRN 1151 — Fava bean protein | 64.6% |
| 4 | GRN 742 — Duckweed (subfamily Lemnoideae) powder | 64.6% |
| 5 | GRN 879 — Fava bean protein isolate | 63.8% |

The set appropriately combines the direct predecessor, ingredient-family
comparators, and methodologically similar extracted plant proteins. The
interface displays why each filing matched and how it differs.

## Remaining limitations

- Ingredient-family aliases are curated and currently narrow.
- Legacy metadata quality varies.
- Metadata cannot establish whether a particular study, test article, or
  exposure scenario is substantively comparable.
- Comparators should be treated as research waypoints until their cited
  sections are retrieved and assessed against a specific evidence-matrix row.
