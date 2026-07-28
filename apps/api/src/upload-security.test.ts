import { describe, expect, it } from "vitest"
import { inspectPdfUpload } from "./upload-security"

const pdf = (body = "1 0 obj << /Type /Catalog >> endobj") =>
  new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`)

describe("PDF upload inspection", () => {
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
})
