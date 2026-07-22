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
import { updateActivityNotes } from '../actions'

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

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const { ok } = await searchParams

  const { data: activity } = await supabase
    .from('activities')
    .select(
      'id, name, description, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km, avg_cadence, strava_activity_id, user_notes',
    )
    .eq('id', id)
    .maybeSingle()

  if (!activity) redirect('/activities')

  const { data: fueling } = await supabase
    .from('fueling_logs')
    .select(
      'id, intake_pattern, carbs_g, carbs_g_per_hour, products, issue, post_window_fed, notes',
    )
    .eq('activity_id', activity.id)
    .maybeSingle()

  const isLongEnough =
    activity.moving_time_s != null && activity.moving_time_s >= LONG_SECS

  const stravaUrl = activity.strava_activity_id
    ? `https://www.strava.com/activities/${activity.strava_activity_id}`
    : null

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-baseline justify-between">
        <Link
          href="/activities"
          className="text-xs text-granit hover:text-schiste"
        >
          ← retour
        </Link>
        <p className="tabular text-sm text-granit">
          {formatDateCourte(activity.started_at)}
        </p>
      </div>

      <ScreenTitle>{activity.name ?? 'Séance sans titre'}</ScreenTitle>

      <div className="grid grid-cols-2 gap-3 rounded-data bg-craie p-4 sm:grid-cols-4">
        <Stat label="Sport" value={activity.sport_type ?? '—'} plain />
        <Stat label="Distance" value={formatDistance(activity.distance_m)} />
        <Stat label="D+" value={formatDplus(activity.elevation_gain_m)} />
        <Stat label="Durée" value={formatDuree(activity.moving_time_s)} />
        <Stat label="Allure" value={formatAllure(activity.avg_pace_s_per_km)} />
        <Stat
          label="Cadence"
          value={activity.avg_cadence != null ? `${activity.avg_cadence}` : '—'}
        />
      </div>

      {activity.description && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Depuis Strava
          </h2>
          <p className="mt-2 whitespace-pre-line text-base text-schiste">
            {activity.description}
          </p>
        </section>
      )}

      <section>
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Fueling
        </h2>
        {fueling ? (
          <div className="mt-3 rounded-data border border-brume bg-craie px-3 py-3">
            <p className="text-base text-schiste">
              <span className="font-mono tabular text-schiste">
                {fueling.carbs_g_per_hour != null
                  ? `${fueling.carbs_g_per_hour} g/h`
                  : `— g/h`}
              </span>
              {' · '}
              <span>{INTAKE_LABELS[fueling.intake_pattern as keyof typeof INTAKE_LABELS]}</span>
              {fueling.issue !== 'aucun' && (
                <>
                  {' · '}
                  <span className="text-ocre">
                    {ISSUE_LABELS[fueling.issue as keyof typeof ISSUE_LABELS]}
                  </span>
                </>
              )}
              {fueling.post_window_fed && (
                <span className="ml-2 text-xs text-granit">post ✓</span>
              )}
            </p>
            {(fueling.products as { text?: string } | null)?.text && (
              <p className="mt-1 text-sm italic text-granit">
                {(fueling.products as { text?: string }).text}
              </p>
            )}
            {fueling.notes && (
              <p className="mt-1 text-sm text-granit whitespace-pre-line">
                {fueling.notes}
              </p>
            )}
            <Link
              href={`/fueling?edit=${fueling.id}`}
              className="mt-3 inline-block text-xs text-granit hover:text-schiste"
            >
              modifier le fueling
            </Link>
          </div>
        ) : isLongEnough ? (
          <div className="mt-3">
            <Link
              href={`/fueling?activity=${activity.id}`}
              className="inline-block rounded-surface border border-schiste bg-schiste px-3 py-2 text-sm font-medium text-craie"
            >
              Logger un fueling
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-granit">
            Séance de moins d&apos;1 h 30 — pas de log de fueling à cette échelle.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Mes notes
        </h2>
        <form action={updateActivityNotes} className="mt-3">
          <input type="hidden" name="id" value={activity.id} />
          <textarea
            name="user_notes"
            rows={5}
            defaultValue={activity.user_notes ?? ''}
            placeholder="Sensations, contexte, matériel, ce qui a marché ou pas. Indépendant de la description Strava — n'est jamais écrasé par un re-import."
            className="w-full rounded-data border border-granit/35 bg-craie px-3 py-2 text-base text-schiste focus:border-schiste focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-granit">
              {ok === '1' ? 'Enregistré.' : ''}
            </p>
            <button
              type="submit"
              className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </section>

      {stravaUrl && (
        <p className="text-xs text-granit">
          <a
            href={stravaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-schiste"
          >
            Voir sur Strava ↗
          </a>
        </p>
      )}
    </main>
  )
}

function Stat({
  label,
  value,
  plain = false,
}: {
  label: string
  value: string
  plain?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-granit">{label}</p>
      <p
        className={
          'text-lg text-schiste ' + (plain ? '' : 'tabular font-medium')
        }
      >
        {value}
      </p>
    </div>
  )
}
