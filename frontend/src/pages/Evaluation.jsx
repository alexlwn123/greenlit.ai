import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RotateCcw, AlertOctagon, AlertTriangle, Minus,
  ShieldAlert, ChevronDown, ChevronUp, CheckCircle2, Microscope,
  BookOpen, ListChecks
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'

const SEVERITY_CONFIG = {
  foundational: {
    label: 'Critical', color: '#dc2626',
    bg: '#fef2f2', border: '#fecaca',
    Icon: AlertOctagon,
  },
  material: {
    label: 'Moderate', color: '#d97706',
    bg: '#fffbeb', border: '#fde68a',
    Icon: AlertTriangle,
  },
  documentation_issue: {
    label: 'Minor', color: '#6b7280',
    bg: '#f9fafb', border: '#e5e7eb',
    Icon: Minus,
  },
}

const PRIORITY_ORDER = { foundational: 0, material: 1, documentation_issue: 2 }
const DEFAULT_VISIBLE_GAPS = 5

function scoreColor(score) {
  if (score === 0) return '#16a34a'
  if (score <= 10) return '#65a30d'
  if (score <= 25) return '#d97706'
  return '#dc2626'
}

function ScoreDisplay({ score }) {
  const color = scoreColor(score)
  return (
    <div className="flex flex-col items-center justify-center w-36">
      <span className="text-6xl font-bold" style={{ color }}>{score}</span>
      <span className="text-text-dim text-xs mt-1 text-center">gap score<br/>lower is better</span>
    </div>
  )
}

function SeverityBadge({ priority }) {
  const cfg = SEVERITY_CONFIG[priority] || SEVERITY_CONFIG.documentation_issue
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
    >
      <cfg.Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// Individual gap card — collapsed by default, expands on click
function GapCard({ gap, compGap }) {
  const [open, setOpen] = useState(false)
  const cfg = SEVERITY_CONFIG[gap.priority] || SEVERITY_CONFIG.documentation_issue

  return (
    <div
      className="rounded-xl border bg-surface overflow-hidden"
      style={{ borderColor: cfg.border, borderLeftWidth: '4px', borderLeftColor: cfg.color }}
    >
      <button
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-surface-2 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <SeverityBadge priority={gap.priority} />
          <h4 className="text-text-base font-semibold text-sm leading-snug truncate">{gap.title}</h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded capitalize hidden sm:inline">
            {gap.domain?.replace(/_/g, ' ')}
          </span>
          {open
            ? <ChevronUp className="w-4 h-4 text-text-dim" />
            : <ChevronDown className="w-4 h-4 text-text-dim" />
          }
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border">
          <p className="text-text-muted text-sm leading-relaxed mt-3 mb-3">{gap.observation}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim mb-3">
            <span className="bg-surface-2 border border-border px-2 py-0.5 rounded capitalize sm:hidden">
              {gap.domain?.replace(/_/g, ' ')}
            </span>
            {gap.section_reference && (
              <span style={{ fontFamily: 'var(--font-mono)' }}>{gap.section_reference}</span>
            )}
          </div>

          {compGap && (compGap.approved_reference || compGap.withdrawn_reference) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {compGap.approved_reference && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3 h-3 text-accent" />
                    <span className="text-xs text-accent font-semibold">Approved example</span>
                  </div>
                  <p className="text-xs text-text-muted font-medium leading-snug" style={{ fontFamily: 'var(--font-mono)' }}>
                    {compGap.approved_reference.substance_name}
                  </p>
                  <p className="text-xs text-text-dim mt-0.5">
                    GRN-{compGap.approved_reference.grn_number} · {compGap.approved_reference.section_label}
                  </p>
                </div>
              )}
              {compGap.withdrawn_reference && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3 h-3 text-moderate" />
                    <span className="text-xs text-moderate font-semibold">Cautionary example</span>
                  </div>
                  <p className="text-xs text-text-muted font-medium leading-snug" style={{ fontFamily: 'var(--font-mono)' }}>
                    {compGap.withdrawn_reference.substance_name}
                  </p>
                  <p className="text-xs text-text-dim mt-0.5">GRN-{compGap.withdrawn_reference.grn_number}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Collapsible section wrapper used for Next Steps and Narrative
function CollapsibleSection({ icon: Icon, title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <button
        className="w-full flex items-center gap-2 mb-0 group"
        onClick={() => setOpen(o => !o)}
      >
        <Icon className="w-5 h-5 text-text-muted" />
        <h2 className="text-2xl font-bold text-text-base tracking-tight">{title}</h2>
        {badge && (
          <span className="ml-2 text-sm text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <span className="ml-auto text-sm text-text-dim group-hover:text-text-muted transition-colors flex items-center gap-1">
          {open ? 'Collapse' : 'Expand'}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {open && <div className="mt-6">{children}</div>}
      {!open && <div className="mt-2 border-b border-border" />}
    </section>
  )
}

// Safety signal card — already collapsible
function SignalCard({ signal }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-amber-200 bg-surface overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-amber-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-moderate mt-0.5 shrink-0" />
          <p className="text-text-base text-sm font-semibold leading-snug">{signal.signal}</p>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-text-dim shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-text-dim shrink-0 mt-0.5" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-amber-100">
          <p className="text-text-muted text-sm leading-relaxed mt-3 mb-3">{signal.evidence}</p>
          {signal.section_reference && (
            <p className="text-xs text-text-dim mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
              {signal.section_reference}
            </p>
          )}
          {signal.recommended_action && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-xs text-accent font-semibold mb-1">Recommended action</p>
              <p className="text-xs text-text-muted leading-relaxed">{signal.recommended_action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Evaluation() {
  const navigate = useNavigate()
  const { result, reset } = useAnalysis()
  const [showAllGaps, setShowAllGaps] = useState(false)

  if (!result) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <Microscope className="w-10 h-10 text-text-dim" />
          <p className="text-text-muted text-sm">No analysis found. Please submit a filing first.</p>
          <button onClick={() => navigate('/')} className="text-accent text-sm hover:underline font-medium">
            Go back
          </button>
        </div>
      </div>
    )
  }

  const score = result.gap_report?.score ?? 0
  const counts = result.gap_report?.priority_counts || {}
  const allGaps = [...(result.consolidated_gap_summary || [])].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  )
  const visibleGaps = showAllGaps ? allGaps : allGaps.slice(0, DEFAULT_VISIBLE_GAPS)
  const hiddenCount = allGaps.length - DEFAULT_VISIBLE_GAPS

  const signals   = result.potential_safety_signals || []
  const nextSteps = result.recommended_next_steps || []
  const narrative = result.limitations_and_caveats || ''

  const compLookup = {}
  for (const g of result.gap_report?.gaps || []) {
    compLookup[g.title] = g
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />

      <main className="w-full max-w-5xl mx-auto px-6 py-12 flex flex-col gap-12">

        {/* Score */}
        <section>
          <h2 className="text-2xl font-bold text-text-base tracking-tight mb-6">Gap Score</h2>
          <div className="rounded-2xl border border-border bg-surface p-8 flex flex-col sm:flex-row items-center gap-10">
            <ScoreDisplay score={score} />
            <div className="flex flex-col gap-4 flex-1">
              <p className="text-text-muted text-sm leading-relaxed max-w-sm">
                Penalty score across all 8 regulatory domains. Each foundational gap adds 10 points, material gaps add 5, documentation issues add 1.
              </p>
              <div className="flex flex-wrap gap-3">
                {counts.foundational > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <AlertOctagon className="w-4 h-4 text-critical" />
                    <span className="text-sm font-bold text-critical">{counts.foundational}</span>
                    <span className="text-sm text-text-muted">Foundational ×10</span>
                  </div>
                )}
                {counts.material > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle className="w-4 h-4 text-moderate" />
                    <span className="text-sm font-bold text-moderate">{counts.material}</span>
                    <span className="text-sm text-text-muted">Material ×5</span>
                  </div>
                )}
                {counts.documentation_issue > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border">
                    <Minus className="w-4 h-4 text-minor" />
                    <span className="text-sm font-bold text-minor">{counts.documentation_issue}</span>
                    <span className="text-sm text-text-muted">Documentation ×1</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Gaps */}
        {allGaps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <AlertOctagon className="w-5 h-5 text-text-muted" />
              <h2 className="text-2xl font-bold text-text-base tracking-tight">Identified Gaps</h2>
              <span className="ml-auto text-sm text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
                {allGaps.length} total
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {visibleGaps.map((gap, i) => (
                <GapCard key={i} gap={gap} compGap={compLookup[gap.title]} />
              ))}
            </div>

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAllGaps(o => !o)}
                className="mt-4 w-full py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-base text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {showAllGaps
                  ? <><ChevronUp className="w-4 h-4" /> Show fewer</>
                  : <><ChevronDown className="w-4 h-4" /> Show {hiddenCount} more gap{hiddenCount > 1 ? 's' : ''}</>
                }
              </button>
            )}
          </section>
        )}

        {/* Safety Signals — individual cards already collapsible */}
        {signals.length > 0 && (
          <CollapsibleSection
            icon={ShieldAlert}
            title="Safety Signals"
            badge={`${signals.length} flagged`}
          >
            <div className="flex flex-col gap-3">
              {signals.map((s, i) => <SignalCard key={i} signal={s} />)}
            </div>
          </CollapsibleSection>
        )}

        {/* Next Steps — collapsed by default */}
        {nextSteps.length > 0 && (
          <CollapsibleSection
            icon={ListChecks}
            title="Recommended Next Steps"
            badge={`${nextSteps.length} actions`}
          >
            <div className="flex flex-col gap-3">
              {nextSteps.map((step, i) => (
                <div key={i} className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                  <div className="w-7 h-7 rounded-full border border-border bg-surface-2 flex items-center justify-center text-xs font-bold text-text-muted shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <SeverityBadge priority={step.priority} />
                      <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded capitalize">
                        {step.domain}
                      </span>
                    </div>
                    <p className="text-text-muted text-sm leading-relaxed">{step.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Narrative — collapsed by default */}
        {narrative && (
          <CollapsibleSection icon={BookOpen} title="Evaluation Summary">
            <div className="rounded-xl border border-border bg-surface p-6">
              <p className="text-text-muted text-sm leading-loose">{narrative}</p>
            </div>
          </CollapsibleSection>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border">
          <button
            onClick={() => navigate('/attributes')}
            className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Attributes
          </button>
          <button
            onClick={() => { reset(); navigate('/') }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-text-muted hover:text-text-base hover:border-border-strong transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Start New Analysis
          </button>
        </div>

      </main>
    </div>
  )
}
