'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const AREAS = [
  'vitesse',
  'volume',
  'descente',
  'montee',
  'technique',
  'fueling',
  'mental',
  'autre',
] as const
const STATUSES = ['active', 'atteint', 'abandonne'] as const

function failWith(message: string): never {
  redirect(`/objectifs?erreur=${encodeURIComponent(message)}`)
}

function pickEnum<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = typeof raw === 'string' ? raw : ''
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

export async function addGoal(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const label = String(formData.get('label') ?? '').trim()
  if (!label) failWith('Le libellé est requis.')

  const area = pickEnum(formData.get('area'), AREAS, 'autre')
  const targetDate = String(formData.get('target_date') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  const { error } = await supabase.from('training_goals').insert({
    tenant_id: user.id,
    label,
    area,
    target_date: targetDate,
    notes,
  })
  if (error) failWith(`Enregistrement impossible : ${error.message}`)

  revalidatePath('/objectifs')
  redirect('/objectifs?ok=1')
}

export async function updateGoal(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) failWith('id manquant')
  const label = String(formData.get('label') ?? '').trim()
  if (!label) failWith('Le libellé est requis.')

  const area = pickEnum(formData.get('area'), AREAS, 'autre')
  const status = pickEnum(formData.get('status'), STATUSES, 'active')
  const targetDate = String(formData.get('target_date') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  const { error } = await supabase
    .from('training_goals')
    .update({
      label,
      area,
      status,
      target_date: targetDate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) failWith(`Modification impossible : ${error.message}`)

  revalidatePath('/objectifs')
  redirect('/objectifs?ok=1')
}

export async function deleteGoal(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const { error } = await supabase.from('training_goals').delete().eq('id', id)
  if (error) failWith(`Suppression impossible : ${error.message}`)

  revalidatePath('/objectifs')
}

export async function toggleGoalStatus(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  const next = pickEnum(formData.get('status'), STATUSES, 'active')
  if (!id) return

  const { error } = await supabase
    .from('training_goals')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) failWith(`Changement de statut impossible : ${error.message}`)

  revalidatePath('/objectifs')
}
