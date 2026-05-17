import { useLocation } from 'react-router-dom'
import { Dna } from 'lucide-react'

const STEPS = [
  { label: 'Submit Filing', path: '/' },
  { label: 'Attributes & Comps', path: '/attributes' },
  { label: 'Evaluation', path: '/evaluation' },
]

function stepIndex(pathname) {
  if (pathname.includes('evaluation')) return 2
  if (pathname.includes('attributes')) return 1
  return 0
}

export default function NavBar() {
  const { pathname } = useLocation()
  const active = stepIndex(pathname)

  return (
    <header className="sticky top-0 z-50 border-b border-forest-500 bg-forest-900/90 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sprout-600 flex items-center justify-center">
            <Dna className="w-5 h-5 text-forest-900" />
          </div>
          <span className="text-text-base font-semibold text-lg tracking-tight">GRAS-sy</span>
        </div>

        {/* Step indicator */}
        <nav className="hidden sm:flex items-center gap-1">
          {STEPS.map((step, i) => {
            const state = i < active ? 'done' : i === active ? 'active' : 'future'
            return (
              <div key={step.path} className="flex items-center gap-1">
                {i > 0 && (
                  <div className={`w-8 h-px ${i <= active ? 'bg-sprout-600' : 'bg-forest-400'}`} />
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={{
                    background: state === 'active' ? 'rgba(34,197,94,0.12)' : 'transparent',
                    color: state === 'active' ? '#22c55e' : state === 'done' ? '#7fa884' : '#3d5e42',
                  }}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border
                    ${state === 'active' ? 'border-sprout-500 text-sprout-500 bg-transparent' :
                      state === 'done' ? 'border-text-muted bg-forest-400 text-text-base' :
                      'border-forest-400 text-text-dim'}`}
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
