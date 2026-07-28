import { createHash } from "node:crypto"
import type { ArtifactReference } from "../../../packages/core/src/index.js"

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

export type UploadSecurityAssessment =
  | { accepted: true; security: NonNullable<ArtifactReference["security"]> }
  | {
      accepted: false
      reason:
        | Extract<PdfInspection, { accepted: false }>["reason"]
        | "malicious"
        | "scanner_unavailable"
    }

export function uploadSecurityStatus() {
  let endpoint: URL | null = null
  let configurationValid = true
  try {
    endpoint = configuredScannerUrl()
  } catch {
    configurationValid = false
  }
  return {
    localInspection: "required" as const,
    malwareScannerConfigured: Boolean(endpoint),
    configurationValid,
    malwareScanningRequired: process.env.GREENLIT_REQUIRE_UPLOAD_MALWARE_SCAN === "true",
    hostedExternalScanningApproved:
      !isHosted() || process.env.GREENLIT_ALLOW_EXTERNAL_UPLOAD_SCANNING === "true",
    endpointHost: endpoint?.hostname,
    sendsFilename: false as const,
    digestBinding: "sha256" as const,
  }
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
const scannerTimeoutMs = 60_000
const maxScannerResponseBytes = 16 * 1024

export async function assessPdfUpload(
  bytes: Uint8Array,
  fetchImplementation: typeof fetch = fetch
): Promise<UploadSecurityAssessment> {
  const inspection = inspectPdfUpload(bytes)
  if (!inspection.accepted) return inspection
  const inspectedAt = new Date().toISOString()
  const endpoint = configuredScannerUrl()
  if (!endpoint) {
    if (process.env.GREENLIT_REQUIRE_UPLOAD_MALWARE_SCAN === "true") {
      return { accepted: false, reason: "scanner_unavailable" }
    }
    return {
      accepted: true,
      security: {
        policyVersion: inspection.policyVersion,
        sha256: inspection.sha256,
        inspectedAt,
        malwareScan: { status: "not_configured" },
      },
    }
  }
  if (isHosted() && process.env.GREENLIT_ALLOW_EXTERNAL_UPLOAD_SCANNING !== "true") {
    return { accepted: false, reason: "scanner_unavailable" }
  }
  const token = process.env.GREENLIT_UPLOAD_SCANNER_TOKEN
  if (!token || token.length < 24) return { accepted: false, reason: "scanner_unavailable" }

  try {
    const response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/pdf",
        "X-Content-SHA256": inspection.sha256,
        "X-Greenlit-Protocol": "greenlit-upload-scan/v1",
      },
      body: Buffer.from(bytes),
      redirect: "error",
      signal: AbortSignal.timeout(scannerTimeoutMs),
    })
    if (!response.ok) return { accepted: false, reason: "scanner_unavailable" }
    const serialized = await response.text()
    if (Buffer.byteLength(serialized) > maxScannerResponseBytes) {
      return { accepted: false, reason: "scanner_unavailable" }
    }
    const result = JSON.parse(serialized) as Record<string, unknown>
    if (result.verdict === "malicious") return { accepted: false, reason: "malicious" }
    if (
      result.verdict !== "clean" ||
      result.sha256 !== inspection.sha256 ||
      !validMetadata(result.engine) ||
      !validMetadata(result.engineVersion) ||
      !validMetadata(result.signatureVersion)
    ) {
      return { accepted: false, reason: "scanner_unavailable" }
    }
    return {
      accepted: true,
      security: {
        policyVersion: inspection.policyVersion,
        sha256: inspection.sha256,
        inspectedAt,
        malwareScan: {
          status: "clean",
          engine: result.engine,
          engineVersion: result.engineVersion,
          signatureVersion: result.signatureVersion,
          scannedAt: new Date().toISOString(),
        },
      },
    }
  } catch {
    return { accepted: false, reason: "scanner_unavailable" }
  }
}

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

function configuredScannerUrl() {
  const value = process.env.GREENLIT_UPLOAD_SCANNER_URL?.trim()
  if (!value) return null
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (isPrivateNetworkLiteral(url.hostname) &&
      process.env.GREENLIT_ALLOW_PRIVATE_UPLOAD_SCANNER !== "true")
  ) {
    throw new Error(
      "GREENLIT_UPLOAD_SCANNER_URL must be an HTTPS URL without credentials, query parameters, or fragments; private addresses require explicit approval."
    )
  }
  return url
}

function validMetadata(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100
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
