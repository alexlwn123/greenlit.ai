import { afterEach, describe, expect, it, vi } from "vitest"
import {
  assertExternalModelProcessingAllowed,
  externalModelProcessingAllowed,
  externalModelRequestError,
} from "./external-model-policy"

afterEach(() => vi.unstubAllEnvs())

describe("external model privacy policy", () => {
  it("requires explicit hosted opt-in before confidential content leaves Greenlit", () => {
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING", "")
    expect(externalModelProcessingAllowed()).toBe(false)
    expect(() => assertExternalModelProcessingAllowed()).toThrow(/disabled/)

    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING", "true")
    expect(externalModelProcessingAllowed()).toBe(true)
    expect(() => assertExternalModelProcessingAllowed()).not.toThrow()
  })

  it("does not copy provider response bodies into application errors", () => {
    expect(externalModelRequestError("Assisted drafting", 400).message).toBe(
      "Assisted drafting failed with external provider status 400."
    )
  })
})
