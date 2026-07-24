import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { AiDisclosure } from '@/components/ai-disclosure'
import { sendMessage } from '../actions'
import {
  acceptCoachProposal,
  rejectCoachProposal,
} from '../proposals-actions'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
}

type Proposal = {
  id: string
  kind: 'constraint'
  payload: Record<string, unknown>
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  decided_at: string | null
  applied_ref: string | null
}

const IMPACT_LABEL: Record<string, string> = {
  bloque: 'bloque',
  allege: 'allège',
  decale: 'décale',
  oriente: 'oriente',
}

const KIND_LABEL: Record<string, string> = {
  recurrente: 'récurrente',
  ponctuelle: 'ponctuelle',
}

const TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
})

export default async function CoachThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const { data: thread } = await supabase
    .from('coach_threads')
    .select('id, title')
    .eq('id', id)
    .maybeSingle()
  if (!thread) redirect('/coach')

  const [{ data: msgsData }, { data: propsData }] = await Promise.all([
    supabase
      .from('coach_messages')
      .select('id, role, content, tokens_in, tokens_out, created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('coach_proposals')
      .select('id, kind, payload, status, created_at, decided_at, applied_ref')
      .eq('thread_id', id)
      .order('created_at', { ascending: true }),
  ])
  const messages = (msgsData ?? []) as Message[]
  const proposals = (propsData ?? []) as Proposal[]

  return (
    <main className="mx-auto flex min-h-[calc(100vh-52px)] max-w-3xl flex-col p-6">
      <div className="flex items-baseline justify-between">
        <Link href="/coach" className="text-xs text-granit hover:text-schiste">
          ← retour
        </Link>
      </div>

      <ScreenTitle className="mt-2">{thread.title ?? 'Coach'}</ScreenTitle>

      <div className="mt-3">
        <AiDisclosure />
      </div>

      <section className="mt-6 flex-1 space-y-4">
        {messages.length === 0 ? (
          <p className="text-base text-granit">
            Pose ta première question — le coach voit ton profil, tes 10 dernières
            activités et ta prochaine course A automatiquement.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} />)
        )}
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </section>

      <form action={sendMessage} className="sticky bottom-4 mt-6 flex flex-col gap-2 rounded-surface border border-granit/30 bg-craie p-3">
        <input type="hidden" name="thread_id" value={thread.id} />
        <textarea
          required
          name="text"
          rows={3}
          placeholder="Écris ta question ou dis ce qui bouge cette semaine…"
          className="w-full rounded-data border border-granit/35 bg-craie px-3 py-2 text-base text-schiste focus:border-schiste focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
          >
            Envoyer
          </button>
        </div>
      </form>
    </main>
  )
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  if (proposal.kind !== 'constraint') return null
  const p = proposal.payload
  const label = (p.label as string) ?? '—'
  const type = (p.type as string) ?? ''
  const kind = (p.kind as string) ?? ''
  const impact = (p.impact as string) ?? ''
  const focus = (p.focus as string | null) ?? null
  const startsOn = (p.starts_on as string | null) ?? null
  const endsOn = (p.ends_on as string | null) ?? null
  const rrule = (p.recurrence_rule as string | null) ?? null
  const notes = (p.notes as string | null) ?? null

  const badgeColor =
    proposal.status === 'accepted'
      ? 'border-lichen/50 text-lichen'
      : proposal.status === 'rejected'
        ? 'border-granit/30 text-granit'
        : 'border-ocre/40 text-ocre'
  const badgeLabel =
    proposal.status === 'accepted'
      ? 'ACCEPTÉE'
      : proposal.status === 'rejected'
        ? 'REJETÉE'
        : 'PROPOSITION'

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-surface border border-schiste/30 bg-brume p-4">
        <div className="flex items-baseline gap-2">
          <span
            className={
              'rounded-data border px-1.5 py-0.5 font-mono text-[10px] uppercase ' +
              badgeColor
            }
          >
            {badgeLabel}
          </span>
          <span className="font-mono text-[10px] uppercase text-granit">
            nouvelle contrainte
          </span>
        </div>
        <p className="mt-2 text-base font-medium text-schiste">{label}</p>
        <p className="mt-1 font-mono text-xs text-granit">
          {[type, KIND_LABEL[kind] ?? kind, IMPACT_LABEL[impact] ?? impact]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {focus && (
          <p className="mt-1 text-sm text-schiste">
            <span className="text-granit">focus : </span>
            {focus}
          </p>
        )}
        {(startsOn || endsOn) && (
          <p className="tabular mt-1 font-mono text-xs text-granit">
            {startsOn ?? '?'}
            {endsOn ? ` → ${endsOn}` : ''}
          </p>
        )}
        {rrule && (
          <p className="tabular mt-1 font-mono text-[10px] text-granit">
            {rrule}
          </p>
        )}
        {notes && (
          <p className="mt-2 text-sm italic text-granit">{notes}</p>
        )}

        {proposal.status === 'pending' && (
          <div className="mt-3 flex gap-2">
            <form action={acceptCoachProposal}>
              <input type="hidden" name="proposal_id" value={proposal.id} />
              <button
                type="submit"
                className="rounded-surface border border-schiste bg-schiste px-3 py-2 text-sm font-medium text-craie"
              >
                Accepter
              </button>
            </form>
            <form action={rejectCoachProposal}>
              <input type="hidden" name="proposal_id" value={proposal.id} />
              <button
                type="submit"
                className="rounded-surface border border-granit/40 px-3 py-2 text-sm text-schiste hover:bg-brume"
              >
                Rejeter
              </button>
            </form>
          </div>
        )}
        {proposal.status === 'accepted' && proposal.applied_ref && (
          <p className="mt-3 font-mono text-[10px] text-granit">
            Créée · <Link href="/contraintes" className="underline">Voir contraintes</Link>
          </p>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ m }: { m: Message }) {
  const isUser = m.role === 'user'
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          'max-w-[80%] rounded-surface px-4 py-3 ' +
          (isUser
            ? 'bg-schiste text-craie'
            : 'border border-granit/20 bg-craie text-schiste')
        }
      >
        <p className="whitespace-pre-line text-base leading-relaxed">{m.content}</p>
        <p
          className={
            'tabular mt-2 text-xs ' + (isUser ? 'text-craie/60' : 'text-granit')
          }
        >
          {TIME.format(new Date(m.created_at))}
          {m.tokens_in != null && m.tokens_out != null && (m.tokens_in > 0 || m.tokens_out > 0) && (
            <>
              {' · '}
              {m.tokens_in.toLocaleString('fr-FR')} in · {m.tokens_out.toLocaleString('fr-FR')} out
            </>
          )}
        </p>
      </div>
    </div>
  )
}
