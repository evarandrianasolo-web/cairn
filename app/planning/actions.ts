'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic, COACH_MODEL } from '@/lib/ai/anthropic'
import { buildCoachContext } from '@/lib/ai/context'
import {
  PLAN_WEEK_SCHEMA,
  PLAN_WEEK_SYSTEM,
  type ProposedWeek,
} from '@/lib/ai/plan-week-generator'
import { isoWeekStart, isoWeekNumber } from '@/lib/analytics'

/**
 * Genere une semaine du plan a partir du contexte + une cible ISO.
 * Persiste plan_weeks + planned_sessions + plan_revisions dans la
 * meme foulee. Redirige vers /planning?generated=<id>.
 *
 * Le coach voit la liste des UUIDs de courses A/B/C via le contexte,
 * il peut donc citer target_race_id. Le tenant vient de la session
 * serveur, jamais des arguments du modele.
 */
export async function generatePlanWeek(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const targetMondayIso = String(formData.get('target_monday') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetMondayIso)) {
    redirect(
      `/planning?erreur=` +
        encodeURIComponent('Semaine cible invalide.'),
    )
  }
  const monday = new Date(targetMondayIso + 'T12:00:00Z')
  const isoWeek = isoWeekNumber(monday)
  const isoYear = getIsoYear(monday)

  // Refuse si la semaine existe deja (unique constraint plan_weeks).
  const { data: existing } = await supabase
    .from('plan_weeks')
    .select('id')
    .eq('iso_year', isoYear)
    .eq('iso_week', isoWeek)
    .maybeSingle()
  if (existing) {
    redirect(
      `/planning?erreur=` +
        encodeURIComponent(`La semaine ${isoWeek} existe deja.`),
    )
  }

  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
  const cible = `du ${dateFr(monday)} au ${dateFr(sunday)} (semaine ISO ${isoWeek}/${isoYear})`

  const context = await buildCoachContext(supabase)
  const userPrompt = `## Semaine a planifier
${cible}

## Contexte
${context}

Propose une semaine coherente pour Eva. Reponds en JSON conforme au schema.`

  let parsed: ProposedWeek
  try {
    const response = await anthropic().messages.create({
      model: COACH_MODEL,
      max_tokens: 4000,
      system: PLAN_WEEK_SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: {
        format: { type: 'json_schema', schema: PLAN_WEEK_SCHEMA },
      },
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      throw new Error('Reponse sans bloc texte')
    }
    parsed = JSON.parse(text.text) as ProposedWeek
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect(
      `/planning?erreur=` +
        encodeURIComponent(`Generation impossible : ${msg}`),
    )
  }

  // Validation cote serveur : chaque session doit tomber dans la semaine.
  const validSessions = parsed.sessions.filter((s) => {
    const d = new Date(s.date + 'T12:00:00Z')
    return d >= monday && d <= sunday
  })

  const targetDistanceM = Math.round(
    validSessions.reduce((sum, s) => sum + (s.distance_km ?? 0) * 1000, 0),
  )
  const targetElevationM = validSessions.reduce(
    (sum, s) => sum + (s.elevation_m ?? 0),
    0,
  )

  const { data: planWeek, error: pwErr } = await supabase
    .from('plan_weeks')
    .insert({
      tenant_id: user.id,
      iso_year: isoYear,
      iso_week: isoWeek,
      phase: parsed.phase,
      target_race_id: parsed.target_race_id,
      target_distance_m: targetDistanceM || null,
      target_elevation_m: targetElevationM || null,
      target_sessions: validSessions.length,
      notes: parsed.notes_week,
    })
    .select('id')
    .single()
  if (pwErr) throw new Error(`insert plan_week: ${pwErr.message}`)

  if (validSessions.length > 0) {
    const rows = validSessions.map((s) => ({
      tenant_id: user.id,
      plan_week_id: planWeek.id,
      scheduled_on: s.date,
      session_type: s.session_type,
      intent: s.intent,
      target_distance_m: s.distance_km != null ? Math.round(s.distance_km * 1000) : null,
      target_elevation_m: s.elevation_m,
      target_duration_s: s.duration_min != null ? s.duration_min * 60 : null,
      is_club: s.is_club,
    }))
    const { error: psErr } = await supabase.from('planned_sessions').insert(rows)
    if (psErr) throw new Error(`insert planned_sessions: ${psErr.message}`)
  }

  // Audit : plan_revisions (CLAUDE.md § Plan -- toute modif IA journalisee).
  await supabase.from('plan_revisions').insert({
    tenant_id: user.id,
    plan_week_id: planWeek.id,
    trigger: 'demande_utilisateur',
    author: 'ai',
    summary: `Semaine ${isoWeek}/${isoYear} generee : ${validSessions.length} seance${validSessions.length > 1 ? 's' : ''}, phase ${parsed.phase}.`,
    diff: { created: parsed },
  })

  revalidatePath('/planning')
  revalidatePath('/aujourdhui')
  redirect(`/planning?generated=${planWeek.id}`)
}

/**
 * Supprime une semaine (cascade sur planned_sessions). Journalise dans
 * plan_revisions avec un trigger reverts_revision_id pointant sur la
 * derniere creation IA de cette semaine, si trouvee.
 */
export async function deletePlanWeek(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('plan_week_id') ?? '').trim()
  if (!id) throw new Error('plan_week_id manquant')

  const { data: pw } = await supabase
    .from('plan_weeks')
    .select('iso_year, iso_week')
    .eq('id', id)
    .maybeSingle()
  if (!pw) redirect('/planning')

  const { data: lastRev } = await supabase
    .from('plan_revisions')
    .select('id')
    .eq('plan_week_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // On journalise le revert AVANT le delete : plan_revisions.plan_week_id
  // devient dangling apres cascade, ce qui est admis (pas de FK not null
  // sur cette colonne).
  await supabase.from('plan_revisions').insert({
    tenant_id: user.id,
    plan_week_id: id,
    trigger: 'demande_utilisateur',
    author: 'user',
    summary: `Suppression de la semaine ${pw.iso_week}/${pw.iso_year}.`,
    diff: { deleted: true },
    reverts_revision_id: lastRev?.id ?? null,
  })

  const { error } = await supabase.from('plan_weeks').delete().eq('id', id)
  if (error) throw new Error(`delete plan_week: ${error.message}`)

  revalidatePath('/planning')
  revalidatePath('/aujourdhui')
  redirect('/planning')
}

function getIsoYear(d: Date): number {
  // L'annee ISO du lundi de la semaine ISO qui contient d.
  const monday = isoWeekStart(d)
  const jan4 = new Date(Date.UTC(monday.getUTCFullYear(), 0, 4))
  const jan4Monday = isoWeekStart(jan4)
  const jan4NextYearMonday = isoWeekStart(
    new Date(Date.UTC(monday.getUTCFullYear() + 1, 0, 4)),
  )
  if (monday.getTime() >= jan4NextYearMonday.getTime()) {
    return monday.getUTCFullYear() + 1
  }
  if (monday.getTime() < jan4Monday.getTime()) {
    return monday.getUTCFullYear() - 1
  }
  return monday.getUTCFullYear()
}

function dateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
