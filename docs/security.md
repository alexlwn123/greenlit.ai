# Greenlit security model

Greenlit handles confidential regulatory filings, extracted text, evidence records, and controlled
drafts. The application therefore treats workspace authentication, owner isolation, and external
review links as primary security boundaries.

## Trust boundaries

- Hosted workspace requests require a valid Convex Auth bearer token. Hosted code fails closed if
  the metadata driver is accidentally omitted; the development-only session header is never an
  authorization mechanism in Vercel or production mode.
- Convex queries and mutations derive the current user on the server and verify record ownership.
  Client-provided owner identifiers are ignored.
- Evidence-response and consultant-review URLs are bearer credentials. Only SHA-256 hashes are
  stored, links expire, newly issued links revoke prior active links for the same workflow, and
  evidence links are single-use. Newly generated URLs carry credentials in fragments, which
  browsers do not send to hosting access logs; the client immediately moves them to session-only
  storage and cleans the address bar. Legacy path links are migrated on first use.
- Private uploaded objects use owner-prefixed paths and private Vercel Blob access. Upload grants
  accept PDF content only, have a 40 MB limit, cannot overwrite existing objects, and are verified
  again before an analysis record is created.
- Before any upload is stored as evidence or processed as an analysis, Greenlit performs a local,
  metadata-free quarantine inspection. It rejects incomplete PDFs, encryption, embedded files,
  JavaScript, launch actions, rich media, and XFA. Rejections emit route/status telemetry without
  filenames, file hashes, identities, or document content.

## Application protections

- API responses use `Cache-Control: no-store`, `Pragma: no-cache`, and `Referrer-Policy:
  no-referrer` so confidential responses and bearer-link paths are not retained or forwarded.
- Public bearer-link endpoints have per-link read/write throttles. This is a server-instance guard;
  platform-level rate limiting remains recommended before a broad public launch.
- Requests are bounded at 41 MB, JSON bodies at 256 KB, response notes at 10,000 characters, PDFs
  at 40 MB and 500 pages, and uploaded files must have both PDF metadata and a PDF file signature.
- Unexpected server failures return a generic message. Internal exception details are not sent to
  clients, provider response bodies are not copied into errors, and capability credentials are
  redacted from application error logs.
- Authentication denials, capability throttling, upload rejections, and unexpected request
  failures emit structured security events with unique event IDs, timestamps, normalized routes,
  and status metadata. They exclude identities, tokens, dossier content, filenames, file hashes,
  and raw record identifiers.
- These events can be delivered to a customer-controlled SIEM using an authenticated, HMAC-signed,
  redirect-blocked webhook. Console emission remains the fallback if delivery fails.
- The deployment applies a Content Security Policy, anti-framing controls, MIME sniffing
  protection, strict transport security, a restrictive permissions policy, and no-referrer policy.
- GitHub runs the complete validation suite on pushes and pull requests. Dependabot opens grouped
  weekly package and immutable-action updates to keep remediation work reviewable. CodeQL is not
  scheduled because code scanning is not enabled for this private repository.
- CSV cells that could be interpreted as spreadsheet formulas are neutralized before export.
- Authenticated operators can inspect `/api/privacy/security-controls` for a secret-free summary of
  upload scanning, SIEM delivery, deletion-receipt signing, and model-processing configuration. It
  exposes only booleans, protocol properties, key IDs, and endpoint hostnames—not tokens or paths.
- Resolving or rejecting an evidence request immediately revokes its active response links.
  Completing or cancelling a consultant handoff does the same for review links.

## External processing and retention

- Hosted external-model calls require the separate
  `GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING=true` opt-in even when an API key is configured.
- Without that opt-in, deterministic analysis and drafting paths remain available and confidential
  filing text is not sent to a model provider.
- Model-stage caches are isolated by analysis. Deleting an analysis removes its upload, extracted
  text, workbook notes, saved metadata, and analysis-scoped model cache.
- Approving external processing is a deployment-level privacy decision. Review the model
  provider's data-processing, retention, residency, subprocessors, and training terms first.

## Secrets and local data

- Server credentials must never use a `VITE_` prefix. `.env*`, `.local-data`, generated reports,
  and uploaded filings are excluded from version control.
- Local development intentionally supports an anonymous machine-local workspace identified by a
  random browser value. It must be used only on a trusted machine and must never be exposed as a
  hosted service.
- Production should set `GREENLIT_METADATA_DRIVER=convex`, `GREENLIT_STORAGE_DRIVER=vercel-blob`,
  `CONVEX_URL`, `VITE_CONVEX_URL`, and private storage/provider credentials in the deployment
  environment.

## Operational follow-ups

The prioritized, evidence-linked enterprise gap register and operational policy set live in the
[`docs/trust-center`](trust-center/README.md) directory. Those records are the source of truth for
procurement responses and must not be replaced with broader unsupported claims.

- Enable platform/WAF rate limiting for `/api/respond/*`, `/api/review/*`, authentication, and
  upload-token issuance before expanding beyond the private MVP.
- Connect the quarantine gate to an independently maintained anti-malware scanner, retain
  signature/version and disposition evidence, and evaluate PDF content disarm and reconstruction.
  Greenlit supports a fail-closed customer-controlled scanner protocol; the production endpoint,
  contract, signatures, alerting, and test evidence must still be configured and approved.
- Rotate provider credentials on a schedule and immediately after any suspected disclosure.
- Review access logs and Convex audit events for abnormal link creation, upload, and review volume.
- Define a formal retention period and deletion policy before accepting production customer data.
- Run `pnpm audit --prod` in CI where registry advisory access is available; local sandboxed runs
  may not have network access to the advisory service.
