# Private upload security gateway

Greenlit performs local PDF quarantine inspection before an uploaded file can become dossier evidence or enter analysis. Enterprises can additionally connect a customer-controlled anti-malware service so proprietary files remain inside an approved security boundary.

## Processing sequence

1. Greenlit validates the upload owner/path, media type, size, PDF signature, and end marker.
2. Local inspection rejects encryption, embedded files, JavaScript, launch actions, rich media, and XFA.
3. Greenlit computes a SHA-256 digest locally.
4. When configured, Greenlit posts the raw PDF to the approved scanner without sending its filename, owner, dossier, company, or session identifier.
5. Greenlit accepts only a `clean` verdict whose returned digest exactly matches the submitted bytes. Malicious, unknown, malformed, mismatched, timed-out, redirected, or failed responses are rejected.
6. The private artifact record retains the local policy version, digest, inspection time, and scanner engine/signature provenance. Security telemetry records only the normalized route and rejection status.

Local structural inspection is defense in depth, not an anti-malware engine. Set required mode only after the scanner endpoint is deployed and tested.

## Scanner request

Greenlit sends `POST GREENLIT_UPLOAD_SCANNER_URL` with:

- `Authorization: Bearer <GREENLIT_UPLOAD_SCANNER_TOKEN>`
- `Content-Type: application/pdf`
- `X-Content-SHA256: <lowercase SHA-256>`
- `X-Greenlit-Protocol: greenlit-upload-scan/v1`

The request body contains only the PDF bytes. The service must cap request size, authenticate Greenlit, disable body logging, isolate scanning, keep signatures current, and delete temporary material after returning a verdict.

## Scanner response

The scanner returns a JSON response no larger than 16 KB:

```json
{
  "verdict": "clean",
  "sha256": "exact request SHA-256",
  "engine": "approved-engine",
  "engineVersion": "version",
  "signatureVersion": "version-or-date"
}
```

`verdict` may be `clean`, `malicious`, or `unknown`. Only `clean` is accepted. The scanner should return an error for incomplete scans rather than guessing.

## Deployment configuration

```dotenv
GREENLIT_UPLOAD_SCANNER_URL=https://scanner.customer.example/v1/scan
GREENLIT_UPLOAD_SCANNER_TOKEN=<server-side secret of at least 24 characters>
GREENLIT_ALLOW_EXTERNAL_UPLOAD_SCANNING=true
GREENLIT_REQUIRE_UPLOAD_MALWARE_SCAN=true
```

Hosted deployments require the explicit external-scanning approval flag. HTTPS is mandatory; credentials, query parameters, fragments, and redirects are rejected. A private IP endpoint additionally requires `GREENLIT_ALLOW_PRIVATE_UPLOAD_SCANNER=true`, intended for a customer-hosted processing plane with private network reachability.

Before enabling the route, approve the scanner contract/data flow, region, subprocessors, retention/deletion behavior, incident notification, assurance evidence, and operational owner. Retain a test showing clean, malicious, unavailable, and digest-mismatch behavior plus the deployed configuration and current signature/version evidence in the restricted audit room.
