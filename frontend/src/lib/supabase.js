import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Auth features are silently disabled when env vars are not set (local dev without Supabase).
export const supabaseEnabled = Boolean(
  url && key && !url.includes('your-project-ref')
)

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder')
