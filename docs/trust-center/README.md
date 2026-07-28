# Greenlit trust center

This repository is the evidence index for enterprise security and legal diligence. It distinguishes product controls that can be demonstrated today from organizational controls that still require approval, operation, testing, insurance, or independent assurance.

## Current posture

Greenlit has strong application-level foundations for a private pilot: production authentication, tenant ownership checks, private uploads, secure external-review capabilities, deletion workflows, secure response headers, bounded inputs, automated tests and static analysis, and a customer-controlled AI processing option.

Greenlit is **not currently represented here as SOC 2 certified, independently penetration tested, HIPAA compliant, ISO 27001 certified, or generally available with enterprise SSO/SCIM**. Those are procurement gates, not wording exercises. The [control register](control-register.json) records the gap and the evidence required to close each one.

## Diligence index

- [Enterprise readiness](enterprise-readiness.md): prioritized buyer questions and pass criteria.
- [Security questionnaire](security-questionnaire.md): concise, evidence-linked answers.
- [Data governance](data-governance.md): data map, classification, retention, deletion, and privacy requests.
- [Subprocessors](subprocessors.md): vendor/data-flow register requiring commercial verification.
- [Incident response](incident-response.md): operational response playbook.
- [Business continuity](business-continuity.md): resilience and recovery plan.
- [Secure development](secure-development.md): change, vulnerability, and release controls.
- [AI governance](ai-governance.md): model boundaries, validation, human review, and prohibited uses.
- [Legal readiness](legal-readiness.md): contract and privacy terms counsel must finalize.
- [Control register](control-register.json): machine-validated status and evidence map.

Run `pnpm trust:validate` before sharing the package. A successful check verifies structure and evidence-file presence; it does not certify that an organizational control has been operated or audited.
