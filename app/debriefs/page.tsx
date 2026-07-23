import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDateCourte, formatRaceDate } from '@/lib/format'
import { DebriefForm, type DebriefInitial, type RaceOption } from './debrief-form'
import { deleteDebrief } from './actions'

type Debrief = {
  id: string
  kind: 'course' | 'bloc'
  race_id: string | null
  period_start: string | null
  period_end: string | null
  narrative: string | null
  what_worked: string | null
  what_failed: string | null
  focus_areas: string[] | null
  created_at: string
  races: { name: string; race_date: string } | null
}

export default async function DebriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string; edit?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur, edit: editingId } = await searchParams

  const [{ data: debriefsData }, { data: racesData }] = await Promise.all([
    supabase
      .from('debriefs')
      .select(
        'id, kind, race_id, period_start, period_end, narrative, what_worked, what_failed, focus_areas, created_at, races(name, race_date)',
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('races')
      .select('id, name, race_date')
      .order('race_date', { ascending: false }),
  ])

  const debriefs = (debriefsData ?? []) as unknown as Debrief[]
  const races = (racesData ?? []) as RaceOption[]

  const editingDebrief = editingId
    ? debriefs.find((d) => d.id === editingId)
    : undefined

  const editingInitial: DebriefInitial | undefined = editingDebrief && {
    id: editingDebrief.id,
    kind: editingDebrief.kind,
    race_id: editingDebrief.race_id,
    period_start: editingDebrief.period_start,
    period_end: editingDebrief.period_end,
    narrative: editingDebrief.narrative,
    what_worked: editingDebrief.what_worked,
    what_failed: editingDebrief.what_failed,
    focus_areas: editingDebrief.focus_areas,
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ScreenTitle>Débriefs</ScreenTitle>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}

      {editingInitial ? (
        <DebriefForm races={races} initial={editingInitial} />
      ) : (
        <DebriefForm races={races} />
      )}

      {debriefs.length === 0 ? (
        <p className="text-base text-granit">
          Aucun débrief. Après une course ou un bloc, note ce qui a marché, ce qui
          a raté et les axes du bloc suivant — le coach s&apos;y référera.
        </p>
      ) : (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Historique
          </h2>
          <ul className="mt-3 space-y-3">
            {debriefs.map((d) =>
              d.id === editingId ? null : <DebriefItem key={d.id} d={d} />,
            )}
          </ul>
        </section>
      )}
    </main>
  )
}

function DebriefItem({ d }: { d: Debrief }) {
  const heading =
    d.kind === 'course'
      ? d.races
        ? `${d.races.name} — ${formatRaceDate(d.races.race_date)}`
        : 'Course supprimée'
      : d.period_start && d.period_end
        ? `Bloc ${formatDateCourte(d.period_start)} → ${formatDateCourte(d.period_end)}`
        : 'Bloc (dates manquantes)'

  return (
    <li className="rounded-data border border-brume bg-craie px-3 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-base text-schiste">
            <span className="mr-2 rounded-data border border-granit/35 px-1.5 py-0.5 font-mono text-xs uppercase text-granit">
              {d.kind}
            </span>
            {heading}
          </p>
          <p className="tabular text-xs text-granit">
            saisi le {formatDateCourte(d.created_at)}
          </p>

          {d.narrative && (
            <p className="mt-2 whitespace-pre-line text-sm text-schiste">
              {d.narrative}
            </p>
          )}

          {(d.what_worked || d.what_failed) && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {d.what_worked && (
                <div className="rounded-data bg-brume/60 p-2">
                  <p className="text-xs uppercase tracking-wide text-granit">a marché</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-schiste">
                    {d.what_worked}
                  </p>
                </div>
              )}
              {d.what_failed && (
                <div className="rounded-data bg-brume/60 p-2">
                  <p className="text-xs uppercase tracking-wide text-granit">a raté</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-schiste">
                    {d.what_failed}
                  </p>
                </div>
              )}
            </div>
          )}

          {d.focus_areas && d.focus_areas.length > 0 && (
            <div className="mt-2">
              <p className="text-xs uppercase tracking-wide text-granit">axes</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {d.focus_areas.map((f) => (
                  <li
                    key={f}
                    className="rounded-data border border-granit/35 px-2 py-0.5 text-xs italic text-schiste"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/debriefs?edit=${d.id}`}
            className="text-xs text-granit hover:text-schiste"
          >
            modifier
          </Link>
          <form action={deleteDebrief}>
            <input type="hidden" name="id" value={d.id} />
            <button
              type="submit"
              aria-label="Supprimer"
              className="text-granit hover:text-schiste"
            >
              ×
            </button>
          </form>
        </div>
      </div>
    </li>
  )
}
