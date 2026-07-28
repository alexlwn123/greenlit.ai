# Secure development and vulnerability management

## Implemented repository controls

- CI runs linting, trust-register validation, typechecking, tests, and production builds on changes.
- CodeQL runs extended JavaScript/TypeScript security queries on pushes, pull requests, and weekly.
- Dependabot proposes grouped weekly dependency updates.
- Production secrets remain server-side; test fixtures must not contain customer data.
- Security boundaries are regression-tested, including production authentication, owner isolation, capability links, upload validation, privacy gating, model sanitization, and secret-free status output.

## Required change process

Every material change should have a defined purpose, reviewed diff, passing CI, rollback path, and proportionate security/privacy assessment. Changes to authentication, authorization, cryptography, uploads, deletion, logging, external processing, or customer-data flows require explicit security review. Emergency changes require retrospective review.

## Vulnerability targets for approval

- Critical: immediately contain; target fix within 72 hours.
- High: target fix within 14 days.
- Medium: target fix within 60 days.
- Low: target fix within 120 days or documented acceptance.

These become external commitments only after ownership, monitoring, exception approval, and metrics exist. Known-exploited issues or active abuse override the normal schedule.

## Release evidence still required

Generate a CycloneDX or SPDX SBOM; pin and review CI actions; enable repository secret scanning/push protection and protected production environments; sign releases or generate SLSA-compatible provenance; retain approvals and deployed commit identity; measure remediation performance; commission annual third-party penetration testing.

The dependency-review workflow requires GitHub's dependency graph and, for a private repository, GitHub Code Security or Advanced Security. Confirm licensing and enable the repository feature before making the workflow a required check.
