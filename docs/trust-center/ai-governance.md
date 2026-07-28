# AI governance

## Permitted role

AI may extract, organize, compare, or draft from supplied regulatory evidence. It is an assistive system. A qualified human remains responsible for evidence verification, scientific interpretation, legal/regulatory judgment, approval, and submission.

## Mandatory controls

- External model processing is disabled by default in hosted environments.
- A deployment owner must explicitly approve external processing and its provider terms.
- The preferred enterprise route is a customer-controlled gateway using the customer's cloud identity, model allowlist, region, logging, and retention policy.
- Requests are minimized and sanitized for common credentials and personal identifiers; sanitization is not described as scientific anonymization.
- Drafting is constrained to verified claims and exact claim markers; unsupported markers and uncited substantive paragraphs are rejected.
- Provider errors do not echo response bodies to users, and gateway credentials are never returned in status data.
- Deterministic fallback paths must not silently invoke an unapproved provider.

## Prohibited claims and uses

Do not represent model output as FDA approval, a final safety conclusion, legal advice, autonomous submission authority, guaranteed completeness, or proof that a comparator transfers to a subject product. Do not train a shared model on customer content without explicit written instruction and a separately approved purpose. Do not add a provider as an undisclosed fallback.

## Model change process

For each model/version or gateway-routing change, record owner, purpose, provider/region/retention configuration, evaluation corpus that contains no production customer data, accuracy and citation-integrity results, security/privacy review, known limitations, approval, rollout, rollback, and monitoring. Re-run regression evaluations after prompt, schema, model, retrieval, or safety-control changes.

## AI incidents

Treat cross-tenant disclosure, prompt-induced secret disclosure, provider routing outside the approved boundary, material unsupported output escaping validation, or unexpected provider retention/training as a security/privacy incident. Preserve metadata and sanitized payload hashes, disable the affected route, notify incident leadership, and do not retain dossier bodies in general incident tooling.
