import { ClerkProvider, useAuth } from "@clerk/react"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { isClerkAuthEnabled, requiredClerkConfig } from "./auth"
import "./styles.css"

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Missing root element")
}

function Root() {
  if (!isClerkAuthEnabled()) {
    return <App />
  }

  const { publishableKey, convexUrl } = requiredClerkConfig()

  if (!publishableKey || !convexUrl) {
    return (
      <main className="app-shell">
        <section className="summary-panel" aria-label="Configuration error">
          <p className="eyebrow">Configuration required</p>
          <h1>Authentication is not configured</h1>
          <p>Set VITE_CLERK_PUBLISHABLE_KEY and VITE_CONVEX_URL before enabling Clerk auth.</p>
        </section>
      </main>
    )
  }

  const convex = new ConvexReactClient(convexUrl)

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
