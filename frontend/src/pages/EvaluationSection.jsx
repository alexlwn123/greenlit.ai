import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertOctagon, AlertTriangle, Minus,
  ShieldAlert, ChevronDown, ChevronUp, CheckCircle2,
  ListChecks, BarChart2, GitCompare,
  Download, BookOpen, Loader2, AlertCircle, SplitSquareHorizontal, FilePlus2,
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'
import { fetchResearch, downloadOutline, fetchSidecar } from '../lib/api'
import {
  SEVERITY_CONFIG, PRIORITY_ORDER, PUSHBACK_ORDER, DEFAULT_VISIBLE_GAPS,
  GAP_REMEDIATION, FALLBACK_REMEDIATION,
  BENCHMARKABLE_FIELDS, FIELD_LABELS, EMPIRICAL_CALIBRATION, getEmpiricalSignal, SIGNAL_ORDER,
  peerFields, getApplicableFields,
} from '../lib/evaluationHelpers'
import { GapCard, CompCard, SignalCard, DetailHeader } from '../components/EvaluationShared'
import SectionNoteWidget from '../components/SectionNote'

export default function EvaluationSection() {
  const { section } = useParams()
  const navigate = useNavigate()
  const { result, jobId } = useAnalysis()

  const goBack = () => navigate('/evaluation')

  if (!result) {
    navigate('/evaluation')
    return null
  }

  const counts = result.gap_report?.priority_counts || {}
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
  const compLookup = {}
  for (const g of result.consolidated_gap_summary || []) {
    compLookup[g.title] = g
  }
  const { approved_notices = [], withdrawn_notices = [] } = result.comparative_analysis || {}
  const topNotices = [...approved_notices, ...withdrawn_notices]
    .sort((a, b) => (a.best_distance ?? 1) - (b.best_distance ?? 1))
    .slice(0, 3)
  const fallbackRef = approved_notices[0]
    ? { substance_name: approved_notices[0].substance_name, grn_number: approved_notices[0].grn_number }
    : null

  let content = null
  if (section === 'comparables') content = <ComparablesSection topNotices={topNotices} onBack={goBack} />
  else if (section === 'signals') content = <SignalsSection signals={signals} onBack={goBack} />
  else if (section === 'gaps') content = <GapsSection result={result} allGaps={allGaps} counts={counts} compLookup={compLookup} fallbackRef={fallbackRef} onBack={goBack} />
  else if (section === 'benchmark') content = <BenchmarkSection result={result} topNotices={topNotices} onBack={goBack} />
  else if (section === 'research') content = <ResearchSection result={result} onBack={goBack} />
  else if (section === 'nextsteps') content = <NextStepsSection nextSteps={nextSteps} onBack={goBack} />
  else if (section === 'outline') content = <OutlineSection result={result} jobId={jobId} onBack={goBack} />
  else if (section === 'diff') content = <DiffSection result={result} onBack={goBack} />
  else { navigate('/evaluation'); return null }

  return (
    <>
      {content}
      <SectionNoteWidget sectionKey={section} />
    </>
  )
}

function ComparablesSection({ topNotices, onBack }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Comparable Filings" icon={GitCompare} onBack={onBack} />
        <p className="text-text-muted text-xs mb-6">3 most similar GRAS notices by semantic similarity, regardless of outcome.</p>
        <div className="flex flex-col gap-3">
          {topNotices.length > 0
            ? topNotices.map(n => <CompCard key={n.grn_number} notice={n} variant={n.status === 'withdrawn' ? 'cautionary' : 'strong'} />)
            : <p className="text-text-dim text-sm italic">No comparable filings found.</p>
          }
        </div>
      </main>
    </div>
  )
}

function SignalsSection({ signals, onBack }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Safety Signals" icon={ShieldAlert} onBack={onBack} />
        <div className="flex flex-col gap-3">
          {signals.map((s, i) => <SignalCard key={i} signal={s} />)}
        </div>
      </main>
    </div>
  )
}

function GapsSection({ result, allGaps, counts, compLookup, fallbackRef, onBack }) {
  const [showAllGaps, setShowAllGaps] = useState(false)
  const [gapsView, setGapsView] = useState('severity')
  const visibleGaps = showAllGaps ? allGaps : allGaps.slice(0, DEFAULT_VISIBLE_GAPS)
  const hiddenCount = allGaps.length - DEFAULT_VISIBLE_GAPS
  const gapsByDomain = {}
  for (const gap of allGaps) {
    const d = gap.domain || 'other'
    if (!gapsByDomain[d]) gapsByDomain[d] = []
    gapsByDomain[d].push(gap)
  }
  const domainGroups = Object.entries(gapsByDomain).sort(([, a], [, b]) =>
    (PRIORITY_ORDER[a[0].priority] ?? 3) - (PRIORITY_ORDER[b[0].priority] ?? 3)
  )
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Identified Gaps" icon={AlertOctagon} onBack={onBack} />
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            {counts.foundational > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                <AlertOctagon className="w-4 h-4 text-critical" />
                <span className="text-sm font-bold text-critical">{counts.foundational}</span>
                <span className="text-sm text-text-muted">Critical</span>
              </div>
            )}
            {counts.material > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)' }}>
                <AlertTriangle className="w-4 h-4 text-moderate" />
                <span className="text-sm font-bold text-moderate">{counts.material}</span>
                <span className="text-sm text-text-muted">Moderate</span>
              </div>
            )}
            {counts.documentation_issue > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border">
                <Minus className="w-4 h-4 text-minor" />
                <span className="text-sm font-bold text-minor">{counts.documentation_issue}</span>
                <span className="text-sm text-text-muted">Minor</span>
              </div>
            )}
          </div>
          <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-medium">
            <button onClick={() => setGapsView('severity')} className={`px-3 py-1.5 rounded-md transition-colors ${gapsView === 'severity' ? 'bg-surface text-text-base shadow-sm' : 'text-text-dim hover:text-text-muted'}`}>By severity</button>
            <button onClick={() => setGapsView('domain')} className={`px-3 py-1.5 rounded-md transition-colors ${gapsView === 'domain' ? 'bg-surface text-text-base shadow-sm' : 'text-text-dim hover:text-text-muted'}`}>By topic</button>
          </div>
        </div>
        {gapsView === 'severity' && (
          <>
            <div className="flex flex-col gap-2">
              {visibleGaps.map((gap, i) => (
                <GapCard key={i} gap={gap} compGap={compLookup[gap.title]} substanceName={result.engagement_summary?.substance_name} fallbackRef={fallbackRef} />
              ))}
            </div>
            {hiddenCount > 0 && (
              <button onClick={() => setShowAllGaps(o => !o)} className="mt-4 w-full py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-base text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {showAllGaps ? <><ChevronUp className="w-4 h-4" /> Show fewer</> : <><ChevronDown className="w-4 h-4" /> Show {hiddenCount} more gap{hiddenCount > 1 ? 's' : ''}</>}
              </button>
            )}
          </>
        )}
        {gapsView === 'domain' && (
          <div className="flex flex-col gap-6">
            {domainGroups.map(([domain, gaps]) => (
              <div key={domain}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-text-dim">{domain.replace(/_/g, ' ')}</h3>
                  <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">{gaps.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {gaps.map((gap, i) => (
                    <GapCard key={i} gap={gap} compGap={compLookup[gap.title]} substanceName={result.engagement_summary?.substance_name} fallbackRef={fallbackRef} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function BenchmarkSection({ result, topNotices, onBack }) {
  const gfp = result.gap_field_presence || {}
  const gfpAvailable = Object.keys(gfp).length > 0
  const applicable = { ...(result.benchmark?.applicable_fields || getApplicableFields(result.engagement_summary)), history_of_safe_use: true }
  const naFields = Object.entries(applicable).filter(([, v]) => !v).map(([k]) => k)
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Documentation Fields" icon={BarChart2} onBack={onBack} />
        <p className="text-text-muted text-xs mb-6">
          7 key fields compared against your {topNotices.length} most similar filings.
          {naFields.length > 0 && <span className="text-text-dim"> Fields marked N/A are not applicable ({result.engagement_summary?.gras_basis?.replace(/_/g, ' ')}).</span>}
        </p>
        {topNotices.length > 0 && (
          <div className="flex items-center gap-3 px-4 mb-2">
            <span className="flex-1" />
            <span className="text-xs font-semibold text-text-dim w-20 text-center">Your filing</span>
            <div className="flex gap-1">
              {topNotices.map(n => (
                <span key={n.grn_number} className="text-xs text-text-dim w-16 text-center" title={n.substance_name}>
                  {n.status === 'withdrawn' ? <span className="text-moderate">GRN-{n.grn_number}</span> : <span className="text-accent">GRN-{n.grn_number}</span>}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {BENCHMARKABLE_FIELDS.map(field => {
            const yours = gfpAvailable ? !!gfp[field] : null
            const peerPresence = topNotices.map(n => peerFields(n)[field])
            return (
              <div key={field} className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
                <span className="flex-1 text-sm font-medium text-text-base">{FIELD_LABELS[field]}</span>
                <div className="w-20 flex justify-center">
                  {yours === null ? <span className="text-xs text-text-dim">-</span>
                    : yours ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}><CheckCircle2 className="w-3 h-3" />Found</span>
                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,64,64,0.08)', color: '#ff4040', border: '1px solid rgba(255,64,64,0.25)' }}><Minus className="w-3 h-3" />Missing</span>
                  }
                </div>
                {topNotices.length > 0 && (
                  <div className="flex gap-1">
                    {peerPresence.map((has, i) => (
                      <div key={i} className="w-16 flex justify-center">
                        {applicable[field] === false ? <span className="text-xs text-text-dim opacity-40">N/A</span>
                          : <span className={`text-sm font-bold ${has ? 'text-accent' : 'text-moderate'}`}>{has ? '✓' : '✗'}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {!gfpAvailable && <p className="text-text-dim text-xs mt-4 italic">Your filing column unavailable - re-run analysis to populate.</p>}
        {topNotices.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {topNotices.map(n => (
              <span key={n.grn_number} className="text-xs text-text-dim">
                <span className={n.status === 'withdrawn' ? 'text-moderate font-semibold' : 'text-accent font-semibold'}>GRN-{n.grn_number}</span>
                {' '}{n.substance_name} ({n.status === 'withdrawn' ? 'withdrawn' : 'approved'})
              </span>
            ))}
          </div>
        )}
        <div className="mt-8 rounded-xl border border-border bg-surface p-5" style={{ borderColor: 'rgba(0,255,136,0.15)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#00ff88' }}>Empirical Calibration Basis</p>
          <p className="text-xs text-text-dim mb-4">Field presence rates across <span className="text-text-muted font-medium">714 approved</span> and <span className="text-text-muted font-medium">158 withdrawn</span> FDA GRAS notices.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th className="text-left text-text-dim font-medium py-2 pr-4">Field</th>
                  <th className="text-right text-text-dim font-medium py-2 px-3">Approved</th>
                  <th className="text-right text-text-dim font-medium py-2 px-3">Withdrawn</th>
                  <th className="text-right text-text-dim font-medium py-2 px-3">Delta</th>
                  <th className="text-left text-text-dim font-medium py-2 pl-4">Signal</th>
                </tr>
              </thead>
              <tbody>
                {EMPIRICAL_CALIBRATION.map(row => (
                  <tr key={row.field} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="py-2 pr-4 text-text-muted">{row.label}</td>
                    <td className="py-2 px-3 text-right text-text-base font-mono">{Math.round(row.approved * 100)}%</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: '#ff9500' }}>{Math.round(row.withdrawn * 100)}%</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold" style={{ color: row.signal === 'moderate' ? '#00ff88' : row.signal === 'weak' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)' }}>
                      {row.delta >= 0 ? '+' : ''}{Math.round(row.delta * 100)}%
                    </td>
                    <td className="py-2 pl-4">
                      {row.signal === 'moderate' && <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.25)' }}>Moderate</span>}
                      {row.signal === 'weak' && <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>Weak</span>}
                      {row.signal === 'none' && <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,64,64,0.06)', color: 'rgba(255,64,64,0.5)', border: '1px solid rgba(255,64,64,0.15)' }}>None</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-text-dim text-xs mt-3 italic">Note: "withdrawn" includes voluntary company withdrawals, which dilutes the signal.</p>
        </div>
        <p className="text-text-dim text-xs mt-5 leading-relaxed" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
          <span className="font-semibold text-text-muted">Note:</span> Peer filing columns are derived from pipeline metadata, not a full text scan.
        </p>
      </main>
    </div>
  )
}

function ResearchSection({ result, onBack }) {
  const [research, setResearch] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    setLoading(true)
    const s = result?.engagement_summary || {}
    fetchResearch(s.substance_name || '', s.production_method || '', s.source_organism || '')
      .then(data => setResearch(data.papers))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Relevant Research" icon={BookOpen} onBack={onBack} />
        <p className="text-text-muted text-xs mb-6">Top PubMed papers matched to this substance.</p>
        {loading && <div className="flex flex-col items-center justify-center gap-4 py-20"><Loader2 className="w-8 h-8 text-accent animate-spin" /><p className="text-text-muted text-sm">Searching PubMed...</p></div>}
        {error && <div className="flex items-start gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,64,64,0.06)', borderColor: 'rgba(255,64,64,0.25)' }}><AlertCircle className="w-4 h-4 text-critical mt-0.5 shrink-0" /><p className="text-sm text-text-muted">{error}</p></div>}
        {research && research.length === 0 && <p className="text-text-dim text-sm italic">No relevant papers found on PubMed for this substance.</p>}
        {research && research.length > 0 && (
          <div className="flex flex-col gap-4">
            {research.map((paper, i) => (
              <div key={paper.pmid} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-xs font-bold text-text-dim shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <a href={paper.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-text-base hover:text-accent transition-colors leading-snug block mb-1">{paper.title}</a>
                    <p className="text-xs text-text-muted mb-0.5">{paper.authors}</p>
                    <p className="text-xs text-text-dim">{paper.journal}{paper.journal && paper.year ? ' - ' : ''}{paper.year}</p>
                  </div>
                </div>
                {paper.relevance && (
                  <div className="mt-3 rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)' }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <p className="text-xs text-text-muted leading-relaxed">{paper.relevance}</p>
                  </div>
                )}
                {paper.abstract && (
                  <details className="mt-3 group">
                    <summary className="text-xs text-text-dim cursor-pointer hover:text-text-muted list-none flex items-center gap-1"><ChevronDown className="w-3 h-3" />Show abstract</summary>
                    <p className="mt-2 text-xs text-text-muted leading-relaxed">{paper.abstract}</p>
                  </details>
                )}
              </div>
            ))}
            <p className="text-xs text-text-dim text-center pt-2">Results from PubMed - Always verify citations before use</p>
          </div>
        )}
      </main>
    </div>
  )
}

function NextStepsSection({ nextSteps, onBack }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Recommended Next Steps" icon={ListChecks} onBack={onBack} />
        <p className="text-text-muted text-xs mb-6">Sorted by FDA pushback risk - address high-risk items first.</p>
        <div className="flex flex-col gap-3">
          {nextSteps.map((step, i) => {
            const prob = step.fda_pushback_probability || 'medium'
            const probConfig = {
              high:   { label: 'High FDA pushback risk',   bg: 'rgba(255,64,64,0.07)',  border: 'rgba(255,64,64,0.25)',  color: '#ff4040', dot: '#ff4040' },
              medium: { label: 'Medium FDA pushback risk', bg: 'rgba(255,149,0,0.07)', border: 'rgba(255,149,0,0.25)', color: '#ff9500', dot: '#ff9500' },
              low:    { label: 'Low FDA pushback risk',    bg: 'rgba(0,255,136,0.07)', border: 'rgba(0,255,136,0.25)', color: '#00ff88', dot: '#00ff88' },
            }[prob]
            const ref = step.withdrawn_reference
            const priority = prob === 'high' ? 'foundational' : prob === 'low' ? 'documentation_issue' : 'material'
            const rem = GAP_REMEDIATION[step.domain]?.[priority] || FALLBACK_REMEDIATION[priority] || FALLBACK_REMEDIATION.material
            return (
              <div key={i} className="rounded-xl border bg-surface overflow-hidden" style={{ borderColor: probConfig.border }}>
                <div className="flex items-center gap-2 px-5 py-2.5 border-b" style={{ background: probConfig.bg, borderColor: probConfig.border }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: probConfig.dot }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: probConfig.color }}>{probConfig.label}</span>
                  <span className="ml-auto text-xs text-text-dim capitalize">{step.domain?.replace(/_/g, ' ')}</span>
                </div>
                <div className="p-5">
                  <p className="text-text-base text-sm font-semibold mb-1">{step.gap_title}</p>
                  {step.pushback_reasoning && <p className="text-text-muted text-sm leading-relaxed mb-3 italic">{step.pushback_reasoning}</p>}
                  <p className="text-text-muted text-sm leading-relaxed mb-3">{step.action}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2 mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#a0a0a0' }}>{rem.cost}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#a0a0a0' }}>{rem.timeline}</span>
                    <span className="text-xs text-text-dim italic truncate">{rem.study}</span>
                  </div>
                  {ref && (
                    <div className="mt-3 rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: 'rgba(255,64,64,0.06)', border: '1px solid rgba(255,64,64,0.25)' }}>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-critical" />
                      <a href={`https://www.cfsanappsexternal.fda.gov/scripts/fdcc/?set=GRASNotices&id=${ref.grn_number}`} target="_blank" rel="noreferrer" className="text-xs text-critical font-semibold hover:underline leading-snug">
                        This issue contributed to the withdrawal of GRN-{ref.grn_number} ({ref.substance_name})
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-text-dim italic mt-4">Cost and timeline ranges are rough industry estimates.</p>
      </main>
    </div>
  )
}

function OutlineSection({ result, jobId, onBack }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-3xl mx-auto px-6 py-12">
        <DetailHeader title="Amendment Outline" icon={FilePlus2} onBack={onBack} />
        <p className="text-text-muted text-xs mb-8 leading-relaxed">
          A structured Word document (.docx) outlining what each section of the supplemental GRAS filing must contain to close every identified gap.
        </p>
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col items-center gap-4 text-center">
          <FilePlus2 className="w-10 h-10 text-accent opacity-80" />
          <div>
            <p className="text-text-base font-semibold mb-1">Download Amendment Outline</p>
            <p className="text-text-muted text-sm">Generates a formatted Word outline with gap tables and AI-written guidance. Takes 1-2 minutes.</p>
          </div>
          {error && <div className="flex items-center gap-2 text-critical text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true)
              setError(null)
              try {
                const effectiveJobId = jobId || sessionStorage.getItem('gras_job_id')
                if (!effectiveJobId) throw new Error('Job ID not found - please re-upload the filing')
                const blob = await downloadOutline(effectiveJobId)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                const substance = result.engagement_summary?.substance_name || 'amendment'
                a.download = `GRAS_Amendment_Outline_${substance.replace(/[^a-zA-Z0-9 -]/g, '_').slice(0, 60)}.docx`
                a.click()
                URL.revokeObjectURL(url)
              } catch (err) {
                setError(err.message)
              } finally {
                setLoading(false)
              }
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{ background: loading ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.2)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating outline...</> : <><Download className="w-4 h-4" /> Download .docx</>}
          </button>
        </div>
      </main>
    </div>
  )
}

const SAFETY_TEST_LABELS = {
  acute_toxicity:              'Acute Toxicity Study',
  '90_day_rat_study':          '90-Day Rat Study',
  chronic_toxicity:            'Chronic Toxicity Study',
  genotoxicity_ames:           'Genotoxicity (Ames)',
  genotoxicity_chromosomal:    'Genotoxicity (Chromosomal)',
  allergenicity_bioinformatic: 'Allergenicity (Bioinformatic)',
  allergenicity_serum:         'Allergenicity (Serum)',
  digestibility_study:         'Digestibility Study',
  nutritional_impact:          'Nutritional Impact Data',
  human_clinical_trial:        'Human Clinical Trial',
  history_of_safe_use:         'History of Safe Use',
  metabolic_fate:              'Metabolic Fate Study',
  genotoxicity_in_vitro:       'Genotoxicity (In Vitro)',
  genotoxicity_in_vivo:        'Genotoxicity (In Vivo)',
}

function DiffSection({ result, onBack }) {
  const [diffSidecar, setDiffSidecar] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const topApproved = result.comparative_analysis?.approved_notices?.[0]
  const es = result.engagement_summary || {}
  const gfp = result.gap_field_presence || {}
  const allTests = Object.keys(SAFETY_TEST_LABELS)
  useEffect(() => {
    if (!topApproved) return
    setLoading(true)
    fetchSidecar(topApproved.grn_number)
      .then(data => setDiffSidecar(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [topApproved?.grn_number])
  if (!topApproved) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12">
          <DetailHeader title="Filing Diff" icon={SplitSquareHorizontal} onBack={onBack} />
          <p className="text-text-muted text-sm">No comparable approved filing available for this analysis.</p>
        </main>
      </div>
    )
  }
  const cap = s => s && typeof s === 'string' ? s.charAt(0).toUpperCase() + s.slice(1) : s
  const peerSd = new Set(diffSidecar?.safety_data_available || [])
  const metaRows = [
    { label: 'Notifier',               yours: es.notifier || '-',                                                  peer: topApproved?.notifier || diffSidecar?.notifier || '-' },
    { label: 'Substance Type',          yours: cap(es.substance_type?.replace(/_/g,' ')) || '-',                   peer: cap(diffSidecar?.substance_type?.replace(/_/g,' ')) || '-' },
    { label: 'GRAS Basis',              yours: cap(es.gras_basis?.replace(/_/g,' ')) || '-',                       peer: cap(diffSidecar?.gras_basis?.replace(/_/g,' ')) || '-' },
    { label: 'Production Method',       yours: cap(es.production_method?.replace(/_/g,' ')) || '-',                peer: cap(diffSidecar?.production_method?.replace(/_/g,' ')) || '-' },
    { label: 'Organism Type',           yours: (() => { const s = es.source_organism || ''; return s ? (s.length > 50 ? s.slice(0,47).trimEnd()+'...' : cap(s)) : '-' })(), peer: cap(diffSidecar?.source_organism_type?.replace(/_/g,' ')) || '-' },
    { label: 'Organism Name',           yours: es.source_organism_name || '-',                                     peer: diffSidecar?.source_organism_name || '-' },
    { label: 'Intended Uses',           yours: (es.intended_uses || []).map(u => cap(u.replace(/_/g,' '))).join(', ') || '-', peer: (diffSidecar?.intended_uses || []).map(u => cap(u.replace(/_/g,' '))).join(', ') || '-' },
    { label: 'Target Population',       yours: cap(es.target_population?.replace(/_/g,' ')) || '-',                peer: cap(diffSidecar?.target_population?.replace(/_/g,' ')) || '-' },
    { label: 'Exposure Estimate',       yours: gfp.dietary_exposure_estimate ? 'Included' : 'Missing',            peer: diffSidecar?.exposure_estimate_included ? 'Included' : 'Missing' },
    { label: 'Allergenicity',           yours: gfp.allergenicity_assessment  ? 'Addressed' : 'Missing',           peer: diffSidecar?.allergenicity_addressed    ? 'Addressed' : 'Missing' },
    { label: 'Dietary Exposure Method', yours: cap(es.dietary_exposure_method?.replace(/_/g,' ')) || '-',          peer: cap(diffSidecar?.dietary_exposure_method?.replace(/_/g,' ')) || '-' },
  ]
  const DiffCell = ({ value }) => <span className="text-xs px-2 py-0.5 rounded font-medium text-text-muted">{value || '-'}</span>
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />
      <main className="w-full max-w-4xl mx-auto px-6 py-12">
        <DetailHeader title="Filing Diff" icon={SplitSquareHorizontal} onBack={onBack} />
        <p className="text-text-muted text-xs mb-6">
          Your filing vs.{' '}
          <a href={`https://www.cfsanappsexternal.fda.gov/scripts/fdcc/?set=GRASNotices&id=${topApproved.grn_number}`} target="_blank" rel="noreferrer" className="text-accent hover:underline font-semibold">
            GRN-{topApproved.grn_number} ({topApproved.substance_name})
          </a>
          {' '}- the most similar approved notice.
        </p>
        {loading && <div className="flex items-center gap-2 text-text-muted text-sm py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading comparison data...</div>}
        {error && <p className="text-critical text-sm">{error}</p>}
        {diffSidecar && (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="grid text-xs" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <div className="px-4 py-2.5 text-text-dim font-semibold uppercase tracking-wider">Field</div>
                <div className="px-4 py-2.5 text-text-dim font-semibold uppercase tracking-wider border-l" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>Your Filing</div>
                <div className="px-4 py-2.5 font-semibold uppercase tracking-wider border-l text-accent" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>GRN-{topApproved.grn_number}</div>
              </div>
              {metaRows.map((row, idx) => (
                <div key={row.label} className="grid text-xs" style={{ gridTemplateColumns: '1fr 1fr 1fr', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div className="px-4 py-3 text-text-muted">{row.label}</div>
                  <div className="px-4 py-3 border-l flex items-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}><DiffCell value={row.yours} /></div>
                  <div className="px-4 py-3 border-l flex items-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}><DiffCell value={row.peer} /></div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="grid text-xs" style={{ gridTemplateColumns: '1fr 7rem 7rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                <div className="px-4 py-2.5 text-text-dim font-semibold uppercase tracking-wider">Study / Data Type</div>
                <div className="px-4 py-2.5 text-text-dim font-semibold uppercase tracking-wider text-center border-l" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>Your Filing</div>
                <div className="px-4 py-2.5 font-semibold uppercase tracking-wider text-center border-l text-accent" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>GRN-{topApproved.grn_number}</div>
              </div>
              <div>
                {allTests.map((test) => {
                  const peerHas = peerSd.has(test)
                  const yoursVal = (() => {
                    const testKey = 'test_' + test
                    if (gfp[testKey] !== undefined) return gfp[testKey]
                    if (test === 'genotoxicity_ames' || test === 'genotoxicity_chromosomal') return gfp.genotoxicity_battery ?? null
                    if (test === 'digestibility_study') return gfp.digestibility_data ?? null
                    if (test === 'nutritional_impact') return gfp.nutritional_impact ?? null
                    if (test === 'human_clinical_trial') return gfp.human_exposure_data ?? null
                    if (test === 'history_of_safe_use') return gfp.history_of_safe_use ?? null
                    return null
                  })()
                  const missing = peerHas && yoursVal === false
                  return (
                    <div key={test} className="grid text-xs" style={{ gridTemplateColumns: '1fr 7rem 7rem', borderTop: '1px solid rgba(255,255,255,0.05)', background: missing ? 'rgba(255,64,64,0.04)' : undefined }}>
                      <div className="px-4 py-3 text-text-muted">{SAFETY_TEST_LABELS[test]}</div>
                      <div className="px-4 py-3 text-center border-l flex items-center justify-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        {yoursVal === null ? <span className="text-text-dim">?</span> : yoursVal ? <span className="font-bold text-accent">✓</span> : <span className="font-bold text-critical">✗</span>}
                      </div>
                      <div className="px-4 py-3 text-center border-l flex items-center justify-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <span className={`font-bold ${peerHas ? 'text-accent' : 'text-critical'}`}>{peerHas ? '✓' : '✗'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="text-text-dim text-xs mt-2 italic">? = not reliably detectable. Red rows = peer included it, yours did not.</p>
          </div>
        )}
      </main>
    </div>
  )
}


