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

function SignalCard({ signal }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
      <div className="flex items-start gap-3 p-5">
        <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-text-base text-sm font-bold leading-snug mb-2">{signal.signal}</p>
          <p className="text-text-muted text-sm leading-relaxed mb-3">{signal.evidence}</p>
          {signal.section_reference && (
            <p className="text-xs text-text-dim mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
              {signal.section_reference}
            </p>
          )}
          {signal.recommended_action && (
            <div className="rounded-lg bg-white border border-amber-200 p-3">
              <p className="text-xs text-amber-700 font-semibold mb-1">Recommended action</p>
              <p className="text-xs text-text-muted leading-relaxed">{signal.recommended_action}</p>
            </div>
          )}
        </div>
      </div>
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
  const benchmark = result.benchmark || null
  const proxyScore = benchmark?.proxy_score
  const corpusBaseline = benchmark?.corpus_baseline
  const peerComparison = benchmark?.peer_comparison
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

        {/* Safety Signals */}
        {signals.length > 0 && (
          <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-text-base tracking-tight">Safety Signals</h2>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 border border-amber-300">
                    {signals.length} flagged
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-text-dim border border-border">
                    Expert-level analysis
                  </span>
                </div>
                <p className="text-text-muted text-xs mt-0.5">
                  Substantive issues identified through deep regulatory review — the kind a senior attorney would raise.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {signals.map((s, i) => <SignalCard key={i} signal={s} />)}
            </div>
          </section>
        )}

        {/* Benchmark */}
        {benchmark && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-bold text-text-base tracking-tight">How Does This Filing Compare?</h2>
            </div>
            <p className="text-text-muted text-sm mb-6">
              Comparing key documentation fields against {corpusBaseline?.n_notices} similar approved filings in the FDA GRAS corpus.
            </p>
            <div className="flex flex-col gap-4">

              {/* Proxy score callout */}
              {proxyScore && (
                <div className="rounded-2xl border border-border bg-surface p-5">
                  <p className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">Missing-field penalty score (lower = fewer gaps)</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {[
                      { label: 'This filing', value: proxyScore.current, n: null, highlight: true },
                      { label: 'Approved filings avg', value: proxyScore.approved_mean, n: proxyScore.n_approved, highlight: false },
                      { label: 'Withdrawn filings avg', value: proxyScore.withdrawn_mean, n: proxyScore.n_withdrawn, highlight: false },
                    ].map(({ label, value, n, highlight }) => {
                      const pct = Math.round(value * 100)
                      const color = pct === 0 ? '#16a34a' : pct <= 20 ? '#65a30d' : pct <= 40 ? '#d97706' : '#dc2626'
                      return (
                        <div key={label} className={`flex-1 rounded-xl p-4 text-center ${highlight ? 'border-2 border-accent bg-accent-pale' : 'border border-border bg-surface-2'}`}>
                          <p className="text-text-dim text-xs font-medium mb-1">{label}{n ? ` (n=${n})` : ''}</p>
                          <p className="text-3xl font-bold" style={{ color }}>{pct}%</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Per-field breakdown */}
              {corpusBaseline && (
                <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0">
                    {/* Header */}
                    <div className="px-5 py-3 bg-surface-2 border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider">Documentation field</div>
                    <div className="px-4 py-3 bg-surface-2 border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider text-center">Your filing</div>
                    <div className="px-4 py-3 bg-surface-2 border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider text-center">Approved avg</div>
                    <div className="px-4 py-3 bg-surface-2 border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider text-center">Top 10 peers</div>

                    {Object.entries(corpusBaseline.fields).map(([field, data], idx) => {
                      const gfp = result.gap_field_presence || {}
                      const present = gfp[field]
                      const peerData = peerComparison?.fields?.[field]
                      const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                      const rowBg = idx % 2 === 0 ? '' : 'bg-surface-2'
                      return (
                        <>
                          <div key={field+'-label'} className={`px-5 py-3.5 border-b border-border text-sm text-text-muted font-medium ${rowBg}`}>{label}</div>
                          <div key={field+'-yours'} className={`px-4 py-3.5 border-b border-border text-center ${rowBg}`}>
                            {present
                              ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-accent border border-green-200">Found</span>
                              : <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-critical border border-red-200">Missing</span>
                            }
                          </div>
                          <div key={field+'-corpus'} className={`px-4 py-3.5 border-b border-border text-center text-sm text-text-muted ${rowBg}`}>
                            {Math.round(data.rate * 100)}% included it
                          </div>
                          <div key={field+'-peers'} className={`px-4 py-3.5 border-b border-border text-center text-sm text-text-muted ${rowBg}`}>
                            {peerData ? `${peerData.peer_count} of ${peerData.n_peers}` : '—'}
                          </div>
                        </>
                      )
                    })}
                  </div>
                  <p className="px-5 py-3 text-text-dim text-xs border-t border-border bg-surface-2">
                    Covers 7 of 16 gap fields — those reliably extractable from FDA filing metadata. “Approved avg” = {corpusBaseline.category_label}.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

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



        {/* Next Steps — collapsed by default */}
        {nextSteps.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ListChecks className="w-5 h-5 text-text-muted" />
              <h2 className="text-2xl font-bold text-text-base tracking-tight">Recommended Next Steps</h2>
              <span className="ml-2 text-sm text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
                {nextSteps.length} actions
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {nextSteps.map((step, i) => {
                const prob = step.fda_pushback_probability || 'medium'
                const probConfig = {
                  high:   { label: 'High FDA pushback risk',   bg: '#fef2f2', border: '#fecaca', color: '#dc2626', dot: '#dc2626' },
                  medium: { label: 'Medium FDA pushback risk', bg: '#fffbeb', border: '#fde68a', color: '#d97706', dot: '#d97706' },
                  low:    { label: 'Low FDA pushback risk',    bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', dot: '#16a34a' },
                }[prob]
                const ref = step.withdrawn_reference
                return (
                  <div key={i} className="rounded-xl border bg-surface overflow-hidden" style={{ borderColor: probConfig.border }}>
                    <div className="flex items-center gap-2 px-5 py-2.5 border-b" style={{ background: probConfig.bg, borderColor: probConfig.border }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: probConfig.dot }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: probConfig.color }}>
                        {probConfig.label}
                      </span>
                      <span className="ml-auto text-xs text-text-dim capitalize">{step.domain?.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="p-5">
                      <p className="text-text-base text-sm font-semibold mb-1">{step.gap_title}</p>
                      {step.pushback_reasoning && (
                        <p className="text-text-muted text-sm leading-relaxed mb-3 italic">{step.pushback_reasoning}</p>
                      )}
                      <p className="text-text-muted text-sm leading-relaxed mb-3">{step.action}</p>
                      {ref && (
                        <a
                          href={`https://www.fda.gov/food/generally-recognized-safe-gras/gras-notice-inventory#grn${String(ref.grn_number).padStart(4, '0')}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-critical font-semibold hover:underline"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          This issue contributed to withdrawal of GRN-{ref.grn_number} ({ref.substance_name})
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
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
