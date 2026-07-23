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
import { candidatesForActivity, type RaceForMatch } from '@/lib/race-matching'

const PAGE_SIZE = 50

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { page: rawPage } = await searchParams
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [{ data: activities, count }, { data: allRaces }] = await Promise.all([
    supabase
      .from('activities')
      .select(
        'id, started_at, sport_type, name, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km, user_notes, race_id, fueling_logs(id)',
        { count: 'exact' },
      )
      .order('started_at', { ascending: false })
      .range(from, to),
    supabase
      .from('races')
      .select('id, name, race_date, distance_m')
      .order('race_date', { ascending: false })
      .limit(200),
  ])

  const races = (allRaces ?? []) as RaceForMatch[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-baseline justify-between">
        <ScreenTitle>Activités</ScreenTitle>
        <p className="text-sm text-granit">
          <span className="tabular">{total}</span> au total
        </p>
      </div>

      {total === 0 ? (
        <p className="mt-6 text-sm text-granit">
          Aucune activité pour l&apos;instant.{' '}
          <Link href="/settings/strava" className="underline">
            Connecter Strava
          </Link>{' '}
          pour importer.
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
                  <th className="px-3 py-2 font-normal text-right">Distance</th>
                  <th className="px-3 py-2 font-normal text-right">D+</th>
                  <th className="px-3 py-2 font-normal text-right">Durée</th>
                  <th className="px-3 py-2 font-normal text-right">Allure</th>
                </tr>
              </thead>
              <tbody>
                {activities?.map((a) => {
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
                      <Link href={`/activities/${a.id}`} className="block">
                        {a.name ?? '—'}
                        {a.race_id && (
                          <span
                            className="ml-2 text-xs text-granit"
                            title="course"
                          >
                            🏁
                          </span>
                        )}
                        {candidateRace && (
                          <span
                            className="ml-2 text-xs text-ocre"
                            title={`course à lier ? ${candidateRace.name}`}
                          >
                            🔗
                          </span>
                        )}
                        {a.user_notes && (
                          <span
                            className="ml-2 text-xs text-granit"
                            title="notes personnelles"
                          >
                            ✎
                          </span>
                        )}
                        {Array.isArray(a.fueling_logs) && a.fueling_logs.length > 0 && (
                          <span
                            className="ml-1 font-mono text-xs text-granit"
                            title="fueling loggé"
                          >
                            g/h
                          </span>
                        )}
                      </Link>
                    </td>
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
        </>
      )}
    </main>
  )
}
