import { createBrowserClient } from '@supabase/ssr'

/** Client navigateur. Ne porte que la clé anon : la RLS fait le reste. */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
