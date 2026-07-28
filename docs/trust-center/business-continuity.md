# Business continuity and disaster recovery

Status: plan and provisional objectives; vendor capabilities and restoration have not yet been evidenced as tested by Greenlit.

## Service priorities

1. Protect confidentiality and integrity; never weaken tenant isolation to restore availability.
2. Preserve authentication, metadata, and restricted objects.
3. Restore authenticated read access before mutations, uploads, model processing, or external collaboration.
4. Reconcile audit history and queued/partial workflows before declaring recovery complete.

## Provisional objectives

- Target RTO: 24 hours for the production application.
- Target RPO: 24 hours for application metadata and uploaded artifacts.

These are planning targets, not an SLA. Commercial commitments require validated provider capabilities, a successful exercise, monitoring, support coverage, and contract approval.

## Dependency scenarios

- **Vercel/API or Blob outage:** disable affected writes, communicate status, avoid redirecting restricted content to unapproved storage, restore only after integrity checks.
- **Convex/auth or metadata outage:** prevent anonymous fallback in production; preserve uploads from becoming orphaned; reconcile objects and metadata after recovery.
- **AI provider/gateway outage:** fail closed or use deterministic paths; never silently route content to a different provider.
- **Source repository/CI compromise:** freeze releases, revoke tokens, validate commit history and build provenance, restore from protected known-good copies.
- **Key-person loss:** maintain two authorized owners for critical vendor accounts and an offline recovery inventory.

## Exercise

At least annually, restore representative metadata and a private artifact into an isolated environment, verify hashes and owner isolation, test credential recovery and vendor escalation, measure actual RTO/RPO, and record gaps. Any failed objective requires a tracked corrective action and retest.
