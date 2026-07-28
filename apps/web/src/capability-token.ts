export type CapabilityKind = "respond" | "review"

const tokenPattern = /^[a-f0-9]{64}$/i

export function isPublicCapabilityRoute(location: Pick<Location, "pathname" | "hash">) {
  const match = location.pathname.match(/^\/(respond|review)(?:\/[^/]+)?\/?$/)
  if (!match) return false
  const kind = match[1] as CapabilityKind
  return Boolean(
    validCapabilityToken(location.pathname.split("/")[2] ?? null) ??
      validCapabilityToken(capabilityTokenFromHash(location.hash)) ??
      validCapabilityToken(window.sessionStorage.getItem(capabilityStorageKey(kind)))
  )
}

export function consumeCapabilityToken(kind: CapabilityKind) {
  const storageKey = capabilityStorageKey(kind)
  const legacyPathToken = window.location.pathname.startsWith(`/${kind}/`)
    ? window.location.pathname.split("/")[2]
    : null
  const candidate =
    validCapabilityToken(legacyPathToken) ??
    validCapabilityToken(capabilityTokenFromHash(window.location.hash)) ??
    validCapabilityToken(window.sessionStorage.getItem(storageKey))

  if (!candidate) return ""
  window.sessionStorage.setItem(storageKey, candidate)
  if (window.location.pathname !== `/${kind}` || window.location.hash) {
    window.history.replaceState({}, "", `/${kind}`)
  }
  return candidate
}

export function clearCapabilityToken(kind: CapabilityKind) {
  window.sessionStorage.removeItem(capabilityStorageKey(kind))
}

function capabilityTokenFromHash(hash: string) {
  if (!hash.startsWith("#")) return null
  return new URLSearchParams(hash.slice(1)).get("token")
}

function validCapabilityToken(value: string | null) {
  return value && tokenPattern.test(value) ? value : null
}

function capabilityStorageKey(kind: CapabilityKind) {
  return `greenlit:${kind}-capability`
}
