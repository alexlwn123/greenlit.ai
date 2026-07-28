# Data governance and privacy operations

## Data inventory

| Class | Examples | Purpose | Default lifecycle |
|---|---|---|---|
| Restricted customer content | Filings, PDFs, extracted text, evidence, drafts, scientific facts | Provide dossier analysis and controlled drafting | Retained until workspace deletion; enterprise configurable retention is pending |
| Account data | Email, identity/provider identifiers | Authentication and access administration | Account/customer relationship plus legally required period; operational procedure pending |
| Operational metadata | Record IDs, timestamps, workflow audit events, model token counts, redaction counts | Security, reliability, traceability, cost | Retention schedule must be approved before production contracting |
| Capability metadata | Hashes, status, expiry, target relationship | External evidence/review workflow | Revoked or expired with workflow; raw tokens are not stored |
| Provider credentials | Storage, authentication, email, optional AI credentials | Operate integrations | Server secret stores only; rotate after suspected exposure and on approved schedule |
| Public-reference queries | Citation identifiers and search metadata when enabled | Verify public scientific references | Do not send restricted dossier bodies; confirm provider logging terms |

## Rules

1. Collect only information needed for the contracted purpose.
2. Treat all customer dossier content as restricted, even if portions are publicly available.
3. Do not use customer content to train shared models or for unrelated product analytics without explicit written instructions.
4. Keep production, test, and local data separated. Never copy production dossiers into development fixtures.
5. Restrict workforce access to approved support or incident purposes, record it, and remove it promptly.
6. Honor customer deletion across primary stores and document when vendor backups age out.
7. Suspend deletion only under an authorized legal hold and record its scope and release.
8. Verify requester identity and jurisdiction before fulfilling access, deletion, correction, or portability requests.

## Enterprise retention schedule to approve

The contract should set active-workspace retention, post-termination export window, deletion deadline, backup expiry, security-log retention, support-log retention, and legal-hold handling. Successful full analysis and dossier deletions return privacy-safe receipts identifying the target only by SHA-256 and distinguishing completed primary deletion from provider-backup lifecycle. The analysis UI downloads the receipt; configured deployments HMAC-sign it with a named server-side key, while unconfigured receipts are explicitly marked unsigned. Automated expiry, legal holds, central receipt retention, independent signature verification, and provider backup-expiry evidence remain pending; do not promise a deadline that cannot be verified across Convex, Blob, logs, model caches, and enabled subprocessors.

## Privacy request procedure

Record the request, verify identity/authority, identify controller/processor roles, preserve relevant legal holds, locate data across the inventory, obtain customer/controller instructions when Greenlit is a processor, execute and verify the response, and retain only minimal completion evidence. Counsel must set jurisdiction-specific deadlines and exemptions.

## Cross-border transfers

Before accepting EEA/UK or other residency-sensitive data, identify each transfer, vendor region, remote-access location, and legal mechanism. Execute the applicable DPA and transfer clauses and complete any required transfer-impact assessment. A customer-hosted deployment may reduce transfers but does not eliminate the need to document support access and subprocessors.
