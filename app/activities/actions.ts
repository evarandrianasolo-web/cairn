'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic, COACH_MODEL } from '@/lib/ai/anthropic'
import { getValidAccessToken } from '@/lib/strava/tokens'
import { getActivityDetail } from '@/lib/strava/api'
import {
  DEBRIEF_FROM_NOTES_SYSTEM,
  DEBRIEF_SCHEMA,
  type ParsedDebrief,
} from '@/lib/ai/debrief-from-notes'
import {
  FUELING_FROM_NOTES_SYSTEM,
  FUELING_SCHEMA,
  type ParsedFueling,
} from '@/lib/ai/fueling-from-notes'
import {
  formatDistance,
  formatDplus,
  formatDuree,
  formatGoalTime,
  formatRaceDate,
} from '@/lib/format'

/**
 * Ecarte / restaure une raison d'apparition dans /activites?filter=todo.
 * Sert quand Eva ne veut pas loguer de fueling / debrief sur une seance
 * particuliere ou confirmer un candidat course. Reversible : cliquer de
 * nouveau retire la raison de la liste ecartee.
 */
const DISMISSABLE = new Set(['debrief', 'fueling', 'link'])

export async function toggleTodoDismissed(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('activity_id') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  if (!id) throw new Error('activity_id manquant')
  if (!DISMISSABLE.has(reason)) throw new Error(`reason inconnue: ${reason}`)

  const { data: current, error: readErr } = await supabase
    .from('activities')
    .select('todo_dismissed')
    .eq('id', id)
    .maybeSingle()
  if (readErr) throw new Error(`toggleTodoDismissed read: ${readErr.message}`)
  if (!current) throw new Error('activite introuvable')

  const existing = new Set<string>((current.todo_dismissed as string[]) ?? [])
  if (existing.has(reason)) {
    existing.delete(reason)
  } else {
    existing.add(reason)
  }

  const { error: upErr } = await supabase
    .from('activities')
    .update({
      todo_dismissed: Array.from(existing),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (upErr) throw new Error(`toggleTodoDismissed update: ${upErr.message}`)

  revalidatePath('/activities')
  revalidatePath(`/activities/${id}`)
}

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
 * Récupère la description Strava d'une activité (endpoint détail, 1 appel
 * API) et l'écrit dans `description` + `user_notes` si ces derniers sont
 * vides. On ne touche pas à `user_notes` si Eva a déjà commencé à noter,
 * pour ne pas ecraser son travail. Requiert la connexion Strava active.
 */
export async function pullStravaDescription(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('activity_id') ?? '').trim()
  if (!id) throw new Error('activity_id manquant')

  const { data: activity, error: readErr } = await supabase
    .from('activities')
    .select('id, strava_activity_id, description, user_notes')
    .eq('id', id)
    .maybeSingle()
  if (readErr) throw new Error(`pullStravaDescription read: ${readErr.message}`)
  if (!activity) redirect('/activities')
  if (!activity.strava_activity_id) {
    redirect(
      `/activities/${id}?erreur=` +
        encodeURIComponent('Cette activité ne vient pas de Strava.'),
    )
  }

  let detail
  try {
    const token = await getValidAccessToken(supabase)
    detail = await getActivityDetail(token, activity.strava_activity_id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect(
      `/activities/${id}?erreur=` +
        encodeURIComponent(`Récupération Strava impossible : ${msg}`),
    )
  }

  const desc = detail.description?.trim() ?? ''
  if (desc.length === 0) {
    redirect(
      `/activities/${id}?erreur=` +
        encodeURIComponent('Pas de description côté Strava sur cette activité.'),
    )
  }

  const existingNotes = (activity.user_notes ?? '').trim()
  const update: { description: string; user_notes?: string; updated_at: string } = {
    description: desc,
    updated_at: new Date().toISOString(),
  }
  if (existingNotes.length === 0) update.user_notes = desc

  const { error: upErr } = await supabase
    .from('activities')
    .update(update)
    .eq('id', id)
  if (upErr) throw new Error(`pullStravaDescription update: ${upErr.message}`)

  revalidatePath(`/activities/${id}`)
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

/**
 * Analyse les notes personnelles d'une activité liée à une course et crée
 * un débrief pré-rempli en base, puis redirige vers /debriefs?edit=<id>.
 *
 * Le débrief n'est PAS auto-sauvegardé comme définitif — Eva doit passer
 * par l'écran d'édition pour valider ou modifier avant que ça persiste au
 * sens qui compte pour elle. La ligne DB existe déjà à ce point, mais
 * l'action Annuler = suppression manuelle depuis /debriefs.
 */
export async function proposeDebriefFromActivity(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const activityId = String(formData.get('activity_id') ?? '').trim()
  if (!activityId) throw new Error('activity_id manquant')

  // 1. Charger l'activité, la course liée, un éventuel fueling log.
  const { data: activity, error: readErr } = await supabase
    .from('activities')
    .select(
      'id, name, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s, elapsed_time_s, user_notes, race_id',
    )
    .eq('id', activityId)
    .maybeSingle()
  if (readErr) throw new Error(`propose read activity: ${readErr.message}`)
  if (!activity) throw new Error('activity introuvable')
  if (!activity.race_id) {
    redirect(`/activities/${activityId}?erreur=` + encodeURIComponent(
      'Lie d\'abord cette activité à une course.',
    ))
  }
  if (!activity.user_notes || activity.user_notes.trim().length === 0) {
    redirect(`/activities/${activityId}?erreur=` + encodeURIComponent(
      'Ajoute des notes personnelles pour permettre l\'analyse.',
    ))
  }

  const [{ data: race }, { data: fueling }, { data: existing }] = await Promise.all([
    supabase
      .from('races')
      .select('id, name, race_date, location, distance_m, elevation_gain_m, goal_time_s')
      .eq('id', activity.race_id!)
      .maybeSingle(),
    supabase
      .from('fueling_logs')
      .select('intake_pattern, carbs_g_per_hour, carbs_g, products, issue, post_window_fed, notes')
      .eq('activity_id', activityId)
      .maybeSingle(),
    supabase
      .from('debriefs')
      .select('id')
      .eq('race_id', activity.race_id!)
      .maybeSingle(),
  ])

  if (existing) {
    // Un débrief existe déjà pour cette course — on l'ouvre en édition
    // plutôt que d'en créer un doublon.
    redirect(`/debriefs?edit=${existing.id}`)
  }
  if (!race) throw new Error('course liée introuvable')

  // 2. Construire le prompt utilisateur avec le contexte de la course +
  // fueling + notes brutes.
  const realTimeS = activity.elapsed_time_s ?? activity.moving_time_s
  const lines: string[] = []
  lines.push(`## Course`)
  lines.push(`- ${race.name} — ${formatRaceDate(race.race_date)}${race.location ? ` · ${race.location}` : ''}`)
  lines.push(
    `- ${formatDistance(race.distance_m)} · ${formatDplus(race.elevation_gain_m)}` +
      (race.goal_time_s != null ? ` · objectif ${formatGoalTime(race.goal_time_s)}` : ''),
  )
  if (realTimeS != null) {
    lines.push(`- Temps réel : ${formatDuree(realTimeS)}`)
  }
  lines.push('')

  if (fueling) {
    lines.push(`## Fueling loggé`)
    const parts: string[] = []
    if (fueling.carbs_g_per_hour != null) parts.push(`${fueling.carbs_g_per_hour} g/h`)
    if (fueling.carbs_g != null) parts.push(`${fueling.carbs_g} g total`)
    parts.push(`apport : ${fueling.intake_pattern}`)
    if (fueling.issue && fueling.issue !== 'aucun') parts.push(`souci : ${fueling.issue}`)
    if (fueling.post_window_fed) parts.push(`fenêtre récup ✓`)
    lines.push(`- ${parts.join(' · ')}`)
    const productsText = (fueling.products as { text?: string } | null)?.text
    if (productsText) lines.push(`- Produits : ${productsText}`)
    if (fueling.notes) lines.push(`- Notes fueling : ${fueling.notes}`)
    lines.push('')
  }

  lines.push(`## Notes brutes d'Eva`)
  lines.push(activity.user_notes!.trim())

  const userPrompt = lines.join('\n')

  // 3. Appel Anthropic avec structured outputs.
  let parsed: ParsedDebrief
  try {
    const response = await anthropic().messages.create({
      model: COACH_MODEL,
      max_tokens: 4000,
      system: DEBRIEF_FROM_NOTES_SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: {
        format: { type: 'json_schema', schema: DEBRIEF_SCHEMA },
      },
      messages: [{ role: 'user', content: userPrompt }],
    })
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Réponse sans bloc texte')
    }
    parsed = JSON.parse(textBlock.text) as ParsedDebrief
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect(
      `/activities/${activityId}?erreur=` +
        encodeURIComponent(`Analyse impossible : ${msg}`),
    )
  }

  // 4. Créer le débrief en base et rediriger vers l'édition.
  const { data: created, error: insertErr } = await supabase
    .from('debriefs')
    .insert({
      tenant_id: user.id,
      kind: 'course',
      race_id: activity.race_id!,
      narrative: parsed.narrative || null,
      what_worked: parsed.what_worked || null,
      what_failed: parsed.what_failed || null,
      focus_areas:
        Array.isArray(parsed.focus_areas) && parsed.focus_areas.length > 0
          ? parsed.focus_areas
          : null,
    })
    .select('id')
    .single()
  if (insertErr) throw new Error(`propose insert debrief: ${insertErr.message}`)

  revalidatePath('/debriefs')
  redirect(`/debriefs?edit=${created.id}`)
}

/**
 * Analyse les notes personnelles d'une activité longue pour en extraire
 * un fueling log pré-rempli. Redirige vers /fueling?edit=<id> pour
 * validation avant que ce soit considéré comme définitif par Eva.
 * Rend explicites les mêmes garde-fous que dans le formulaire manuel :
 * additif, jamais restrictif ; produits + grammes, jamais calories.
 */
export async function proposeFuelingFromActivity(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const activityId = String(formData.get('activity_id') ?? '').trim()
  if (!activityId) throw new Error('activity_id manquant')

  // 1. Charger l'activité + un éventuel log existant.
  const { data: activity, error: readErr } = await supabase
    .from('activities')
    .select(
      'id, name, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s, elapsed_time_s, user_notes',
    )
    .eq('id', activityId)
    .maybeSingle()
  if (readErr) throw new Error(`propose fueling read: ${readErr.message}`)
  if (!activity) throw new Error('activity introuvable')

  if (!activity.user_notes || activity.user_notes.trim().length === 0) {
    redirect(
      `/activities/${activityId}?erreur=` +
        encodeURIComponent(
          'Ajoute des notes personnelles pour permettre l\'analyse fueling.',
        ),
    )
  }

  const { data: existing } = await supabase
    .from('fueling_logs')
    .select('id')
    .eq('activity_id', activityId)
    .maybeSingle()

  if (existing) {
    // Un log existe déjà — on ouvre en édition plutôt que de créer un doublon.
    redirect(`/fueling?edit=${existing.id}`)
  }

  // 2. Construire le prompt utilisateur avec le contexte de l'activité + notes.
  const realTimeS = activity.elapsed_time_s ?? activity.moving_time_s
  const lines: string[] = []
  lines.push(`## Séance`)
  if (activity.name) lines.push(`- ${activity.name}`)
  lines.push(
    `- ${activity.sport_type ?? '—'} · ${formatDistance(activity.distance_m)} · ` +
      `${formatDplus(activity.elevation_gain_m)} · durée ${formatDuree(realTimeS)}`,
  )
  lines.push('')
  lines.push(`## Notes brutes d'Eva`)
  lines.push(activity.user_notes!.trim())

  const userPrompt = lines.join('\n')

  // 3. Appel Anthropic avec structured outputs.
  let parsed: ParsedFueling
  try {
    const response = await anthropic().messages.create({
      model: COACH_MODEL,
      max_tokens: 2000,
      system: FUELING_FROM_NOTES_SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: {
        format: { type: 'json_schema', schema: FUELING_SCHEMA },
      },
      messages: [{ role: 'user', content: userPrompt }],
    })
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Réponse sans bloc texte')
    }
    parsed = JSON.parse(textBlock.text) as ParsedFueling
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect(
      `/activities/${activityId}?erreur=` +
        encodeURIComponent(`Analyse fueling impossible : ${msg}`),
    )
  }

  // 4. Créer le log en base et rediriger vers l'édition.
  const productsText = parsed.products_text?.trim() ?? ''
  const products = productsText ? { text: productsText } : null

  const { data: created, error: insertErr } = await supabase
    .from('fueling_logs')
    .insert({
      tenant_id: user.id,
      activity_id: activityId,
      intake_pattern: parsed.intake_pattern,
      carbs_g:
        parsed.carbs_g != null && parsed.carbs_g >= 0
          ? Math.round(parsed.carbs_g)
          : null,
      carbs_g_per_hour:
        parsed.carbs_g_per_hour != null && parsed.carbs_g_per_hour >= 0
          ? parsed.carbs_g_per_hour
          : null,
      products,
      issue: parsed.issue,
      post_window_fed: parsed.post_window_fed,
      notes: parsed.notes?.trim() || null,
    })
    .select('id')
    .single()
  if (insertErr) throw new Error(`propose insert fueling: ${insertErr.message}`)

  revalidatePath('/fueling')
  redirect(`/fueling?edit=${created.id}`)
}
