# Lemna Leaf Protein Evaluation Fixture

## Purpose

This worksheet defines the first evidence-backed evaluation case for rebuilding Greenlit's:

- identified gaps;
- recommended next steps;
- documentation benchmark; and
- safety-signal modules.

It compares the withdrawn GRN 1160 submission with its successful resubmission,
GRN 1256. It is an evaluation fixture, not a claim that withdrawal alone proves a
notice was deficient.

## Source set

| Source | Disposition | PDF pages | SHA-256 |
| --- | --- | ---: | --- |
| `GRN-1160_lemna-leaf-protein.pdf` | Evaluation ceased at notifier's request | 230 | `8eff49d11b3d9557018e590866dcb7405026056afe989cf25c3593a728935c78` |
| `gras-notice-grn-1160-agency-response-letter.pdf` | FDA response dated May 6, 2024 | 2 | `41ad4425564a90f750eda1b0e4712a76ecfcaf363d5b216e58c89c626bbe7635` |
| `GRN-1256_lemna-leaf-protein-resubmission-of-grn-1160.pdf` | Resubmission | 1,428 | `d2494d601188593bd82f021aa78ea17b1fd3f19fad677effc2d81ed5f4a52337` |
| `gras-notice-grn-1256-agency-response-letter.pdf` | FDA no-questions response dated February 5, 2026 | 5 | `c9adc43bf17c11bdf3765a5af9829199c9365497193abec17a42102cbc1efbc6` |

Page references below use one-based PDF page numbers, not the page numbers
printed inside the notice.

## Regulatory outcome

FDA's GRN 1160 response says it identified "considerable deficiencies" and
recommended that Plantible request that FDA cease its evaluation because the
issues required significant revisions. The letter identifies three specific
deficiencies:

1. Reliance on other GRNs was not specific enough about the incorporated data
   and information and did not adequately present independent conclusions.
2. Data pivotal to the safety conclusion needed to be publicly available,
   including publication in a peer-reviewed journal.
3. The notice needed to demonstrate that results from the test articles used in
   pivotal safety studies could be sufficiently extrapolated to Plantible's LLP.

FDA's GRN 1256 response records amendments that clarified the manufacturing
process, analytical results, specifications, intended uses, dietary exposure,
and literature search. FDA ultimately had no questions regarding Plantible's
GRAS conclusion under the intended conditions of use. That response is not an
FDA affirmation that the ingredient is GRAS.

## Evidence comparison

### 1. Incorporation of other GRNs and independent conclusions

**GRN 1160**

- PDF page 10 says the safety assessment draws on publicly available
  information about LENTEIN Complete and other related plants and protein
  products.
- The FDA response says the notice needed to identify incorporated material
  specifically and present its own independent conclusions.

**GRN 1256**

- PDF page 10 identifies the pivotal bodies of evidence as published Mankai
  (*Wolffia globosa*) data and Lemna Protein Concentrate data.
- PDF page 18 enumerates the candidate comparator materials, their forms, and
  the studies for which they are used.
- The narrative states that applicability to LLP will be addressed in the
  assessment rather than relying on a prior GRN's outcome alone.

**Expected analyzer behavior**

- GRN 1160: return a major gap for nonspecific incorporation and insufficient
  independent synthesis.
- GRN 1256: do not return that gap as missing. The analyzer may identify a
  narrower residual concern only when it cites a particular unsupported bridge.

### 2. Public availability of pivotal safety evidence

**GRN 1160**

- PDF page 10 relies in part on toxicology data described through GRN 742.
- PDF page 45 relies on GRN 742's allergenicity literature search and an expert
  opinion included in GRN 742.
- The FDA response expressly says pivotal safety information must be publicly
  available and published in a peer-reviewed journal.

**GRN 1256**

- PDF page 10 identifies published pivotal safety data for Mankai and published
  evidence for related Lemnaceae materials.
- PDF page 61 distinguishes an unpublished study as supportive rather than
  pivotal evidence.

**Expected analyzer behavior**

- GRN 1160: return a critical or major gap explaining that pivotal evidence
  cannot be supplied merely by pointing to another GRN.
- GRN 1256: recognize the distinction between pivotal published evidence and
  supportive unpublished information.
- Never invent publication status, a PMID, a DOI, or peer-review status.

### 3. Test-article applicability and extrapolation to LLP

**GRN 1160**

- PDF pages 35 and 38 use genotoxicity and 90-day study results from Mankai,
  a *Wolffia globosa* material.
- The FDA response says the notice did not sufficiently demonstrate that the
  pivotal test articles could be extrapolated to LLP.

**GRN 1256**

- PDF page 10 flags test-article applicability as an issue the assessment will
  address.
- PDF page 18 identifies the source species, product form, processing, and
  study role of Mankai, Lemna Protein Concentrate, LENTEIN Complete, and other
  related materials.
- The resubmission contains expanded composition, protein, nutrient,
  anti-nutrient, processing, and intended-use comparisons before drawing safety
  conclusions.

**Expected analyzer behavior**

- GRN 1160: return a critical gap for the unproven test-article bridge.
- The recommendation must request a structured comparison of identity,
  composition, processing, impurities, intended use, exposure, and relevant
  biological properties.
- GRN 1256: recognize the bridge as present. A model may question its strength,
  but must not label it absent.

### 4. Intended uses and dietary exposure

**GRN 1160**

- PDF pages 76-78 describe broad proposed uses, generally at a maximum level of
  20%, and report a 90th-percentile users-only estimate of approximately
  61.1 g/day.

**GRN 1256**

- The FDA response provides a product-level use table with maximum levels
  generally between 2% and 5%.
- PDF page 170 reports a 90th-percentile users-only estimate of approximately
  15.8 g/day using NHANES 2021-2023 data.
- The final FDA response reports 14.1 g/day after amendments.

**Interpretation**

The resubmission materially narrows and clarifies intended uses and exposure.
FDA's GRN 1160 response does not identify exposure as one of its three express
deficiencies, so this difference is an analyst-supported improvement rather
than an FDA-confirmed defect.

### 5. Manufacturing, specifications, and analytical support

**GRN 1160**

- PDF pages 14-16 contain specifications, five-batch results, and a
  manufacturing-process description.

**GRN 1256**

- PDF pages 13-15 provide a revised identity/specification package,
  five-batch results, and manufacturing description.
- The FDA response says amendments clarified manufacturing, analytical
  results, and specifications.

**Interpretation**

The analyzer should not claim these sections are wholly missing from GRN 1160.
It may classify them as weak only when it identifies a substantive omission.
Keyword or heading presence alone is not enough to classify either notice as
complete.

### 6. Literature review, allergenicity, and minor components

**GRN 1160**

- PDF page 45 relies substantially on the allergenicity search and expert
  analysis associated with GRN 742.

**GRN 1256**

- PDF pages 47 onward contain a dedicated protein safety and allergenicity
  assessment.
- The notice separately evaluates the principal proteins, digestibility,
  sequence similarity, potential cross-reactivity, and published reports.
- The final FDA response describes controls or reasoning for manganese,
  copper, heavy metals, nucleic acids, oxalic acid, carotenoids, tannins,
  lysinoalanine, and potential allergic reactions.
- FDA records that amendments clarified the literature search.

**Interpretation**

GRN 1160 should be flagged for insufficiently self-contained allergenicity and
literature support, not for having no allergenicity discussion at all.

## Ground-truth findings for GRN 1160

The first gap-analysis implementation should reliably identify these three
FDA-confirmed findings:

| ID | Severity | Finding | Required recommendation |
| --- | --- | --- | --- |
| `incorporation-independent-conclusions` | Major | Reliance on other GRNs is insufficiently specific and independently synthesized. | Identify every incorporated item, explain its role, and state an independent conclusion based on the underlying evidence. |
| `public-pivotal-evidence` | Critical | Pivotal safety support is not established as publicly available peer-reviewed evidence. | Replace or supplement pivotal nonpublic/indirect material with citable public evidence and distinguish pivotal from supportive evidence. |
| `test-article-bridge` | Critical | Applicability of safety-study test articles to Plantible's LLP is not sufficiently demonstrated. | Provide a structured comparability and extrapolation analysis covering identity, composition, processing, impurities, exposure, and biological relevance. |

Two additional findings are acceptable when grounded precisely:

- `intended-use-exposure-scope`: proposed uses and exposure assumptions are
  broader than the successful resubmission and need refinement.
- `self-contained-literature-allergenicity`: the notice relies too heavily on
  another GRN's search and expert assessment rather than presenting a
  self-contained review.

The analyzer must not infer that every change in GRN 1256 was an FDA-identified
deficiency in GRN 1160.

## Documentation benchmark expectations

| Field | GRN 1160 | GRN 1256 | Confidence |
| --- | --- | --- | --- |
| Identity and composition | Present | Present | High |
| Manufacturing description | Present | Present | High |
| Specifications and batch analysis | Present | Present | High |
| Intended uses and exposure | Weak | Present | Medium |
| Public pivotal safety evidence | Weak | Present | High |
| Independent evidence synthesis | Weak | Present | High |
| Test-article comparability bridge | Weak | Present | High |
| Self-contained literature search | Weak | Present | High |
| Allergenicity assessment | Weak | Present | Medium |

`Weak` means the topic is present but its support is incomplete for the stated
conclusion. It must not be rendered as `missing`.

## Safety-signal expectations

These are evidence-review signals, not conclusions that LLP is unsafe:

- Cross-species and cross-product extrapolation from *Wolffia globosa*,
  Lemnaceae mixtures, and other duckweed preparations.
- Relevance of the test-article composition and processing to Plantible's LLP.
- Exposure relationship between the pivotal study doses and intended uses.
- Potential allergenicity and cross-reactivity of the LLP protein mixture.
- Control of minor constituents and anti-nutrients.

For GRN 1256, these subjects should generally be classified as addressed or
review-required, not missing.

## Evaluation rules

An analysis passes the initial fixture when it:

1. Finds all three FDA-confirmed GRN 1160 gaps.
2. Grounds each finding in the notice and does not cite the FDA letter as if it
   were part of the submitted notice.
3. Produces a specific corrective action for each finding.
4. Distinguishes `weak` from `missing`.
5. Does not repeat the three confirmed gaps as absent in GRN 1256.
6. Does not equate withdrawal with an FDA finding on every report section.
7. Does not predict FDA action or state that either notice proves the
   ingredient safe or unsafe.
8. Does not fabricate citations, study facts, page numbers, or regulatory
   conclusions.

## Known limitations

- This comparison is based on the public notice packages and response letters,
  not the complete private correspondence between FDA and the notifier.
- The exact March 9, 2024 FDA email referenced in the GRN 1160 response is not
  in the source set.
- PDF pages and printed dossier pages differ.
- GRN 1256 includes extensive appendices; the fixture focuses first on the core
  narrative and the evidence explicitly identified by FDA.
- A no-questions letter is not an FDA affirmation of GRAS status.
