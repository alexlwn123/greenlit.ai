import { createHash } from "node:crypto"

export type PdfInspection =
  | {
      accepted: true
      sha256: string
      policyVersion: 1
    }
  | {
      accepted: false
      reason: "invalid_signature" | "truncated" | "encrypted" | "active_content" | "embedded_file"
      policyVersion: 1
    }

const pdfSignature = new TextEncoder().encode("%PDF-")
const pdfEndMarker = new TextEncoder().encode("%%EOF")
const prohibitedFeatures = [
  { token: "/JavaScript", reason: "active_content" },
  { token: "/JS", reason: "active_content" },
  { token: "/Launch", reason: "active_content" },
  { token: "/RichMedia", reason: "active_content" },
  { token: "/XFA", reason: "active_content" },
  { token: "/EmbeddedFile", reason: "embedded_file" },
  { token: "/Encrypt", reason: "encrypted" },
] as const

export function inspectPdfUpload(bytes: Uint8Array): PdfInspection {
  const policyVersion = 1 as const
  if (!containsAscii(bytes.subarray(0, Math.min(bytes.length, 1024)), pdfSignature)) {
    return { accepted: false, reason: "invalid_signature", policyVersion }
  }
  if (!containsAscii(bytes.subarray(Math.max(0, bytes.length - 2048)), pdfEndMarker)) {
    return { accepted: false, reason: "truncated", policyVersion }
  }
  for (const feature of prohibitedFeatures) {
    if (containsPdfName(bytes, new TextEncoder().encode(feature.token))) {
      return { accepted: false, reason: feature.reason, policyVersion }
    }
  }
  return {
    accepted: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    policyVersion,
  }
}

function containsPdfName(bytes: Uint8Array, name: Uint8Array) {
  if (name.length === 0 || bytes.length < name.length) return false
  for (let offset = 0; offset <= bytes.length - name.length; offset += 1) {
    let match = true
    for (let index = 0; index < name.length; index += 1) {
      if (asciiLower(bytes[offset + index]) !== asciiLower(name[index])) {
        match = false
        break
      }
    }
    if (match && isPdfDelimiter(bytes[offset + name.length])) return true
  }
  return false
}

function isPdfDelimiter(value: number | undefined) {
  return (
    value === undefined ||
    value === 0 ||
    value === 9 ||
    value === 10 ||
    value === 12 ||
    value === 13 ||
    value === 32 ||
    "()<>[]{}/%".includes(String.fromCharCode(value))
  )
}

function containsAscii(haystack: Uint8Array, needle: Uint8Array, caseInsensitive = false) {
  if (needle.length === 0 || haystack.length < needle.length) return false
  for (let offset = 0; offset <= haystack.length - needle.length; offset += 1) {
    let match = true
    for (let index = 0; index < needle.length; index += 1) {
      const actual = caseInsensitive
        ? asciiLower(haystack[offset + index])
        : haystack[offset + index]
      const expected = caseInsensitive ? asciiLower(needle[index]) : needle[index]
      if (actual !== expected) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

function asciiLower(value: number) {
  return value >= 65 && value <= 90 ? value + 32 : value
}
