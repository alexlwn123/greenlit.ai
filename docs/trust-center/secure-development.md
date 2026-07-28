# Secure development and vulnerability management

## Implemented repository controls

- CI runs linting, trust-register validation, typechecking, tests, and production builds on changes.
- Biome static analysis and the full validation suite run on pushes and pull requests. GitHub CodeQL
  is not currently enabled because code scanning is unavailable for this private repository's plan;
  the former failing scheduled workflow was removed rather than represented as an operating control.
- Dependabot proposes grouped weekly dependency updates.
- Every third-party CI action is pinned to an immutable commit, checkout credentials are not persisted, jobs have bounded execution time, and Dependabot proposes reviewed action-revision updates.
- Production secrets remain server-side; test fixtures must not contain customer data.
- Security boundaries are regression-tested, including production authentication, owner isolation, capability links, upload validation, privacy gating, model sanitization, and secret-free status output.
- CI generates a CycloneDX 1.6 inventory from unchanged tracked source before build outputs exist, then runs the complete validation suite. A release-evidence manifest binds the SBOM, lockfile, and automation configuration hashes to the exact commit and workflow run; only those two allowlisted files are uploaded from the hidden artifact directory after validation succeeds and retained for 90 days.
- `pnpm security:validate-workflows` blocks movable third-party action tags, persisted checkout credentials, unbounded jobs, implicit permissions, broad write access, and unreviewed `pull_request_target` use.

## Required change process

Every material change should have a defined purpose, reviewed diff, passing CI, rollback path, and proportionate security/privacy assessment. Changes to authentication, authorization, cryptography, uploads, deletion, logging, external processing, or customer-data flows require explicit security review. Emergency changes require retrospective review.

## Vulnerability targets for approval

- Critical: immediately contain; target fix within 72 hours.
- High: target fix within 14 days.
- Medium: target fix within 60 days.
- Low: target fix within 120 days or documented acceptance.

These become external commitments only after ownership, monitoring, exception approval, and metrics exist. Known-exploited issues or active abuse override the normal schedule.

## Release evidence still required

Enable repository secret scanning/push protection and protected production environments; add cryptographic signing or SLSA-compatible provenance beyond the current hash-linked release manifest; retain approvals and deployed commit identity; measure remediation performance; commission annual third-party penetration testing.

GitHub CodeQL and dependency review require repository security features that are not currently enabled for this private repository. Confirm licensing before reintroducing either workflow. Until then, Dependabot is the implemented dependency-update signal; vulnerability scanning and remediation metrics remain incomplete controls.
