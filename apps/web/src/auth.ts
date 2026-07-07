export type AuthDriver = "clerk" | "local-session"

export function authDriver(): AuthDriver {
  const configured = import.meta.env.VITE_GREENLIT_AUTH_DRIVER

  if (configured === "clerk" || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
    return "clerk"
  }

  return "local-session"
}

export function isClerkAuthEnabled() {
  return authDriver() === "clerk"
}

export function requiredClerkConfig() {
  return {
    convexUrl: import.meta.env.VITE_CONVEX_URL,
    publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  }
}
