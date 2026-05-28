import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RotateCcw, AlertOctagon, AlertTriangle, Minus,
  ShieldAlert, CheckCircle2, Microscope,
  ListChecks, BarChart2, ExternalLink, GitCompare,
  Download, BookOpen, BookMarked, SplitSquareHorizontal, FilePlus2,
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'
import {
  SEVERITY_CONFIG, PRIORITY_ORDER, PUSHBACK_ORDER,
  BENCHMARKABLE_FIELDS, FIELD_LABELS,
  scoreColor, healthScoreColor, peerFields, getApplicableFields, getEmpiricalSignal, SIGNAL_ORDER,
} from '../lib/evaluationHelpers'
import { OverviewCard } from '../components/EvaluationShared'
import { useAuth } from '../context/AuthContext'
import { useNotes } from '../context/NotesContext'
import { supabase, supabaseEnabled } from '../lib/supabase'
import AuthModal from '../components/AuthModal'

function SaveNudge({ result }) {
  const { user } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  if (!supabaseEnabled) return null

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase.from('analyses').insert({
      user_id: user.id,
      substance_name: result.engagement_summary?.substance_name ?? null,
      result_json: result,
    })
    if (error) {
      setSaveError('Save failed. Please try again.')
    } else {
      setSaved(true)
    }
    setSaving(false)
  }

  if (saved) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(0,204,106,0.2)', background: 'rgba(0,204,106,0.05)' }}>
        <span style={{ color: '#00cc6a', fontSize: '0.85rem', fontWeight: 600 }}>✓ Analysis saved to your account</span>
      </div>
    )
  }

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: '#888' }}>Save this analysis to your account to access it later.</p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '0.45rem 1rem', borderRadius: '2rem', border: 'none', background: saving ? '#1a3d2a' : '#00cc6a', color: saving ? '#888' : '#000', fontWeight: 700, fontSize: '0.8rem', cursor: saving ? 'default' : 'pointer' }}
          >{saving ? 'Saving…' : 'Save analysis'}</button>
          {saveError && <span style={{ fontSize: '0.72rem', color: '#ff4040' }}>{saveError}</span>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(0,204,106,0.15)', background: 'rgba(0,204,106,0.03)' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#ccc' }}>Save this analysis</p>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#666' }}>Sign in to save, annotate, and return to this report.</p>
        </div>
        <button
          onClick={() => setShowAuth(true)}
          style={{ padding: '0.45rem 1rem', borderRadius: '2rem', border: '1px solid rgba(0,204,106,0.4)', background: 'transparent', color: '#00cc6a', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >Sign in / Create account</button>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
// Print-only report — rendered hidden, shown on window.print()
function PrintReport({ result, allGaps, signals, nextSteps, narrative, topNotices, compLookup }) {
  const s = result.engagement_summary || {}
  const score = result.gap_report?.score ?? 0
  const counts = result.gap_report?.priority_counts || {}
  const totalIssues = (counts.foundational || 0) + (counts.material || 0) + (counts.documentation_issue || 0)
  const printHealthScore = result.health_score ?? null
  const printSummaryParagraph = result.summary_paragraph || ''
  const benchmark = result.benchmark || null
  const proxyScore = benchmark?.proxy_score
  const corpusBaseline = benchmark?.corpus_baseline
  const peerComparison = benchmark?.peer_comparison

  const sectionStyle = { marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e5e5' }
  const h2Style = { fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '0.75rem' }
  const labelStyle = { fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666' }
  const monoStyle = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' }

  return (
    <div className="print-only hidden" style={{ fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif', color: '#111111', fontSize: '0.85rem', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #00cc6a' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#00aa55', letterSpacing: '-0.02em' }}>greenlit.ai - Gap Analysis Report</div>
          {s.substance_name && <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111111', marginTop: '0.25rem' }}>{s.substance_name}</div>}
          {s.notifier && <div style={{ fontSize: '0.8rem', color: '#555555', marginTop: '0.1rem' }}>{s.notifier}</div>}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#888888', textAlign: 'right' }}>
          {s.date_filed && <div>{new Date(s.date_filed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
          <div style={{ marginTop: '0.1rem' }}>Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
          <div style={h2Style}>Gap Summary</div>
          {printHealthScore !== null && (
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: printHealthScore >= 75 ? '#00aa55' : printHealthScore >= 50 ? '#d97706' : '#dc2626' }}>
              {printHealthScore}/100 health
            </span>
          )}
        </div>
        {printSummaryParagraph && <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: '#333', lineHeight: 1.65 }}>{printSummaryParagraph}</div>}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '1rem' }}>{counts.foundational || 0} Critical</span>
          <span style={{ color: '#d97706', fontWeight: 700, fontSize: '1rem' }}>{counts.material || 0} Moderate</span>
          <span style={{ color: '#666666', fontWeight: 700, fontSize: '1rem' }}>{counts.documentation_issue || 0} Minor</span>
        </div>
        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#555' }}>{totalIssues} issue{totalIssues !== 1 ? 's' : ''} across 8 regulatory domains</div>
      </div>
      {signals.length > 0 && (
        <div style={sectionStyle}>
          <div style={h2Style}>Safety Signals ({signals.length})</div>
          {signals.map((sig, i) => (
            <div key={i} style={{ marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{sig.signal}</div>
              <div style={{ color: '#555555', marginBottom: '0.2rem' }}>{sig.evidence}</div>
              {sig.recommended_action && <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#333333' }}><strong>Action:</strong> {sig.recommended_action}</div>}
            </div>
          ))}
        </div>
      )}
      {allGaps.length > 0 && (
        <div style={sectionStyle}>
          <div style={h2Style}>Identified Gaps ({allGaps.length})</div>
          {allGaps.map((gap, i) => {
            const cfg = SEVERITY_CONFIG[gap.priority] || SEVERITY_CONFIG.documentation_issue
            return (
              <div key={i} style={{ marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: `3px solid ${cfg.color}` }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontWeight: 600 }}>{gap.title}</span>
                </div>
                <div style={{ color: '#555555', fontSize: '0.82rem' }}>{gap.observation}</div>
              </div>
            )
          })}
        </div>
      )}
      {topNotices.length > 0 && (
        <div style={sectionStyle}>
          <div style={h2Style}>5 Most Similar Filings</div>
          {topNotices.map(n => {
            const isApproved = n.status !== 'withdrawn'
            return (
              <div key={n.grn_number} style={{ marginBottom: '0.5rem', paddingLeft: '0.75rem', borderLeft: `3px solid ${isApproved ? '#00aa55' : '#ff9500'}` }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isApproved ? '#00aa55' : '#ff9500', textTransform: 'uppercase' }}>{isApproved ? 'Approved' : 'Withdrawn'}</span>
                  <span style={{ ...monoStyle, fontWeight: 600, fontSize: '0.8rem' }}>{n.substance_name}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#888888' }}>GRN-{n.grn_number} - {n.best_distance != null ? `${Math.round((1 - n.best_distance) * 100)}% match` : ''}</div>
              </div>
            )
          })}
        </div>
      )}
      {narrative && (
        <div style={sectionStyle}>
          <div style={h2Style}>Evaluation Summary</div>
          <div style={{ color: '#456050', lineHeight: 1.7 }}>{narrative}</div>
        </div>
      )}
      <div style={{ marginTop: '2rem', paddingTop: '0.75rem', borderTop: '1px solid #ccddd3', fontSize: '0.7rem', color: '#7a9e85', display: 'flex', justifyContent: 'space-between' }}>
        <span>greenlit.ai - AI-assisted regulatory gap analysis</span>
        <span>Not legal advice</span>
      </div>
    </div>
  )
}


function ScrollHint() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    function onScroll() {
      const scrolled = window.scrollY + window.innerHeight
      const total = document.documentElement.scrollHeight
      setVisible(scrolled < total - 120)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        height: '5rem',
        background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: '0.875rem',
        pointerEvents: 'none',
        transition: 'opacity 0.3s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.25)', position: 'relative', overflow: 'hidden', borderRadius: '1px' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', background: 'rgba(255,255,255,0.6)', borderRadius: '1px', animation: 'scrollDrop 1.4s ease-in-out infinite', height: '8px' }} />
        </div>
        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>scroll</span>
      </div>
    </div>
  )
}
export default function Evaluation() {
  const navigate = useNavigate()
  const { result, reset } = useAnalysis()
  const ctx = useNotes()

  if (!result) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <Microscope className="w-10 h-10 text-text-dim" />
          <p className="text-text-muted text-sm">No analysis found. Please submit a filing first.</p>
          <button onClick={() => navigate('/')} className="text-accent text-sm hover:underline font-medium">Go back</button>
        </div>
      </div>
    )
  }

  const score = result.gap_report?.score ?? 0
  const scoreCol = scoreColor(score)
  const counts = result.gap_report?.priority_counts || {}
  const benchmark = result.benchmark || null
  const proxyScore = benchmark?.proxy_score
  const allGaps = [...(result.consolidated_gap_summary || [])].sort((a, b) => {
    const priA = PRIORITY_ORDER[a.priority] ?? 3
    const priB = PRIORITY_ORDER[b.priority] ?? 3
    if (priA !== priB) return priA - priB
    return (SIGNAL_ORDER[getEmpiricalSignal(a)?.signal] ?? 3) - (SIGNAL_ORDER[getEmpiricalSignal(b)?.signal] ?? 3)
  })
  const signals = result.potential_safety_signals || []
  const nextSteps = [...(result.recommended_next_steps || [])].sort(
    (a, b) => (PUSHBACK_ORDER[a.fda_pushback_probability] ?? 1) - (PUSHBACK_ORDER[b.fda_pushback_probability] ?? 1)
  )
  const narrative = result.limitations_and_caveats || ''
  const summaryParagraph = result.summary_paragraph || ''
  const healthScore = result.health_score ?? null
  const compLookup = {}
  for (const g of result.consolidated_gap_summary || []) compLookup[g.title] = g
  const { approved_notices = [], withdrawn_notices = [] } = result.comparative_analysis || {}
  const topNotices = [...approved_notices, ...withdrawn_notices]
    .sort((a, b) => (a.best_distance ?? 1) - (b.best_distance ?? 1))
    .slice(0, 3)

  const totalIssues = (counts.foundational || 0) + (counts.material || 0) + (counts.documentation_issue || 0)
  const topSimilar = topNotices[0]
  const currentProxyPct = proxyScore ? Math.round(proxyScore.current * 100) : null
  const approvedProxyPct = proxyScore ? Math.round(proxyScore.approved_mean * 100) : null

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="no-print"><NavBar /></div>

      <PrintReport result={result} allGaps={allGaps} signals={signals} nextSteps={nextSteps} narrative={narrative} topNotices={topNotices} compLookup={compLookup} />

      <main className="no-print w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">

        {/* Truncation warning */}
        {(result.meta?.truncated || result.meta?.skipped_pages > 0) && (
          <div className="flex items-start gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,149,0,0.07)', borderColor: 'rgba(255,149,0,0.3)' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#ff9500' }} />
            <p className="text-xs text-text-muted leading-relaxed">
              {result.meta?.truncated && <><span className="font-semibold" style={{ color: '#ff9500' }}>Document truncated</span> - this PDF exceeded the analysis input limit. Sections near the end may not have been fully reviewed.</>}
              {result.meta?.skipped_pages > 0 && <span>{result.meta?.truncated ? ' ' : <><span className="font-semibold" style={{ color: '#ff9500' }}>Partial extraction</span> - </>}<strong>{result.meta.skipped_pages}</strong> page{result.meta.skipped_pages !== 1 ? 's' : ''} had no extractable text and were skipped.</span>}
            </p>
          </div>
        )}

        {/* Save nudge */}
        <SaveNudge result={result} />

        {/* Header */}
        {result.engagement_summary?.substance_name && (
          <div>
            <p className="text-text-dim text-xs uppercase tracking-widest font-semibold mb-1">Gap Analysis Report</p>
            <h1 className="text-2xl font-bold text-text-base mb-1.5" style={{ letterSpacing: '-0.02em' }}>
              {result.engagement_summary.substance_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted text-sm">
              {result.engagement_summary.notifier && <span>{result.engagement_summary.notifier}</span>}
              {result.engagement_summary.date_filed && (
                <><span className="text-text-dim">-</span><span>Filed {new Date(result.engagement_summary.date_filed).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}</span></>
              )}
              {result.engagement_summary.gras_basis && (
                <><span className="text-text-dim">-</span><span className="capitalize">{result.engagement_summary.gras_basis.replace(/_/g, ' ')}</span></>
              )}
            </div>
          </div>
        )}

        

        {/* Gap summary card */}
        <div className="rounded-2xl border border-border bg-surface p-8">
          <p className="text-xs font-semibold text-text-dim uppercase tracking-widest mb-5">Gap summary</p>

          {/* Health score bar */}
          {healthScore !== null && (() => {
            const col = healthScoreColor(healthScore)
            const tier = healthScore >= 90 ? 'Submission-ready'
              : healthScore >= 75 ? 'Nearly ready'
              : healthScore >= 50 ? 'Needs work'
              : 'Not ready'
            const ticks = [{ pct: 50, label: 'Needs work' }, { pct: 75, label: 'Nearly ready' }, { pct: 90, label: 'Ready' }]
            return (
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                    <span style={{ fontSize: '2.25rem', fontWeight: 900, color: col, letterSpacing: '-0.04em', lineHeight: 1 }}>{healthScore}</span>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginLeft: '0.1rem' }}>/100</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: col }}>{tier}</span>
                </div>
                <div style={{ position: 'relative', height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, #ff4040 0%, #ff9500 38%, #ffcc00 60%, #00cc6a 78%, #00ff88 100%)', marginBottom: '0.5rem' }}>
                  {ticks.map(t => (
                    <div key={t.pct} style={{ position: 'absolute', left: `${t.pct}%`, top: 0, width: '1px', height: '100%', background: 'rgba(0,0,0,0.4)' }} />
                  ))}
                  <div style={{ position: 'absolute', left: `${healthScore}%`, top: '50%', transform: 'translate(-50%,-50%)', width: '13px', height: '13px', borderRadius: '50%', background: col, border: '2px solid #111', boxShadow: `0 0 8px ${col}88` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingRight: '0' }}>
                  <span style={{ fontSize: '0.6rem', color: '#ff4040', fontWeight: 600 }}>Not ready</span>
                  <span style={{ fontSize: '0.6rem', color: '#ff9500', fontWeight: 600, position: 'relative', left: '-2%' }}>Needs work</span>
                  <span style={{ fontSize: '0.6rem', color: '#00cc6a', fontWeight: 600 }}>Nearly ready</span>
                  <span style={{ fontSize: '0.6rem', color: '#00ff88', fontWeight: 600 }}>Ready</span>
                </div>
              </div>
            )
          })()}

          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ borderColor: 'rgba(255,64,64,0.35)', background: 'rgba(255,64,64,0.07)' }}>
              <AlertOctagon className="w-4 h-4" style={{ color: '#ff4040' }} />
              <span className="text-2xl font-bold" style={{ color: '#ff4040' }}>{counts.foundational || 0}</span>
              <span className="text-sm font-semibold" style={{ color: 'rgba(255,64,64,0.8)' }}>Critical</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ borderColor: 'rgba(255,149,0,0.35)', background: 'rgba(255,149,0,0.07)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#ff9500' }} />
              <span className="text-2xl font-bold" style={{ color: '#ff9500' }}>{counts.material || 0}</span>
              <span className="text-sm font-semibold" style={{ color: 'rgba(255,149,0,0.8)' }}>Moderate</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
              <Minus className="w-4 h-4" style={{ color: '#888' }} />
              <span className="text-2xl font-bold" style={{ color: '#888' }}>{counts.documentation_issue || 0}</span>
              <span className="text-sm font-semibold" style={{ color: '#666' }}>Minor</span>
            </div>
          </div>
          <p className="text-text-dim text-xs mb-4">{totalIssues} issue{totalIssues !== 1 ? 's' : ''} across 8 regulatory domains</p>
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-5" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.12)' }}>
            <span style={{ color: '#00ff88', fontSize: '0.6rem', marginTop: '0.2rem', flexShrink: 0 }}>●</span>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Gap priority calibrated against{' '}
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>714 approved + 158 withdrawn</span>{' '}
              FDA GRAS notices. Allergenicity is the strongest empirical predictor of withdrawal (9.5% delta).{' '}
              <button onClick={() => navigate('/evaluation/benchmark')} style={{ color: '#00ff88', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                See methodology
              </button>
            </p>
          </div>

          {summaryParagraph && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {summaryParagraph.split('\n').filter(l => l.trim()).map((line, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00ff88', fontSize: '0.55rem', marginTop: '0.35rem', flexShrink: 0 }}>●</span>
                  <span style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)' }}>{line.replace(/^•\s*/, '')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Section cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {topNotices.length > 0 && (
            <OverviewCard
              icon={GitCompare}
              title="Comparable Filings"
              badge={`${topNotices.length} notices`}
              preview={(() => {
                if (!topSimilar) return 'No similar filings found.'
                const sim = topSimilar.best_distance != null ? `${Math.round((1 - topSimilar.best_distance) * 100)}% match` : ''
                return `Closest: ${topSimilar.substance_name || `GRN-${topSimilar.grn_number}`}${sim ? ' - ' + sim : ''}`
              })()}
              onClick={() => navigate('/evaluation/comparables')}
            />
          )}
          <OverviewCard
            icon={ShieldAlert}
            title="Safety Signals"
            badge={signals.length > 0 ? `${signals.length} flagged` : 'None'}
            preview={signals.length > 0 ? `${signals.length} concern${signals.length > 1 ? 's' : ''} flagged for expert review` : 'No safety signals identified in this filing.'}
            accentBorder={signals.length > 0 ? '#fcd34d' : undefined}
            onClick={() => navigate('/evaluation/signals')}
            disabled={signals.length === 0}
          />
          <OverviewCard
            icon={AlertOctagon}
            title="Identified Gaps"
            badge={`${allGaps.length} total`}
            preview={[counts.foundational && `${counts.foundational} critical`, counts.material && `${counts.material} moderate`, counts.documentation_issue && `${counts.documentation_issue} minor`].filter(Boolean).join(' - ') || 'No gaps identified.'}
            onClick={() => navigate('/evaluation/gaps')}
            disabled={allGaps.length === 0}
          />
          {topNotices.length > 0 && (() => {
            const gfp = result.gap_field_presence || {}
            const presentCount = BENCHMARKABLE_FIELDS.filter(f => gfp[f]).length
            return (
              <OverviewCard
                icon={BarChart2}
                title="Documentation Fields"
                badge="7 key fields"
                preview={`${presentCount} of ${BENCHMARKABLE_FIELDS.length} key fields present`}
                onClick={() => navigate('/evaluation/benchmark')}
              />
            )
          })()}
          {nextSteps.length > 0 && (() => {
            const highCount = nextSteps.filter(s => s.fda_pushback_probability === 'high').length
            return (
              <OverviewCard
                icon={ListChecks}
                title="Recommended Next Steps"
                badge={`${nextSteps.length} actions`}
                preview={`${nextSteps.length} prioritized actions - ${highCount} high FDA pushback risk`}
                onClick={() => navigate('/evaluation/nextsteps')}
              />
            )
          })()}
          <OverviewCard
            icon={BookOpen}
            title="Relevant Research"
            badge="PubMed"
            preview="Top 3 papers matched to this substance - real citations, Claude relevance summaries"
            accentBorder="rgba(0,200,255,0.3)"
            onClick={() => navigate('/evaluation/research')}
          />
          <OverviewCard
            icon={FilePlus2}
            title="Amendment Outline"
            badge=".docx download"
            preview="Section-by-section Word outline of what the supplemental filing must include to close every gap"
            accentBorder="rgba(160,120,255,0.3)"
            onClick={() => navigate('/evaluation/outline')}
          />
          {result.comparative_analysis?.approved_notices?.length > 0 && (
            <OverviewCard
              icon={SplitSquareHorizontal}
              title="Filing Diff"
              badge={result.comparative_analysis.approved_notices[0] ? `vs GRN-${result.comparative_analysis.approved_notices[0].grn_number}` : 'Compare'}
              preview="Side-by-side: your filing vs the closest approved GRN"
              accentBorder="rgba(0,180,255,0.3)"
              onClick={() => navigate('/evaluation/diff')}
            />
          )}
          <OverviewCard
            icon={BookMarked}
            title="Workbook"
            badge={ctx?.notes?.['general']?.status?.replace('_', ' ') ?? 'Notes'}
            preview={ctx?.notes?.['general']?.content?.slice(0, 80) || 'Add notes, set filing status, and annotate sections.'}
            accentBorder="rgba(0,204,106,0.25)"
            onClick={() => navigate('/workbook')}
          />
        </div>
        {/* Narrative */}
        {narrative && (
          <p className="text-text-dim text-xs leading-relaxed border-t border-border pt-6">
            <span className="font-semibold">Evaluation summary: </span>{narrative}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to Submit
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-base transition-colors text-sm font-medium">
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button onClick={() => { reset(); navigate('/') }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-text-muted hover:text-text-base hover:border-border-strong transition-colors text-sm font-medium">
              <RotateCcw className="w-4 h-4" />
              Start New Analysis
            </button>
          </div>
        </div>
      <ScrollHint />
      </main>
    </div>
  )
}









