# SOC 2 restricted audit room index

This file defines the structure for sensitive evidence that must not be committed to the product repository. Create the restricted room in a company-controlled storage service with MFA, named-user access, download/activity logging, and access limited to management, the control owner, and the independent CPA team.

## Evidence ID convention

Use `GL-YYYY-CATEGORY-NNN`, where `CATEGORY` is one of `GOV`, `IAM`, `HR`, `RISK`, `VEND`, `SDLC`, `LOG`, `IR`, `BCP`, `DATA`, `APP`, `AUDIT`, or `LEGAL`. Never reuse an ID. Evidence filenames begin with the ID and contain no customer names, credentials, tokens, or secret values.

Each evidence item must record:

- evidence ID, title, control IDs, and collection date;
- source system, covered period or as-of timestamp, and production environment;
- preparer and reviewer;
- original filename and SHA-256 hash;
- sensitivity classification and permitted audience;
- related exception IDs, if any.

## Folder structure

1. `00-program-and-scope`: approved intake, system description, organization chart, scope/date, engagement letter, and management representations.
2. `01-governance-and-risk`: policy approvals, risk register approvals, meeting minutes, insurance, and control reviews.
3. `02-people-and-access`: workforce population, agreements/training, onboarding/offboarding, system exports, MFA, and access-review approval.
4. `03-vendors-and-legal`: vendor assessments, contracts, DPAs, SOC reports, regions, retention, and recovery commitments.
5. `04-change-and-security`: CI/release evidence, branch settings, vulnerability scans, penetration test, remediation, and retest.
6. `05-monitoring-and-incidents`: log inventory, retention, alert tests, responder acknowledgements, incidents, and tabletop results.
7. `06-continuity-and-data`: backup configuration, recovery exercise, RTO/RPO, retention approvals, deletion tests, and backup expiry.
8. `07-product-and-ai`: architecture, data flow, tenant-isolation evidence, upload controls, model-route approvals, evaluations, and human review.
9. `08-exceptions`: original findings, compensating controls, risk acceptance, corrective actions, retest, and closure approvals.

## Collection rules

- Export from the authoritative source whenever possible; do not recreate evidence in a document editor.
- Preserve the full timestamp, actor, environment, filters, and population. A cropped screenshot alone is weak evidence.
- Store reports from vendors under their contractual confidentiality restrictions and share only with authorized auditors.
- Do not backdate, overwrite, or silently replace evidence. Add a superseding item and preserve the original.
- Record every deviation in `soc2-exception-register.json`; a closed ticket without a retest is not sufficient.
- Review audit-room access before opening it to an auditor and revoke auditor access after the agreed retention period.

## Auditor handoff checklist

- Management intake and policy/risk approvals are signed and internally consistent.
- Every in-scope control maps to at least one evidence ID or documented exception.
- Population exports reconcile to the workforce, access, vendor, and production-system inventories.
- Samples can be traced from auditor request to original source, reviewer, hash, and any exception.
- The final index is exported read-only and retained with the issued report and representation letter.

Track preparation and fieldwork in `soc2-pbc-register.json`. Every request maps to its SOC 2 controls, related remediation, owner, audit-room folder, timing, required contents, and evidence IDs. Do not mark a request `ready_for_auditor` until its population is complete, source evidence is uploaded, hashes and reviewer are recorded, and known deviations are in the exception register. Replace or reconcile this management-prepared list with the engaged CPA firm's official request list; do not assume numbering or samples will remain identical.

## Reproducible public evidence pack

Run `pnpm soc2:evidence-pack` from a clean, reviewed commit. It creates a secret-free package under `.artifacts/soc2-evidence-pack` containing the public control documentation and referenced source evidence, machine-readable readiness result, control-to-evidence map, source commit, and a SHA-256 manifest of every included file. Run `pnpm soc2:evidence-verify` after copying or uploading the directory to detect missing, added, or modified files. Use `pnpm soc2:evidence-pack -- --strict` when the package must fail unless all readiness gates have been satisfied.

The generated package deliberately excludes restricted evidence. Upload it alongside—not in place of—the original source exports, approvals, personnel records, contracts, penetration-test report, and other protected artifacts in the audit room. A package hash demonstrates integrity after collection; it does not establish completeness or auditor acceptance.
