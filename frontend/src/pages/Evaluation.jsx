import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RotateCcw, AlertOctagon, AlertTriangle, Minus,
  ShieldAlert, ChevronDown, ChevronUp, CheckCircle2, Microscope,
  ListChecks, ArrowRight, BarChart2, ExternalLink, GitCompare,
  Download, Info
} from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'

const SEVERITY_CONFIG = {
  foundational: {
    label: 'Critical', color: '#ff4040',
    bg: 'rgba(255,64,64,0.08)', border: 'rgba(255,64,64,0.3)',
    Icon: AlertOctagon,
  },
  material: {
    label: 'Moderate', color: '#ff9500',
    bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.3)',
    Icon: AlertTriangle,
  },
  documentation_issue: {
    label: 'Minor', color: '#666666',
    bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)',
    Icon: Minus,
  },
}

const PRIORITY_ORDER = { foundational: 0, material: 1, documentation_issue: 2 }
const DEFAULT_VISIBLE_GAPS = 5

function scoreColor(score) {
  if (score === 0) return '#00ff88'
  if (score <= 10) return '#00cc6a'
  if (score <= 25) return '#ff9500'
  return '#ff4040'
}

const PROXY_WEIGHTS = {
  dietary_exposure_estimate: 10,
  allergenicity_assessment: 10,
  genotoxicity_battery: 10,
  digestibility_data: 1,
  nutritional_impact: 1,
  human_exposure_data: 1,
  history_of_safe_use: 1,
}
const PROXY_MAX = 34

const BENCHMARKABLE_FIELDS = [
  'dietary_exposure_estimate',
  'allergenicity_assessment',
  'genotoxicity_battery',
  'digestibility_data',
  'nutritional_impact',
  'human_exposure_data',
  'history_of_safe_use',
]

const FIELD_LABELS = {
  dietary_exposure_estimate: 'Dietary Exposure Estimate',
  allergenicity_assessment:  'Allergenicity Assessment',
  genotoxicity_battery:      'Genotoxicity Battery',
  digestibility_data:        'Digestibility Data',
  nutritional_impact:        'Nutritional Impact',
  human_exposure_data:       'Human Exposure Data',
  history_of_safe_use:       'History of Safe Use',
}

function peerFields(notice) {
  const sd = new Set((notice.safety_data_available || '').split(',').map(s => s.trim()))
  return {
    dietary_exposure_estimate: !!notice.exposure_estimate_included,
    allergenicity_assessment:  !!notice.allergenicity_addressed,
    genotoxicity_battery:      sd.has('genotoxicity_ames') || sd.has('genotoxicity_chromosomal'),
    digestibility_data:        sd.has('digestibility_study'),
    nutritional_impact:        sd.has('nutritional_impact'),
    human_exposure_data:       sd.has('human_clinical_trial'),
    history_of_safe_use:       sd.has('history_of_safe_use'),
  }
}

function getApplicableFields(engagementSummary) {
  const grasBasis = engagementSummary?.gras_basis || 'scientific_procedures'
  return {
    dietary_exposure_estimate: true,
    allergenicity_assessment:  true,
    genotoxicity_battery:      true,
    digestibility_data:        true,
    nutritional_impact:        true,
    human_exposure_data:       true,
    history_of_safe_use:       grasBasis === 'common_use_prior_1958',
  }
}

function peerProxyPct(notice, applicable = null) {
  const present = peerFields(notice)
  let total = 0, missing = 0
  for (const [f, w] of Object.entries(PROXY_WEIGHTS)) {
    if (applicable && applicable[f] === false) continue
    total += w
    if (!present[f]) missing += w
  }
  return total ? Math.round(missing / total * 100) : 0
}

function ProxyRow({ label, pct, color, bold }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className={`text-xs truncate shrink-0 w-44 ${bold ? 'font-semibold text-text-base' : 'text-text-muted'}`}>
        {label}
      </span>
      <div className="flex-1 bg-surface-2 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right shrink-0" style={{ color }}>{pct}%</span>
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

          {compGap?.approved_reference && (
            <div className="mt-2">
              <div className="rounded-lg p-3" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-accent" />
                  <span className="text-xs text-accent font-semibold">What good looks like</span>
                </div>
                <p className="text-xs text-text-muted font-medium leading-snug" style={{ fontFamily: 'var(--font-mono)' }}>
                  {compGap.approved_reference.substance_name}
                </p>
                <p className="text-xs text-text-dim mt-0.5">
                  GRN-{compGap.approved_reference.grn_number} · {compGap.approved_reference.section_label}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CompCard({ notice, variant }) {
  const isStrong = variant === 'strong'
  const year = notice.date_filed ? new Date(notice.date_filed).getFullYear() : '—'
  const similarity = notice.best_distance != null
    ? `${Math.round((1 - notice.best_distance) * 100)}% match`
    : null

  const borderColor = isStrong ? 'rgba(0,255,136,0.25)' : 'rgba(255,149,0,0.25)'

  return (
    <div
      className="rounded-xl border p-4 bg-surface transition-colors hover:bg-surface-2"
      style={{ borderColor }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {isStrong
            ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-moderate shrink-0" />
          }
          <span className={`text-xs font-bold uppercase tracking-wider ${isStrong ? 'text-accent' : 'text-moderate'}`}>
            {isStrong ? 'Approved' : 'Withdrawn'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {similarity && (
            <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
              {similarity}
            </span>
          )}
          <a
            href={`https://www.cfsanappsexternal.fda.gov/scripts/fdcc/?set=GRASNotices&id=${notice.grn_number}`}
            target="_blank" rel="noreferrer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-text-dim hover:text-accent transition-colors" />
          </a>
        </div>
      </div>

      <p className="text-text-base text-sm font-semibold leading-snug mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
        {notice.substance_name}
      </p>
      <p className="text-text-muted text-xs mb-3">{notice.notifier}</p>

      <div className="flex items-center gap-3 text-xs text-text-dim">
        <span>GRN-{notice.grn_number}</span>
        <span>·</span>
        <span>{year}</span>
        {notice.production_method && (
          <>
            <span>·</span>
            <span className="capitalize">{notice.production_method.replace(/_/g, ' ')}</span>
          </>
        )}
      </div>

      {notice.safety_data_available && (
        <div className="mt-3 flex flex-wrap gap-1">
          {notice.safety_data_available.split(', ').slice(0, 3).map(s => (
            <span key={s} className="px-1.5 py-0.5 rounded text-xs bg-surface-2 text-text-dim border border-border">
              {s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SignalCard({ signal }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,149,0,0.3)', background: 'rgba(255,149,0,0.05)' }}>
      <div className="flex items-start gap-3 p-5">
        <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#ff9500' }} />
        <div className="flex-1 min-w-0">
          <p className="text-text-base text-sm font-bold leading-snug mb-2">{signal.signal}</p>
          <p className="text-text-muted text-sm leading-relaxed mb-3">{signal.evidence}</p>
          {signal.section_reference && (
            <p className="text-xs text-text-dim mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
              {signal.section_reference}
            </p>
          )}
          {signal.recommended_action && (
            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,149,0,0.2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#ff9500' }}>Recommended action</p>
              <p className="text-xs text-text-muted leading-relaxed">{signal.recommended_action}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailHeader({ title, icon: Icon, onBack }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-base transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Overview
      </button>
      <span className="text-text-dim text-sm">·</span>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-text-muted" />
        <span className="text-text-base font-semibold text-sm">{title}</span>
      </div>
    </div>
  )
}

function OverviewCard({ icon: Icon, title, badge, preview, accentBorder, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`text-left rounded-2xl border bg-surface p-5 transition-all group w-full ${
        disabled ? 'opacity-40 cursor-default' : 'hover:bg-surface-2 hover:shadow-sm cursor-pointer'
      }`}
      style={accentBorder ? { borderColor: accentBorder } : {}}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-bold text-text-base">{title}</span>
        </div>
        {badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-text-dim border border-border shrink-0">
            {badge}
          </span>
        )}
      </div>
      {preview && (
        <p className="text-text-muted text-xs leading-relaxed line-clamp-2 mb-4">{preview}</p>
      )}
      {!disabled && (
        <div className="flex items-center gap-1 text-xs font-medium text-text-dim group-hover:text-text-base transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </button>
  )
}

function PrintReport({ result, allGaps, signals, nextSteps, narrative, topNotices, compLookup }) {
  const s = result.engagement_summary || {}
  const score = result.gap_report?.score ?? 0
  const counts = result.gap_report?.priority_counts || {}
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #00cc6a' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#00aa55', letterSpacing: '-0.02em' }}>greenlit.ai — Gap Analysis Report</div>
          {s.substance_name && <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111111', marginTop: '0.25rem' }}>{s.substance_name}</div>}
          {s.notifier && <div style={{ fontSize: '0.8rem', color: '#555555', marginTop: '0.1rem' }}>{s.notifier}</div>}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#888888', textAlign: 'right' }}>
          {s.date_filed && <div>{new Date(s.date_filed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>}
          <div style={{ marginTop: '0.1rem' }}>Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {/* Score */}
      <div>
        <div style={h2Style}>Gap Score</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '3rem', fontWeight: 800, color: score <= 10 ? '#16a34a' : score <= 25 ? '#d97706' : '#dc2626', lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: '0.8rem', color: '#456050' }}>penalty score — lower is better</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {counts.foundational > 0 && <span style={{ color: '#ff4040', fontWeight: 600 }}>{counts.foundational} Critical</span>}
          {counts.material > 0 && <span style={{ color: '#ff9500', fontWeight: 600 }}>{counts.material} Moderate</span>}
          {counts.documentation_issue > 0 && <span style={{ color: '#888888', fontWeight: 600 }}>{counts.documentation_issue} Minor</span>}
        </div>
      </div>

      {/* Safety Signals */}
      {signals.length > 0 && (
        <div style={sectionStyle}>
          <div style={h2Style}>Safety Signals ({signals.length})</div>
          {signals.map((sig, i) => (
            <div key={i} style={{ marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{sig.signal}</div>
              <div style={{ color: '#555555', marginBottom: '0.2rem' }}>{sig.evidence}</div>
              {sig.section_reference && <div style={{ ...monoStyle, fontSize: '0.75rem', color: '#888888' }}>{sig.section_reference}</div>}
              {sig.recommended_action && <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#333333' }}><strong>Action:</strong> {sig.recommended_action}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Gaps */}
      {allGaps.length > 0 && (
        <div style={sectionStyle}>
          <div style={h2Style}>Identified Gaps ({allGaps.length})</div>
          {allGaps.map((gap, i) => {
            const cfg = SEVERITY_CONFIG[gap.priority] || SEVERITY_CONFIG.documentation_issue
            const cg = compLookup[gap.title]
            return (
              <div key={i} style={{ marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: `3px solid ${cfg.color}` }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontWeight: 600 }}>{gap.title}</span>
                  {gap.domain && <span style={{ fontSize: '0.75rem', color: '#7a9e85' }}>— {gap.domain.replace(/_/g, ' ')}</span>}
                </div>
                <div style={{ color: '#555555', fontSize: '0.82rem', marginBottom: '0.15rem' }}>{gap.observation}</div>
                {gap.section_reference && <div style={{ ...monoStyle, fontSize: '0.72rem', color: '#888888' }}>{gap.section_reference}</div>}
                {cg?.approved_reference && <div style={{ fontSize: '0.75rem', color: '#00aa55', marginTop: '0.2rem' }}>✓ What good looks like: {cg.approved_reference.substance_name} (GRN-{cg.approved_reference.grn_number})</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Benchmark */}
      {benchmark && (
        <div style={sectionStyle}>
          <div style={h2Style}>Benchmark Comparison</div>
          {proxyScore && (
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div><span style={labelStyle}>This filing: </span><strong style={{ color: Math.round(proxyScore.current * 100) <= 20 ? '#00aa55' : '#ff4040' }}>{Math.round(proxyScore.current * 100)}% missing</strong></div>
              <div><span style={labelStyle}>Approved avg: </span><strong>{Math.round(proxyScore.approved_mean * 100)}%</strong></div>
            </div>
          )}
          {corpusBaseline && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', color: '#888888', fontWeight: 600 }}>Field</th>
                  <th style={{ textAlign: 'center', padding: '0.25rem 0.5rem', color: '#888888', fontWeight: 600 }}>Your filing</th>
                  <th style={{ textAlign: 'center', padding: '0.25rem 0.5rem', color: '#888888', fontWeight: 600 }}>Approved avg</th>
                  <th style={{ textAlign: 'center', padding: '0.25rem 0.5rem', color: '#888888', fontWeight: 600 }}>Top peers</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(corpusBaseline.fields).map(([field, data], idx) => {
                  const present = (result.gap_field_presence || {})[field]
                  const peerData = peerComparison?.fields?.[field]
                  const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                  return (
                    <tr key={field} style={{ borderBottom: '1px solid #eef6f1', background: idx % 2 ? '#f4f9f5' : 'white' }}>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{label}</td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', color: present ? '#00aa55' : '#ff4040', fontWeight: 600 }}>{present ? 'Found' : 'Missing'}</td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', color: '#555555' }}>{Math.round(data.rate * 100)}%</td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', color: '#555555' }}>{peerData ? `${peerData.peer_count}/${peerData.n_peers}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Comparables */}
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
                <div style={{ fontSize: '0.75rem', color: '#888888' }}>GRN-{n.grn_number} · {n.notifier} · {n.best_distance != null ? `${Math.round((1 - n.best_distance) * 100)}% match` : ''}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <div style={sectionStyle}>
          <div style={h2Style}>Recommended Next Steps ({nextSteps.length})</div>
          {nextSteps.map((step, i) => {
            const prob = step.fda_pushback_probability || 'medium'
            const color = { high: '#ff4040', medium: '#ff9500', low: '#00aa55' }[prob]
            return (
              <div key={i} style={{ marginBottom: '0.75rem', paddingLeft: '0.75rem', borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color }}>{prob} FDA pushback risk</span>
                  <span style={{ fontWeight: 600 }}>{step.gap_title}</span>
                </div>
                {step.pushback_reasoning && <div style={{ color: '#555555', fontSize: '0.82rem', fontStyle: 'italic', marginBottom: '0.15rem' }}>{step.pushback_reasoning}</div>}
                <div style={{ color: '#555555', fontSize: '0.82rem' }}>{step.action}</div>
                {step.withdrawn_reference && (
                  <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.2rem' }}>
                    ⚠ Withdrawal precedent: GRN-{step.withdrawn_reference.grn_number} ({step.withdrawn_reference.substance_name})
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Narrative */}
      {narrative && (
        <div style={sectionStyle}>
          <div style={h2Style}>Evaluation Summary</div>
          <div style={{ color: '#456050', lineHeight: 1.7 }}>{narrative}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '2rem', paddingTop: '0.75rem', borderTop: '1px solid #ccddd3', fontSize: '0.7rem', color: '#7a9e85', display: 'flex', justifyContent: 'space-between' }}>
        <span>GRAS-sy — AI-assisted regulatory gap analysis</span>
        <span>Not legal advice</span>
      </div>
    </div>
  )
}

export default function Evaluation() {
  const navigate = useNavigate()
  const { result, reset } = useAnalysis()
  const [activeSection, setActiveSection] = useState(null)
  const [showAllGaps, setShowAllGaps] = useState(false)
  const [gapsView, setGapsView] = useState('severity')
  const [showScoreInfo, setShowScoreInfo] = useState(false)

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
  const scoreCol = scoreColor(score)
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
  for (const g of result.consolidated_gap_summary || []) {
    compLookup[g.title] = g
  }

  const { approved_notices = [], withdrawn_notices = [] } = result.comparative_analysis || {}
  const topNotices = [...approved_notices, ...withdrawn_notices]
    .sort((a, b) => (a.best_distance ?? 1) - (b.best_distance ?? 1))
    .slice(0, 3)

  // ── Detail views ──────────────────────────────────────────────────────────

  if (activeSection === 'comparables') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12">
          <DetailHeader title="Comparable Filings" icon={GitCompare} onBack={() => setActiveSection(null)} />
          <p className="text-text-muted text-xs mb-6">3 most similar GRAS notices by semantic similarity, regardless of outcome.</p>
          <div className="flex flex-col gap-3">
            {topNotices.length > 0
              ? topNotices.map(n => (
                  <CompCard
                    key={n.grn_number}
                    notice={n}
                    variant={n.status === 'withdrawn' ? 'cautionary' : 'strong'}
                  />
                ))
              : <p className="text-text-dim text-sm italic">No comparable filings found.</p>
            }
          </div>
        </main>
      </div>
    )
  }

  if (activeSection === 'signals') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12">
          <DetailHeader title="Safety Signals" icon={ShieldAlert} onBack={() => setActiveSection(null)} />
          <div className="flex flex-col gap-3">
            {signals.map((s, i) => <SignalCard key={i} signal={s} />)}
          </div>
        </main>
      </div>
    )
  }

  if (activeSection === 'gaps') {
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
          <DetailHeader title="Identified Gaps" icon={AlertOctagon} onBack={() => setActiveSection(null)} />

          {/* Summary + toggle */}
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
              <button
                onClick={() => setGapsView('severity')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  gapsView === 'severity' ? 'bg-surface text-text-base shadow-sm' : 'text-text-dim hover:text-text-muted'
                }`}
              >
                By severity
              </button>
              <button
                onClick={() => setGapsView('domain')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  gapsView === 'domain' ? 'bg-surface text-text-base shadow-sm' : 'text-text-dim hover:text-text-muted'
                }`}
              >
                By topic
              </button>
            </div>
          </div>

          {/* Severity view */}
          {gapsView === 'severity' && (
            <>
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
            </>
          )}

          {/* Domain view */}
          {gapsView === 'domain' && (
            <div className="flex flex-col gap-6">
              {domainGroups.map(([domain, gaps]) => (
                <div key={domain}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-dim">
                      {domain.replace(/_/g, ' ')}
                    </h3>
                    <span className="text-xs text-text-dim bg-surface-2 border border-border px-2 py-0.5 rounded-full">
                      {gaps.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {gaps.map((gap, i) => (
                      <GapCard key={i} gap={gap} compGap={compLookup[gap.title]} />
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

  if (activeSection === 'benchmark') {
    const gfp = result.gap_field_presence || {}
    const gfpAvailable = Object.keys(gfp).length > 0
    const applicable = result.benchmark?.applicable_fields || getApplicableFields(result.engagement_summary)
    const naFields = Object.entries(applicable).filter(([, v]) => !v).map(([k]) => k)
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12">
          <DetailHeader title="Documentation Fields" icon={BarChart2} onBack={() => setActiveSection(null)} />
          <p className="text-text-muted text-xs mb-6">
            7 key fields compared against your {topNotices.length} most similar filings.
            {naFields.length > 0 && (
              <span className="text-text-dim"> Fields marked N/A are not applicable to this filing type ({result.engagement_summary?.gras_basis?.replace(/_/g, ' ')}).</span>
            )}
          </p>

          {/* Column headers */}
          {topNotices.length > 0 && (
            <div className="flex items-center gap-3 px-4 mb-2">
              <span className="flex-1" />
              <span className="text-xs font-semibold text-text-dim w-20 text-center">Your filing</span>
              <div className="flex gap-1">
                {topNotices.map(n => (
                  <span key={n.grn_number} className="text-xs text-text-dim w-16 text-center" title={n.substance_name}>
                    {n.status === 'withdrawn'
                      ? <span className="text-moderate">GRN-{n.grn_number}</span>
                      : <span className="text-accent">GRN-{n.grn_number}</span>
                    }
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {BENCHMARKABLE_FIELDS.map(field => {
              const yours = gfpAvailable ? !!gfp[field] : null
              const peerPresence = topNotices.map(n => peerFields(n)[field])
              const peerCount = peerPresence.filter(Boolean).length
              return (
                <div key={field} className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium text-text-base">{FIELD_LABELS[field]}</span>
                  <div className="w-20 flex justify-center">
                    {yours === null
                      ? <span className="text-xs text-text-dim">—</span>
                      : yours
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}><CheckCircle2 className="w-3 h-3" />Found</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,64,64,0.08)', color: '#ff4040', border: '1px solid rgba(255,64,64,0.25)' }}><Minus className="w-3 h-3" />Missing</span>
                    }
                  </div>
                  {topNotices.length > 0 && (
                    <div className="flex gap-1">
                      {peerPresence.map((has, i) => (
                        <div
                          key={i}
                          className="w-16 flex justify-center"
                          title={`${topNotices[i].substance_name}: ${applicable[field] === false ? 'not applicable' : has ? 'present' : 'absent'}`}
                        >
                          {applicable[field] === false
                            ? <span className="text-xs text-text-dim opacity-40">N/A</span>
                            : <span className={`text-sm ${has ? 'text-accent' : 'text-text-dim'}`}>{has ? '✓' : '·'}</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!gfpAvailable && (
            <p className="text-text-dim text-xs mt-4 italic">
              Your filing column unavailable — re-run analysis to populate.
            </p>
          )}

          {/* Peer legend */}
          {topNotices.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {topNotices.map(n => (
                <span key={n.grn_number} className="text-xs text-text-dim">
                  <span className={n.status === 'withdrawn' ? 'text-moderate font-semibold' : 'text-accent font-semibold'}>
                    GRN-{n.grn_number}
                  </span>
                  {' '}{n.substance_name} ({n.status === 'withdrawn' ? 'withdrawn' : 'approved'})
                </span>
              ))}
            </div>
          )}

          <p className="text-text-dim text-xs mt-5 leading-relaxed" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
            <span className="font-semibold text-text-muted">Note:</span> Peer filing columns are derived from pipeline metadata, not a full text scan. Fields may be undercounted if the sidecar data was not fully populated during ingestion — a missing ✓ does not necessarily mean the field is absent from the actual PDF.
          </p>
        </main>
      </div>
    )
  }

  if (activeSection === 'nextsteps') {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12">
          <DetailHeader title="Recommended Next Steps" icon={ListChecks} onBack={() => setActiveSection(null)} />
          <div className="flex flex-col gap-3">
            {nextSteps.map((step, i) => {
              const prob = step.fda_pushback_probability || 'medium'
              const probConfig = {
                high:   { label: 'High FDA pushback risk',    bg: 'rgba(255,64,64,0.07)',  border: 'rgba(255,64,64,0.25)',  color: '#ff4040', dot: '#ff4040' },
                medium: { label: 'Medium FDA pushback risk', bg: 'rgba(255,149,0,0.07)', border: 'rgba(255,149,0,0.25)', color: '#ff9500', dot: '#ff9500' },
                low:    { label: 'Low FDA pushback risk',    bg: 'rgba(0,255,136,0.07)', border: 'rgba(0,255,136,0.25)', color: '#00ff88', dot: '#00ff88' },
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
                        href={`https://www.cfsanappsexternal.fda.gov/scripts/fdcc/?set=GRASNotices&id=${ref.grn_number}`}
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
        </main>
      </div>
    )
  }

  // ── Overview ──────────────────────────────────────────────────────────────

  const topSimilar = topNotices[0]
  const topGap = allGaps[0]
  const totalIssues = (counts.foundational || 0) + (counts.material || 0) + (counts.documentation_issue || 0)
  const issueLabel = [
    counts.foundational  && `${counts.foundational} critical`,
    counts.material      && `${counts.material} moderate`,
    counts.documentation_issue && `${counts.documentation_issue} minor`,
  ].filter(Boolean).join(' · ')
  const topSignal = signals[0]
  const topStep = nextSteps.find(s => s.fda_pushback_probability === 'high') || nextSteps[0]
  const currentProxyPct = proxyScore ? Math.round(proxyScore.current * 100) : null
  const approvedProxyPct = proxyScore ? Math.round(proxyScore.approved_mean * 100) : null

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="no-print"><NavBar /></div>

      <PrintReport
        result={result}
        allGaps={allGaps}
        signals={signals}
        nextSteps={nextSteps}
        narrative={narrative}
        topNotices={topNotices}
        compLookup={compLookup}
      />

      <main className="no-print w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">

        {/* Truncation / skipped-pages warning */}
        {(result.meta?.truncated || result.meta?.skipped_pages > 0) && (
          <div className="flex items-start gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,149,0,0.07)', borderColor: 'rgba(255,149,0,0.3)' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#ff9500' }} />
            <p className="text-xs text-text-muted leading-relaxed">
              {result.meta?.truncated && (
                <><span className="font-semibold" style={{ color: '#ff9500' }}>Document truncated</span> — this PDF exceeded the analysis input limit. Sections near the end (typically Part 6–7) may not have been fully reviewed. Gaps there may be undercounted.</>
              )}
              {result.meta?.skipped_pages > 0 && (
                <span className={result.meta?.truncated ? ' ' : ''}>
                  {result.meta?.truncated ? ' ' : <><span className="font-semibold" style={{ color: '#ff9500' }}>Partial extraction</span> — </>}
                  <strong>{result.meta.skipped_pages}</strong> page{result.meta.skipped_pages !== 1 ? 's' : ''} had no extractable text (likely scanned images) and were skipped.
                </span>
              )}
            </p>
          </div>
        )}

        {/* Score hero */}
        <div className="rounded-2xl border border-border bg-surface p-8">
          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-7xl font-bold" style={{ color: scoreCol }}>{score}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-text-dim text-sm">gap score</span>
              <div className="relative">
                <button
                  onClick={() => setShowScoreInfo(o => !o)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-text-dim hover:text-text-muted hover:bg-surface-2 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                {showScoreInfo && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowScoreInfo(false)} />
                    <div className="absolute left-0 top-6 z-20 w-64 rounded-xl border border-border bg-surface shadow-lg p-4">
                      <p className="text-xs font-bold text-text-base mb-3">Scoring methodology</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-bold text-critical w-6 shrink-0">10</span>
                          <div>
                            <p className="text-xs font-semibold text-text-base">Foundational gap</p>
                            <p className="text-xs text-text-dim">GRAS conclusion cannot be supported without resolving</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-bold text-moderate w-6 shrink-0">5</span>
                          <div>
                            <p className="text-xs font-semibold text-text-base">Material gap</p>
                            <p className="text-xs text-text-dim">Weakens the conclusion but may be addressable</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-bold text-minor w-6 shrink-0">1</span>
                          <div>
                            <p className="text-xs font-semibold text-text-base">Documentation issue</p>
                            <p className="text-xs text-text-dim">Affects presentation, not the substantive safety case</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <p className="text-text-dim text-xs mb-6">
            {issueLabel ? `${issueLabel} · ` : ''}{totalIssues} issue{totalIssues !== 1 ? 's' : ''} across 8 regulatory domains
          </p>

          {topNotices.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-dim uppercase tracking-widest mb-3">
                Documentation completeness vs. {topNotices.length} most similar filings
              </p>
              {currentProxyPct != null && (
                <ProxyRow label="Your filing" pct={currentProxyPct} color={scoreCol} bold />
              )}
              <div className="h-px my-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
              {topNotices.map(n => {
                const isApproved = n.status !== 'withdrawn'
                const applicable = result.benchmark?.applicable_fields || getApplicableFields(result.engagement_summary)
                return (
                  <ProxyRow
                    key={n.grn_number}
                    label={`${isApproved ? '✓' : '✕'} GRN-${n.grn_number}`}
                    pct={peerProxyPct(n, applicable)}
                    color={isApproved ? '#00ff88' : '#ff9500'}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Section cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Comparables */}
          {topNotices.length > 0 && (
            <OverviewCard
              icon={GitCompare}
              title="Comparable Filings"
              badge={`${topNotices.length} notices`}
              preview={topSimilar ? `${topSimilar.status === 'withdrawn' ? 'Withdrawn' : 'Approved'}: ${topSimilar.substance_name} (GRN-${topSimilar.grn_number})` : undefined}
              onClick={() => setActiveSection('comparables')}
            />
          )}

          {/* Safety Signals */}
          <OverviewCard
            icon={ShieldAlert}
            title="Safety Signals"
            badge={signals.length > 0 ? `${signals.length} flagged` : 'None'}
            preview={topSignal ? topSignal.signal : 'No safety signals identified in this filing.'}
            accentBorder={signals.length > 0 ? '#fcd34d' : undefined}
            onClick={() => setActiveSection('signals')}
            disabled={signals.length === 0}
          />

          {/* Gaps */}
          <OverviewCard
            icon={AlertOctagon}
            title="Identified Gaps"
            badge={`${allGaps.length} total`}
            preview={topGap ? topGap.title : 'No gaps identified.'}
            onClick={() => setActiveSection('gaps')}
            disabled={allGaps.length === 0}
          />

          {/* Benchmark */}
          {topNotices.length > 0 && (
            <OverviewCard
              icon={BarChart2}
              title="Documentation Fields"
              badge="7 key fields"
              preview={`Field-by-field checklist vs. your ${topNotices.length} most similar filings.`}
              onClick={() => setActiveSection('benchmark')}
            />
          )}

          {/* Next Steps */}
          {nextSteps.length > 0 && (
            <OverviewCard
              icon={ListChecks}
              title="Recommended Next Steps"
              badge={`${nextSteps.length} actions`}
              preview={topStep ? topStep.gap_title || topStep.action : undefined}
              onClick={() => setActiveSection('nextsteps')}
            />
          )}

        </div>

        {/* Narrative disclaimer */}
        {narrative && (
          <p className="text-text-dim text-xs leading-relaxed border-t border-border pt-6">
            <span className="font-semibold">Evaluation summary: </span>{narrative}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Submit
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-base transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={() => { reset(); navigate('/') }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-text-muted hover:text-text-base hover:border-border-strong transition-colors text-sm font-medium"
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
