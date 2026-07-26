import { useAuthActions, useAuthToken } from "@convex-dev/auth/react"
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { setApiAuthToken } from "./api"

export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <main className="auth-page">
          <p>Securing your workspace…</p>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <ApiAuthBridge>
          <SignOut />
          {children}
        </ApiAuthBridge>
      </Authenticated>
    </>
  )
}

function ApiAuthBridge({ children }: { children: ReactNode }) {
  const token = useAuthToken()
  const [bridgedToken, setBridgedToken] = useState<string | null>(null)
  useEffect(() => {
    setApiAuthToken(token)
    setBridgedToken(token)
    return () => {
      setApiAuthToken(null)
    }
  }, [token])
  if (!token || bridgedToken !== token) {
    return (
      <main className="auth-page">
        <p>Securing your workspace…</p>
      </main>
    )
  }
  return children
}

function SignIn() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<"signIn" | "signUp" | "reset" | "resetVerification">("signIn")
  const [resetEmail, setResetEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const formData = new FormData(event.currentTarget)
      await signIn("password", formData)
      if (flow === "reset") {
        setResetEmail(String(formData.get("email") ?? ""))
        setFlow("resetVerification")
      }
    } catch {
      if (flow === "signIn") setError("Sign-in failed. Check your email and password.")
      if (flow === "signUp") {
        setError(
          "Account creation failed. Use an invited email and at least 12 characters with uppercase, lowercase, and a number."
        )
      }
      if (flow === "reset") setError("Could not send a reset code. Check the email address.")
      if (flow === "resetVerification") {
        setError("The reset code was invalid or expired. Request a new code and try again.")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">GREENLIT.AI</p>
        <h1>{authHeading(flow)}</h1>
        <p>Your filings and reports are visible only inside your authenticated workspace.</p>
        <form onSubmit={submit}>
          {flow === "resetVerification" ? (
            <>
              <input name="email" type="hidden" value={resetEmail} />
              <label>
                Reset code
                <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
              <input name="flow" type="hidden" value="reset-verification" />
            </>
          ) : (
            <>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              {flow !== "reset" ? (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                    minLength={flow === "signUp" ? 12 : undefined}
                    required
                  />
                </label>
              ) : null}
              <input name="flow" type="hidden" value={flow} />
            </>
          )}
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="primary-action" type="submit" disabled={pending}>
            {pending ? "Please wait…" : authSubmitLabel(flow)}
          </button>
        </form>
        <div className="auth-links">
          {flow === "signIn" ? (
            <>
              <button className="auth-switch" type="button" onClick={() => setFlow("signUp")}>
                Create an account
              </button>
              <button className="auth-switch" type="button" onClick={() => setFlow("reset")}>
                Forgot password?
              </button>
            </>
          ) : (
            <button className="auth-switch" type="button" onClick={() => setFlow("signIn")}>
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

function authHeading(flow: "signIn" | "signUp" | "reset" | "resetVerification") {
  if (flow === "signUp") return "Create your private workspace"
  if (flow === "reset") return "Reset your password"
  if (flow === "resetVerification") return "Enter your reset code"
  return "Sign in to your private workspace"
}

function authSubmitLabel(flow: "signIn" | "signUp" | "reset" | "resetVerification") {
  if (flow === "signUp") return "Create account"
  if (flow === "reset") return "Send reset code"
  if (flow === "resetVerification") return "Set new password"
  return "Sign in"
}

function SignOut() {
  const { signOut } = useAuthActions()
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setPending(true)
    try {
      await signOut()
    } finally {
      setPending(false)
    }
  }

  return (
    <button className="auth-sign-out" type="button" onClick={handleSignOut} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  )
}
