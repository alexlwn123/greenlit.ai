export type AuthDriver = "clerk" | "local-session"

export function authDriver(): AuthDriver {
  const configured =
    import.meta.env.VITE_GREENLIT_AUTH_DRIVER ?? import.meta.env.GREENLIT_AUTH_DRIVER

  if (configured === "clerk" || clerkPublishableKey()) {
    return "clerk"
  }

  return "local-session"
}

export function isClerkAuthEnabled() {
  return authDriver() === "clerk"
}

export function requiredClerkConfig() {
  return {
    convexUrl: import.meta.env.VITE_CONVEX_URL ?? import.meta.env.CONVEX_URL,
    publishableKey: clerkPublishableKey(),
  }
}

function clerkPublishableKey() {
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? import.meta.env.CLERK_PUBLISHABLE_KEY
}
