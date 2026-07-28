# Subprocessor and third-party register

This is an architecture-derived inventory, not a substitute for vendor contracting records. Before sharing it externally, verify the exact contracting entity, enabled product, processing location, data categories, DPA, security report, retention, breach terms, and deletion behavior for the production account.

| Provider | Role | Data potentially processed | Required status check |
|---|---|---|---|
| Vercel | Web/API hosting and private Blob storage | Requests, restricted uploads, generated artifacts, operational logs | Verify plan, regions, DPA, SOC report, log retention, incident terms, and deletion/backup behavior |
| Convex | Authentication and application metadata database | Account identity, dossier/analysis metadata, workflow content | Verify plan, regions, DPA, SOC report, backup/recovery, retention, access logging, and deletion |
| Resend | Authentication email delivery | Account email and password-reset message metadata | Verify DPA, regions, retention, security report, and suppression/log behavior |
| GitHub | Source control and CI security tooling | Source code and build metadata; no customer production content by design | Enforce MFA, least privilege, branch protection, secret scanning, audit access, and organization recovery |
| Anthropic | Optional direct model processing | Sanitized dossier/model packet when explicitly enabled | Verify enterprise terms, no-training and retention setting, region, DPA, incident terms; omit when customer gateway is used |
| Customer model gateway/provider | Customer-controlled AI processing | Sanitized model packet | Customer owns provider selection, identity, region, retention, logging, and model allowlist; contract must allocate responsibility |
| Crossref | Optional public-reference verification | Citation/reference query and configured contact email | Confirm no restricted dossier body is sent and review service terms/logging |
| NCBI | Optional public-reference verification | Citation/reference query and configured contact email | Confirm no restricted dossier body is sent and review service terms/logging |

## Change process

Security and privacy owners must assess a new vendor before restricted data is sent: purpose, necessity, data minimization, security evidence, privacy terms, location/transfers, access, retention/deletion, incident notice, continuity, concentration risk, and exit capability. Customer notice and objection timing must match the signed DPA. Remove disabled optional vendors from the customer-specific schedule.
