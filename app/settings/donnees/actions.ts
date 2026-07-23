'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Suppression definitive du compte -- RGPD art. 17 droit a l'oubli.
 * Cascade delete sur toutes les tables tenant via FK
 * `on delete cascade` posee sur auth.users.id. Utilise le service_role
 * cote serveur pour supprimer l'utilisateur d'auth.users (le client
 * user standard ne peut pas se supprimer lui-meme via l'API).
 *
 * Confirmation par saisie de l'email pour eviter le clic accidentel.
 */
export async function deleteMyAccount(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const confirmation = String(formData.get('email_confirmation') ?? '').trim()
  if (confirmation.toLowerCase() !== (user.email ?? '').toLowerCase()) {
    redirect(
      '/settings/donnees?erreur=' +
        encodeURIComponent(
          'Confirmation invalide : saisis exactement ton adresse e-mail pour valider la suppression.',
        ),
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    redirect(
      '/settings/donnees?erreur=' +
        encodeURIComponent(
          'Configuration serveur incomplete -- la suppression admin est indisponible.',
        ),
    )
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    redirect(
      '/settings/donnees?erreur=' +
        encodeURIComponent(`Suppression impossible : ${error.message}`),
    )
  }

  // Signout local (le compte n'existe plus mais le cookie oui).
  await supabase.auth.signOut()
  redirect('/login?deleted=1')
}
