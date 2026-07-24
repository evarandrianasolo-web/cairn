'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic, COACH_MODEL } from '@/lib/ai/anthropic'
import { buildCoachContext } from '@/lib/ai/context'
import {
  buildBibliothequeBlock,
  PLAN_WEEK_SCHEMA,
  PLAN_WEEK_SYSTEM,
  type ProposedWeek,
} from '@/lib/ai/plan-week-generator'
import { isoWeekStart, isoWeekNumber, isoWeekMonday } from '@/lib/analytics'
import { phaseFor, PHASE_INTENT } from '@/lib/periodization'
import { logAnthropicCall } from '@/lib/ai/metering'

const DAY_MS = 24 * 60 * 60 * 1000

type ConstraintForPlan = {
  label: string
  type: string | null
  impact: string
  focus: string | null
  recurrence_rule: string | null
  starts_on: string | null
  ends_on: string | null
  notes: string | null
}

const IMPACT_UPPER: Record<string, string> = {
  bloque: 'BLOQUE',
  allege: 'ALLEGE',
  decale: 'DECALE',
  oriente: 'ORIENTE',
}

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
  const requestedCount = Math.max(
    1,
    Math.min(3, parseInt(String(formData.get('weeks_count') ?? '1'), 10) || 1),
  )
  const firstMonday = new Date(targetMondayIso + 'T12:00:00Z')
  const userHint = String(formData.get('user_hint') ?? '').trim()

  let generated = 0
  let skipped = 0
  const errors: string[] = []
  let firstGeneratedId: string | null = null

  for (let i = 0; i < requestedCount; i++) {
    const monday = new Date(firstMonday.getTime() + i * 7 * DAY_MS)
    const mondayIso = monday.toISOString().slice(0, 10)
    try {
      const result = await generateOneWeek(supabase, user.id, monday, mondayIso, userHint)
      if (result === 'exists') {
        skipped++
      } else {
        generated++
        if (!firstGeneratedId) firstGeneratedId = result
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`S${isoWeekNumber(monday)} : ${msg}`)
    }
  }

  revalidatePath('/planning')
  revalidatePath('/aujourdhui')

  if (errors.length > 0) {
    redirect(
      `/planning?erreur=` +
        encodeURIComponent(`${generated} generees, ${errors.length} erreurs : ${errors.join(' ; ')}`),
    )
  }
  if (generated === 0 && skipped > 0) {
    redirect(
      `/planning?erreur=` +
        encodeURIComponent(`Toutes les ${skipped} semaines cibles existaient deja.`),
    )
  }
  redirect(`/planning?generated=${generated}`)
}

/**
 * Genere UNE semaine. Retourne l'id de la plan_week creee, ou 'exists'
 * si la semaine cible existait deja.
 */
async function generateOneWeek(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tenantId: string,
  monday: Date,
  targetMondayIso: string,
  userHint: string,
): Promise<string | 'exists'> {
  const isoWeek = isoWeekNumber(monday)
  const isoYear = getIsoYear(monday)

  const { data: existing } = await supabase
    .from('plan_weeks')
    .select('id')
    .eq('iso_year', isoYear)
    .eq('iso_week', isoWeek)
    .maybeSingle()
  if (existing) return 'exists'

  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  const cible = `du ${dateFr(monday)} au ${dateFr(sunday)} (semaine ISO ${isoWeek}/${isoYear})`
  const sundayIso = sunday.toISOString().slice(0, 10)
  const constraintsBlock = await buildTargetWeekConstraintsBlock(
    supabase,
    targetMondayIso,
    sundayIso,
  )
  const periodizationBlock = await buildPeriodizationBlock(supabase, targetMondayIso)
  const activeAxesBlock = await buildActiveAxesBlock(supabase)
  const bibliothequeBlock = await buildBibliothequeBlock(supabase)
  const context = await buildCoachContext(supabase)
  const hintBlock = userHint
    ? `\n## Notes d'Eva pour cette semaine\n${userHint}\n\nCes notes sont des consignes explicites : respecte-les tant qu'elles ne contredisent pas les regles non negociables.\n`
    : ''
  const userPrompt = `## Semaine a planifier
${cible}
${activeAxesBlock}${periodizationBlock}${constraintsBlock}${bibliothequeBlock}${hintBlock}
## Contexte general
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
    await logAnthropicCall(supabase, tenantId, 'plan-generate', COACH_MODEL, response.usage, {
      iso_year: isoYear,
      iso_week: isoWeek,
    })
    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      throw new Error('Reponse sans bloc texte')
    }
    parsed = JSON.parse(text.text) as ProposedWeek
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Generation impossible : ${msg}`)
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
      tenant_id: tenantId,
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
      tenant_id: tenantId,
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
    tenant_id: tenantId,
    plan_week_id: planWeek.id,
    trigger: 'demande_utilisateur',
    author: 'ai',
    summary: `Semaine ${isoWeek}/${isoYear} generee : ${validSessions.length} seance${validSessions.length > 1 ? 's' : ''}, phase ${parsed.phase}.`,
    diff: { created: parsed },
  })

  return planWeek.id
}

/**
 * Reajuste une semaine en cours : garde les jours passes (deja realises
 * ou manques), remplace les jours restants (aujourd'hui inclus) par une
 * nouvelle proposition. Le coach voit ce qui a ete fait dans la semaine
 * jusqu'a today, ce qui reste a planifier, et re-tient compte des
 * contraintes.
 */
export async function readjustPlanWeek(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const planWeekId = String(formData.get('plan_week_id') ?? '').trim()
  if (!planWeekId) throw new Error('plan_week_id manquant')
  const userHint = String(formData.get('user_hint') ?? '').trim()

  const { data: pw, error: pwErr } = await supabase
    .from('plan_weeks')
    .select('id, iso_year, iso_week, phase, target_race_id, notes')
    .eq('id', planWeekId)
    .maybeSingle()
  if (pwErr) throw new Error(`readjust read plan_week: ${pwErr.message}`)
  if (!pw) redirect('/planning')

  const monday = isoWeekMonday(pw.iso_year, pw.iso_week)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  const mondayIso = monday.toISOString().slice(0, 10)
  const sundayIso = sunday.toISOString().slice(0, 10)
  const todayIso = new Date().toISOString().slice(0, 10)

  if (todayIso > sundayIso) {
    redirect(
      `/planning?erreur=` +
        encodeURIComponent(
          'Cette semaine est deja terminee. Genere plutot les semaines a venir.',
        ),
    )
  }

  const [{ data: existingSessions }, { data: activities }] = await Promise.all([
    supabase
      .from('planned_sessions')
      .select(
        'id, scheduled_on, session_type, intent, target_duration_s, target_distance_m, target_elevation_m, is_club',
      )
      .eq('plan_week_id', planWeekId)
      .order('scheduled_on', { ascending: true }),
    supabase
      .from('activities')
      .select('name, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s')
      .gte('started_at', mondayIso)
      .lte('started_at', new Date(sunday.getTime() + DAY_MS).toISOString().slice(0, 10))
      .order('started_at', { ascending: true }),
  ])

  const sessionsPast = (existingSessions ?? []).filter((s) => s.scheduled_on < todayIso)
  const sessionsFuture = (existingSessions ?? []).filter((s) => s.scheduled_on >= todayIso)

  type WeekAct = NonNullable<typeof activities>[number]
  const activitiesByDate = new Map<string, WeekAct[]>()
  for (const a of activities ?? []) {
    const key = a.started_at.slice(0, 10)
    const list = activitiesByDate.get(key) ?? []
    list.push(a)
    activitiesByDate.set(key, list)
  }

  const doneLines: string[] = []
  for (const s of sessionsPast) {
    const acts = activitiesByDate.get(s.scheduled_on) ?? []
    const doneStr =
      acts.length === 0
        ? 'MANQUEE (aucune activite ce jour)'
        : acts
            .map(
              (a) =>
                `${a.name ?? a.sport_type ?? '—'} · ${a.distance_m ? Math.round(a.distance_m / 100) / 10 + ' km' : '—'} · ${a.moving_time_s ? Math.round(a.moving_time_s / 60) + ' min' : '—'}`,
            )
            .join(' + ')
    doneLines.push(
      `- ${s.scheduled_on} · plan : ${s.session_type}${s.is_club ? ' (club)' : ''} — ${s.intent ?? '—'} → ${doneStr}`,
    )
  }
  // Activites du week-end passe qui n'ont pas de planned_session : les
  // signaler aussi pour la lecture de charge.
  for (const [dateIso, acts] of activitiesByDate.entries()) {
    if (dateIso >= todayIso) continue
    const hasPlanned = sessionsPast.some((s) => s.scheduled_on === dateIso)
    if (hasPlanned) continue
    for (const a of acts) {
      doneLines.push(
        `- ${dateIso} · hors plan : ${a.name ?? a.sport_type ?? '—'} · ${a.distance_m ? Math.round(a.distance_m / 100) / 10 + ' km' : '—'} · ${a.moving_time_s ? Math.round(a.moving_time_s / 60) + ' min' : '—'}`,
      )
    }
  }

  const remainingDays: string[] = []
  for (
    let d = new Date(Math.max(monday.getTime(), new Date(todayIso + 'T12:00:00Z').getTime()));
    d.getTime() <= sunday.getTime();
    d = new Date(d.getTime() + DAY_MS)
  ) {
    remainingDays.push(d.toISOString().slice(0, 10))
  }

  const constraintsBlock = await buildTargetWeekConstraintsBlock(
    supabase,
    mondayIso,
    sundayIso,
  )
  const periodizationBlock = await buildPeriodizationBlock(supabase, mondayIso)
  const activeAxesBlock = await buildActiveAxesBlock(supabase)
  const bibliothequeBlock = await buildBibliothequeBlock(supabase)
  const context = await buildCoachContext(supabase)
  const hintBlock = userHint
    ? `\n## Notes d'Eva pour ce reajustement\n${userHint}\n\nConsignes explicites : respecte-les tant qu'elles ne contredisent pas les regles non negociables.\n`
    : ''

  const userPrompt = `## Semaine en cours a reajuster
Semaine ISO ${pw.iso_week}/${pw.iso_year} · du ${mondayIso} au ${sundayIso} · aujourd'hui = ${todayIso}
Phase actuelle : ${pw.phase}
${activeAxesBlock}${periodizationBlock}${constraintsBlock}${bibliothequeBlock}${hintBlock}
## Ce qui a ete fait ou manque jusqu'a aujourd'hui
${doneLines.length > 0 ? doneLines.join('\n') : 'Rien de particulier.'}

## Jours restants a planifier (aujourd'hui inclus)
${remainingDays.join(', ')}

## Contexte general
${context}

Propose une adaptation de la semaine. Contraintes de format :
- Chaque session dans le JSON DOIT avoir une date parmi les jours restants listes ci-dessus.
- Ne repropose PAS de session pour les dates passees, elles sont figees.
- Tiens compte de la charge deja effectuee, des seances manquees, et des activites hors plan.
Reponds en JSON conforme au schema.`

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
    await logAnthropicCall(supabase, user.id, 'plan-readjust', COACH_MODEL, response.usage, {
      plan_week_id: planWeekId,
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
        encodeURIComponent(`Reajustement impossible : ${msg}`),
    )
  }

  // On ne garde que les sessions dans la fenetre restante.
  const newFutureSessions = parsed.sessions.filter(
    (s) => s.date >= todayIso && s.date <= sundayIso,
  )

  // Supprimer les planned_sessions futures existantes, inserer les
  // nouvelles. Les passees restent intactes.
  const futureIds = sessionsFuture.map((s) => s.id)
  if (futureIds.length > 0) {
    const { error: delErr } = await supabase
      .from('planned_sessions')
      .delete()
      .in('id', futureIds)
    if (delErr) throw new Error(`delete future sessions: ${delErr.message}`)
  }
  if (newFutureSessions.length > 0) {
    const rows = newFutureSessions.map((s) => ({
      tenant_id: user.id,
      plan_week_id: planWeekId,
      scheduled_on: s.date,
      session_type: s.session_type,
      intent: s.intent,
      target_distance_m: s.distance_km != null ? Math.round(s.distance_km * 1000) : null,
      target_elevation_m: s.elevation_m,
      target_duration_s: s.duration_min != null ? s.duration_min * 60 : null,
      is_club: s.is_club,
    }))
    const { error: insErr } = await supabase.from('planned_sessions').insert(rows)
    if (insErr) throw new Error(`insert future sessions: ${insErr.message}`)
  }

  // Recalcul des cibles de la semaine (passees + nouvelles futures).
  const allSessions = [
    ...sessionsPast.map((s) => ({
      distance_m: s.target_distance_m,
      elevation_m: s.target_elevation_m,
    })),
    ...newFutureSessions.map((s) => ({
      distance_m: s.distance_km != null ? Math.round(s.distance_km * 1000) : null,
      elevation_m: s.elevation_m,
    })),
  ]
  const targetDistanceM = allSessions.reduce((sum, s) => sum + (s.distance_m ?? 0), 0)
  const targetElevationM = allSessions.reduce(
    (sum, s) => sum + (s.elevation_m ?? 0),
    0,
  )

  await supabase
    .from('plan_weeks')
    .update({
      phase: parsed.phase,
      notes: parsed.notes_week,
      target_sessions: allSessions.length,
      target_distance_m: targetDistanceM || null,
      target_elevation_m: targetElevationM || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planWeekId)

  await supabase.from('plan_revisions').insert({
    tenant_id: user.id,
    plan_week_id: planWeekId,
    trigger: 'demande_utilisateur',
    author: 'ai',
    summary: `Reajustement de la semaine ${pw.iso_week}/${pw.iso_year} le ${todayIso} : ${sessionsPast.length} seance${sessionsPast.length > 1 ? 's' : ''} passee${sessionsPast.length > 1 ? 's' : ''} conservee${sessionsPast.length > 1 ? 's' : ''}, ${newFutureSessions.length} nouvelle${newFutureSessions.length > 1 ? 's' : ''} a venir.`,
    diff: {
      readjusted_at: todayIso,
      kept_past_count: sessionsPast.length,
      removed_future: sessionsFuture,
      inserted_future: parsed,
      user_hint: userHint || null,
    },
  })

  revalidatePath('/planning')
  revalidatePath('/aujourdhui')
  redirect(`/planning?readjusted=${planWeekId}`)
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

/**
 * Bloc axes actifs : extrait les focus_areas du dernier debrief pour
 * les mettre en avant separement du contexte general. Les axes portent
 * l'apprentissage de la course precedente et doivent orienter chaque
 * generation -- sans quoi les debriefs restent des ecritures mortes.
 * Le coach est explicitement invite a citer les axes travailles dans
 * notes_week ou dans les intents des seances.
 */
async function buildActiveAxesBlock(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<string> {
  const { data } = await supabase
    .from('debriefs')
    .select('focus_areas, race:races(name), period_start')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return ''
  const raw = (data as { focus_areas?: unknown }).focus_areas
  const axes = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []
  if (axes.length === 0) return ''
  const rawRace = (data as unknown as { race?: { name: string } | { name: string }[] | null }).race
  const race = Array.isArray(rawRace) ? rawRace[0] ?? null : rawRace
  const period = (data as unknown as { period_start?: string | null }).period_start
  const source = race?.name ?? (period ? `bloc ${period}` : 'dernier debrief')

  const lines: string[] = []
  lines.push(`## Axes actifs du dernier debrief (${source})`)
  axes.slice(0, 5).forEach((axis, i) => {
    lines.push(`${i + 1}. ${axis}${i === 0 ? ' — PRIORITE' : ''}`)
  })
  lines.push('')
  lines.push(
    `Ces axes portent ce qu'Eva doit travailler. AU MOINS UNE seance de la semaine doit adresser l'axe 1 (priorite). Cite explicitement dans notes_week quels axes tu travailles cette semaine.`,
  )
  lines.push('')
  return lines.join('\n') + '\n'
}

/**
 * Bloc periodisation : rappelle au coach la phase attendue pour la
 * semaine cible en fonction de la course A a venir. Complete le contexte
 * general en donnant une intention haute sans dicter le contenu -- le
 * coach reste libre de sortir de la phase si les contraintes le justifient.
 */
async function buildPeriodizationBlock(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  mondayIso: string,
): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10)
  const { data: raceA } = await supabase
    .from('races')
    .select('name, race_date')
    .eq('priority', 'A')
    .gte('race_date', todayIso)
    .order('race_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!raceA) return ''

  const phase = phaseFor(mondayIso, raceA.race_date)
  const raceDate = new Date(raceA.race_date + 'T12:00:00Z').getTime()
  const monday = new Date(mondayIso + 'T12:00:00Z').getTime()
  const daysUntilRace = Math.round((raceDate - monday) / (24 * 60 * 60 * 1000))
  const intent = PHASE_INTENT[phase]

  return `\n## Periodisation retroplan
Course A : ${raceA.name} (${raceA.race_date}), soit ${daysUntilRace >= 0 ? `J-${daysUntilRace}` : `J+${-daysUntilRace}`} depuis le debut de cette semaine.
Phase attendue : ${phase} -- ${intent}.

Utilise cette phase comme intention haute. Tu peux en devier si les contraintes ou notes d'Eva l'exigent, mais alors mentionne-le explicitement dans notes_week.\n`
}

/**
 * Bloc dedie aux contraintes qui touchent la semaine cible. Distinct du
 * resume general du contexte pour deux raisons :
 * - focus verbatim mis en avant, avec un rappel qu'il est prioritaire ;
 * - alerte explicite quand la recurrence est ambigue (INTERVAL > 1 sans
 *   starts_on), pour que le coach ne suppose PAS que la contrainte ne
 *   s'applique pas -- il doit demander a Eva de trancher via le champ
 *   notes, ou par defaut respecter la contrainte pour la semaine cible.
 */
async function buildTargetWeekConstraintsBlock(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  mondayIso: string,
  sundayIso: string,
): Promise<string> {
  const { data } = await supabase
    .from('constraints')
    .select(
      'label, type, impact, focus, recurrence_rule, starts_on, ends_on, notes',
    )
    .or(
      // Recurrentes non expirees
      `and(recurrence_rule.not.is.null,or(starts_on.is.null,starts_on.lte.${sundayIso}),or(ends_on.is.null,ends_on.gte.${mondayIso})),` +
        // Ponctuelles qui recoupent la fenetre
        `and(recurrence_rule.is.null,starts_on.lte.${sundayIso},or(ends_on.is.null,ends_on.gte.${mondayIso}))`,
    )
  const rows = (data ?? []) as ConstraintForPlan[]
  if (rows.length === 0) return ''

  const lines: string[] = []
  lines.push(`## Contraintes qui touchent la semaine cible`)
  for (const c of rows) {
    const impact = IMPACT_UPPER[c.impact] ?? c.impact
    const cadenceInfo = describeCadenceForWindow(c, mondayIso, sundayIso)
    const focusPart = c.focus ? ` — focus verbatim : « ${c.focus} »` : ''
    const typePart = c.type ? ` [${c.type}]` : ''
    lines.push(`- « ${c.label} »${typePart} (${impact}, ${cadenceInfo})${focusPart}`)
    if (c.notes) lines.push(`  note : ${c.notes}`)
  }
  lines.push('')
  lines.push(
    `RESPECT ABSOLU du focus verbatim de chaque contrainte ci-dessus. Si tu ne peux pas concilier deux contraintes, privilegie la plus restrictive et mets une note dans notes_week.`,
  )
  lines.push('')
  return lines.join('\n') + '\n'
}

function describeCadenceForWindow(
  c: ConstraintForPlan,
  mondayIso: string,
  sundayIso: string,
): string {
  if (!c.recurrence_rule) {
    if (c.starts_on && c.ends_on)
      return `ponctuel ${c.starts_on} → ${c.ends_on}`
    if (c.starts_on) return `ponctuel depuis ${c.starts_on}`
    return 'ponctuel'
  }
  const parts = Object.fromEntries(
    c.recurrence_rule
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  )
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
  const byday = parts.BYDAY
  const freq = parts.FREQ

  const daysHuman = byday
    ? byday
        .split(',')
        .map((d) => {
          const m: Record<string, string> = {
            MO: 'lundi',
            TU: 'mardi',
            WE: 'mercredi',
            TH: 'jeudi',
            FR: 'vendredi',
            SA: 'samedi',
            SU: 'dimanche',
          }
          return m[d] ?? d
        })
        .join(' + ')
    : ''

  if (freq === 'WEEKLY' && interval === 1) {
    return daysHuman ? `chaque ${daysHuman}` : `chaque semaine`
  }
  if (freq === 'WEEKLY' && interval > 1) {
    const base = daysHuman
      ? `${daysHuman} une semaine sur ${interval}`
      : `une semaine sur ${interval}`
    if (!c.starts_on) {
      return `${base} — ATTENTION : sans ancrage starts_on, l'alternance n'est pas calculable ; considere que la contrainte S'APPLIQUE cette semaine (semaine cible du ${mondayIso}) sauf indication contraire dans les notes d'Eva`
    }
    // Ancre : on peut calculer.
    const anchor = new Date(c.starts_on + 'T12:00:00Z')
    const target = new Date(mondayIso + 'T12:00:00Z')
    const weeksSinceAnchor = Math.floor(
      (target.getTime() - anchor.getTime()) / (7 * DAY_MS),
    )
    const applies = weeksSinceAnchor >= 0 && weeksSinceAnchor % interval === 0
    return `${base} (ancree au ${c.starts_on}) — cette semaine cible : ${applies ? 'S\'APPLIQUE' : 'ne s\'applique PAS'}`
  }
  if (freq === 'MONTHLY') {
    return interval === 1 ? 'chaque mois' : `tous les ${interval} mois`
  }
  return c.recurrence_rule
}
