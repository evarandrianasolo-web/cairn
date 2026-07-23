'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  WEEKDAY_CODES,
  type WeekdayCode,
  buildMonthlyRRule,
  buildWeeklyRRule,
} from '@/lib/format'

type Kind = 'recurrente' | 'ponctuelle'
type ConstraintType =
  | 'garde'
  | 'club'
  | 'deplacement'
  | 'vacances'
  | 'meteo'
  | 'blessure'
  | 'travail'
  | 'autre'
type Impact = 'bloque' | 'allege' | 'decale' | 'oriente'

const KINDS: readonly Kind[] = ['recurrente', 'ponctuelle']
const TYPES: readonly ConstraintType[] = [
  'garde',
  'club',
  'deplacement',
  'vacances',
  'meteo',
  'blessure',
  'travail',
  'autre',
]
const IMPACTS: readonly Impact[] = ['bloque', 'allege', 'decale', 'oriente']

function pickEnum<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = typeof raw === 'string' ? raw : ''
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

/** Redirige vers /contraintes avec un message affiché dans le formulaire. */
function failWith(message: string): never {
  redirect(`/contraintes?erreur=${encodeURIComponent(message)}`)
}

export async function addConstraint(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const label = String(formData.get('label') ?? '').trim()
  if (!label) failWith('Le libellé est requis.')

  const kind = pickEnum<Kind>(formData.get('kind'), KINDS, 'recurrente')
  const type = pickEnum<ConstraintType>(formData.get('type'), TYPES, 'autre')
  const impact = pickEnum<Impact>(formData.get('impact'), IMPACTS, 'bloque')
  const notes = String(formData.get('notes') ?? '').trim() || null
  const focus = String(formData.get('focus') ?? '').trim() || null

  let recurrenceRule: string | null = null
  let startsOn: string | null = null
  let endsOn: string | null = null

  if (kind === 'recurrente') {
    const freq = String(formData.get('frequency') ?? 'weekly-1')
    const days = WEEKDAY_CODES.filter((d) => formData.get(`day_${d}`) === 'on') as WeekdayCode[]

    if (freq === 'weekly-1') {
      recurrenceRule = buildWeeklyRRule(days, 1)
      if (!recurrenceRule) failWith('Coche au moins un jour de la semaine.')
    } else if (freq === 'weekly-N') {
      const interval = Number.parseInt(String(formData.get('interval') ?? '2'), 10)
      if (!Number.isFinite(interval) || interval < 2 || interval > 12) {
        failWith("L'intervalle doit être entre 2 et 12 semaines.")
      }
      recurrenceRule = buildWeeklyRRule(days, interval)
      if (!recurrenceRule) failWith('Coche au moins un jour de la semaine.')
      const anchor = String(formData.get('anchor_date') ?? '').trim()
      if (!anchor) {
        failWith(
          "Date d'ancrage requise pour une récurrence intervalle > 1 (sans quoi l'alternance n'est pas calculable).",
        )
      }
      startsOn = anchor
    } else if (freq === 'monthly') {
      const dom = Number.parseInt(String(formData.get('day_of_month') ?? ''), 10)
      recurrenceRule = buildMonthlyRRule(dom)
      if (!recurrenceRule) failWith('Choisis un jour du mois entre 1 et 31.')
    } else if (freq === 'custom') {
      const raw = String(formData.get('custom_rrule') ?? '').trim()
      if (!raw || !/FREQ=/.test(raw)) {
        failWith('RRULE personnalisée invalide — elle doit contenir FREQ=…')
      }
      recurrenceRule = raw
    } else {
      failWith(`Fréquence inconnue : ${freq}`)
    }
  } else {
    startsOn = String(formData.get('starts_on') ?? '').trim() || null
    endsOn = String(formData.get('ends_on') ?? '').trim() || null
    if (!startsOn) failWith('Date de début requise pour une contrainte ponctuelle.')
    if (endsOn && endsOn < startsOn!) failWith('La date de fin doit être après le début.')
  }

  const { error } = await supabase.from('constraints').insert({
    tenant_id: user.id,
    label,
    kind,
    type,
    impact,
    recurrence_rule: recurrenceRule,
    starts_on: startsOn,
    ends_on: endsOn,
    notes,
    focus,
  })
  if (error) failWith(`Enregistrement impossible : ${error.message}`)

  revalidatePath('/contraintes')
  revalidatePath('/aujourdhui')
  redirect('/contraintes?ok=1')
}

export async function updateConstraint(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) failWith('id manquant')

  const label = String(formData.get('label') ?? '').trim()
  if (!label) failWith('Le libellé est requis.')

  const kind = pickEnum<Kind>(formData.get('kind'), KINDS, 'recurrente')
  const type = pickEnum<ConstraintType>(formData.get('type'), TYPES, 'autre')
  const impact = pickEnum<Impact>(formData.get('impact'), IMPACTS, 'bloque')
  const notes = String(formData.get('notes') ?? '').trim() || null
  const focus = String(formData.get('focus') ?? '').trim() || null

  let recurrenceRule: string | null = null
  let startsOn: string | null = null
  let endsOn: string | null = null

  if (kind === 'recurrente') {
    const freq = String(formData.get('frequency') ?? 'weekly-1')
    const days = WEEKDAY_CODES.filter((d) => formData.get(`day_${d}`) === 'on') as WeekdayCode[]

    if (freq === 'weekly-1') {
      recurrenceRule = buildWeeklyRRule(days, 1)
      if (!recurrenceRule) failWith('Coche au moins un jour de la semaine.')
    } else if (freq === 'weekly-N') {
      const interval = Number.parseInt(String(formData.get('interval') ?? '2'), 10)
      if (!Number.isFinite(interval) || interval < 2 || interval > 12) {
        failWith("L'intervalle doit être entre 2 et 12 semaines.")
      }
      recurrenceRule = buildWeeklyRRule(days, interval)
      if (!recurrenceRule) failWith('Coche au moins un jour de la semaine.')
      const anchor = String(formData.get('anchor_date') ?? '').trim()
      if (!anchor) {
        failWith(
          "Date d'ancrage requise pour une récurrence intervalle > 1 (sans quoi l'alternance n'est pas calculable).",
        )
      }
      startsOn = anchor
    } else if (freq === 'monthly') {
      const dom = Number.parseInt(String(formData.get('day_of_month') ?? ''), 10)
      recurrenceRule = buildMonthlyRRule(dom)
      if (!recurrenceRule) failWith('Choisis un jour du mois entre 1 et 31.')
    } else if (freq === 'custom') {
      const raw = String(formData.get('custom_rrule') ?? '').trim()
      if (!raw || !/FREQ=/.test(raw)) {
        failWith('RRULE personnalisée invalide — elle doit contenir FREQ=…')
      }
      recurrenceRule = raw
    } else {
      failWith(`Fréquence inconnue : ${freq}`)
    }
  } else {
    startsOn = String(formData.get('starts_on') ?? '').trim() || null
    endsOn = String(formData.get('ends_on') ?? '').trim() || null
    if (!startsOn) failWith('Date de début requise pour une contrainte ponctuelle.')
    if (endsOn && endsOn < startsOn!) failWith('La date de fin doit être après le début.')
  }

  const { error } = await supabase
    .from('constraints')
    .update({
      label,
      kind,
      type,
      impact,
      recurrence_rule: recurrenceRule,
      starts_on: startsOn,
      ends_on: endsOn,
      notes,
      focus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) failWith(`Modification impossible : ${error.message}`)

  revalidatePath('/contraintes')
  revalidatePath('/aujourdhui')
  redirect('/contraintes?ok=1')
}

export async function deleteConstraint(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const { error } = await supabase.from('constraints').delete().eq('id', id)
  if (error) failWith(`Suppression impossible : ${error.message}`)

  revalidatePath('/contraintes')
  revalidatePath('/aujourdhui')
}
