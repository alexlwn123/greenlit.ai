import { afterEach, describe, expect, it, vi } from "vitest"
import { recordSecurityEvent } from "./security-telemetry"

afterEach(() => vi.restoreAllMocks())

describe("security telemetry", () => {
  it("emits structured, correlation-friendly metadata without request secrets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const event = recordSecurityEvent("authentication_denied", {
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
})
