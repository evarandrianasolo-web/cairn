'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  CONSENT_POLICY_VERSION,
  CONSENT_TEXTS,
  type ConsentScope,
} from '@/lib/consent/policy'

export async function saveConsentAndImport(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const scopes: ConsentScope[] = ['fc_stockage', 'fc_analyse_ia', 'stats_anonymes']
  const now = new Date().toISOString()

  const rows = scopes.map((scope) => ({
    tenant_id: user.id,
    scope,
    granted: formData.get(scope) === 'on',
    policy_version: CONSENT_POLICY_VERSION,
    policy_text: CONSENT_TEXTS[scope],
    occurred_at: now,
  }))

  const { error } = await supabase.from('consent_records').insert(rows)
  if (error) throw new Error(`saveConsent: ${error.message}`)

  // TODO Task 5: lancer l'import initial ici et rediriger avec le compte.
  revalidatePath('/settings/strava')
  redirect('/settings/strava?consent=1')
}

export async function disconnectStrava() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pas de filtrage applicatif : la RLS ne laisse voir/toucher que les
  // lignes du tenant courant. `not('id', 'is', null)` sert juste de
  // clause universelle exigée par PostgREST pour DELETE sans WHERE.
  const { error } = await supabase.from('strava_connections').delete().not('id', 'is', null)
  if (error) throw new Error(`disconnect: ${error.message}`)

  revalidatePath('/settings/strava')
}
