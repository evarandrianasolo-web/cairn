import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDistance, formatDplus, formatDuree } from '@/lib/format'
import {
  aggregateByWeek,
  aggregateBySport,
  isoWeekStart,
  type WeeklyActivity,
} from '@/lib/analytics'

const WEEK_COUNT = 12
const DAY_MS = 24 * 60 * 60 * 1000

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const since = isoWeekStart(new Date(Date.now() - (WEEK_COUNT - 1) * 7 * DAY_MS))
  const { data: rows } = await supabase
    .from('activities')
    .select('started_at, sport_type, distance_m, elevation_gain_m, moving_time_s')
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: false })

  const activities = (rows ?? []) as WeeklyActivity[]
  const weeks = aggregateByWeek(activities, WEEK_COUNT)
  const bySport = aggregateBySport(activities)

  const totalDistanceM = weeks.reduce((s, w) => s + w.distanceM, 0)
  const totalElevationM = weeks.reduce((s, w) => s + w.elevationM, 0)
  const totalSessions = weeks.reduce((s, w) => s + w.sessions, 0)
  const totalTimeS = weeks.reduce((s, w) => s + w.timeS, 0)
  const longestM = Math.max(0, ...weeks.map((w) => w.longestM))
  const maxWeekDistance = Math.max(1, ...weeks.map((w) => w.distanceM))
  const maxWeekElevation = Math.max(1, ...weeks.map((w) => w.elevationM))

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="flex items-baseline justify-between">
        <ScreenTitle>Dashboard</ScreenTitle>
        <p className="text-xs text-granit">12 dernières semaines</p>
      </div>

      <section className="grid grid-cols-2 gap-3 rounded-data bg-craie p-4 sm:grid-cols-4">
        <Stat label="Distance" value={formatDistance(totalDistanceM)} />
        <Stat label="D+" value={formatDplus(totalElevationM)} />
        <Stat label="Séances" value={String(totalSessions)} />
        <Stat label="Temps" value={formatDuree(totalTimeS)} />
        <Stat label="Plus longue" value={formatDistance(longestM)} />
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Charge hebdo
        </h2>
        <div className="mt-3 rounded-data bg-craie p-4">
          <ul className="space-y-2">
            {weeks.map((w) => {
              const distPct = (w.distanceM / maxWeekDistance) * 100
              const elevPct = (w.elevationM / maxWeekElevation) * 100
              return (
                <li key={w.key} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                  <div className="w-32 shrink-0 tabular text-xs text-granit">
                    <span className="font-mono">S{w.isoWeek}</span>{' '}
                    <span>{MONTH_LABEL.format(w.weekStart)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="h-3 rounded-data bg-brume">
                      <div
                        className="h-3 rounded-data bg-schiste"
                        style={{ width: `${distPct}%` }}
                      />
                    </div>
                    <div className="h-1.5 rounded-data bg-brume">
                      <div
                        className="h-1.5 rounded-data bg-granit"
                        style={{ width: `${elevPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="tabular text-right text-xs">
                    <div className="text-schiste">{formatDistance(w.distanceM)}</div>
                    <div className="text-granit">{formatDplus(w.elevationM)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-granit">
            <span className="mr-3">
              <span className="mr-1 inline-block h-2 w-3 rounded-data bg-schiste align-middle" />
              distance
            </span>
            <span>
              <span className="mr-1 inline-block h-1 w-3 rounded-data bg-granit align-middle" />
              D+
            </span>
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Par sport
        </h2>
        <ul className="mt-3 space-y-2">
          {bySport.map((s) => {
            const share = totalSessions > 0 ? (s.sessions / totalSessions) * 100 : 0
            return (
              <li
                key={s.sport}
                className="grid grid-cols-[10rem_1fr_auto] gap-3 items-center rounded-data bg-craie px-3 py-2"
              >
                <div className="text-sm text-schiste">{s.sport}</div>
                <div className="h-2 rounded-data bg-brume">
                  <div
                    className="h-2 rounded-data bg-schiste"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <div className="tabular text-right text-xs text-granit">
                  <span className="text-schiste">{s.sessions}</span> ·{' '}
                  {formatDistance(s.distanceM)} · {formatDuree(s.timeS)}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-granit">{label}</p>
      <p className="tabular text-lg font-medium text-schiste">{value}</p>
    </div>
  )
}
