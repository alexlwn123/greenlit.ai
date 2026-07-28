export function assertExternalModelProcessingAllowed() {
  if (!externalModelProcessingAllowed()) {
    throw new Error(
      "External model processing is disabled. Set GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING=true only after approving the provider data-processing terms."
    )
  }
}

export function externalModelProcessingAllowed() {
  const hosted = process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
  return !hosted || process.env.GREENLIT_ALLOW_EXTERNAL_MODEL_PROCESSING === "true"
}

export function externalModelRequestError(operation: string, status: number) {
  return new Error(`${operation} failed with external provider status ${status}.`)
}
