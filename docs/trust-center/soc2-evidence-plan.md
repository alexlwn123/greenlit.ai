# SOC 2 Type I evidence plan

## Management evidence—required

- Confirmed legal entity, address, organization chart, products, workforce/contractor roster, and system owners.
- Signed policy approval record covering access, security, privacy/data governance, incidents, continuity, vendors, secure development, AI, and acceptable use.
- Approved risk assessment and documented risk acceptances.
- Personnel confidentiality/IP agreements, screening decisions where lawful, security training, and onboarding/offboarding checklists.
- Cyber and technology E&O insurance certificate or approved risk treatment.
- Signed auditor engagement and management representation letter.

## Access evidence—required

Export user/role/MFA status from GitHub, Vercel, Convex, Resend, DNS/domain/email administration, model providers, and any compliance platform. Map each account to an active person and business need; remove stale/shared/excess access; capture management approval. Repeat quarterly and after material personnel changes.

## Technical evidence—largely available

- Architecture and data flow; production configuration inventory; source and deployed commit identity.
- Authenticated secret-free security-control status export from `/api/privacy/security-controls`.
- Production authentication and owner-isolation code/tests.
- Private upload/storage and deletion code/tests.
- Security headers, bounded inputs, privacy-safe errors, capability-link controls, and model gateway tests.
- CI, CodeQL, Dependabot, dependency review, branch/release configuration, and recent successful runs.
- Vulnerability register, remediation tickets, exception approvals, penetration-test executive report, and retest evidence.

## Operational evidence—must be performed

- Security mailbox intake test and response record.
- Quarterly control-owner review minutes and corrective-action register.
- Incident tabletop attendance, scenario, timeline, decisions, lessons, and remediation.
- Backup/restore exercise with measured RTO/RPO, integrity validation, and owner-isolation check.
- Vendor assessments and current contracts/DPA/assurance reports for every enabled production vendor.
- Retention/deletion test across application metadata, private objects, notes, caches, logs, and backup lifecycle.
- Model-route approval, provider terms/configuration, evaluation results, and human-review procedure.

## Type I sampling rule

Type I tests design at an as-of date, but the auditor will still request evidence that each control exists and can operate. Keep original exports and approvals with dates, source, preparer, reviewer, scope, and immutable file hashes where feasible. Do not manufacture historical evidence or backdate approvals.

## Restricted audit room

Store corporate, personnel, vendor reports, screenshots, contracts, insurance, access exports, incident materials, and the final SOC report in a restricted diligence room. This repository should contain templates and non-sensitive technical evidence only.
