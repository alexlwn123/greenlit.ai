import { createHmac, randomUUID } from "node:crypto"

export type SecurityEventName =
  | "authentication_denied"
  | "capability_rate_limited"
  | "upload_rejected"
  | "unexpected_request_failure"

export type SecurityEvent = {
  schemaVersion: 1
  source: "greenlit.api"
  eventId: string
  occurredAt: string
  event: SecurityEventName
  outcome: "blocked" | "failure"
  severity: "notice" | "warning"
  method: string
  route: string
  status: number
}

export function securityTelemetryStatus() {
  let endpoint: URL | null = null
  let configurationValid = true
  try {
    endpoint = configuredTelemetryUrl()
  } catch {
    configurationValid = false
  }
  return {
    configured: Boolean(endpoint),
    configurationValid,
    hostedExternalDeliveryApproved:
      !isHosted() || process.env.GREENLIT_ALLOW_EXTERNAL_SECURITY_TELEMETRY === "true",
    endpointHost: endpoint?.hostname,
    eventSigning: "hmac-sha256" as const,
    localFallback: true as const,
    payloadPolicy: "metadata_only" as const,
  }
}

const telemetryTimeoutMs = 2_000

export async function recordSecurityEvent(
  event: SecurityEventName,
  input: Pick<SecurityEvent, "method" | "route" | "status">,
  fetchImplementation: typeof fetch = fetch
) {
  const securityEvent: SecurityEvent = {
    schemaVersion: 1,
    source: "greenlit.api",
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    event,
    outcome: event === "unexpected_request_failure" ? "failure" : "blocked",
    severity: event === "authentication_denied" ? "notice" : "warning",
    method: input.method,
    route: input.route,
    status: input.status,
  }
  const serialized = JSON.stringify(securityEvent)
  console.warn(serialized)
  await forwardSecurityEvent(securityEvent, serialized, fetchImplementation)
  return securityEvent
}

async function forwardSecurityEvent(
  event: SecurityEvent,
  serialized: string,
  fetchImplementation: typeof fetch
) {
  let endpoint: URL | null
  try {
    endpoint = configuredTelemetryUrl()
  } catch {
    console.error("Security telemetry configuration is invalid", { eventId: event.eventId })
    return "misconfigured" as const
  }
  if (!endpoint) return "not_configured" as const
  if (isHosted() && process.env.GREENLIT_ALLOW_EXTERNAL_SECURITY_TELEMETRY !== "true") {
    return "not_approved" as const
  }
  const token = process.env.GREENLIT_SECURITY_TELEMETRY_TOKEN
  if (!token || token.length < 24) return "misconfigured" as const
  try {
    const response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": event.eventId,
        "X-Greenlit-Protocol": "greenlit-security-event/v1",
        "X-Greenlit-Signature": `sha256=${createHmac("sha256", token).update(serialized).digest("hex")}`,
      },
      body: serialized,
      redirect: "error",
      signal: AbortSignal.timeout(telemetryTimeoutMs),
    })
    await response.body?.cancel()
    if (!response.ok) {
      console.error("Security telemetry delivery failed", {
        eventId: event.eventId,
        status: response.status,
      })
      return "failed" as const
    }
    return "delivered" as const
  } catch {
    console.error("Security telemetry delivery failed", { eventId: event.eventId })
    return "failed" as const
  }
}

function configuredTelemetryUrl() {
  const value = process.env.GREENLIT_SECURITY_TELEMETRY_URL?.trim()
  if (!value) return null
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (isPrivateNetworkLiteral(url.hostname) &&
      process.env.GREENLIT_ALLOW_PRIVATE_SECURITY_TELEMETRY !== "true")
  ) {
    throw new Error(
      "GREENLIT_SECURITY_TELEMETRY_URL must be an HTTPS URL without credentials, query parameters, or fragments; private addresses require explicit approval."
    )
  }
  return url
}

function isHosted() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
}

function isPrivateNetworkLiteral(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  )
}
