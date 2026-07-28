# Draft SOC 2 system description

Status: auditor-preparation draft. Management and the service auditor must review it against the AICPA description criteria before use in a report.

## Company and services

**Legal entity:** `[MANAGEMENT TO CONFIRM]`

Greenlit provides a hosted workspace for organizing evidence, evaluating readiness, drafting controlled regulatory dossier sections, coordinating external evidence and consultant review, and preparing release/submission artifacts. The system processes confidential customer regulatory, scientific, manufacturing, identity, exposure, and safety information.

## Principal service commitments

Subject to executed customer agreements, Greenlit intends to protect customer information against unauthorized access, maintain tenant separation, restrict processing to the contracted purpose, preserve evidence traceability and controlled human review, manage security incidents, and delete or return information according to the agreed lifecycle. Final contractual commitments must be reconciled to this description before the as-of date.

## System boundary

The in-scope system includes the Greenlit production web client and API; Convex production authentication and metadata persistence; Vercel production hosting and private Blob storage; GitHub source control and CI/CD; Resend authentication email; enabled model-processing routes; and personnel or contractors with source, production, security, or customer-support access.

Customer-managed systems are outside the boundary except for the documented interface to a customer-controlled model gateway. Disabled optional integrations and developer-local environments prohibited from containing production customer data are excluded. Management must confirm every production integration before audit scope is finalized.

## Infrastructure

- Vercel executes the web application and API and stores private uploaded/generated objects.
- Convex provides production identity services and application metadata persistence.
- GitHub stores source code and runs continuous integration and security analysis.
- Resend delivers authentication-related email.
- An approved external model provider or customer-owned gateway may process minimized, sanitized model packets when explicitly enabled.

Vendor regions, contractual entities, assurance reports, backup behavior, and enabled plans must be verified in the restricted audit room.

## Software

The browser application is built with React. A Hono API performs authenticated workflows, validates and bounds inputs, authorizes owner access, brokers storage operations, and gates external processing. Convex functions enforce authenticated ownership in persistence. Automated analysis and drafting combine deterministic logic with optional controlled model processing. GitHub CI validates source formatting, types, tests, production builds, security analysis, dependency changes, and trust evidence references.

## People

The workforce currently consists of `[MANAGEMENT TO PROVIDE ROSTER AND ROLES]`. Management must identify executive, security, privacy, system, incident, vendor, and control owners; document authorized production access; and retain confidentiality, training, onboarding, access-review, and offboarding evidence.

## Procedures

Documented procedures cover data governance, secure development, vulnerability disclosure, incident response, continuity/recovery, vendor review, AI governance, and legal readiness. Draft procedures become audit controls only after management approval, assignment, communication, and—where applicable—execution or exercise.

## Data

Restricted data includes uploaded filings, extracted text, evidence, scientific facts, drafts, releases, review materials, and model packets. Account data supports authentication. Operational metadata supports auditability, security, traceability, and cost. Capability tokens are not stored in raw form. Customer content is not intended for shared-model training or unrelated analytics.

## Data lifecycle

The browser receives authenticated access and uses short-lived signed grants to place PDF objects into private owner-prefixed storage. The API performs local quarantine inspection before metadata creation or extraction and supports a fail-closed customer-controlled anti-malware gateway that transmits no filename, owner, dossier, or session identifier. Authenticated users create and modify owner-scoped records. Optional external model and upload-scanner calls require explicit deployment approval and pass through documented gateways. Deletion removes primary upload, extracted text, analysis metadata, notes, and scoped model cache; configurable expiry, legal holds, receipts, and documented backup expiry remain remediation items.

## Security control environment

Implemented controls include production fail-closed authentication, server-derived ownership, persistence-layer authorization, private objects, bounded upload/requests, secure headers, expiring hashed capability links, privacy-safe errors, audit history, external-model gating, sanitization, CI/testing, CodeQL, Dependabot, and a vulnerability disclosure policy. The control matrix identifies incomplete management, privileged-access, monitoring, recovery-testing, personnel, vendor, and retention controls.

## Complementary customer controls

Customers are expected to authorize appropriate users; protect their identities and endpoints; classify information before submission; verify AI-generated or extracted content; maintain qualified scientific/legal review; configure and govern customer-owned model gateways; notify Greenlit of suspected compromise; and comply with applicable laws and contractual restrictions. These responsibilities must be aligned with customer agreements.

## Subservice organizations

Vercel, Convex, Resend, and optionally an enabled model provider perform subservices relevant to Greenlit. Greenlit intends to use the carve-out method unless the auditor recommends otherwise: their controls are excluded from Greenlit's control tests, while Greenlit's vendor-selection and monitoring controls remain in scope. The auditor must confirm this treatment.

## Significant changes and incidents

Management must disclose material architecture, provider, ownership, personnel, legal, and control changes through the as-of date, along with any relevant incidents. As of this draft, management has not completed that representation; no statement about absence of incidents should be inferred.
