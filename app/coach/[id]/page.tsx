import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { sendMessage } from '../actions'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_in: number | null
  tokens_out: number | null
  created_at: string
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

  const { data: msgsData } = await supabase
    .from('coach_messages')
    .select('id, role, content, tokens_in, tokens_out, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })
  const messages = (msgsData ?? []) as Message[]

  return (
    <main className="mx-auto flex min-h-[calc(100vh-52px)] max-w-3xl flex-col p-6">
      <div className="flex items-baseline justify-between">
        <Link href="/coach" className="text-xs text-granit hover:text-schiste">
          ← retour
        </Link>
      </div>

      <ScreenTitle className="mt-2">{thread.title ?? 'Coach'}</ScreenTitle>

      <p className="mt-3 rounded-data border border-granit/30 bg-craie px-3 py-2 text-xs text-granit">
        Tu échanges avec une IA (Claude, Anthropic). Elle ne remplace ni médecin,
        ni kiné, ni diététicien.
      </p>

      <section className="mt-6 flex-1 space-y-4">
        {messages.length === 0 ? (
          <p className="text-base text-granit">
            Pose ta première question — le coach voit ton profil, tes 10 dernières
            activités et ta prochaine course A automatiquement.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} />)
        )}
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
