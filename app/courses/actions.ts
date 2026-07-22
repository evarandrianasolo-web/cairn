'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseGoalTime } from '@/lib/format'

type RacePriority = 'A' | 'B' | 'C'
const PRIORITIES: readonly RacePriority[] = ['A', 'B', 'C']

function coerceNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function addRace(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = String(formData.get('name') ?? '').trim()
  const raceDate = String(formData.get('race_date') ?? '').trim()
  const priorityRaw = String(formData.get('priority') ?? 'C')
  const priority: RacePriority = (PRIORITIES as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as RacePriority)
    : 'C'
  const location = String(formData.get('location') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!name || !raceDate) throw new Error('Nom et date sont requis.')

  const distanceKm = coerceNumber(formData.get('distance_km'))
  const distanceM = distanceKm != null ? Math.round(distanceKm * 1000) : null
  const elevationM = coerceNumber(formData.get('elevation_gain_m'))
  const goalTimeS = parseGoalTime(String(formData.get('goal_time') ?? ''))

  const { error } = await supabase.from('races').insert({
    tenant_id: user.id,
    name,
    race_date: raceDate,
    location,
    distance_m: distanceM,
    elevation_gain_m: elevationM != null ? Math.round(elevationM) : null,
    priority,
    status: 'envisagee',
    goal_time_s: goalTimeS,
    notes,
  })
  if (error) throw new Error(`addRace: ${error.message}`)

  revalidatePath('/courses')
  revalidatePath('/aujourdhui')
}

export async function updateRace(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('id manquant')

  const name = String(formData.get('name') ?? '').trim()
  const raceDate = String(formData.get('race_date') ?? '').trim()
  const priorityRaw = String(formData.get('priority') ?? 'C')
  const priority: RacePriority = (PRIORITIES as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as RacePriority)
    : 'C'
  const location = String(formData.get('location') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!name || !raceDate) throw new Error('Nom et date sont requis.')

  const distanceKm = coerceNumber(formData.get('distance_km'))
  const distanceM = distanceKm != null ? Math.round(distanceKm * 1000) : null
  const elevationM = coerceNumber(formData.get('elevation_gain_m'))
  const goalTimeS = parseGoalTime(String(formData.get('goal_time') ?? ''))

  // La RLS filtre : impossible de modifier la course d'un autre tenant.
  const { error } = await supabase
    .from('races')
    .update({
      name,
      race_date: raceDate,
      location,
      distance_m: distanceM,
      elevation_gain_m: elevationM != null ? Math.round(elevationM) : null,
      priority,
      goal_time_s: goalTimeS,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`updateRace: ${error.message}`)

  revalidatePath('/courses')
  revalidatePath('/aujourdhui')
  redirect('/courses')
}

export async function deleteRace(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('id manquant')

  // La RLS filtre : impossible de supprimer la ligne d'un autre tenant.
  const { error } = await supabase.from('races').delete().eq('id', id)
  if (error) throw new Error(`deleteRace: ${error.message}`)

  revalidatePath('/courses')
  revalidatePath('/aujourdhui')
}
