'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { WEEKDAY_CODES, type WeekdayCode, buildWeeklyRRule } from '@/lib/format'

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
type Impact = 'bloque' | 'allege' | 'decale'

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
const IMPACTS: readonly Impact[] = ['bloque', 'allege', 'decale']

function pickEnum<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = typeof raw === 'string' ? raw : ''
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

export async function addConstraint(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const label = String(formData.get('label') ?? '').trim()
  if (!label) throw new Error('Le libellé est requis.')

  const kind = pickEnum<Kind>(formData.get('kind'), KINDS, 'recurrente')
  const type = pickEnum<ConstraintType>(formData.get('type'), TYPES, 'autre')
  const impact = pickEnum<Impact>(formData.get('impact'), IMPACTS, 'bloque')
  const notes = String(formData.get('notes') ?? '').trim() || null

  let recurrenceRule: string | null = null
  let startsOn: string | null = null
  let endsOn: string | null = null

  if (kind === 'recurrente') {
    const days = WEEKDAY_CODES.filter((d) => formData.get(`day_${d}`) === 'on') as WeekdayCode[]
    recurrenceRule = buildWeeklyRRule(days)
    if (!recurrenceRule) throw new Error('Sélectionne au moins un jour pour une contrainte récurrente.')
  } else {
    startsOn = String(formData.get('starts_on') ?? '').trim() || null
    endsOn = String(formData.get('ends_on') ?? '').trim() || null
    if (!startsOn) throw new Error('Date de début requise pour une contrainte ponctuelle.')
    if (endsOn && endsOn < startsOn) throw new Error('La date de fin doit être après le début.')
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
  })
  if (error) throw new Error(`addConstraint: ${error.message}`)

  revalidatePath('/contraintes')
  revalidatePath('/aujourdhui')
}

export async function deleteConstraint(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('id manquant')

  const { error } = await supabase.from('constraints').delete().eq('id', id)
  if (error) throw new Error(`deleteConstraint: ${error.message}`)

  revalidatePath('/contraintes')
  revalidatePath('/aujourdhui')
}
