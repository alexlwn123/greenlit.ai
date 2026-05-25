import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabaseEnabled } from '../lib/supabase'
import AuthModal from './AuthModal'

const STEPS = [
  { label: 'Submit Filing', path: '/' },
  { label: 'Evaluation',    path: '/evaluation' },
]

function stepIndex(pathname) {
  if (pathname.includes('evaluation')) return 1
  return 0
}

function GreenlitLogo() {
  return (
    <div className="flex items-center">
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.03em', color: '#00ff88' }}>greenlit</span>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, fontSize: '1.2rem', letterSpacing: '-0.02em', color: 'rgba(240,240,240,0.55)' }}>.ai</span>
    </div>
  )
}

function UserMenu({ user, signOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const initials = (user.email || '?')[0].toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.6rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#ccc' }}
      >
        <span style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: '#00cc6a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#000' }}>{initials}</span>
        <span style={{ fontSize: '0.78rem', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
        <ChevronDown size={12} style={{ color: '#666' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 0.5rem)', minWidth: '11rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', background: '#111', padding: '0.4rem', zIndex: 60, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <button
            onClick={() => { signOut(); setOpen(false) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: '0.5rem', border: 'none', background: 'none', cursor: 'pointer', color: '#aaa', fontSize: '0.82rem', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function NavBar() {
  const { pathname } = useLocation()
  const active = stepIndex(pathname)
  const { user, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-50 border-b" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <GreenlitLogo />

          <nav className="hidden sm:flex items-center gap-1">
            {STEPS.map((step, i) => {
              const state = i < active ? 'done' : i === active ? 'active' : 'future'
              return (
                <div key={step.path} className="flex items-center gap-1">
                  {i > 0 && <div className="w-8 h-px" style={{ background: i <= active ? '#00ff88' : '#222222' }} />}
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: state === 'active' ? 'rgba(0,255,136,0.08)' : 'transparent', color: state === 'active' ? '#00ff88' : state === 'done' ? '#aaaaaa' : '#777777' }}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border"
                      style={{ borderColor: state === 'active' ? '#00ff88' : state === 'done' ? '#555555' : '#3a3a3a', color: state === 'active' ? '#00ff88' : state === 'done' ? '#aaaaaa' : '#666666', background: 'transparent' }}
                    >
                      {state === 'done' ? '✓' : i + 1}
                    </span>
                    <span className="hidden md:inline">{step.label}</span>
                  </div>
                </div>
              )
            })}
          </nav>

          <div>
            {supabaseEnabled && (
              user
                ? <UserMenu user={user} signOut={signOut} />
                : <button onClick={() => setShowAuth(true)} style={{ padding: '0.4rem 0.875rem', borderRadius: '2rem', border: '1px solid rgba(0,204,106,0.4)', background: 'rgba(0,204,106,0.07)', color: '#00cc6a', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Sign in</button>
            )}
          </div>
        </div>
      </header>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
