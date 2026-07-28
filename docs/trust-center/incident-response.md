# Incident response plan

Status: operational template requiring executive approval, named contacts, and an exercise before it can be represented as tested.

## Severity

- **SEV-1 Critical:** confirmed or strongly suspected unauthorized restricted-data access, destructive compromise, broad tenant isolation failure, exposed production secrets, or material outage with no workaround.
- **SEV-2 High:** contained unauthorized access, exploitable high-impact vulnerability, material integrity failure, or sustained degradation.
- **SEV-3 Moderate:** limited security event with low demonstrated impact or credible vulnerability requiring normal remediation.
- **SEV-4 Low:** unsuccessful event, informational report, or hygiene issue.

## Roles to assign

Incident commander; security/technical lead; privacy/legal lead; communications/customer lead; evidence recorder; executive decision-maker; and alternates. Maintain out-of-band contact details plus retained counsel, cyber-insurer, hosting, identity, storage, forensic, and law-enforcement contacts outside this public repository.

## Procedure

1. **Detect and intake:** record reporter, time, systems, indicators, data/tenants potentially affected, and preserve original evidence. Do not place secrets or dossier bodies in general chat/tickets.
2. **Triage:** assign severity and commander; open a restricted timeline; engage privacy/legal and insurer early for potentially reportable events.
3. **Contain:** revoke sessions/capabilities, rotate affected secrets, isolate integrations or deployments, block indicators, preserve snapshots/logs, and avoid destroying evidence.
4. **Investigate:** establish entry point, affected identities/data/actions, duration, exfiltration/integrity/availability impact, vendor involvement, and confidence. Maintain chain of custody.
5. **Eradicate and recover:** patch root cause, rebuild from trusted artifacts, validate tenant boundaries and data integrity, increase monitoring, and restore in controlled stages.
6. **Notify:** legal determines regulator, customer, individual, insurer, and law-enforcement obligations. Contractual notices should state known facts, affected data/systems, containment, customer actions, contact, and update cadence—never speculate.
7. **Close:** document root cause, scope, decisions, notifications, recovery evidence, and corrective owners/dates. Hold a lessons-learned review within ten business days for SEV-1/2.

## Initial targets for approval

SEV-1 acknowledgement within 15 minutes and executive/legal escalation within 30 minutes; SEV-2 within one hour. These are internal response targets, not customer notification promises. Contractual or statutory notification clocks are tracked by counsel from the legally relevant trigger.

## Exercises and evidence

Run at least one annual tabletop covering credential compromise, cross-tenant access, malicious PDF/upload, AI-provider data exposure, and regional cloud outage. Retain attendance, timeline, decisions, gaps, corrective actions, and closure evidence. Test contact trees quarterly.

## Monitoring intake

Privacy-safe application events can be forwarded through the documented customer-controlled SIEM protocol. The security owner must configure the production route, approve retention and access, define alert thresholds and on-call escalation, test successful and failed delivery, and reconcile the SIEM with identity, GitHub, Vercel, Convex, storage, email, and enabled provider logs. A configured webhook without reviewed alerts and responder evidence is not a completed monitoring control.
