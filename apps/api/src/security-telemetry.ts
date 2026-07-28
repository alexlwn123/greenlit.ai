import { randomUUID } from "node:crypto"

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

export function recordSecurityEvent(
  event: SecurityEventName,
  input: Pick<SecurityEvent, "method" | "route" | "status">
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
  console.warn(JSON.stringify(securityEvent))
  return securityEvent
}
