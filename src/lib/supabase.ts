import { createClient } from '@supabase/supabase-js'

/**
 * The single Supabase client instance for the whole app — docs/03_MasterPrompts.md §5.3.
 * Uses import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (client-safe,
 * never the service_role key — that only ever lives server-side in Edge Functions).
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
