'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { anthropic, COACH_MODEL } from '@/lib/ai/anthropic'
import { COACH_SYSTEM } from '@/lib/ai/prompts'
import { buildCoachContext } from '@/lib/ai/context'

type StoredMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
}

export async function createThread(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('coach_threads')
    .insert({ tenant_id: user.id, title: 'Nouvelle conversation' })
    .select('id')
    .single()
  if (error) throw new Error(`createThread: ${error.message}`)

  redirect(`/coach/${data.id}`)
}

export async function deleteThread(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '')
  if (!id) return
  const { error } = await supabase.from('coach_threads').delete().eq('id', id)
  if (error) throw new Error(`deleteThread: ${error.message}`)
  revalidatePath('/coach')
  redirect('/coach')
}

/** Rassemble les messages d'un fil, insère le user message, appelle l'API, persiste la réponse. */
export async function sendMessage(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const threadId = String(formData.get('thread_id') ?? '')
  const text = String(formData.get('text') ?? '').trim()
  if (!threadId || !text) return

  const nowIso = new Date().toISOString()

  // 1. Persister le message utilisateur.
  const { error: userMsgErr } = await supabase.from('coach_messages').insert({
    tenant_id: user.id,
    thread_id: threadId,
    role: 'user',
    content: text,
    tokens_in: 0,
    tokens_out: 0,
    model: null,
  })
  if (userMsgErr) throw new Error(`insert user msg: ${userMsgErr.message}`)

  // 2. Recharger le fil complet pour l'API.
  const { data: msgsData, error: msgsErr } = await supabase
    .from('coach_messages')
    .select('role, content, tokens_in, tokens_out, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (msgsErr) throw new Error(`load messages: ${msgsErr.message}`)
  const stored = (msgsData ?? []) as StoredMessage[]

  // 3. Construire le contexte (V1 : profil + 10 dernières activités + course A).
  //    Injecté comme premier message user pour préserver le cache system.
  const context = await buildCoachContext(supabase)

  // 4. Assembler la conversation pour l'API.
  const apiMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: `${context}\n\n(Ci-dessus : contexte automatique. Question suit.)` },
    { role: 'assistant', content: 'Compris, je regarde.' },
    ...stored.map((m): Anthropic.MessageParam => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
  ]

  // 5. Appel Anthropic — Opus 4.8, adaptive thinking, effort high.
  let assistantText = ''
  let tokensIn = 0
  let tokensOut = 0
  try {
    const response = await anthropic().messages.create({
      model: COACH_MODEL,
      max_tokens: 16000,
      system: COACH_SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      messages: apiMessages,
    })
    for (const block of response.content) {
      if (block.type === 'text') assistantText += block.text
    }
    tokensIn = response.usage.input_tokens
    tokensOut = response.usage.output_tokens
    if (!assistantText) assistantText = '(Aucune réponse texte reçue.)'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('coach_messages').insert({
      tenant_id: user.id,
      thread_id: threadId,
      role: 'assistant',
      content: `Erreur d'appel API : ${msg}`,
      tokens_in: 0,
      tokens_out: 0,
      model: COACH_MODEL,
    })
    revalidatePath(`/coach/${threadId}`)
    return
  }

  // 6. Persister la réponse.
  const { error: asstErr } = await supabase.from('coach_messages').insert({
    tenant_id: user.id,
    thread_id: threadId,
    role: 'assistant',
    content: assistantText,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    model: COACH_MODEL,
  })
  if (asstErr) throw new Error(`insert assistant msg: ${asstErr.message}`)

  // 7. Mettre à jour le fil (dernière activité, titre à partir du premier user si vide).
  const updates: Record<string, unknown> = {
    last_message_at: nowIso,
    updated_at: nowIso,
  }
  const firstUserMsg = stored.find((m) => m.role === 'user')
  if (!firstUserMsg) {
    updates.title = text.slice(0, 60)
  }
  await supabase.from('coach_threads').update(updates).eq('id', threadId)

  revalidatePath(`/coach/${threadId}`)
  revalidatePath('/coach')
}

