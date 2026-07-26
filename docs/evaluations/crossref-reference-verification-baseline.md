# Reference-Verification Baseline

## Method

Notifier-cited references first receive bibliographic verification against
Crossref's versioned REST API. The verifier uses DOI lookup when a DOI was
printed in the filing and a bibliographic-title query otherwise.

The integration:

- preserves the notifier's original metadata;
- records matched Crossref title, authors, year, DOI, and URL separately;
- calculates an explicit title-match confidence;
- records title, year, and DOI conflicts;
- caches repeated requests;
- retries transient rate-limit and server failures; and
- leaves an unmatched reference marked `extracted_unverified`.

Crossref verification confirms deposited bibliographic metadata. It does not
confirm study quality, full-text content, peer-review adequacy, or applicability
to the filing.

After metadata matching, the source verifier follows a controlled hierarchy:

1. convert a DOI or PMID to a PMCID with NCBI's PMC ID Converter;
2. verify accessible PMC full text through NCBI's BioC service;
3. verify a PubMed abstract through BioC when full text is unavailable; and
4. resolve a DOI landing page when no NCBI source is available.

The report records the access level, resolved identifier, trusted URL, check
time, and content size. Source access is evidence that a cited record resolves;
it is not a quality or applicability judgment.

## GRN 1160 result

All 15 prioritized notifier-cited references matched Crossref metadata. Four
records retained conflicts:

1. The Lemna protein-quality intervention trial is listed as 2022 in the filing
   and 2021 in Crossref.
2. The EFSA Wolffia opinion has a minor title-prefix difference.
3. The EFSA water-lentil opinion has a minor title-prefix difference.
4. The Rubiscolytics paper is listed as 2008 in the filing and 2007 in Crossref.

These differences are displayed to the reviewer and do not overwrite the filing
citation.

## Operational behavior

External verification is opt-in through `GREENLIT_VERIFY_REFERENCES=true`.
`GREENLIT_CROSSREF_MAILTO` can identify the client to Crossref's polite pool.
`GREENLIT_NCBI_EMAIL` identifies the client to NCBI and falls back to the
Crossref address when unset.
If verification is unavailable, the report retains the extracted references and
the core evidence analysis still completes.
