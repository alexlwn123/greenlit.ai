import { afterEach, describe, expect, it, vi } from "vitest"
import {
  modelProcessingStatus,
  type RedactionSummary,
  requestExternalModel,
  sanitizeModelText,
} from "./model-gateway"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("confidential model gateway", () => {
  it("redacts common credentials and personal identifiers", () => {
    const summary: RedactionSummary = {
      credentials: 0,
      emails: 0,
      phoneNumbers: 0,
      governmentIdentifiers: 0,
    }
    const sanitized = sanitizeModelText(
      "Email jane@example.com, call 415-555-1212, SSN 123-45-6789, key sk-ant-abcdefghijklmnop.",
      summary
    )
    expect(sanitized).not.toContain("jane@example.com")
    expect(sanitized).not.toContain("415-555-1212")
    expect(sanitized).not.toContain("123-45-6789")
    expect(sanitized).not.toContain("sk-ant-abcdefghijklmnop")
    expect(summary).toEqual({
      credentials: 1,
      emails: 1,
      phoneNumbers: 1,
      governmentIdentifiers: 1,
    })
  })

  it("sends a minimized, auditable packet to a customer-owned gateway", async () => {
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING", "true")
    vi.stubEnv("GREENLIT_MODEL_PROVIDER", "customer_gateway")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_URL", "https://models.customer.example/invoke")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_TOKEN", "gateway-secret-at-least-24-chars")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await requestExternalModel("test_operation", {
      model: "customer-model",
      max_tokens: 100,
      messages: [{ role: "user", content: "Contact owner@example.com" }],
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.hostname).toBe("models.customer.example")
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer gateway-secret-at-least-24-chars",
        "X-Greenlit-Protocol": "greenlit-confidential-model/v1",
      })
    )
    const packet = JSON.parse(String(init.body)) as {
      protocol: string
      operation: string
      payload: { messages: Array<{ content: string }> }
      privacy: { redactions: { emails: number }; transmittedSha256: string }
    }
    expect(packet.protocol).toBe("greenlit-confidential-model/v1")
    expect(packet.operation).toBe("test_operation")
    expect(packet.payload.messages[0].content).toBe("Contact [REDACTED_EMAIL]")
    expect(packet.privacy.redactions.emails).toBe(1)
    expect(packet.privacy.transmittedSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(String(init.body)).not.toContain("gateway-secret-at-least-24-chars")
    expect(String(init.body)).not.toContain("owner@example.com")
  })

  it("rejects unsafe gateway endpoints unless a private deployment explicitly approves one", () => {
    vi.stubEnv("GREENLIT_MODEL_PROVIDER", "customer_gateway")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_URL", "http://127.0.0.1:9000/invoke")
    expect(() => modelProcessingStatus()).toThrow(/HTTPS URL/)

    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_URL", "https://10.0.0.5/invoke")
    expect(() => modelProcessingStatus()).toThrow(/private addresses/)
    vi.stubEnv("GREENLIT_ALLOW_PRIVATE_MODEL_GATEWAY", "true")
    expect(modelProcessingStatus().endpointHost).toBe("10.0.0.5")
  })

  it("reports only safe boundary metadata and never gateway credentials", () => {
    vi.stubEnv("GREENLIT_MODEL_PROVIDER", "customer_gateway")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_URL", "https://secure.example.com/invoke")
    vi.stubEnv("GREENLIT_CUSTOMER_GATEWAY_TOKEN", "never-display-this")
    const serialized = JSON.stringify(modelProcessingStatus())
    expect(serialized).toContain("secure.example.com")
    expect(serialized).not.toContain("never-display-this")
    expect(serialized).not.toContain("/invoke")
  })

  it("fails closed on an unknown provider selection", () => {
    vi.stubEnv("GREENLIT_MODEL_PROVIDER", "typo-provider")
    vi.stubEnv("ANTHROPIC_API_KEY", "configured-key")
    expect(() => modelProcessingStatus()).toThrow(/must be disabled/)
  })
})
