'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type RacePriority = 'A' | 'B' | 'C'
const PRIORITIES: readonly RacePriority[] = ['A', 'B', 'C']

function coerceInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number.parseInt(value, 10)
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

  if (!name || !raceDate) throw new Error('Nom et date sont requis.')

  const { error } = await supabase.from('races').insert({
    tenant_id: user.id,
    name,
    race_date: raceDate,
    location,
    distance_m: coerceInt(formData.get('distance_km'))
      ? coerceInt(formData.get('distance_km'))! * 1000
      : null,
    elevation_gain_m: coerceInt(formData.get('elevation_gain_m')),
    priority,
    status: 'envisagee',
  })
  if (error) throw new Error(`addRace: ${error.message}`)

  revalidatePath('/courses')
  revalidatePath('/aujourdhui')
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
