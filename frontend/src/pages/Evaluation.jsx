import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RotateCcw, AlertOctagon, AlertTriangle, Minus,
  ShieldAlert, ChevronDown, ChevronUp, CheckCircle2, Microscope,
  ArrowUpRight, BookOpen, ListChecks
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'

const SEVERITY_CONFIG = {
  foundational: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', Icon: AlertOctagon },
  material:     { label: 'Moderate', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', Icon: AlertTriangle },
  documentation_issue: { label: 'Minor', color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', Icon: Minus },
}

function scoreColor(score) {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

function ScoreRing({ score }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = scoreColor(score)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#152e18" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-4xl font-bold" style={{ color }}>{score}</span>
        <span className="text-text-muted text-sm block -mt-1">/100</span>
      </div>
    </div>
  )
}

function SeverityBadge({ priority }) {
  const cfg = SEVERITY_CONFIG[priority] || SEVERITY_CONFIG.documentation_issue
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
    >
      <cfg.Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function GapCard({ gap, compGap }) {
  const cfg = SEVERITY_CONFIG[gap.priority] || SEVERITY_CONFIG.documentation_issue

  return (
    <div
      className="rounded-xl border p-5 bg-forest-800"
      style={{ borderColor: cfg.border, borderLeftWidth: '3px', borderLeftColor: cfg.color }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h4 className="text-text-base font-medium text-sm leading-snug">{gap.title}</h4>
        <SeverityBadge priority={gap.priority} />
      </div>
      <p className="text-text-muted text-sm leading-relaxed mb-3">{gap.observation}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-dim">
        <span className="bg-forest-600 px-2 py-0.5 rounded capitalize">
          {gap.domain?.replace(/_/g, ' ')}
        </span>
        {gap.section_reference && (
          <span className="font-mono">{gap.section_reference}</span>
        )}
      </div>

      {compGap && (
        <div className="mt-4 pt-4 border-t border-forest-500 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {compGap.approved_reference && (
            <div className="rounded-lg bg-forest-700 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3 h-3 text-sprout-500" />
                <span className="text-xs text-sprout-500 font-medium">Approved example</span>
              </div>
              <p className="text-xs text-text-muted font-mono leading-snug">{compGap.approved_reference.substance_name}</p>
              <p className="text-xs text-text-dim mt-0.5">GRN-{compGap.approved_reference.grn_number} · {compGap.approved_reference.section_label}</p>
            </div>
          )}
          {compGap.withdrawn_reference && (
            <div className="rounded-lg bg-forest-700 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3 h-3 text-moderate" />
                <span className="text-xs text-moderate font-medium">Cautionary example</span>
              </div>
              <p className="text-xs text-text-muted font-mono leading-snug">{compGap.withdrawn_reference.substance_name}</p>
              <p className="text-xs text-text-dim mt-0.5">GRN-{compGap.withdrawn_reference.grn_number}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SignalCard({ signal }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-forest-500 bg-forest-800 overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-forest-700 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-moderate mt-0.5 shrink-0" />
          <p className="text-text-base text-sm font-medium leading-snug">{signal.signal}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-text-dim shrink-0 mt-0.5" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-forest-500">
          <p className="text-text-muted text-sm leading-relaxed mt-3 mb-3">{signal.evidence}</p>
          {signal.section_reference && (
            <p className="text-xs text-text-dim font-mono mb-3">{signal.section_reference}</p>
          )}
          {signal.recommended_action && (
            <div className="rounded-lg bg-forest-700 p-3">
              <p className="text-xs text-sprout-400 font-medium mb-1">Recommended action</p>
              <p className="text-xs text-text-muted leading-relaxed">{signal.recommended_action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PRIORITY_ORDER = { foundational: 0, material: 1, documentation_issue: 2 }

export default function Evaluation() {
  const navigate = useNavigate()
  const { result, reset } = useAnalysis()

  if (!result) {
    return (
      <div className="min-h-screen bg-forest-950 flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <Microscope className="w-10 h-10 text-text-dim" />
          <p className="text-text-muted text-sm">No analysis found. Please submit a filing first.</p>
          <button onClick={() => navigate('/')} className="text-sprout-500 text-sm hover:underline">Go back</button>
        </div>
      </div>
    )
  }

  const score = result.gap_report?.score ?? 0
  const counts = result.gap_report?.present_counts || {}
  const gaps = [...(result.consolidated_gap_summary || [])].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  )
  const signals = result.potential_safety_signals || []
  const nextSteps = result.recommended_next_steps || []
  const narrative = result.limitations_and_caveats || ''

  // Build a lookup from field name to gap_report gap for comp references
  const compLookup = {}
  for (const g of result.gap_report?.gaps || []) {
    compLookup[g.title] = g
  }

  return (
    <div className="min-h-screen bg-forest-950 flex flex-col">
      <NavBar />

      <main className="w-full max-w-5xl mx-auto px-6 py-12 flex flex-col gap-14">

        {/* Score */}
        <section>
          <h2 className="text-2xl font-semibold text-text-base tracking-tight mb-8">Completeness Score</h2>
          <div className="rounded-2xl border border-forest-500 bg-forest-800 p-8 flex flex-col sm:flex-row items-center gap-10">
            <ScoreRing score={score} />
            <div className="flex flex-col gap-4 flex-1">
              <p className="text-text-muted text-sm leading-relaxed max-w-sm">
                Based on gap severity and coverage across all 8 regulatory domains.
              </p>
              <div className="flex flex-wrap gap-3">
                {counts.critical > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-forest-700 border border-red-900/40">
                    <AlertOctagon className="w-4 h-4 text-critical" />
                    <span className="text-sm font-semibold text-critical">{counts.critical}</span>
                    <span className="text-sm text-text-muted">Critical</span>
                  </div>
                )}
                {counts.high > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-forest-700 border border-amber-900/40">
                    <AlertTriangle className="w-4 h-4 text-moderate" />
                    <span className="text-sm font-semibold text-moderate">{counts.high}</span>
                    <span className="text-sm text-text-muted">Moderate</span>
                  </div>
                )}
                {counts.medium > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-forest-700 border border-forest-400">
                    <Minus className="w-4 h-4 text-minor" />
                    <span className="text-sm font-semibold text-minor">{counts.medium}</span>
                    <span className="text-sm text-text-muted">Minor</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Gaps */}
        {gaps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <AlertOctagon className="w-5 h-5 text-text-muted" />
              <h2 className="text-2xl font-semibold text-text-base tracking-tight">Identified Gaps</h2>
              <span className="ml-auto text-sm text-text-dim bg-forest-600 px-2 py-0.5 rounded-full">{gaps.length} total</span>
            </div>
            <div className="flex flex-col gap-3">
              {gaps.map((gap, i) => (
                <GapCard key={i} gap={gap} compGap={compLookup[gap.title]} />
              ))}
            </div>
          </section>
        )}

        {/* Safety Signals */}
        {signals.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ShieldAlert className="w-5 h-5 text-moderate" />
              <h2 className="text-2xl font-semibold text-text-base tracking-tight">Safety Signals</h2>
              <span className="ml-auto text-sm text-text-dim bg-forest-600 px-2 py-0.5 rounded-full">{signals.length} flagged</span>
            </div>
            <div className="flex flex-col gap-3">
              {signals.map((s, i) => <SignalCard key={i} signal={s} />)}
            </div>
          </section>
        )}

        {/* Next Steps */}
        {nextSteps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ListChecks className="w-5 h-5 text-text-muted" />
              <h2 className="text-2xl font-semibold text-text-base tracking-tight">Recommended Next Steps</h2>
            </div>
            <div className="flex flex-col gap-3">
              {nextSteps.map((step, i) => (
                <div key={i} className="flex gap-4 rounded-xl border border-forest-500 bg-forest-800 p-5">
                  <div className="w-7 h-7 rounded-full border border-forest-400 flex items-center justify-center text-xs font-bold text-text-muted shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <SeverityBadge priority={step.priority} />
                      <span className="text-xs text-text-dim bg-forest-600 px-2 py-0.5 rounded capitalize">
                        {step.domain}
                      </span>
                    </div>
                    <p className="text-text-muted text-sm leading-relaxed">{step.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Narrative */}
        {narrative && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <BookOpen className="w-5 h-5 text-text-muted" />
              <h2 className="text-2xl font-semibold text-text-base tracking-tight">Evaluation Summary</h2>
            </div>
            <div className="rounded-xl border border-forest-500 bg-forest-800 p-6">
              <p className="text-text-muted text-sm leading-loose">{narrative}</p>
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-forest-500">
          <button
            onClick={() => navigate('/attributes')}
            className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Attributes
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { reset(); navigate('/') }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-forest-400 text-text-muted hover:text-text-base hover:border-forest-300 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Start New Analysis
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}
