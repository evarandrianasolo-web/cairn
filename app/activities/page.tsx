import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  formatAllure,
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'

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

  const { data: activities, count } = await supabase
    .from('activities')
    .select(
      'id, started_at, sport_type, name, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km',
      { count: 'exact' },
    )
    .order('started_at', { ascending: false })
    .range(from, to)

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-xl text-schiste">Activités</h1>
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
                {activities?.map((a) => (
                  <tr key={a.id} className="border-t border-brume">
                    <td className="px-3 py-2 tabular text-schiste">
                      {formatDateCourte(a.started_at)}
                    </td>
                    <td className="px-3 py-2 text-granit">{a.sport_type ?? '—'}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-schiste">
                      {a.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      {formatDistance(a.distance_m)}
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      {formatDplus(a.elevation_gain_m)}
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      {formatDuree(a.moving_time_s)}
                    </td>
                    <td className="px-3 py-2 tabular text-right text-schiste">
                      {formatAllure(a.avg_pace_s_per_km)}
                    </td>
                  </tr>
                ))}
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
