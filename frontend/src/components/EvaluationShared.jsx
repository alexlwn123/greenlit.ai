import { useState } from 'react'
import {
  ArrowLeft, ArrowRight, AlertOctagon, AlertTriangle, Minus,
  ShieldAlert, ChevronDown, ChevronUp, CheckCircle2,
  ExternalLink, FileText,
} from 'lucide-react'
import {
  SEVERITY_CONFIG, DOMAIN_SECTION_LABEL,
  GAP_REMEDIATION, FALLBACK_REMEDIATION, getRemediation,
  getEmpiricalSignal,
} from '../lib/evaluationHelpers'
import { getFdaQuestion } from '../lib/fdaQuestions'

export function ProxyRow({ label, pct, color, bold }) {
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

export function SeverityBadge({ priority }) {
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


export function EmpiricalSignalBadge({ signal }) {
  const config = {
    moderate: { label: 'Moderate signal', bg: 'rgba(0,255,136,0.08)', color: '#00ff88', border: 'rgba(0,255,136,0.25)' },
    weak:     { label: 'Weak signal',     bg: 'rgba(255,149,0,0.08)', color: '#ff9500', border: 'rgba(255,149,0,0.25)' },
    none:     { label: 'No signal',       bg: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.1)' },
  }[signal.signal]
  if (!config) return null
  return (
    <span
      className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0"
      style={{ background: config.bg, color: config.color, borderColor: config.border }}
      title={`Empirical delta: ${signal.delta} vs FDA approval rate`}
    >
      {config.label}
    </span>
  )
}
export function GapCard({ gap, compGap, substanceName, fallbackRef }) {
  const [open, setOpen] = useState(false)
  const cfg = SEVERITY_CONFIG[gap.priority] || SEVERITY_CONFIG.documentation_issue
  const empiricalSignal = getEmpiricalSignal(gap)
  const isCritical = gap.priority === 'foundational'
  const ref = compGap?.approved_reference || fallbackRef

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: cfg.border,
        borderLeftWidth: '4px',
        borderLeftColor: cfg.color,
        background: isCritical ? 'rgba(255,64,64,0.04)' : 'var(--color-surface)',
      }}
    >
      <button
        className="w-full flex flex-col p-4 text-left hover:bg-surface-2 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <SeverityBadge priority={gap.priority} />
            {empiricalSignal && <EmpiricalSignalBadge signal={empiricalSignal} />}
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
        </div>
        {!open && ref && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: 'rgba(0,255,136,0.65)' }} />
            <span className="text-xs text-text-muted truncate">
              See GRN-{ref.grn_number}: {ref.substance_name}
            </span>
          </div>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border">
          <p className="text-text-muted text-sm leading-relaxed mt-3 mb-3">{gap.observation}</p>
          {(() => {
            const rem = getRemediation(gap)
            return rem ? (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#a0a0a0' }}>
                  {rem.cost}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#a0a0a0' }}>
                  {rem.timeline}
                </span>
                <span className="text-xs text-text-dim italic truncate">{rem.study}</span>
              </div>
            ) : null
          })()}
          {(() => {
            const fda = getFdaQuestion(gap, substanceName)
            return (
              <div className="rounded-lg mb-3 overflow-hidden" style={{ border: '1px solid rgba(255,180,0,0.3)', background: 'rgba(255,180,0,0.04)' }}>
                <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,180,0,0.2)', background: 'rgba(255,180,0,0.07)' }}>
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: '#c89b00' }} />
                  <span className="text-xs font-bold tracking-wide uppercase" style={{ color: '#c89b00' }}>FDA would ask</span>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)', fontStyle: 'italic' }}>
                    &ldquo;{fda.question}&rdquo;
                  </p>
                  <p className="text-xs mt-2" style={{ color: 'rgba(255,180,0,0.6)' }}>{fda.note}</p>
                </div>
              </div>
            )
          })()}
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim mb-3">
            <span className="bg-surface-2 border border-border px-2 py-0.5 rounded capitalize sm:hidden">
              {gap.domain?.replace(/_/g, ' ')}
            </span>
            {gap.section_reference && (
              <span style={{ fontFamily: 'var(--font-mono)' }}>{gap.section_reference}</span>
            )}
          </div>

          {ref && (
            <div className="mt-2">
              <div className="rounded-lg p-3" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-accent" />
                  <span className="text-xs text-accent font-semibold">What good looks like</span>
                </div>
                <a
                  href={`https://www.cfsanappsexternal.fda.gov/scripts/fdcc/?set=GRASNotices&id=${ref.grn_number}`}
                  target="_blank" rel="noreferrer"
                  className="block hover:underline"
                >
                  <p className="text-xs text-text-muted font-medium leading-snug" style={{ fontFamily: 'var(--font-mono)' }}>
                    {ref.substance_name}
                  </p>
                  <p className="text-xs text-text-dim mt-0.5">
                    GRN-{ref.grn_number} - {ref.section_label || DOMAIN_SECTION_LABEL[gap.domain] || gap.domain?.replace(/_/g, ' ')}
                  </p>
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CompCard({ notice, variant }) {
  const isStrong = variant === 'strong'
  const year = notice.date_filed ? new Date(notice.date_filed).getFullYear() : '-'
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
      {notice.notifier && <p className="text-text-muted text-xs mb-3">{notice.notifier}</p>}

      <div className="flex items-center gap-3 text-xs text-text-dim">
        <span>GRN-{notice.grn_number}</span>
        <span>-</span>
        <span>{year}</span>
        {notice.production_method && (
          <>
            <span>-</span>
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

export function SignalCard({ signal }) {
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

export function DetailHeader({ title, icon: Icon, onBack }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-base transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Overview
      </button>
      <span className="text-text-dim text-sm">-</span>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-text-muted" />
        <span className="text-text-base font-semibold text-sm">{title}</span>
      </div>
    </div>
  )
}

export function OverviewCard({ icon: Icon, title, badge, preview, accentBorder, onClick, disabled }) {
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

