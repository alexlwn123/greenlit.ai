import { useState, useEffect, useRef } from 'react'
import { Notebook, X, Save } from 'lucide-react'
import { useNotes } from '../context/NotesContext'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { supabaseEnabled } from '../lib/supabase'

const SECTION_LABELS = {
  gaps:        'Identified Gaps',
  signals:     'Safety Signals',
  comparables: 'Comparable Filings',
  benchmark:   'Documentation Fields',
  nextsteps:   'Recommended Next Steps',
  research:    'Relevant Research',
  outline:     'Amendment Outline',
  diff:        'Filing Diff',
}

export default function SectionNoteWidget({ sectionKey }) {
  const { user } = useAuth()
  const ctx = useNotes()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef(null)

  const note = ctx?.notes?.[sectionKey]

  const panelBg     = isDark ? '#111111' : '#ffffff'
  const panelBorder = isDark ? 'rgba(255,255,255,0.18)' : '#cccccc'
  const headerBg    = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
  const headerBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0'
  const labelColor  = isDark ? '#cccccc' : '#444444'
  const closeBtnColor = isDark ? '#888888' : '#666666'
  const textareaColor  = isDark ? '#e0e0e0' : '#111111'
  const textareaBg     = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'
  const textareaBorder = isDark ? 'rgba(255,255,255,0.18)' : '#cccccc'
  const notSignedInColor = isDark ? '#888888' : '#555555'


  useEffect(() => {
    setValue(note?.content ?? '')
  }, [note?.content])

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus()
  }, [open])

  if (!supabaseEnabled) return null

  async function handleSave() {
    if (!ctx) return
    if (value !== (note?.content ?? '')) {
      setSaving(true)
      await ctx.saveNote(sectionKey, value)
      setSaving(false)
    }
    setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 700)
  }

  const hasNote = Boolean(note?.content)

  return (
    <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
      {open && (
        <div style={{ width: '21rem', borderRadius: '0.875rem', border: `1px solid ${panelBorder}`, background: panelBg, boxShadow: '0 8px 40px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderBottom: `1px solid ${headerBorder}`, background: headerBg }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {SECTION_LABELS[sectionKey] ?? sectionKey}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: closeBtnColor, padding: '0.1rem', display: 'flex' }}>
              <X size={14} />
            </button>
          </div>
          {user ? (
            <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Notes for this section..."
                rows={5}
                style={{ width: '100%', background: textareaBg, border: `1px solid ${textareaBorder}`, borderRadius: '0.5rem', color: textareaColor, fontSize: '0.82rem', padding: '0.6rem 0.75rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor = 'rgba(0,204,106,0.5)'}
                onBlur={e => e.target.style.borderColor = textareaBorder}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave() }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.875rem', borderRadius: '2rem', border: 'none', background: saved ? '#1a3d2a' : '#00cc6a', color: saved ? '#00cc6a' : '#000', fontWeight: 700, fontSize: '0.75rem', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.15s' }}
              >
                {saved ? '✓ Saved' : saving ? 'Saving…' : <><Save size={12} /> Save</>}
              </button>
            </div>
          ) : (
            <div style={{ padding: '1rem', fontSize: '0.82rem', color: notSignedInColor, textAlign: 'center' }}>
              Sign in to add notes
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        title="Section note"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.45rem 0.875rem', borderRadius: '2rem',
          border: '1px solid var(--color-accent)',
          background: hasNote ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.07)',
          color: 'var(--color-accent)',
          fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 16px rgba(0,255,136,0.2)',
        }}
      >
        <Notebook size={13} />
        {hasNote ? 'Note' : 'Add note'}
        {hasNote && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} />}
      </button>
    </div>
  )
}