import { afterEach, describe, expect, it, vi } from "vitest"
import { assessPdfUpload, inspectPdfUpload } from "./upload-security"

const pdf = (body = "1 0 obj << /Type /Catalog >> endobj") =>
  new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`)

describe("PDF upload inspection", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("accepts a passive, complete PDF and returns only its digest", () => {
    const result = inspectPdfUpload(pdf())
    expect(result).toMatchObject({ accepted: true, policyVersion: 1 })
    if (result.accepted) expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    ["/JavaScript", "active_content"],
    ["/jS", "active_content"],
    ["/Launch", "active_content"],
    ["/RichMedia", "active_content"],
    ["/XFA", "active_content"],
    ["/EmbeddedFile", "embedded_file"],
    ["/Encrypt", "encrypted"],
  ])("rejects prohibited PDF feature %s", (feature, reason) => {
    expect(inspectPdfUpload(pdf(`1 0 obj << ${feature} 2 0 R >> endobj`))).toEqual({
      accepted: false,
      reason,
      policyVersion: 1,
    })
  })

  it("rejects non-PDF and truncated input", () => {
    expect(inspectPdfUpload(new TextEncoder().encode("not a pdf"))).toMatchObject({
      accepted: false,
      reason: "invalid_signature",
    })
    expect(inspectPdfUpload(new TextEncoder().encode("%PDF-1.7\n1 0 obj"))).toMatchObject({
      accepted: false,
      reason: "truncated",
    })
  })

  it("fails closed when malware scanning is required but not configured", async () => {
    vi.stubEnv("GREENLIT_REQUIRE_UPLOAD_MALWARE_SCAN", "true")
    await expect(assessPdfUpload(pdf())).resolves.toEqual({
      accepted: false,
      reason: "scanner_unavailable",
    })
  })

  it("sends content without a filename and retains scanner provenance", async () => {
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_URL", "https://scanner.customer.example/v1/scan")
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_TOKEN", "scanner-token-with-24-characters")
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const sha256 = new Headers(init?.headers).get("x-content-sha256")
      expect(new Headers(init?.headers).has("x-file-name")).toBe(false)
      return new Response(
        JSON.stringify({
          verdict: "clean",
          sha256,
          engine: "customer-av",
          engineVersion: "4.2",
          signatureVersion: "2026-07-28",
        })
      )
    })

    const result = await assessPdfUpload(pdf(), fetchMock as typeof fetch)
    expect(result).toMatchObject({
      accepted: true,
      security: {
        policyVersion: 1,
        malwareScan: {
          status: "clean",
          engine: "customer-av",
          engineVersion: "4.2",
          signatureVersion: "2026-07-28",
        },
      },
    })
  })

  it("rejects malicious and mismatched scanner responses", async () => {
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_URL", "https://scanner.customer.example/v1/scan")
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_TOKEN", "scanner-token-with-24-characters")
    const malicious = vi.fn(
      async () => new Response(JSON.stringify({ verdict: "malicious" }), { status: 200 })
    )
    await expect(assessPdfUpload(pdf(), malicious as typeof fetch)).resolves.toEqual({
      accepted: false,
      reason: "malicious",
    })

    const mismatch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            verdict: "clean",
            sha256: "0".repeat(64),
            engine: "customer-av",
            engineVersion: "4.2",
            signatureVersion: "current",
          })
        )
    )
    await expect(assessPdfUpload(pdf(), mismatch as typeof fetch)).resolves.toEqual({
      accepted: false,
      reason: "scanner_unavailable",
    })
  })

  it("blocks unsafe scanner endpoints", async () => {
    vi.stubEnv("GREENLIT_UPLOAD_SCANNER_URL", "http://127.0.0.1/scan?token=secret")
    await expect(assessPdfUpload(pdf())).rejects.toThrow(/must be an HTTPS URL/)
  })
})
