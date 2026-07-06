import { useEffect, useRef, useState } from "react"
import { X, Mail, Lock, Loader2 } from "lucide-react"
import { supabase } from "../lib/supabase"
import { useTheme } from "../context/ThemeContext"

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export default function AuthModal({ onClose, defaultTab = "signin" }) {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [tab, setTab] = useState(defaultTab)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const overlayRef = useRef(null)

  const panelBg = isDark ? "#0e0e0e" : "#ffffff"
  const panelBorder = isDark ? "rgba(255,255,255,0.1)" : "#dddddd"
  const textBase = isDark ? "#f0f0f0" : "#111111"
  const textMuted = isDark ? "#aaaaaa" : "#666666"
  const textDim = isDark ? "#666666" : "#aaaaaa"
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "#f5f5f5"
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "#dddddd"
  const inputBorderFocus = isDark ? "#00cc6a" : "#007a44"
  const googleBg = isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5"
  const googleBorder = isDark ? "rgba(255,255,255,0.15)" : "#dddddd"
  const googleText = isDark ? "#e0e0e0" : "#333333"
  const tabSwitcherBg = isDark ? "rgba(255,255,255,0.05)" : "#f0f0f0"
  const tabActiveBg = isDark ? "rgba(255,255,255,0.1)" : "#ffffff"
  const tabActiveText = isDark ? "#f0f0f0" : "#111111"
  const divider = isDark ? "rgba(255,255,255,0.08)" : "#eeeeee"

  const INPUT = {
    width: "100%",
    padding: "0.65rem 0.875rem",
    borderRadius: "0.625rem",
    border: `1px solid ${inputBorder}`,
    background: inputBg,
    color: textBase,
    fontSize: "0.875rem",
    outline: "none",
    boxSizing: "border-box",
  }

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function switchTab(t) { setTab(t); setError(""); setMessage("") }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setMessage("")
    if (tab === "signup" && password !== confirmPassword) { setError("Passwords do not match."); return }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    setLoading(true)
    try {
      if (tab === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) { setError("Invalid email or password."); return }
        onClose()
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) {
          setError(err.message.includes("already") ? "An account with this email already exists." : err.message)
          return
        }
        setMessage("Account created — you are now signed in.")
        setTimeout(onClose, 1200)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div style={{ width: "100%", maxWidth: "22rem", margin: "1rem", borderRadius: "1.25rem", border: `1px solid ${panelBorder}`, background: panelBg, padding: "2rem", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: textDim, padding: "0.25rem" }}>
          <X size={16} />
        </button>

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--color-accent)", marginBottom: "0.25rem" }}>greenlit.ai</div>
          <p style={{ fontSize: "0.8rem", color: textDim, margin: 0 }}>Save analyses and access your workspace.</p>
        </div>

        <div style={{ display: "flex", gap: "0", marginBottom: "1.5rem", background: tabSwitcherBg, borderRadius: "0.625rem", padding: "3px" }}>
          {[["signin", "Sign in"], ["signup", "Create account"]].map(([t, label]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{ flex: 1, padding: "0.45rem", borderRadius: "0.5rem", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, transition: "all 0.15s", background: tab === t ? tabActiveBg : "transparent", color: tab === t ? tabActiveText : textDim }}
            >{label}</button>
          ))}
        </div>

        <button onClick={handleGoogle} style={{ width: "100%", padding: "0.7rem", borderRadius: "0.625rem", border: `1px solid ${googleBorder}`, background: googleBg, color: googleText, fontWeight: 600, fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.625rem" }}>
          <GoogleIcon /> Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
          <div style={{ flex: 1, height: "1px", background: divider }} />
          <span style={{ fontSize: "0.7rem", color: textDim }}>or</span>
          <div style={{ flex: 1, height: "1px", background: divider }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ position: "relative" }}>
            <Mail size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: textDim }} />
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" style={{ ...INPUT, paddingLeft: "2.25rem" }}
              onFocus={e => e.target.style.borderColor = inputBorderFocus}
              onBlur={e => e.target.style.borderColor = inputBorder}
            />
          </div>
          <div style={{ position: "relative" }}>
            <Lock size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: textDim }} />
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" style={{ ...INPUT, paddingLeft: "2.25rem" }}
              onFocus={e => e.target.style.borderColor = inputBorderFocus}
              onBlur={e => e.target.style.borderColor = inputBorder}
            />
          </div>
          {tab === "signup" && (
            <div style={{ position: "relative" }}>
              <Lock size={14} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: textDim }} />
              <input
                type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password" style={{ ...INPUT, paddingLeft: "2.25rem" }}
                onFocus={e => e.target.style.borderColor = inputBorderFocus}
                onBlur={e => e.target.style.borderColor = inputBorder}
              />
            </div>
          )}

          {error && <p style={{ margin: 0, fontSize: "0.78rem", color: "#ff4040" }}>{error}</p>}
          {message && <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--color-accent)" }}>{message}</p>}

          <button type="submit" disabled={loading} style={{ width: "100%", padding: "0.7rem", borderRadius: "0.625rem", border: "none", background: "var(--color-accent-dark)", color: "#000", fontWeight: 700, fontSize: "0.875rem", cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", opacity: loading ? 0.7 : 1 }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  )
}
