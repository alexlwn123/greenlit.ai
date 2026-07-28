import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { recordSecurityEvent } from "./security-telemetry"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("security telemetry", () => {
  it("emits structured, correlation-friendly metadata without request secrets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const event = await recordSecurityEvent("authentication_denied", {
      method: "GET",
      route: "/api/dossiers/:id",
      status: 401,
    })

    expect(event).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        source: "greenlit.api",
        event: "authentication_denied",
        outcome: "blocked",
        severity: "notice",
        method: "GET",
        route: "/api/dossiers/:id",
        status: 401,
      })
    )
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/)
    expect(warn).toHaveBeenCalledWith(JSON.stringify(event))
    expect(JSON.stringify(event)).not.toMatch(/authorization|bearer|token|email|owner/i)
  })

  it("delivers an authenticated and signed event to an approved customer SIEM", async () => {
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_SECURITY_TELEMETRY", "true")
    vi.stubEnv("GREENLIT_SECURITY_TELEMETRY_URL", "https://siem.customer.example/events")
    vi.stubEnv("GREENLIT_SECURITY_TELEMETRY_TOKEN", "security-event-token-at-least-24-characters")
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const serialized = String(init?.body)
      const headers = new Headers(init?.headers)
      expect(headers.get("authorization")).toBe(
        "Bearer security-event-token-at-least-24-characters"
      )
      expect(headers.get("x-greenlit-signature")).toBe(
        `sha256=${createHmac("sha256", "security-event-token-at-least-24-characters")
          .update(serialized)
          .digest("hex")}`
      )
      expect(headers.get("idempotency-key")).toBe(JSON.parse(serialized).eventId)
      return new Response(null, { status: 204 })
    })

    await recordSecurityEvent(
      "upload_rejected",
      { method: "POST", route: "/api/analyses", status: 400 },
      fetchMock as typeof fetch
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("never breaks local event recording when delivery configuration is unsafe", async () => {
    vi.stubEnv("GREENLIT_SECURITY_TELEMETRY_URL", "http://127.0.0.1/events?secret=value")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      recordSecurityEvent("capability_rate_limited", {
        method: "POST",
        route: "/api/respond/[redacted]",
        status: 429,
      })
    ).resolves.toMatchObject({ event: "capability_rate_limited" })
    expect(warn).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledWith(
      "Security telemetry configuration is invalid",
      expect.objectContaining({ eventId: expect.any(String) })
    )
  })
})
