'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function updateActivityNotes(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('id manquant')

  const raw = String(formData.get('user_notes') ?? '').trim()
  const userNotes = raw === '' ? null : raw

  // La RLS filtre : on ne peut modifier que ses propres activités.
  const { error } = await supabase
    .from('activities')
    .update({ user_notes: userNotes, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`updateActivityNotes: ${error.message}`)

  revalidatePath(`/activities/${id}`)
  revalidatePath('/activities')
  redirect(`/activities/${id}?ok=1`)
}

/**
 * Lie une activité à une course (ou dissocie si raceId vide).
 * Effets de bord côté course :
 *   - lien : passe status à 'terminee' et remplit result_time_s depuis
 *            l'activité (elapsed prioritaire, sinon moving).
 *   - unlink : remet status à 'envisagee' et vide result_time_s.
 * Ces effets sont volontairement simples pour V1 — un vrai coach P2
 * pourrait vouloir garder l'historique de résultats.
 */
export async function linkActivityToRace(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const activityId = String(formData.get('activity_id') ?? '').trim()
  const raceIdRaw = String(formData.get('race_id') ?? '').trim()
  const raceId = raceIdRaw === '' ? null : raceIdRaw
  if (!activityId) throw new Error('activity_id manquant')

  // Récupère l'activité (pour les temps) + l'ancienne liaison éventuelle.
  const { data: activity, error: readErr } = await supabase
    .from('activities')
    .select('id, race_id, elapsed_time_s, moving_time_s')
    .eq('id', activityId)
    .maybeSingle()
  if (readErr) throw new Error(`linkActivityToRace read: ${readErr.message}`)
  if (!activity) throw new Error('activity introuvable')

  const previousRaceId = activity.race_id as string | null
  const resultTimeS = activity.elapsed_time_s ?? activity.moving_time_s ?? null

  // 1. Met à jour la liaison sur l'activité.
  const { error: linkErr } = await supabase
    .from('activities')
    .update({ race_id: raceId, updated_at: new Date().toISOString() })
    .eq('id', activityId)
  if (linkErr) throw new Error(`linkActivityToRace update: ${linkErr.message}`)

  // 2. Effets sur l'ancienne course (si elle était liée à cette activité, on nettoie).
  if (previousRaceId && previousRaceId !== raceId) {
    await supabase
      .from('races')
      .update({
        result_time_s: null,
        status: 'envisagee',
        updated_at: new Date().toISOString(),
      })
      .eq('id', previousRaceId)
  }

  // 3. Effets sur la nouvelle course (temps réel + statut).
  if (raceId) {
    await supabase
      .from('races')
      .update({
        result_time_s: resultTimeS,
        status: 'terminee',
        updated_at: new Date().toISOString(),
      })
      .eq('id', raceId)
  }

  revalidatePath(`/activities/${activityId}`)
  revalidatePath('/activities')
  revalidatePath('/courses')
  revalidatePath('/aujourdhui')
  redirect(`/activities/${activityId}?linked=1`)
}
