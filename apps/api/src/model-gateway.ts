import { createHash, randomUUID } from "node:crypto"
import { assertExternalModelProcessingAllowed } from "./external-model-policy.js"

export type ModelProviderKind = "disabled" | "anthropic" | "customer_gateway"

export type ModelProcessingStatus = {
  enabled: boolean
  provider: ModelProviderKind
  boundary: "greenlit" | "provider_api" | "customer_cloud"
  externalProcessingApproved: boolean
  sanitization: "required"
  endpointHost?: string
}

type ProviderRequest = {
  model: string
  max_tokens: number
  system?: string
  messages: Array<{ role: string; content: string }>
  [key: string]: unknown
}

export type RedactionSummary = {
  credentials: number
  emails: number
  phoneNumbers: number
  governmentIdentifiers: number
}

const maxModelPayloadBytes = 2 * 1024 * 1024
const modelRequestTimeoutMs = 120_000

export function modelProcessingStatus(): ModelProcessingStatus {
  const provider = configuredProvider()
  const gatewayUrl = provider === "customer_gateway" ? configuredGatewayUrl() : null
  return {
    enabled: provider !== "disabled" && externalProcessingApproved(),
    provider,
    boundary:
      provider === "customer_gateway"
        ? "customer_cloud"
        : provider === "anthropic"
          ? "provider_api"
          : "greenlit",
    externalProcessingApproved: externalProcessingApproved(),
    sanitization: "required",
    endpointHost: gatewayUrl?.hostname,
  }
}

export async function requestExternalModel(operation: string, request: ProviderRequest) {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(operation)) {
    throw new Error("Model operation name is invalid.")
  }
  assertExternalModelProcessingAllowed()
  const provider = configuredProvider()
  if (provider === "disabled") throw new Error("External model processing is disabled.")
  const { sanitized, redactions } = sanitizeProviderRequest(request)
  const serialized = JSON.stringify(sanitized)
  if (Buffer.byteLength(serialized) > maxModelPayloadBytes) {
    throw new Error("Sanitized model request exceeds the 2 MB processing limit.")
  }

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for Anthropic processing.")
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: serialized,
      redirect: "error",
      signal: AbortSignal.timeout(modelRequestTimeoutMs),
    })
  }

  const endpoint = configuredGatewayUrl()
  if (!endpoint) throw new Error("GREENLIT_CUSTOMER_GATEWAY_URL is required.")
  const token = process.env.GREENLIT_CUSTOMER_GATEWAY_TOKEN
  if (!token || token.length < 24) {
    throw new Error("GREENLIT_CUSTOMER_GATEWAY_TOKEN must contain at least 24 characters.")
  }
  const requestId = randomUUID()
  const packet = {
    protocol: "greenlit-confidential-model/v1",
    requestId,
    operation,
    payload: sanitized,
    privacy: {
      sanitization: "greenlit-required-v1",
      redactions,
      transmittedSha256: sha256(serialized),
      retentionRequested: "none",
      createdAt: new Date().toISOString(),
    },
  }
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": requestId,
      "X-Greenlit-Protocol": "greenlit-confidential-model/v1",
    },
    body: JSON.stringify(packet),
    redirect: "error",
    signal: AbortSignal.timeout(modelRequestTimeoutMs),
  })
}

export function sanitizeModelText(value: string, summary: RedactionSummary) {
  return value
    .replace(
      /\b(?:sk|sk-ant|xox[baprs])[-_][A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      () => {
        summary.credentials += 1
        return "[REDACTED_CREDENTIAL]"
      }
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => {
      summary.emails += 1
      return "[REDACTED_EMAIL]"
    })
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, () => {
      summary.governmentIdentifiers += 1
      return "[REDACTED_IDENTIFIER]"
    })
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, () => {
      summary.phoneNumbers += 1
      return "[REDACTED_PHONE]"
    })
}

function sanitizeProviderRequest(request: ProviderRequest) {
  const redactions: RedactionSummary = {
    credentials: 0,
    emails: 0,
    phoneNumbers: 0,
    governmentIdentifiers: 0,
  }
  return {
    sanitized: {
      ...request,
      system: request.system ? sanitizeModelText(request.system, redactions) : undefined,
      messages: request.messages.map((message) => ({
        ...message,
        content: sanitizeModelText(message.content, redactions),
      })),
    },
    redactions,
  }
}

function configuredProvider(): ModelProviderKind {
  const configured = process.env.GREENLIT_MODEL_PROVIDER?.trim().toLowerCase()
  if (configured === "disabled" || configured === "anthropic" || configured === "customer_gateway")
    return configured
  if (configured) {
    throw new Error("GREENLIT_MODEL_PROVIDER must be disabled, anthropic, or customer_gateway.")
  }
  if (process.env.GREENLIT_CUSTOMER_GATEWAY_URL) return "customer_gateway"
  if (process.env.ANTHROPIC_API_KEY) return "anthropic"
  return "disabled"
}

function configuredGatewayUrl() {
  const value = process.env.GREENLIT_CUSTOMER_GATEWAY_URL?.trim()
  if (!value) return null
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (isPrivateNetworkLiteral(url.hostname) &&
      process.env.GREENLIT_ALLOW_PRIVATE_MODEL_GATEWAY !== "true")
  ) {
    throw new Error(
      "GREENLIT_CUSTOMER_GATEWAY_URL must be an HTTPS URL without credentials, query parameters, or fragments; private addresses require explicit approval."
    )
  }
  return url
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

function externalProcessingApproved() {
  const hosted = process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  return !hosted || process.env.GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING === "true"
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
