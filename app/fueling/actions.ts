'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type IntakePattern = 'rien' | 'un_peu' | 'regulierement'
type Issue = 'aucun' | 'oubli' | 'nausee' | 'pas_acces' | 'autre'

const INTAKE_PATTERNS: readonly IntakePattern[] = ['rien', 'un_peu', 'regulierement']
const ISSUES: readonly Issue[] = ['aucun', 'oubli', 'nausee', 'pas_acces', 'autre']

function pickEnum<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = typeof raw === 'string' ? raw : ''
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function failWith(message: string): never {
  redirect(`/fueling?erreur=${encodeURIComponent(message)}`)
}

function coerceNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function addFuelingLog(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const activityId = String(formData.get('activity_id') ?? '').trim() || null
  if (!activityId) failWith('Choisis une activité.')

  const intakePattern = pickEnum<IntakePattern>(
    formData.get('intake_pattern'),
    INTAKE_PATTERNS,
    'rien',
  )
  const issue = pickEnum<Issue>(formData.get('issue'), ISSUES, 'aucun')
  const postWindowFed = formData.get('post_window_fed') === 'on'
  const notes = String(formData.get('notes') ?? '').trim() || null
  const productsText = String(formData.get('products_text') ?? '').trim() || null

  const carbsPerHour = coerceNumber(formData.get('carbs_g_per_hour'))
  const carbsTotal = coerceNumber(formData.get('carbs_g'))

  // Produits en texte libre — on stocke tel quel dans le jsonb, la structure
  // sera introduite avec la bibliothèque perso (V1.5).
  const products = productsText ? { text: productsText } : null

  const { error } = await supabase.from('fueling_logs').insert({
    tenant_id: user.id,
    activity_id: activityId,
    intake_pattern: intakePattern,
    carbs_g: carbsTotal != null ? Math.round(carbsTotal) : null,
    carbs_g_per_hour: carbsPerHour,
    products,
    issue,
    post_window_fed: postWindowFed,
    notes,
  })
  if (error) failWith(`Enregistrement impossible : ${error.message}`)

  revalidatePath('/fueling')
  revalidatePath('/aujourdhui')
  redirect('/fueling?ok=1')
}

export async function updateFuelingLog(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '').trim()
  if (!id) failWith('id manquant')

  const intakePattern = pickEnum<IntakePattern>(
    formData.get('intake_pattern'),
    INTAKE_PATTERNS,
    'rien',
  )
  const issue = pickEnum<Issue>(formData.get('issue'), ISSUES, 'aucun')
  const postWindowFed = formData.get('post_window_fed') === 'on'
  const notes = String(formData.get('notes') ?? '').trim() || null
  const productsText = String(formData.get('products_text') ?? '').trim() || null

  const carbsPerHour = coerceNumber(formData.get('carbs_g_per_hour'))
  const carbsTotal = coerceNumber(formData.get('carbs_g'))

  const products = productsText ? { text: productsText } : null

  // L'activité rattachée ne se modifie pas ici — pour la changer, supprimer
  // le log et en créer un autre. Ça évite d'invalider l'unicité côté matching.
  const { error } = await supabase
    .from('fueling_logs')
    .update({
      intake_pattern: intakePattern,
      carbs_g: carbsTotal != null ? Math.round(carbsTotal) : null,
      carbs_g_per_hour: carbsPerHour,
      products,
      issue,
      post_window_fed: postWindowFed,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) failWith(`Modification impossible : ${error.message}`)

  revalidatePath('/fueling')
  revalidatePath('/aujourdhui')
  redirect('/fueling?ok=1')
}

export async function deleteFuelingLog(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const { error } = await supabase.from('fueling_logs').delete().eq('id', id)
  if (error) failWith(`Suppression impossible : ${error.message}`)

  revalidatePath('/fueling')
  revalidatePath('/aujourdhui')
}
