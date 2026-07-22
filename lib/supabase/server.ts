import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Client serveur, porteur de la session authentifiée.
 *
 * C'est cette session qui alimente auth.uid(), donc la RLS. Aucune clé
 * d'administration ici : une requête sans session doit échouer par défaut,
 * pas retomber sur un accès privilégié.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit
            // la session, on peut ignorer sans risque.
          }
        },
      },
    },
  )
}
