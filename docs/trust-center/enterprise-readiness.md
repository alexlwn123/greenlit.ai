# Enterprise delivery-partner readiness

## The top screening gates

| Priority | What reviewers need | Greenlit position | What closes the gate |
|---|---|---|---|
| 1 | Independent assurance | Product controls exist; no SOC 2 or penetration-test claim is made | SOC 2 readiness, Type I if demanded, Type II observation, and independent authenticated penetration test |
| 2 | Identity and tenant isolation | Authenticated production access and server-derived ownership are implemented | SAML/OIDC SSO, MFA enforcement, RBAC, SCIM, session policy, admin logs, quarterly access reviews |
| 3 | Data protection and deletion | Private storage, TLS, cache prevention, scoped access, and primary-record deletion are implemented | Customer retention settings, legal hold, deletion receipts, backup-expiry evidence, customer-managed keys/data residency where required |
| 4 | AI/data-use boundary | External AI is off by default; customer gateway, sanitization, no-training configuration, and human review are supported | Customer-approved provider contract/configuration, model evaluation evidence, and AI incident/change process |
| 5 | Secure SDLC and vulnerability management | CI, static checks, Dependabot, input controls, and a disclosure channel exist | Licensed/independent vulnerability scanning, remediation SLA metrics, artifact signing/provenance, protected releases, annual third-party test |
| 6 | Monitoring and incident response | Privacy-safe application errors and dossier audit history exist; response plan is documented | Central monitored security telemetry, named on-call roles, forensic/counsel retainers, annual tabletop and retained evidence |
| 7 | Availability and recovery | Vendor-managed cloud resilience plus a documented plan | Contractual SLA/RTO/RPO, architecture dependency review, backup verification, successful restore/failover exercise |
| 8 | Privacy and contracts | Data flows and required DPA terms are documented | Counsel-approved DPA/privacy notice/terms, transfer mechanism, rights process, breach commitment, subprocessor notification |
| 9 | Third-party risk | Current technical vendors and optional data flows are inventoried | Verify legal entities, regions, DPAs, SOC reports, breach obligations, deletion and continuity commitments |
| 10 | Corporate risk | Honest gap register exists | Security owner, approved policies, workforce training/background controls, cyber/E&O insurance, annual risk assessment |

## Recommended delivery sequence

### Before any production partner data

1. Name the security and privacy accountable owners.
2. Execute customer confidentiality and data-processing terms.
3. Confirm every enabled subprocessor, region, retention setting, and AI route.
4. Enable central authentication/hosting/storage alerts and define an on-call escalation route.
5. Commission an independent penetration test and remediate high/critical findings.
6. Exercise incident response and data restoration.
7. Purchase cyber and technology E&O coverage appropriate to promised liability.
8. Choose and publish retention, deletion, and breach-notification commitments that operations can actually meet.

### Before enterprise scale

1. Implement organization tenancy, RBAC, SSO/MFA, SCIM, and access reviews.
2. Add malware scanning/quarantine for uploads.
3. Add configurable retention, legal hold, deletion receipts, and backup lifecycle evidence.
4. Produce release SBOMs and provenance, protect production deployment approvals, and measure vulnerability SLAs.
5. Complete SOC 2 Type II or the assurance framework demanded by target buyers.

## Claims discipline

Sales and delivery personnel must not say “SOC 2 compliant,” “HIPAA compliant,” “zero retention,” “anonymous,” “fully encrypted end to end,” “no human access,” or “guaranteed accurate” unless a current, scoped artifact proves the exact statement. Use the control register and customer deployment schedule as the source of truth.
