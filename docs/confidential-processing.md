# Confidential model processing

Greenlit can operate without sending dossier content to a model provider. When AI-assisted analysis or drafting is enabled, every request now crosses one server-side gateway with mandatory sanitization and an explicit deployment-level opt-in.

## Deployment choices

1. **Private deterministic mode** (default): set `GREENLIT_MODEL_PROVIDER=disabled`. Uploaded content remains inside Greenlit's storage and processing boundary; AI-assisted features use deterministic fallbacks or remain unavailable.
2. **Approved enterprise API**: set `GREENLIT_MODEL_PROVIDER=anthropic`, provide the server-side key, and explicitly approve external processing. Greenlit sanitizes each request before calling the provider API.
3. **Customer-controlled gateway**: set `GREENLIT_MODEL_PROVIDER=customer_gateway`. Greenlit sends a sanitized protocol packet to an HTTPS endpoint controlled by the customer. That gateway can invoke the customer's approved Azure OpenAI, AWS Bedrock, Anthropic, OpenAI, or internal model deployment. Provider credentials never enter Greenlit.

The third option is the recommended enterprise architecture. It preserves the customer's existing cloud identity, provider contract, logging policy, network controls, data residency, retention policy, and model allowlist.

## Customer gateway protocol

Greenlit sends `POST GREENLIT_CUSTOMER_GATEWAY_URL` with:

- `Authorization: Bearer <GREENLIT_CUSTOMER_GATEWAY_TOKEN>`
- `Idempotency-Key: <request UUID>`
- `X-Greenlit-Protocol: greenlit-confidential-model/v1`
- `Content-Type: application/json`

The request body is:

```json
{
  "protocol": "greenlit-confidential-model/v1",
  "requestId": "uuid",
  "operation": "deep_analysis",
  "payload": {
    "model": "customer-model-alias",
    "max_tokens": 20000,
    "system": "sanitized instructions",
    "messages": [{ "role": "user", "content": "sanitized dossier context" }]
  },
  "privacy": {
    "sanitization": "greenlit-required-v1",
    "redactions": {
      "credentials": 0,
      "emails": 2,
      "phoneNumbers": 0,
      "governmentIdentifiers": 0
    },
    "transmittedSha256": "sha256 of payload",
    "retentionRequested": "none",
    "createdAt": "ISO-8601 timestamp"
  }
}
```

The gateway returns an Anthropic-compatible response envelope so Greenlit remains independent of the model behind it:

```json
{
  "content": [{ "type": "text", "text": "model output" }],
  "usage": { "input_tokens": 1000, "output_tokens": 200 }
}
```

The customer gateway should authenticate Greenlit, reject replayed idempotency keys, enforce an operation and model allowlist, cap request and response sizes, disable provider-side retention where supported, emit metadata-only audit events, and avoid logging request or response bodies. Production endpoints must use HTTPS. Private IP endpoints require `GREENLIT_ALLOW_PRIVATE_MODEL_GATEWAY=true`, intended only for a customer-hosted Greenlit processing plane with private network reachability.

## Sanitization and its limits

Before transmission, Greenlit removes common API credentials, email addresses, US phone numbers, and Social Security-number-shaped identifiers. It records only redaction counts and a hash of the exact sanitized payload. Model requests are capped at 2 MB and time out after two minutes.

Sanitization is defense in depth, not a promise of scientific anonymity. A formulation, organism, manufacturing method, study design, or unusual numerical profile can identify a company even after ordinary personal identifiers are removed. Customers with that threat model should use the customer-controlled gateway and their own enterprise model boundary. A future de-identification tier can alias company, product, and study identities, but should not be enabled automatically because substitutions can damage regulatory meaning and evidence traceability.

## Required configuration

```dotenv
GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING=true
GREENLIT_MODEL_PROVIDER=customer_gateway
GREENLIT_CUSTOMER_GATEWAY_URL=https://models.customer.example/greenlit
GREENLIT_CUSTOMER_GATEWAY_TOKEN=<secret stored only on the server>
```

Do not use a `VITE_` prefix for any model or gateway secret. The application exposes only a safe status object containing the selected boundary, enabled state, sanitization requirement, and gateway hostname.

## Remaining enterprise hardening

Before claiming a high-assurance enterprise deployment, add mutual TLS or workload-identity authentication, tenant-specific envelope encryption keys, configurable regional storage, malware scanning and content-disarm/reconstruction for uploads, retention schedules with verified deletion, and independent penetration testing. The current gateway creates the architectural seam needed for those controls without tying Greenlit to one provider.
