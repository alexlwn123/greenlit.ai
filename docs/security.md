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
  evidence links are single-use.
- Private uploaded objects use owner-prefixed paths and private Vercel Blob access. Upload grants
  accept PDF content only, have a 40 MB limit, cannot overwrite existing objects, and are verified
  again before an analysis record is created.

## Application protections

- API responses use `Cache-Control: no-store`, `Pragma: no-cache`, and `Referrer-Policy:
  no-referrer` so confidential responses and bearer-link paths are not retained or forwarded.
- Public bearer-link endpoints have per-link read/write throttles. This is a server-instance guard;
  platform-level rate limiting remains recommended before a broad public launch.
- Requests are bounded at 41 MB, JSON bodies at 256 KB, response notes at 10,000 characters, PDFs
  at 40 MB and 500 pages, and uploaded files must have both PDF metadata and a PDF file signature.
- Unexpected server failures return a generic message. Internal exception details are not sent to
  clients.
- The deployment applies a Content Security Policy, anti-framing controls, MIME sniffing
  protection, strict transport security, a restrictive permissions policy, and no-referrer policy.
- GitHub runs CodeQL's extended security queries on pushes, pull requests, and a weekly schedule.
  Dependabot opens grouped weekly dependency updates to keep remediation work reviewable.

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

- Enable platform/WAF rate limiting for `/api/respond/*`, `/api/review/*`, authentication, and
  upload-token issuance before expanding beyond the private MVP.
- Rotate provider credentials on a schedule and immediately after any suspected disclosure.
- Review access logs and Convex audit events for abnormal link creation, upload, and review volume.
- Define a formal retention period and deletion policy before accepting production customer data.
- Run `pnpm audit --prod` in CI where registry advisory access is available; local sandboxed runs
  may not have network access to the advisory service.
