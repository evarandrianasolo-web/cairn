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

  if (proposal.kind === 'constraint') {
    const p = proposal.payload as Record<string, unknown>
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

    await supabase
      .from('coach_proposals')
      .update({
        status: 'accepted',
        applied_ref: created.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
  } else {
    throw new Error(`kind non supporte: ${proposal.kind}`)
  }

  revalidatePath(`/coach/${proposal.thread_id}`)
  revalidatePath('/contraintes')
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
