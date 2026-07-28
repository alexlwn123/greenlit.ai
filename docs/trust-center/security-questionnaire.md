# Security questionnaire: standard answers

These are concise diligence answers as of 2026-07-28. Validate them against the control register before external use.

## Architecture and data

- **Service/data flow:** React web client; Hono API; Convex authentication/metadata; private Vercel Blob objects; optional model, email, and public-reference services. See the subprocessor register.
- **Tenant isolation:** Production identity is derived server-side. Records are owner-scoped again in Convex; browser-supplied owner IDs are not trusted.
- **Encryption:** HTTPS/HSTS is enforced in transit. Hosted persistence relies on the selected vendors' managed encryption. Customer-managed application-layer keys are not yet offered.
- **Uploads:** PDFs only, private storage, signed short-lived upload grants, owner-prefixed paths, 40 MB/500-page limits, type/signature verification, and no overwrite. Malware scanning is a documented gap.
- **Deletion:** User deletion removes primary upload, extracted text, metadata, notes, and analysis-scoped model caches. Configurable expiry, legal holds, deletion receipts, and backup-expiry proof are pending.
- **Data use:** Customer content is not sold. External model processing is disabled by default and requires explicit deployment approval. A customer-owned model gateway is supported.

## Access and application security

- **Authentication:** Required in hosted production and fails closed on missing production configuration. Enterprise SSO, enforced MFA, SCIM, and organization RBAC are pending.
- **Authorization:** Server-derived ownership is enforced in the API and persistence layer. External reviewer capabilities are hashed, expiring, revocable, single-purpose, and moved out of URL paths.
- **Sessions/secrets:** Server credentials are not exposed through browser environment variables. Confidential responses are `no-store`; referrers are suppressed.
- **Application controls:** CSP, HSTS, anti-framing, MIME-sniffing prevention, permissions restrictions, size bounds, generic errors, CSV formula neutralization, and public-link throttling are implemented.

## Assurance and operations

- **SDLC:** Pull/push CI runs formatting/lint, trust-register and workflow-security validation, typechecks, tests, builds, and commit-bound release evidence. Dependabot covers packages and immutable CI actions. CodeQL is not enabled on the current private-repository plan.
- **Vulnerabilities:** Reports are accepted through the published security policy. Formal remediation SLA metrics, SBOM/provenance, independent penetration testing, and SOC 2 are open items.
- **Logging:** Dossier workflow actions are auditable and application errors avoid confidential details. Central SIEM-style security monitoring and immutable retention are pending.
- **Incidents:** A severity and response playbook exists. Named rota, counsel/forensics contacts, annual tabletop, and evidence of execution are required before enterprise claims.
- **Continuity:** A continuity plan and provisional targets exist. Vendor backup validation and restore/failover exercise evidence are outstanding.

## Privacy, legal, and AI

- **DPA:** Required provisions are enumerated, but customer-facing terms must be approved by qualified counsel and signed.
- **Subprocessors:** A scoped register exists; commercial legal entities, regions, current DPAs and assurance reports must be verified for the actual deployment.
- **HIPAA:** Greenlit does not claim HIPAA compliance or BAA availability. Do not process PHI until counsel confirms applicability, all relevant vendors sign BAAs, a risk analysis is completed, and required safeguards operate.
- **AI accuracy:** AI output is assistive, provenance-constrained where possible, and subject to human review. Greenlit does not automate a final legal or scientific safety determination.
- **Model training/retention:** Controlled by the chosen route and contract. The preferred enterprise route invokes the customer's own approved model environment; runtime sanitization is defense in depth and not scientific anonymization.
