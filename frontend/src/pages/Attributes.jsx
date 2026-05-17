import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Microscope, ExternalLink } from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'

function AttributeCard({ label, value }) {
  const isArray = Array.isArray(value)
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-text-dim text-xs font-semibold uppercase tracking-widest mb-2">{label}</p>
      {isArray ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map(v => (
            <span key={v} className="px-2 py-0.5 rounded-full text-xs bg-accent-pale text-accent-dark border border-green-200 font-medium">
              {v}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-text-base text-sm font-medium leading-snug">{value || '—'}</p>
      )}
    </div>
  )
}

const GRAS_BASIS_LABELS = {
  scientific_procedures: 'Scientific Procedures',
  common_use_prior_1958: 'Pre-1958 Common Use',
}

function CompCard({ notice, variant }) {
  const isStrong = variant === 'strong'
  const year = notice.date_filed ? new Date(notice.date_filed).getFullYear() : '—'
  const similarity = notice.best_distance != null
    ? `${Math.round((1 - notice.best_distance) * 100)}% match`
    : null

  return (
    <div
      className="rounded-xl border p-4 bg-surface transition-colors hover:bg-surface-2"
      style={{ borderColor: isStrong ? 'rgba(22,163,74,0.35)' : 'rgba(217,119,6,0.35)' }}
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
          {notice.source_pdf_url && (
            <a href={notice.source_pdf_url} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5 text-text-dim hover:text-accent transition-colors" />
            </a>
          )}
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

export default function Attributes() {
  const navigate = useNavigate()
  const { result } = useAnalysis()

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

  const s = result.engagement_summary
  const { approved_notices = [], withdrawn_notices = [] } = result.comparative_analysis || {}

  const attributes = [
    { label: 'Substance Name',    value: s.substance_name },
    { label: 'Notifier',          value: s.notifier },
    { label: 'Production Method', value: s.production_method?.replace(/_/g, ' ') },
    { label: 'Source Organism',   value: s.source_organism },
    { label: 'Intended Uses',     value: s.intended_uses },
    { label: 'Target Population', value: s.target_population?.replace(/_/g, ' ') },
    { label: 'Date Filed',        value: s.date_filed ? new Date(s.date_filed).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null },
    { label: 'GRAS Basis',        value: GRAS_BASIS_LABELS[s.gras_basis] || s.gras_basis },
  ]

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <NavBar />

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12">

        {/* Filing Attributes */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-text-base tracking-tight">Key Filing Attributes</h2>
            <p className="text-text-muted text-sm mt-1">Extracted from your submitted GRAS notice</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attributes.map(attr => (
              <AttributeCard key={attr.label} label={attr.label} value={attr.value} />
            ))}
          </div>
        </section>

        {/* Comparables */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-text-base tracking-tight">Comparable FDA GRAS Notices</h2>
            <p className="text-text-muted text-sm mt-1">Most similar filings from the FDA GRAS notice inventory</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold text-accent uppercase tracking-widest">Strong Comparables</h3>
              </div>
              <div className="flex flex-col gap-3">
                {approved_notices.length > 0
                  ? approved_notices.map(n => <CompCard key={n.grn_number} notice={n} variant="strong" />)
                  : <p className="text-text-dim text-sm italic">No strong comparables found.</p>
                }
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-moderate" />
                <h3 className="text-sm font-bold text-moderate uppercase tracking-widest">Cautionary Comparables</h3>
              </div>
              <div className="flex flex-col gap-3">
                {withdrawn_notices.length > 0
                  ? withdrawn_notices.map(n => <CompCard key={n.grn_number} notice={n} variant="cautionary" />)
                  : <p className="text-text-dim text-sm italic">No cautionary comparables found.</p>
                }
              </div>
            </div>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-border">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-text-muted hover:text-text-base transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => navigate('/evaluation')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-dark text-white font-semibold text-sm transition-colors"
          >
            View Full Evaluation
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </main>
    </div>
  )
}
