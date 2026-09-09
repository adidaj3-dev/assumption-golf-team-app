import { createClient } from '@supabase/supabase-js'

// These are safe to expose in frontend code — they're the public anon key,
// restricted by the Row Level Security policies defined in schema.sql.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
