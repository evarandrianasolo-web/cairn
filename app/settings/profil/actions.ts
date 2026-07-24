'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseTimeToSeconds } from '@/lib/paces'

function failWith(msg: string): never {
  redirect(`/settings/profil?erreur=${encodeURIComponent(msg)}`)
}

/**
 * Met a jour les temps de reference de l'athlete. Les champs vides
 * suppriment la valeur precedente. Format d'entree accepte :
 * "hh:mm:ss", "mm:ss", ou secondes brutes.
 */
export async function updateReferenceTimes(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parseField = (field: string) => {
    const raw = String(formData.get(field) ?? '').trim()
    if (!raw) return null
    const parsed = parseTimeToSeconds(raw)
    if (parsed == null || parsed <= 0)
      failWith(`Temps invalide pour ${field}. Utilise le format hh:mm:ss.`)
    return parsed
  }

  const values = {
    ref_5km_s: parseField('ref_5km_s'),
    ref_10km_s: parseField('ref_10km_s'),
    ref_semi_s: parseField('ref_semi_s'),
    ref_marathon_s: parseField('ref_marathon_s'),
    updated_at: new Date().toISOString(),
  }

  // Verifier si une ligne athletes existe deja pour ce tenant.
  const { data: existing } = await supabase
    .from('athletes')
    .select('id')
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('athletes')
      .update(values)
      .eq('id', existing.id)
    if (error) failWith(`Enregistrement impossible : ${error.message}`)
  } else {
    // Pas encore de ligne athletes : on doit fournir un display_name
    // (NOT NULL en base). Fallback sur la partie locale de l'email.
    const fallbackName = (user.email ?? 'moi').split('@')[0]
    const { error } = await supabase.from('athletes').insert({
      tenant_id: user.id,
      display_name: fallbackName,
      ...values,
    })
    if (error) failWith(`Creation impossible : ${error.message}`)
  }

  revalidatePath('/settings/profil')
  revalidatePath('/dashboard')
  redirect('/settings/profil?ok=1')
}
