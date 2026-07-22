import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDateCourte } from '@/lib/format'
import { createThread, deleteThread } from './actions'

type Thread = {
  id: string
  title: string | null
  last_message_at: string | null
  created_at: string
}

export default async function CoachPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: threads } = await supabase
    .from('coach_threads')
    .select('id, title, last_message_at, created_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50)

  const rows = (threads ?? []) as Thread[]

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ScreenTitle>Coach</ScreenTitle>

      <p className="rounded-data border border-granit/30 bg-craie px-3 py-2 text-xs text-granit">
        Tu échanges avec une IA (Claude, Anthropic). Elle ne remplace ni médecin,
        ni kiné, ni diététicien.
      </p>

      <form action={createThread}>
        <button
          type="submit"
          className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
        >
          Nouvelle conversation
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-base text-granit">Aucune conversation pour l&apos;instant.</p>
      ) : (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Conversations
          </h2>
          <ul className="mt-3 space-y-2">
            {rows.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-data border border-brume bg-craie px-3 py-2"
              >
                <Link href={`/coach/${t.id}`} className="flex-1">
                  <p className="text-base text-schiste">
                    {t.title ?? 'Nouvelle conversation'}
                  </p>
                  <p className="tabular text-xs text-granit">
                    {t.last_message_at
                      ? formatDateCourte(t.last_message_at)
                      : `créée le ${formatDateCourte(t.created_at)}`}
                  </p>
                </Link>
                <form action={deleteThread}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    type="submit"
                    aria-label="Supprimer"
                    className="text-granit hover:text-schiste"
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
