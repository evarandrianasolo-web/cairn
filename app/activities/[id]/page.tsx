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
