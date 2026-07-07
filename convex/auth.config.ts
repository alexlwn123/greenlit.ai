import type { AuthConfig } from "convex/server"

const clerkDomain = process.env.CLERK_FRONTEND_API_URL ?? process.env.CLERK_JWT_ISSUER_DOMAIN

if (!clerkDomain) {
  throw new Error("Set CLERK_FRONTEND_API_URL or CLERK_JWT_ISSUER_DOMAIN in Convex.")
}

export default {
  providers: [
    {
      domain: clerkDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
