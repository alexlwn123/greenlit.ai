import { beforeEach, describe, expect, it } from "vitest"
import {
  clearCapabilityToken,
  consumeCapabilityToken,
  isPublicCapabilityRoute,
} from "./capability-token"

beforeEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState({}, "", "/")
})

describe("public capability token privacy", () => {
  it("moves fragment credentials into session-only storage and cleans the address bar", () => {
    const token = "a".repeat(64)
    window.history.replaceState({}, "", `/respond#token=${token}`)

    expect(isPublicCapabilityRoute(window.location)).toBe(true)
    expect(consumeCapabilityToken("respond")).toBe(token)
    expect(window.location.pathname).toBe("/respond")
    expect(window.location.hash).toBe("")
    expect(window.sessionStorage.getItem("greenlit:respond-capability")).toBe(token)
    expect(isPublicCapabilityRoute(window.location)).toBe(true)
    expect(consumeCapabilityToken("respond")).toBe(token)
  })

  it("migrates legacy path credentials without retaining them in browser history", () => {
    const token = "b".repeat(64)
    window.history.replaceState({}, "", `/review/${token}`)

    expect(consumeCapabilityToken("review")).toBe(token)
    expect(window.location.pathname).toBe("/review")
    expect(window.sessionStorage.getItem("greenlit:review-capability")).toBe(token)
  })

  it("rejects malformed credentials and supports explicit removal", () => {
    window.history.replaceState({}, "", "/respond#token=not-a-token")
    expect(consumeCapabilityToken("respond")).toBe("")

    const token = "c".repeat(64)
    window.sessionStorage.setItem("greenlit:respond-capability", token)
    clearCapabilityToken("respond")
    expect(window.sessionStorage.getItem("greenlit:respond-capability")).toBeNull()
  })
})
