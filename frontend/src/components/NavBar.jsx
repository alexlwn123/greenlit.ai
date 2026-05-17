import { useLocation } from 'react-router-dom'

const STEPS = [
  { label: 'Submit Filing',       path: '/' },
  { label: 'Attributes & Comps',  path: '/attributes' },
  { label: 'Evaluation',          path: '/evaluation' },
]

function stepIndex(pathname) {
  if (pathname.includes('evaluation')) return 2
  if (pathname.includes('attributes')) return 1
  return 0
}

function GrassyLogo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Icon mark */}
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="9" fill="#16a34a"/>
        {/* Three grass blades */}
        <path d="M13 28 C13 28 10 20 12 11 C13.5 13 13.5 21 13.5 28Z" fill="white" fillOpacity="0.65"/>
        <path d="M18 28 C18 28 18 15 18 7 C19.5 10 19.5 19 18.5 28Z" fill="white"/>
        <path d="M23 28 C23 28 26 18 24 11 C22.5 13 22.5 21 22.5 28Z" fill="white" fillOpacity="0.65"/>
        {/* Ground line */}
        <line x1="8" y1="29" x2="28" y2="29" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round"/>
      </svg>

      {/* Wordmark */}
      <div className="flex items-baseline gap-0.5">
        <span className="text-xl font-bold text-text-base tracking-tight">GRAS</span>
        <span className="text-xl font-light text-accent tracking-tight">-sy</span>
        {/* Small superscript note */}
        <sup className="text-[9px] font-medium text-text-dim ml-0.5 -top-2 relative leading-none">
          gap analysis
        </sup>
      </div>
    </div>
  )
}

export default function NavBar() {
  const { pathname } = useLocation()
  const active = stepIndex(pathname)

  return (
    <header className="sticky top-0 z-50 bg-surface border-b border-border shadow-sm">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <GrassyLogo />

        {/* Step indicator */}
        <nav className="hidden sm:flex items-center gap-1">
          {STEPS.map((step, i) => {
            const state = i < active ? 'done' : i === active ? 'active' : 'future'
            return (
              <div key={step.path} className="flex items-center gap-1">
                {i > 0 && (
                  <div className={`w-8 h-px ${i <= active ? 'bg-accent' : 'bg-border'}`} />
                )}
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={{
                    background: state === 'active' ? '#dcfce7' : 'transparent',
                    color: state === 'active' ? '#15803d' : state === 'done' ? '#7a9e85' : '#ccddd3',
                  }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border"
                    style={{
                      borderColor: state === 'active' ? '#16a34a' : state === 'done' ? '#9cbfab' : '#ccddd3',
                      color:       state === 'active' ? '#16a34a' : state === 'done' ? '#456050' : '#ccddd3',
                      background:  state === 'done'   ? '#dcfce7' : 'transparent',
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
