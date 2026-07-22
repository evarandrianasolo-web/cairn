import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDistance, formatDplus, formatDuree } from '@/lib/format'

type Activity = {
  started_at: string
  sport_type: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
}

const WEEK_COUNT = 12
const DAY_MS = 24 * 60 * 60 * 1000

/** Lundi 00:00 UTC de la semaine ISO contenant la date. */
function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7 // Lundi = 1 … Dimanche = 7
  d.setUTCDate(d.getUTCDate() - dayNum + 1)
  return d
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

type WeekBucket = {
  key: string
  isoWeek: number
  weekStart: Date
  sessions: number
  distanceM: number
  elevationM: number
  timeS: number
  longestM: number
}

function aggregateByWeek(activities: Activity[]): WeekBucket[] {
  const nowMonday = isoWeekStart(new Date())
  const buckets = new Map<string, WeekBucket>()
  for (let i = WEEK_COUNT - 1; i >= 0; i--) {
    const start = new Date(nowMonday.getTime() - i * 7 * DAY_MS)
    const key = start.toISOString().slice(0, 10)
    buckets.set(key, {
      key,
      isoWeek: isoWeekNumber(start),
      weekStart: start,
      sessions: 0,
      distanceM: 0,
      elevationM: 0,
      timeS: 0,
      longestM: 0,
    })
  }

  for (const a of activities) {
    const start = isoWeekStart(new Date(a.started_at))
    const key = start.toISOString().slice(0, 10)
    const b = buckets.get(key)
    if (!b) continue
    b.sessions += 1
    b.distanceM += a.distance_m ?? 0
    b.elevationM += a.elevation_gain_m ?? 0
    b.timeS += a.moving_time_s ?? 0
    if ((a.distance_m ?? 0) > b.longestM) b.longestM = a.distance_m ?? 0
  }

  return [...buckets.values()]
}

type SportBucket = { sport: string; sessions: number; distanceM: number; timeS: number }

function aggregateBySport(activities: Activity[]): SportBucket[] {
  const map = new Map<string, SportBucket>()
  for (const a of activities) {
    const sport = a.sport_type ?? 'Autre'
    const b = map.get(sport) ?? { sport, sessions: 0, distanceM: 0, timeS: 0 }
    b.sessions += 1
    b.distanceM += a.distance_m ?? 0
    b.timeS += a.moving_time_s ?? 0
    map.set(sport, b)
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions)
}

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

  const activities = (rows ?? []) as Activity[]
  const weeks = aggregateByWeek(activities)
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
