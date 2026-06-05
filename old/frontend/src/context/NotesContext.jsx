import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadNotes, upsertNote } from '../lib/notes'
import { supabaseEnabled } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useAnalysis } from './AnalysisContext'

const NotesContext = createContext(null)

export function NotesProvider({ children }) {
  const { user } = useAuth()
  const { filingId } = useAnalysis()
  const [notes, setNotes] = useState({})

  useEffect(() => {
    if (!user || !filingId || !supabaseEnabled) { setNotes({}); return }
    loadNotes(user.id, filingId).then(({ data }) => {
      const map = {}
      for (const n of data) map[n.section] = n
      setNotes(map)
    })
  }, [user?.id, filingId])

  const saveNote = useCallback(async (section, content, status = undefined) => {
    if (!user || !filingId) return
    const resolvedStatus = status !== undefined ? status : (notes[section]?.status ?? null)
    const { data } = await upsertNote(user.id, filingId, section, content, resolvedStatus)
    if (data) setNotes(prev => ({ ...prev, [section]: data }))
  }, [user?.id, filingId, notes])

  return (
    <NotesContext.Provider value={{ notes, saveNote }}>
      {children}
    </NotesContext.Provider>
  )
}

export function useNotes() {
  return useContext(NotesContext)
}
