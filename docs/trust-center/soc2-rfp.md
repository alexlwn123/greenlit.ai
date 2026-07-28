# SOC 2 Type I request for proposal

Use this document to request directly comparable proposals. Do not provide production customer data, secrets, personnel records, vendor SOC reports, or other restricted evidence before NDA and access approval.

## Organization and objective

Greenlit is an early-stage SaaS platform for confidential regulatory evidence, analysis, controlled drafting, review, and submission preparation. Greenlit seeks a SOC 2 Type I examination with a recommended initial scope of Security and Confidentiality, followed immediately by a Type II observation period.

The legal entity, principal address, workforce count, target as-of date, and delivery-partner deadline will be supplied after management confirmation.

## Proposed system boundary

- Greenlit production web application and API.
- Vercel production hosting and private Blob storage.
- Convex authentication and application metadata.
- GitHub source control and CI/CD.
- Resend authentication email.
- Enabled external model route, including the boundary to a customer-controlled model gateway.
- Personnel and contractors with source, production, security, or support access.

Disabled optional integrations and customer-controlled systems beyond the documented gateway interface are proposed exclusions. Subservice organizations are expected to use the carve-out method, subject to auditor advice.

## Current readiness materials

Greenlit maintains a system description, SOC 2 control matrix, risk and remediation registers, evidence plan, security/privacy policies, data and vendor inventories, incident and continuity procedures, AI governance, automated control tests, Dependabot, immutable CI actions, a CycloneDX SBOM, and commit-bound release evidence. Licensed/independent vulnerability scanning, organizational approvals, access review, monitoring integration, vendor evidence, exercises, and penetration testing are tracked as open remediation.

## Auditor response requested

1. CPA firm legal name, licensing jurisdiction, peer-review status, responsible partner, and report-signing entity.
2. Confirmation of independence from any readiness/platform provider and disclosure of referral or commercial relationships.
3. Experience auditing small SaaS and AI-assisted systems using Vercel, Convex, GitHub, and customer-controlled model gateways.
4. Recommended Trust Services Criteria and treatment of Confidentiality, Availability, and customer gateway responsibilities.
5. Type I readiness assumptions, as-of-date flexibility, estimated request volume, fieldwork method, draft/final timing, and management time expected.
6. Fixed fee and all potential add-ons: readiness, Type I, Type II, additional criteria, exceptions/retests, platform/API access, rush work, and out-of-scope hours.
7. Whether the same engagement can proceed directly into a three-month Type II period without an evidence gap.
8. Evidence-platform compatibility and whether a paid GRC tool is genuinely required for this size and scope.
9. Secure evidence-transfer method, retention/deletion, staff access, subprocessors, locations, confidentiality, and incident terms.
10. Sample request list, engagement letter, report timeline, client references, and a redacted illustrative report.
11. Policy on report distribution, NDA, bridge letters, and customer confirmation requests.
12. Conditions that could delay or qualify the report.

## Compliance-platform response requested

1. Annual price for the actual headcount and one SOC 2 framework, implementation fees, minimum term, renewal cap, and every necessary add-on.
2. Integrations for GitHub, Vercel, Convex, Resend, identity/email administration, and custom/manual controls.
3. Ability to import Greenlit's existing control/risk/evidence registers without replacing evidence-backed controls with generic templates.
4. Auditor access/API/export, complete data export, evidence hashes, immutable timestamps, offboarding, and deletion.
5. Access review, risk, vendor, policy, training, vulnerability, exception, and Type II continuous-monitoring capabilities.
6. Data location, subprocessors, model/AI use, training/retention, DPA, SOC report, penetration evidence, SSO/MFA, and support access.
7. Assigned implementation support, expected management hours, customer references of similar size, and proof that advertised automation works for the proposed stack.
8. Any auditor referral fees or commercial relationships.

## Penetration-test response requested

Request an independent authenticated web and API test covering tenant isolation/IDOR, authentication/session flows, capability links, PDF uploads and parsing, authorization, business logic, model-gateway boundaries, injection, sensitive-data exposure, rate limits, and cloud configuration observable from the application boundary. Require named human testers, methodology, scope/hours, validation rather than scanner-only output, severity rationale, engineering-ready reproduction, executive letter, one included retest, data handling/deletion, insurance, and fixed price.

## Commercial format

Require vendors to separate platform, readiness, CPA Type I, CPA Type II, penetration test, implementation, optional criteria, and renewal costs. Proposals must identify assumptions and exclusions and remain valid for at least 30 days.
