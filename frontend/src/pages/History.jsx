import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, ChevronRight, Microscope, Loader2 } from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAuth } from '../context/AuthContext'
import { useAnalysis } from '../context/AnalysisContext'
import { supabase, supabaseEnabled } from '../lib/supabase'
import { healthScoreColor } from '../lib/evaluationHelpers'
import AuthModal from '../components/AuthModal'

const STATUS_LABELS = {
  draft:      { label: 'Draft',           color: '#888' },
  in_review:  { label: 'In Review',       color: '#ff9500' },
  ready:      { label: 'Ready to Submit', color: '#00cc6a' },
  submitted:  { label: 'Submitted',       color: '#00b4ff' },
}

export default function History() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { loadSaved } = useAnalysis()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(null)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    if (!user || !supabaseEnabled) return
    setLoading(true)
    supabase
      .from('analyses')
      .select('id, substance_name, health_score, filing_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setAnalyses(data ?? []); setLoading(false) })
  }, [user?.id])

  async function handleOpen(analysis) {
    setOpening(analysis.id)
    const { data } = await supabase
      .from('analyses')
      .select('result_json, filing_id')
      .eq('id', analysis.id)
      .single()
    if (data) {
      loadSaved(data)
      navigate('/evaluation')
    }
    setOpening(null)
  }

  return (
    <>
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Clock size={18} style={{ color: '#888' }} />
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f0f0f0' }}>Your Analyses</h1>
          </div>

          {!supabaseEnabled || !user ? (
            <div style={{ padding: '2rem', borderRadius: '0.875rem', border: '1px solid rgba(0,204,106,0.15)', background: 'rgba(0,204,106,0.03)', textAlign: 'center' }}>
              <p style={{ color: '#888', fontSize: '0.85rem', margin: '0 0 0.875rem' }}>Sign in to view your saved analyses.</p>
              <button
                onClick={() => setShowAuth(true)}
                style={{ padding: '0.45rem 1.25rem', borderRadius: '2rem', border: '1px solid rgba(0,204,106,0.4)', background: 'transparent', color: '#00cc6a', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
              >Sign in / Create account</button>
            </div>
          ) : loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#555', fontSize: '0.85rem' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : analyses.length === 0 ? (
            <div style={{ padding: '3rem 2rem', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', textAlign: 'center' }}>
              <Microscope size={32} style={{ color: '#333', margin: '0 auto 0.875rem' }} />
              <p style={{ color: '#555', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>No saved analyses yet.</p>
              <p style={{ color: '#3a3a3a', fontSize: '0.78rem', margin: 0 }}>Submit a filing and click &ldquo;Save analysis&rdquo; to track it here.</p>
              <button
                onClick={() => navigate('/')}
                style={{ marginTop: '1.25rem', padding: '0.45rem 1.25rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#888', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
              >Submit a filing</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {analyses.map(a => (
                <AnalysisRow
                  key={a.id}
                  analysis={a}
                  opening={opening === a.id}
                  onOpen={() => handleOpen(a)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

function AnalysisRow({ analysis, opening, onOpen }) {
  const score = analysis.health_score
  const scoreCol = score != null ? healthScoreColor(score) : '#555'
  const date = new Date(analysis.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <button
      onClick={onOpen}
      disabled={opening}
      style={{
        textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1rem 1.125rem', borderRadius: '0.875rem',
        border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)',
        cursor: opening ? 'default' : 'pointer', transition: 'background 0.15s', opacity: opening ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!opening) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
    >
      {score != null && (
        <div style={{ flexShrink: 0, width: '2.75rem', height: '2.75rem', borderRadius: '50%', border: `2px solid ${scoreCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${scoreCol}14` }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: scoreCol }}>{Math.round(score)}</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 0.2rem', fontWeight: 600, color: '#e0e0e0', fontSize: '0.9rem', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {analysis.substance_name ?? 'Untitled'}
        </p>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#555' }}>{date}</p>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {opening
          ? <Loader2 size={14} style={{ color: '#555' }} className="animate-spin" />
          : <ChevronRight size={16} style={{ color: '#444' }} />
        }
      </div>
    </button>
  )
}
