import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  formatAllure,
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'
import {
  candidatesForActivity,
  isRaceEligibleSport,
  type RaceForMatch,
} from '@/lib/race-matching'
import { IconFlag, IconLink, IconPencil } from '@/components/icons'
import { toggleTodoDismissed } from './actions'

const PAGE_SIZE = 50
const TODO_SCAN_WINDOW = 200
const LONG_SECS = 90 * 60

type ActivityRow = {
  id: string
  started_at: string
  sport_type: string | null
  name: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
  avg_pace_s_per_km: number | null
  user_notes: string | null
  race_id: string | null
  todo_dismissed: string[] | null
  fueling_logs: { id: string }[] | null
}

type Reason = 'debrief' | 'fueling' | 'link'

const REASON_LABEL: Record<Reason, string> = {
  debrief: 'débrief',
  fueling: 'fueling',
  link: 'à lier',
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { page: rawPage, filter } = await searchParams
  const todoMode = filter === 'todo'
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [
    { data: pageActivities, count },
    { data: allRaces },
    { data: recentActivities },
    { data: debriefs },
  ] = await Promise.all([
    supabase
      .from('activities')
      .select(
        'id, started_at, sport_type, name, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km, user_notes, race_id, todo_dismissed, fueling_logs(id)',
        { count: 'exact' },
      )
      .order('started_at', { ascending: false })
      .range(from, to),
    supabase
      .from('races')
      .select('id, name, race_date, distance_m')
      .order('race_date', { ascending: false })
      .limit(200),
    supabase
      .from('activities')
      .select(
        'id, started_at, sport_type, name, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km, user_notes, race_id, todo_dismissed, fueling_logs(id)',
      )
      .order('started_at', { ascending: false })
      .limit(TODO_SCAN_WINDOW),
    supabase.from('debriefs').select('race_id').not('race_id', 'is', null),
  ])

  const races = (allRaces ?? []) as RaceForMatch[]
  const debriefedRaceIds = new Set(
    (debriefs ?? []).map((d) => d.race_id as string).filter(Boolean),
  )
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Calcul « à traiter » sur les 200 activités les plus récentes. Une
  // activité plus ancienne est rarement une lacune qu'on veut rattraper
  // aujourd'hui — le compromis évite de scanner les 1904 lignes.
  const todoRows = (recentActivities ?? []).map((a) => ({
    activity: a as ActivityRow,
    reasons: reasonsFor(a as ActivityRow, races, debriefedRaceIds),
  })).filter((r) => r.reasons.length > 0)

  const displayedRows: { activity: ActivityRow; reasons: Reason[] }[] = todoMode
    ? todoRows
    : (pageActivities ?? []).map((a) => ({
        activity: a as ActivityRow,
        reasons: reasonsFor(a as ActivityRow, races, debriefedRaceIds),
      }))

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-baseline justify-between">
        <ScreenTitle>Activités</ScreenTitle>
        <p className="text-sm text-granit">
          <span className="tabular">{total}</span> au total
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <Link
          href="/activities"
          className={
            'rounded-data border px-3 py-1 ' +
            (!todoMode
              ? 'border-schiste bg-schiste text-craie'
              : 'border-granit/40 text-schiste hover:bg-craie')
          }
        >
          Toutes
        </Link>
        <Link
          href="/activities?filter=todo"
          className={
            'rounded-data border px-3 py-1 ' +
            (todoMode
              ? 'border-schiste bg-schiste text-craie'
              : 'border-granit/40 text-schiste hover:bg-craie')
          }
        >
          À traiter{' '}
          <span className="tabular text-xs">({todoRows.length})</span>
        </Link>
        {todoMode && (
          <span className="text-xs italic text-granit">
            parmi les {TODO_SCAN_WINDOW} plus récentes
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-6 text-sm text-granit">
          Aucune activité pour l&apos;instant.{' '}
          <Link href="/settings/strava" className="underline">
            Connecter Strava
          </Link>{' '}
          pour importer.
        </p>
      ) : todoMode && todoRows.length === 0 ? (
        <p className="mt-6 text-sm text-granit">
          Rien à traiter dans les {TODO_SCAN_WINDOW} activités les plus récentes.
          Débriefs, fueling logs et liaisons courses sont à jour.
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-data bg-craie">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-granit">
                <tr>
                  <th className="px-3 py-2 font-normal">Date</th>
                  <th className="px-3 py-2 font-normal">Sport</th>
                  <th className="px-3 py-2 font-normal">Séance</th>
                  {todoMode && (
                    <th className="px-3 py-2 font-normal">À faire</th>
                  )}
                  <th className="px-3 py-2 font-normal text-right">Distance</th>
                  <th className="px-3 py-2 font-normal text-right">D+</th>
                  <th className="px-3 py-2 font-normal text-right">Durée</th>
                  <th className="px-3 py-2 font-normal text-right">Allure</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map(({ activity: a, reasons }) => {
                  const candidateRace =
                    !a.race_id && races.length > 0
                      ? candidatesForActivity(a, races)[0] ?? null
                      : null
                  return (
                  <tr
                    key={a.id}
                    className="border-t border-brume hover:bg-brume/40"
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular text-schiste">
                      <Link href={`/activities/${a.id}`} className="block">
                        {formatDateCourte(a.started_at)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-granit">
                      <Link href={`/activities/${a.id}`} className="block">
                        {a.sport_type ?? '—'}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-schiste">
                      <Link
                        href={`/activities/${a.id}`}
                        className="flex items-center gap-2"
                      >
                        <span className="truncate">{a.name ?? '—'}</span>
                        {a.race_id && (
                          <IconFlag
                            className="shrink-0 text-granit"
                            title="Liée à une course"
                          />
                        )}
                        {candidateRace && (
                          <IconLink
                            className="shrink-0 text-ocre"
                            title={`Course à lier ? ${candidateRace.name}`}
                          />
                        )}
                        {a.user_notes && (
                          <IconPencil
                            className="shrink-0 text-granit"
                            title="Notes personnelles"
                          />
                        )}
                        {Array.isArray(a.fueling_logs) && a.fueling_logs.length > 0 && (
                          <span
                            className="shrink-0 font-mono text-xs text-granit"
                            title="Fueling loggé"
                          >
                            g/h
                          </span>
                        )}
                      </Link>
                    </td>
                    {todoMode && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {reasons.map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1 rounded-data border border-ocre/40 pl-1.5 font-mono text-xs uppercase text-ocre"
                            >
                              <Link
                                href={`/activities/${a.id}`}
                                className="py-0.5"
                              >
                                {REASON_LABEL[r]}
                              </Link>
                              <form action={toggleTodoDismissed} className="flex">
                                <input
                                  type="hidden"
                                  name="activity_id"
                                  value={a.id}
                                />
                                <input type="hidden" name="reason" value={r} />
                                <button
                                  type="submit"
                                  title="Ne s'applique pas à cette séance"
                                  className="px-1.5 py-0.5 text-ocre/60 hover:bg-ocre/10 hover:text-ocre"
                                >
                                  ×
                                </button>
                              </form>
                            </span>
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      <Link href={`/activities/${a.id}`} className="block">
                        {formatDistance(a.distance_m)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      <Link href={`/activities/${a.id}`} className="block">
                        {formatDplus(a.elevation_gain_m)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      <Link href={`/activities/${a.id}`} className="block">
                        {formatDuree(a.moving_time_s)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      <Link href={`/activities/${a.id}`} className="block">
                        {formatAllure(a.avg_pace_s_per_km)}
                      </Link>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!todoMode && (
            <nav className="mt-4 flex items-center justify-between text-sm text-granit">
              {page > 1 ? (
                <Link
                  href={`/activities?page=${page - 1}`}
                  className="rounded-data border border-granit/50 px-3 py-1 text-schiste hover:bg-craie"
                >
                  ← Précédent
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page <span className="tabular">{page}</span> sur{' '}
                <span className="tabular">{totalPages}</span>
              </span>
              {page < totalPages ? (
                <Link
                  href={`/activities?page=${page + 1}`}
                  className="rounded-data border border-granit/50 px-3 py-1 text-schiste hover:bg-craie"
                >
                  Suivant →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </main>
  )
}

/**
 * Trois raisons d'atterrir dans « à traiter » — memes priorites que
 * /aujourdhui, mais en liste complete. Ordre : debrief, fueling, lien.
 */
function reasonsFor(
  a: ActivityRow,
  races: RaceForMatch[],
  debriefedRaceIds: Set<string>,
): Reason[] {
  const dismissed = new Set(a.todo_dismissed ?? [])
  const out: Reason[] = []
  if (a.race_id && !debriefedRaceIds.has(a.race_id) && !dismissed.has('debrief'))
    out.push('debrief')
  const hasFueling = Array.isArray(a.fueling_logs) && a.fueling_logs.length > 0
  if (
    a.moving_time_s != null &&
    a.moving_time_s >= LONG_SECS &&
    isRaceEligibleSport(a.sport_type) &&
    !hasFueling &&
    !dismissed.has('fueling')
  ) {
    out.push('fueling')
  }
  if (
    !a.race_id &&
    !dismissed.has('link') &&
    candidatesForActivity(a, races).length > 0
  )
    out.push('link')
  return out
}
