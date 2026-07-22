'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
