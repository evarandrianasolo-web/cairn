'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Accepte une proposition en attente : cree la ligne metier reelle
 * (V0 : uniquement kind='constraint' -> INSERT constraints), puis
 * marque la proposition status='accepted' avec applied_ref pointant
 * sur l'id cree.
 */
export async function acceptCoachProposal(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const proposalId = String(formData.get('proposal_id') ?? '').trim()
  if (!proposalId) throw new Error('proposal_id manquant')

  const { data: proposal, error: readErr } = await supabase
    .from('coach_proposals')
    .select('id, thread_id, kind, payload, status')
    .eq('id', proposalId)
    .maybeSingle()
  if (readErr) throw new Error(`acceptProposal read: ${readErr.message}`)
  if (!proposal) throw new Error('proposition introuvable')
  if (proposal.status !== 'pending') return // idempotent

  const p = proposal.payload as Record<string, unknown>
  let appliedRef: string | null = null

  if (proposal.kind === 'constraint') {
    const { data: created, error: insErr } = await supabase
      .from('constraints')
      .insert({
        tenant_id: user.id,
        label: p.label as string,
        kind: p.kind as string,
        type: p.type as string,
        impact: p.impact as string,
        focus: (p.focus as string | null) ?? null,
        starts_on: (p.starts_on as string | null) ?? null,
        ends_on: (p.ends_on as string | null) ?? null,
        recurrence_rule: (p.recurrence_rule as string | null) ?? null,
        notes: (p.notes as string | null) ?? null,
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`insert constraint: ${insErr.message}`)
    appliedRef = created.id
    revalidatePath('/contraintes')
  } else if (proposal.kind === 'race') {
    const { data: created, error: insErr } = await supabase
      .from('races')
      .insert({
        tenant_id: user.id,
        name: p.name as string,
        race_date: p.race_date as string,
        priority: p.priority as string,
        location: (p.location as string | null) ?? null,
        distance_m: (p.distance_m as number | null) ?? null,
        elevation_gain_m: (p.elevation_gain_m as number | null) ?? null,
        goal_time_s: (p.goal_time_s as number | null) ?? null,
        notes: (p.notes as string | null) ?? null,
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`insert race: ${insErr.message}`)
    appliedRef = created.id
    revalidatePath('/courses')
  } else if (proposal.kind === 'debrief_axis') {
    const debriefId = p.debrief_id as string | undefined
    const axis = p.axis as string | undefined
    if (!debriefId || !axis) throw new Error('payload debrief_axis invalide')
    // Lire les focus_areas actuels et append. Le champ est jsonb array.
    const { data: existing, error: dbErr } = await supabase
      .from('debriefs')
      .select('focus_areas')
      .eq('id', debriefId)
      .maybeSingle()
    if (dbErr) throw new Error(`lookup debrief: ${dbErr.message}`)
    if (!existing) throw new Error('debrief introuvable')
    const current = Array.isArray(existing.focus_areas)
      ? (existing.focus_areas as string[])
      : []
    const updated = [...current, axis]
    const { error: upErr } = await supabase
      .from('debriefs')
      .update({ focus_areas: updated, updated_at: new Date().toISOString() })
      .eq('id', debriefId)
    if (upErr) throw new Error(`update debrief: ${upErr.message}`)
    appliedRef = debriefId
    revalidatePath('/debriefs')
    revalidatePath('/dashboard')
  } else {
    throw new Error(`kind non supporte: ${proposal.kind}`)
  }

  await supabase
    .from('coach_proposals')
    .update({
      status: 'accepted',
      applied_ref: appliedRef,
      decided_at: new Date().toISOString(),
    })
    .eq('id', proposalId)

  revalidatePath(`/coach/${proposal.thread_id}`)
}

/**
 * Rejette une proposition en attente : status='rejected', pas d'ecriture
 * metier. La proposition reste dans coach_proposals pour tracabilite.
 */
export async function rejectCoachProposal(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const proposalId = String(formData.get('proposal_id') ?? '').trim()
  if (!proposalId) throw new Error('proposal_id manquant')

  const { data: proposal, error: readErr } = await supabase
    .from('coach_proposals')
    .select('thread_id, status')
    .eq('id', proposalId)
    .maybeSingle()
  if (readErr) throw new Error(`rejectProposal read: ${readErr.message}`)
  if (!proposal) return
  if (proposal.status !== 'pending') return

  await supabase
    .from('coach_proposals')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', proposalId)

  revalidatePath(`/coach/${proposal.thread_id}`)
}
