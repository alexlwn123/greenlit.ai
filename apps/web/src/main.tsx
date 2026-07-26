import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { AuthGate } from "./AuthGate"
import "./styles.css"

const rootElement = document.getElementById("root")
const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!rootElement) {
  throw new Error("Missing root element")
}

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL")
}

const convex = new ConvexReactClient(convexUrl)

createRoot(rootElement).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <AuthGate>
        <App />
      </AuthGate>
    </ConvexAuthProvider>
  </StrictMode>
)

import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { ConvexReactClient } from "convex/react"
