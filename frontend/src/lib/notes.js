import { supabase } from './supabase'

export async function loadNotes(userId, filingId) {
  const { data, error } = await supabase
    .from('filing_notes')
    .select('*')
    .eq('user_id', userId)
    .eq('filing_id', filingId)
  return { data: data ?? [], error }
}

export async function upsertNote(userId, filingId, section, content, status = null) {
  const { data, error } = await supabase
    .from('filing_notes')
    .upsert(
      { user_id: userId, filing_id: filingId, section, content, status, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,filing_id,section' }
    )
    .select()
    .single()
  return { data, error }
}
