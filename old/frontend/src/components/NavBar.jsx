import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { LogOut, ChevronDown, Clock, Sun, Moon, HelpCircle, Bug, X, ChevronRight } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"
import { supabaseEnabled } from "../lib/supabase"
import AuthModal from "./AuthModal"

const STEPS = [
  { label: "Submit Filing", path: "/" },
  { label: "Evaluation",    path: "/evaluation" },
  { label: "Workbook",      path: "/workbook" },
]

function stepIndex(pathname) {
  if (pathname.includes("workbook")) return 2
  if (pathname.includes("evaluation")) return 1
  return 0
}

function GreenlitLogo() {
  return (
    <div className="flex items-center">
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1.2rem", letterSpacing: "-0.03em", color: "var(--color-accent)" }}>greenlit</span>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, fontSize: "1.2rem", letterSpacing: "-0.02em", color: "var(--color-text-dim)" }}>.ai</span>
    </div>
  )
}

function ModalOverlay({ onClose, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  )
}

function HelpModal({ onClose, isDark }) {
  const bg = isDark ? "#111111" : "#ffffff"
  const border = isDark ? "rgba(255,255,255,0.1)" : "#dddddd"
  const textBase = isDark ? "#f4f4f4" : "#111111"
  const textSub = isDark ? "#cccccc" : "#444444"
  const textDim = isDark ? "#888888" : "#777777"
  const dividerC = isDark ? "rgba(255,255,255,0.07)" : "#eeeeee"
  const chipBg = isDark ? "rgba(255,255,255,0.06)" : "#f0f0f0"
  const chipBorder = isDark ? "rgba(255,255,255,0.1)" : "#dddddd"

  const evalSections = [
    ["Identified Gaps", "Critical, moderate, and minor issues with FDA rationale and remediation guidance."],
    ["Safety Signals", "Red flags from comparable historical notices."],
    ["Comparable Filings", "Most similar approved/withdrawn notices from the FDA database."],
    ["Documentation Fields", "Field-by-field benchmark vs. historical norms."],
    ["Recommended Next Steps", "Prioritized action items to close your highest-severity gaps."],
    ["Relevant Research", "Supporting PubMed literature for the substance and safety questions raised."],
    ["Amendment Outline", "Structured draft outline for addressing gaps in a future amendment."],
  ]

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: "100%", maxWidth: "36rem", maxHeight: "88vh", overflowY: "auto", borderRadius: "1rem", border: `1px solid ${border}`, background: bg, boxShadow: "0 16px 64px rgba(0,0,0,0.5)", padding: "1.75rem 2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.05rem", fontWeight: 700, color: textBase }}>
            <HelpCircle size={17} style={{ color: "var(--color-accent)" }} />
            How to use greenlit.ai
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textDim, padding: "0.15rem", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: "0.84rem", color: textSub, lineHeight: 1.6, marginBottom: "1.25rem" }}>
          greenlit.ai analyzes your draft FDA GRAS notice PDF against 872 historical submissions, scores gaps by severity, and gives you a concrete action plan before you file.
        </p>

        <div style={{ borderTop: `1px solid ${dividerC}`, paddingTop: "1rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-accent)", marginBottom: "0.75rem" }}>Workflow</div>
          {[
            ["Submit Filing", "Upload your draft GRAS notice as a PDF. The AI extracts the text and runs a deep analysis."],
            ["Evaluation", "Review your gap analysis report. Click any section card to drill into the details."],
            ["Workbook", "Track filing status, add notes per section, and keep annotations organized across sessions."],
          ].map(([name, desc], i) => (
            <div key={name} style={{ display: "flex", alignItems: "flex-start", gap: "0.7rem", marginBottom: "0.65rem" }}>
              <div style={{ flexShrink: 0, width: "1.35rem", height: "1.35rem", borderRadius: "50%", background: isDark ? "rgba(0,255,136,0.1)" : "rgba(0,153,85,0.1)", border: "1px solid var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, color: "var(--color-accent)", marginTop: "0.08rem" }}>{i + 1}</div>
              <div style={{ fontSize: "0.83rem", color: textSub, lineHeight: 1.55 }}>
                <span style={{ fontWeight: 600, color: textBase }}>{name}</span> {`—`} {desc}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${dividerC}`, paddingTop: "1rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-accent)", marginBottom: "0.75rem" }}>Evaluation sections</div>
          {evalSections.map(([name, desc]) => (
            <div key={name} style={{ display: "flex", gap: "0.45rem", marginBottom: "0.45rem", alignItems: "flex-start" }}>
              <ChevronRight size={11} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "0.25rem" }} />
              <div style={{ fontSize: "0.82rem", color: textSub, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: textBase }}>{name}</span> {`—`} {desc}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${dividerC}`, paddingTop: "1rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-accent)", marginBottom: "0.55rem" }}>Gap severity</div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            {[
              ["Critical", "rgba(255,64,64,0.12)", isDark ? "#ff6060" : "#cc2020", "rgba(255,64,64,0.3)"],
              ["Moderate", "rgba(255,149,0,0.12)", isDark ? "#ffaa33" : "#cc7700", "rgba(255,149,0,0.3)"],
              ["Minor", chipBg, textDim, chipBorder],
            ].map(([label, cbg, color, cborder]) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "center", padding: "0.15rem 0.5rem", borderRadius: "2rem", fontSize: "0.74rem", fontWeight: 600, background: cbg, color, border: `1px solid ${cborder}` }}>{label}</span>
            ))}
          </div>
          <p style={{ fontSize: "0.81rem", color: textDim, lineHeight: 1.5, margin: 0 }}>
            Critical gaps are most likely to trigger FDA pushback or withdrawal {`—`} address these first.
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${dividerC}`, paddingTop: "1rem" }}>
          <p style={{ fontSize: "0.82rem", color: textSub, lineHeight: 1.6, margin: 0 }}>
            <span style={{ fontWeight: 600, color: textBase }}>Saving analyses:</span> Sign in and click <span style={{ fontWeight: 600 }}>Save analysis</span> on the Evaluation page. Access saved analyses from the History icon in the top-right corner.
          </p>
        </div>
      </div>
    </ModalOverlay>
  )
}

function BugModal({ onClose, isDark }) {
  const [text, setText] = useState('')
  const bg = isDark ? "#111111" : "#ffffff"
  const border = isDark ? "rgba(255,255,255,0.1)" : "#dddddd"
  const textBase = isDark ? "#f4f4f4" : "#111111"
  const textSub = isDark ? "#aaaaaa" : "#666666"
  const textDim = isDark ? "#555555" : "#aaaaaa"
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "#f5f5f5"
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "#dddddd"
  const btnBg = isDark ? "rgba(255,255,255,0.07)" : "#f0f0f0"
  const btnBgHover = isDark ? "rgba(255,255,255,0.13)" : "#e5e5e5"
  const btnBorder = isDark ? "rgba(255,255,255,0.15)" : "#cccccc"
  const btnColor = isDark ? "#dddddd" : "#333333"

  function handleSend() {
    const subject = encodeURIComponent('Bug Report: greenlit.ai')
    const body = encodeURIComponent(text || '(no description provided)')
    window.open(`mailto:?subject=${subject}&body=${body}`)
    onClose()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: "100%", maxWidth: "26rem", borderRadius: "1rem", border: `1px solid ${border}`, background: bg, boxShadow: "0 16px 64px rgba(0,0,0,0.5)", padding: "1.75rem 2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1rem", fontWeight: 700, color: textBase }}>
            <Bug size={16} style={{ color: isDark ? "#ff6060" : "#cc2020" }} />
            Report a Bug
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textDim, padding: "0.15rem", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: "0.84rem", color: textSub, lineHeight: 1.6, marginBottom: "1rem" }}>
          Describe what happened and what you expected. This will open your email client with the details pre-filled.
        </p>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What went wrong? What were you doing when it happened?"
          rows={4}
          style={{ width: "100%", background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: "0.6rem", color: textBase, fontSize: "0.84rem", padding: "0.65rem 0.875rem", resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6, marginBottom: "0.875rem" }}
          onFocus={e => e.target.style.borderColor = isDark ? "rgba(255,255,255,0.25)" : "#aaaaaa"}
          onBlur={e => e.target.style.borderColor = inputBorder}
        />

        <button
          onClick={handleSend}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", padding: "0.65rem 1rem", borderRadius: "0.6rem", border: `1px solid ${btnBorder}`, background: btnBg, color: btnColor, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = btnBgHover }}
          onMouseLeave={e => { e.currentTarget.style.background = btnBg }}
        >
          Send via email
        </button>
      </div>
    </ModalOverlay>
  )
}

function UserMenu({ user, signOut, isDark }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const initials = (user.email || "?")[0].toUpperCase()

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.6rem", borderRadius: "2rem", border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", cursor: "pointer", color: isDark ? "#ccc" : "#555" }}
      >
        <span style={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%", background: "var(--color-accent-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#000" }}>{initials}</span>
        <span style={{ fontSize: "0.78rem", maxWidth: "10rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
        <ChevronDown size={12} style={{ color: isDark ? "#666" : "#aaa" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 0.5rem)", minWidth: "11rem", borderRadius: "0.75rem", border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "#e0e0e0"}`, background: isDark ? "#111" : "#fff", padding: "0.4rem", zIndex: 60, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          <button
            onClick={() => { signOut(); setOpen(false) }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.75rem", borderRadius: "0.5rem", border: "none", background: "none", cursor: "pointer", color: isDark ? "#aaa" : "#555", fontSize: "0.82rem", textAlign: "left" }}
            onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.07)" : "#f0f0f0" }}
            onMouseLeave={e => { e.currentTarget.style.background = "none" }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function IconBtn({ onClick, title, color, hoverColor, children }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      style={{ display: "flex", alignItems: "center", padding: "0.35rem", borderRadius: "0.5rem", border: "none", background: "none", cursor: "pointer", color: hovered ? hoverColor : color, transition: "color 0.15s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  )
}

export default function NavBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = stepIndex(pathname)
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const isDark = theme === "dark"
  const [showAuth, setShowAuth] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showBug, setShowBug] = useState(false)

  const headerBg = isDark ? "#000000" : "#ffffff"
  const headerBorder = isDark ? "#1a1a1a" : "#e8e8e8"
  const iconColor = isDark ? "#888" : "#666"
  const iconHover = isDark ? "#ccc" : "#222"
  const accentColor = isDark ? "#00ff88" : "#009955"

  return (
    <>
      <header className="sticky top-0 z-50 border-b" style={{ background: headerBg, borderColor: headerBorder }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <GreenlitLogo />

          <nav className="hidden sm:flex items-center gap-1">
            {STEPS.map((step, i) => {
              const state = i < active ? "done" : i === active ? "active" : "future"
              const doneColor = isDark ? "#cccccc" : "#444444"
              const futureColor = isDark ? "#888888" : "#aaaaaa"
              const connectorActive = accentColor
              const connectorInactive = isDark ? "#222222" : "#e0e0e0"
              return (
                <div key={step.path} className="flex items-center gap-1">
                  {i > 0 && <div className="w-8 h-px" style={{ background: i <= active ? connectorActive : connectorInactive }} />}
                  <button
                    onClick={() => navigate(step.path)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: state === "active" ? (isDark ? "rgba(0,255,136,0.08)" : "rgba(0,153,85,0.07)") : "transparent", color: state === "active" ? accentColor : state === "done" ? doneColor : futureColor, border: "none", cursor: "pointer" }}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border"
                      style={{ borderColor: state === "active" ? accentColor : state === "done" ? (isDark ? "#aaaaaa" : "#bbbbbb") : (isDark ? "#2a2a2a" : "#e0e0e0"), color: state === "active" ? accentColor : state === "done" ? doneColor : futureColor, background: "transparent" }}
                    >
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    <span className="hidden md:inline">{step.label}</span>
                  </button>
                </div>
              )
            })}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "0.1rem" }}>
            <IconBtn onClick={() => setShowHelp(true)} title="Help and guide" color={iconColor} hoverColor={iconHover}>
              <HelpCircle size={15} />
            </IconBtn>
            <IconBtn onClick={() => setShowBug(true)} title="Report a bug" color={iconColor} hoverColor={iconHover}>
              <Bug size={15} />
            </IconBtn>
            <IconBtn onClick={toggle} title={isDark ? "Switch to light mode" : "Switch to dark mode"} color={iconColor} hoverColor={iconHover}>
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </IconBtn>

            {supabaseEnabled && (
              user
                ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.1rem", marginLeft: "0.15rem" }}>
                    <IconBtn onClick={() => navigate("/history")} title="Your analyses" color={iconColor} hoverColor={iconHover}>
                      <Clock size={15} />
                    </IconBtn>
                    <UserMenu user={user} signOut={signOut} isDark={isDark} />
                  </div>
                )
                : (
                  <button
                    onClick={() => setShowAuth(true)}
                    style={{ marginLeft: "0.35rem", padding: "0.4rem 0.875rem", borderRadius: "2rem", border: `1px solid ${isDark ? "rgba(0,204,106,0.4)" : "rgba(0,122,68,0.35)"}`, background: isDark ? "rgba(0,204,106,0.07)" : "rgba(0,122,68,0.06)", color: isDark ? "#00cc6a" : "#007a44", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                  >
                    Sign in
                  </button>
                )
            )}
          </div>
        </div>
      </header>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} isDark={isDark} />}
      {showBug && <BugModal onClose={() => setShowBug(false)} isDark={isDark} />}
    </>
  )
}
