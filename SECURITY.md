# Security policy

## Reporting a vulnerability

Email `security@greenlit.ai` with a description, affected URL/component, reproducible steps or proof of concept, impact, and a safe contact method. Do not include customer dossier content, credentials, personal data, or secrets unless we explicitly arrange a protected transfer.

We aim to acknowledge credible reports within two business days and will coordinate validation and remediation. Please allow a reasonable remediation period before public disclosure.

## Safe harbor

We support good-faith research intended to improve security. When you follow this policy, avoid privacy harm and service disruption, and report promptly, Greenlit will not initiate legal action against you for the research. If a third party initiates action, we will make our good-faith authorization clear where appropriate.

## Rules of engagement

- Test only accounts and data you own or have explicit permission to use.
- Stop and report immediately if you encounter customer data or obtain unintended access.
- Do not perform denial of service, social engineering, phishing, physical testing, destructive actions, persistence, automated high-volume scanning, spam, or third-party infrastructure testing.
- Do not download, alter, retain, or disclose data beyond the minimum necessary to demonstrate the issue.
- Do not demand payment or threaten disclosure. Greenlit does not currently operate a guaranteed bug-bounty program.
- Comply with applicable law and the coordinated-disclosure process.

## Scope

The Greenlit production application and API are in scope. Vendor infrastructure, customer-owned gateways, and third-party services are out of scope and should be reported to their owners. Findings already known, self-XSS without meaningful impact, missing headers without exploitability, rate-limit observations without demonstrated impact, and automated scanner output without validation may not receive individual remediation.

This policy does not grant access to customer data or waive contractual or legal obligations unrelated to good-faith security research.
