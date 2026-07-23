'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type Kind = 'course' | 'bloc'
const KINDS: readonly Kind[] = ['course', 'bloc']

function pickEnum<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = typeof raw === 'string' ? raw : ''
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function failWith(message: string): never {
  redirect(`/debriefs?erreur=${encodeURIComponent(message)}`)
}

/** Textarea 1 ligne = 1 axe, lignes vides ignorées, max 20 axes. */
function parseFocusAreas(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== 'string') return null
  const items = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 20)
  return items.length > 0 ? items : null
}

function buildPayload(
  formData: FormData,
  userId: string,
): {
  kind: Kind
  race_id: string | null
  period_start: string | null
  period_end: string | null
  narrative: string | null
  what_worked: string | null
  what_failed: string | null
  focus_areas: string[] | null
  tenant_id: string
  updated_at: string
} {
  const kind = pickEnum<Kind>(formData.get('kind'), KINDS, 'course')

  let raceId: string | null = null
  let startsOn: string | null = null
  let endsOn: string | null = null

  if (kind === 'course') {
    raceId = String(formData.get('race_id') ?? '').trim() || null
    if (!raceId) failWith('Sélectionne une course pour ce débrief.')
  } else {
    startsOn = String(formData.get('period_start') ?? '').trim() || null
    endsOn = String(formData.get('period_end') ?? '').trim() || null
    if (!startsOn || !endsOn) failWith('Dates de début et de fin requises pour un bloc.')
    if (endsOn < startsOn) failWith('La fin du bloc doit être après le début.')
  }

  return {
    tenant_id: userId,
    kind,
    race_id: raceId,
    period_start: startsOn,
    period_end: endsOn,
    narrative: String(formData.get('narrative') ?? '').trim() || null,
    what_worked: String(formData.get('what_worked') ?? '').trim() || null,
    what_failed: String(formData.get('what_failed') ?? '').trim() || null,
    focus_areas: parseFocusAreas(formData.get('focus_areas')),
    updated_at: new Date().toISOString(),
  }
}

export async function addDebrief(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const payload = buildPayload(formData, user.id)
  const { error } = await supabase.from('debriefs').insert(payload)
  if (error) failWith(`Enregistrement impossible : ${error.message}`)

  revalidatePath('/debriefs')
  redirect('/debriefs?ok=1')
}

export async function updateDebrief(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) failWith('id manquant')

  const payload = buildPayload(formData, user.id)
  const { error } = await supabase.from('debriefs').update(payload).eq('id', id)
  if (error) failWith(`Modification impossible : ${error.message}`)

  revalidatePath('/debriefs')
  redirect('/debriefs?ok=1')
}

export async function deleteDebrief(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const { error } = await supabase.from('debriefs').delete().eq('id', id)
  if (error) failWith(`Suppression impossible : ${error.message}`)

  revalidatePath('/debriefs')
}
