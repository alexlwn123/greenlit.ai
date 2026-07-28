# Customer-controlled security telemetry

Greenlit emits a small, versioned event envelope for authentication denials, public-capability throttling, upload quarantine rejections, and unexpected API failures. Events contain no identity, email, filename, file hash, capability token, record identifier, dossier content, or provider response body.

Console emission is always retained as a platform-log fallback. An enterprise can additionally send each event synchronously to a customer-controlled SIEM intake endpoint. Delivery failure never suppresses the local event or changes the underlying security response.

## Event envelope

```json
{
  "schemaVersion": 1,
  "source": "greenlit.api",
  "eventId": "uuid",
  "occurredAt": "ISO-8601 timestamp",
  "event": "upload_rejected",
  "outcome": "blocked",
  "severity": "warning",
  "method": "POST",
  "route": "/api/analyses",
  "status": 400
}
```

Greenlit sends `POST GREENLIT_SECURITY_TELEMETRY_URL` with:

- `Authorization: Bearer <GREENLIT_SECURITY_TELEMETRY_TOKEN>`
- `Content-Type: application/json`
- `Idempotency-Key: <eventId>`
- `X-Greenlit-Protocol: greenlit-security-event/v1`
- `X-Greenlit-Signature: sha256=<HMAC-SHA256 of the exact body using the token>`

The endpoint should verify the signature before parsing, deduplicate by event ID, return an empty response within two seconds, retain events for the approved period, alert against documented rules, restrict and review access, and preserve immutable export evidence. Greenlit rejects redirects and discards response bodies. Delivery errors log only the event ID and HTTP status.

## Deployment configuration

```dotenv
GREENLIT_SECURITY_TELEMETRY_URL=https://siem.customer.example/greenlit/events
GREENLIT_SECURITY_TELEMETRY_TOKEN=<server-side secret of at least 24 characters>
GREENLIT_ALLOW_EXTERNAL_SECURITY_TELEMETRY=true
```

Hosted deployments require explicit external-telemetry approval. HTTPS is mandatory; credentials, query parameters, fragments, and redirects are rejected. A private IP endpoint additionally requires `GREENLIT_ALLOW_PRIVATE_SECURITY_TELEMETRY=true`, intended for a private processing plane.

Connecting this endpoint does not complete the monitoring control by itself. Retain the production configuration, endpoint owner, access review, retention setting, alert rules, clean delivery test, forced failure test, responder acknowledgement, and representative alert/ticket evidence in the restricted audit room. Identity-provider, GitHub, Vercel, Convex, Blob, DNS/email, and model-provider events must also be connected or separately reviewed.
