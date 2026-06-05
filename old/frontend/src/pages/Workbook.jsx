import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookMarked, Notebook, Clock } from 'lucide-react'
import NavBar from '../components/NavBar'
import { useAnalysis } from '../context/AnalysisContext'
import { useAuth } from '../context/AuthContext'
import { useNotes } from '../context/NotesContext'
import { supabaseEnabled } from '../lib/supabase'
import AuthModal from '../components/AuthModal'

const STATUSES = [
  { key: 'draft',      label: 'Draft',           color: '#888',    bg: 'var(--glass-6)', border: 'var(--glass-15)' },
  { key: 'in_review',  label: 'In Review',        color: '#ff9500', bg: 'rgba(255,149,0,0.08)',  border: 'rgba(255,149,0,0.35)'   },
  { key: 'ready',      label: 'Ready to Submit',  color: '#00cc6a', bg: 'rgba(0,204,106,0.08)',  border: 'rgba(0,204,106,0.35)'   },
  { key: 'submitted',  label: 'Submitted',         color: '#00b4ff', bg: 'rgba(0,180,255,0.08)',  border: 'rgba(0,180,255,0.35)'   },
]

const SECTION_META = [
  { key: 'gaps',        label: 'Identified Gaps' },
  { key: 'signals',     label: 'Safety Signals' },
  { key: 'comparables', label: 'Comparable Filings' },
  { key: 'benchmark',   label: 'Documentation Fields' },
  { key: 'nextsteps',   label: 'Recommended Next Steps' },
  { key: 'research',    label: 'Relevant Research' },
  { key: 'outline',     label: 'Amendment Outline' },
  { key: 'diff',        label: 'Filing Diff' },
]

export default function Workbook() {
  const navigate = useNavigate()
  const { result } = useAnalysis()
  const { user } = useAuth()
  const ctx = useNotes()
  const [showAuth, setShowAuth] = useState(false)
  const [generalValue, setGeneralValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const saveTimeout = useRef(null)

  const generalNote = ctx?.notes?.['general']
  const currentStatus = generalNote?.status ?? null

  useEffect(() => {
    if (generalNote?.content !== undefined) setGeneralValue(generalNote.content)
  }, [generalNote?.content])

  if (!result) { navigate('/'); return null }

  const substanceName = result.engagement_summary?.substance_name ?? 'Filing'

  async function handleStatusClick(statusKey) {
    if (!ctx || !user) return
    const newStatus = currentStatus === statusKey ? null : statusKey
    await ctx.saveNote('general', generalValue, newStatus)
  }

  function handleGeneralChange(e) {
    const val = e.target.value
    setGeneralValue(val)
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      if (!ctx || !user) return
      setSaving(true)
      await ctx.saveNote('general', val, currentStatus)
      setSaving(false)
      setSavedAt(new Date())
    }, 1200)
  }

  const sectionNotes = SECTION_META.filter(s => ctx?.notes?.[s.key]?.content)

  return (
    <>
      <div className="min-h-screen bg-bg flex flex-col">
        <NavBar />
        <main className="w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <BookMarked size={18} style={{ color: '#888' }} />
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-base)' }}>Workbook</h1>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#555', fontFamily: 'var(--font-mono)' }}>{substanceName}</p>
          </div>

          {!supabaseEnabled || !user ? (
            <div style={{ padding: '2rem', borderRadius: '0.875rem', border: '1px solid rgba(0,204,106,0.15)', background: 'rgba(0,204,106,0.03)', textAlign: 'center' }}>
              <p style={{ color: '#888', fontSize: '0.85rem', margin: '0 0 0.875rem' }}>Sign in to save notes and track your filing status.</p>
              <button
                onClick={() => setShowAuth(true)}
                style={{ padding: '0.45rem 1.25rem', borderRadius: '2rem', border: '1px solid rgba(0,204,106,0.4)', background: 'transparent', color: '#00cc6a', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
              >Sign in / Create account</button>
            </div>
          ) : (
            <>
              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {STATUSES.map(s => {
                    const active = currentStatus === s.key
                    return (
                      <button
                        key={s.key}
                        onClick={() => handleStatusClick(s.key)}
                        style={{ padding: '0.4rem 1rem', borderRadius: '2rem', border: `1px solid ${active ? s.border : 'var(--glass-10)'}`, background: active ? s.bg : 'transparent', color: active ? s.color : '#555', fontSize: '0.8rem', fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s' }}
                      >{s.label}</button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em' }}>General Notes</p>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                    {saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null}
                  </span>
                </div>
                <textarea
                  value={generalValue}
                  onChange={handleGeneralChange}
                  placeholder="Overall notes, action items, decisions, open questions…"
                  rows={8}
                  style={{ width: '100%', background: 'var(--glass-3)', border: '1px solid var(--glass-8)', borderRadius: '0.75rem', color: 'var(--color-text-base)', fontSize: '0.875rem', padding: '0.875rem 1rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }}
                  onFocus={e => e.target.style.borderColor = 'var(--glass-18)'}
                  onBlur={e => e.target.style.borderColor = 'var(--glass-8)'}
                />
              </div>

              <div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Section Notes</p>
                {sectionNotes.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
                    Open any section and click &ldquo;Add note&rdquo; to annotate it here.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {sectionNotes.map(s => (
                      <SectionNoteRow key={s.key} label={s.label} note={ctx.notes[s.key]} onClick={() => navigate(`/evaluation/${s.key}`)} />
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--glass-6)', paddingTop: '1.5rem' }}>
                <button
                  onClick={() => navigate('/history')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#444', fontSize: '0.8rem', padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#888'}
                  onMouseLeave={e => e.currentTarget.style.color = '#444'}
                >
                  <Clock size={13} /> View all past analyses
                </button>
              </div>
            </>
          )}
        </main>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

function SectionNoteRow({ label, note, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ textAlign: 'left', padding: '0.875rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--glass-7)', background: 'var(--glass-2)', cursor: 'pointer', transition: 'background 0.15s', width: '100%' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-5)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--glass-2)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
        <Notebook size={11} style={{ color: '#00cc6a', flexShrink: 0 }} />
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#00cc6a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#777', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{note.content}</p>
    </button>
  )
}

