import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDateCourte, formatDistance, formatDuree } from '@/lib/format'
import { NewFuelingForm } from './new-fueling-form'
import { deleteFuelingLog } from './actions'

type FuelingLog = {
  id: string
  activity_id: string | null
  intake_pattern: 'rien' | 'un_peu' | 'regulierement'
  carbs_g: number | null
  carbs_g_per_hour: number | null
  products: { text?: string } | null
  issue: 'aucun' | 'oubli' | 'nausee' | 'pas_acces' | 'autre'
  post_window_fed: boolean | null
  notes: string | null
  created_at: string
  activities: {
    started_at: string
    name: string | null
    sport_type: string | null
    distance_m: number | null
    moving_time_s: number | null
  } | null
}

const INTAKE_LABELS = {
  rien: 'rien',
  un_peu: 'un peu',
  regulierement: 'régulièrement',
} as const

const ISSUE_LABELS = {
  aucun: 'ok',
  oubli: 'oublié',
  nausee: 'nausée',
  pas_acces: 'pas d\'accès',
  autre: 'autre',
} as const

const LONG_SECS = 90 * 60

export default async function FuelingPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur } = await searchParams

  // Sélectionne les 20 séances les plus récentes qualifiées de « longues »
  // pour proposer un log de fueling. Seuil : 90 min de moving time.
  const { data: candidateActivities } = await supabase
    .from('activities')
    .select('id, name, sport_type, started_at, distance_m, moving_time_s')
    .gte('moving_time_s', LONG_SECS)
    .order('started_at', { ascending: false })
    .limit(20)

  const { data: logs } = await supabase
    .from('fueling_logs')
    .select(
      'id, activity_id, intake_pattern, carbs_g, carbs_g_per_hour, products, issue, post_window_fed, notes, created_at, activities(started_at, name, sport_type, distance_m, moving_time_s)',
    )
    .order('created_at', { ascending: false })
    .limit(30)

  const loggedActivityIds = new Set((logs ?? []).map((l) => l.activity_id).filter(Boolean))
  const activities = (candidateActivities ?? []).filter(
    (a) => !loggedActivityIds.has(a.id),
  )

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ScreenTitle>Fueling</ScreenTitle>

      {erreur && (
        // ocre = vigilance ; jamais balise pour un message d'erreur.
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}

      {activities.length > 0 ? (
        <NewFuelingForm activities={activities} />
      ) : (
        <p className="text-base text-granit">
          Toutes tes sorties longues récentes sont déjà loggées, ou tu n&apos;en as pas
          eu ces derniers jours. Un fueling se logge après une séance de plus de
          1 h 30.
        </p>
      )}

      {logs && logs.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Historique
          </h2>
          <ul className="mt-3 space-y-2">
            {(logs as unknown as FuelingLog[]).map((l) => (
              <LogItem key={l.id} log={l} />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function LogItem({ log }: { log: FuelingLog }) {
  const activity = log.activities
  return (
    <li className="rounded-data border border-brume bg-craie px-3 py-2">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          {activity ? (
            <p className="text-base text-schiste">
              <span className="tabular text-sm text-granit">
                {formatDateCourte(activity.started_at)}
              </span>{' '}
              · {activity.sport_type ?? '—'} · {formatDistance(activity.distance_m)} ·{' '}
              {formatDuree(activity.moving_time_s)}
            </p>
          ) : (
            <p className="text-base text-granit italic">séance supprimée</p>
          )}

          <p className="mt-1 text-sm text-schiste">
            <span className="font-mono tabular text-schiste">
              {log.carbs_g_per_hour != null
                ? `${log.carbs_g_per_hour} g/h`
                : `— g/h`}
            </span>
            {' · '}
            <span>{INTAKE_LABELS[log.intake_pattern]}</span>
            {log.issue !== 'aucun' && (
              <>
                {' · '}
                <span className="text-ocre">{ISSUE_LABELS[log.issue]}</span>
              </>
            )}
            {log.post_window_fed && (
              <span className="ml-2 text-xs text-granit">post ✓</span>
            )}
          </p>

          {log.products?.text && (
            <p className="mt-1 text-xs italic text-granit">{log.products.text}</p>
          )}
          {log.notes && (
            <p className="mt-1 text-xs text-granit whitespace-pre-line">{log.notes}</p>
          )}
        </div>

        <form action={deleteFuelingLog}>
          <input type="hidden" name="id" value={log.id} />
          <button
            type="submit"
            aria-label="Supprimer"
            className="text-granit hover:text-schiste"
          >
            ×
          </button>
        </form>
      </div>
    </li>
  )
}
