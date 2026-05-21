import { useLocation } from 'react-router-dom'

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
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        fontSize: '1.2rem',
        letterSpacing: '-0.03em',
        color: '#00ff88',
      }}>greenlit</span>
      <span style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 400,
        fontSize: '1.2rem',
        letterSpacing: '-0.02em',
        color: 'rgba(240,240,240,0.55)',
      }}>.ai</span>
    </div>
  )
}

export default function NavBar() {
  const { pathname } = useLocation()
  const active = stepIndex(pathname)

  return (
    <header className="sticky top-0 z-50 border-b" style={{ background: '#000000', borderColor: '#1a1a1a' }}>
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <GreenlitLogo />

        <nav className="hidden sm:flex items-center gap-1">
          {STEPS.map((step, i) => {
            const state = i < active ? 'done' : i === active ? 'active' : 'future'
            return (
              <div key={step.path} className="flex items-center gap-1">
                {i > 0 && (
                  <div className="w-8 h-px" style={{ background: i <= active ? '#00ff88' : '#222222' }} />
                )}
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={{
                    background: state === 'active' ? 'rgba(0,255,136,0.08)' : 'transparent',
                    color: state === 'active' ? '#00ff88' : state === 'done' ? '#aaaaaa' : '#777777',
                  }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border"
                    style={{
                      borderColor: state === 'active' ? '#00ff88' : state === 'done' ? '#555555' : '#3a3a3a',
                      color:       state === 'active' ? '#00ff88' : state === 'done' ? '#aaaaaa' : '#666666',
                      background:  'transparent',
                    }}
                  >
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span className="hidden md:inline">{step.label}</span>
                </div>
              </div>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
