import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  daysUntil,
  formatDistance,
  formatDplus,
  formatDuree,
  formatJMinus,
  formatRaceDate,
} from '@/lib/format'
import {
  aggregateByWeek,
  aggregateBySport,
  isoWeekStart,
  type WeeklyActivity,
} from '@/lib/analytics'

const WEEK_COUNT = 13
const DAY_MS = 24 * 60 * 60 * 1000
const LONG_SECS = 90 * 60

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
})

type RaceRow = {
  id: string
  name: string
  race_date: string
  location: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  priority: 'A' | 'B' | 'C'
  status: string | null
  result_time_s: number | null
}

type DebriefRow = {
  id: string
  kind: string
  narrative: string | null
  what_worked: string | null
  what_failed: string | null
  focus_areas: unknown
  created_at: string
  race: { name: string } | null
}

type FuelingRow = {
  activity_id: string
  intake_pattern: string
  carbs_g: number | null
  carbs_g_per_hour: number | null
  issue: string | null
  post_window_fed: boolean | null
  created_at: string
  activity: {
    started_at: string
    name: string | null
    moving_time_s: number | null
  } | null
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const since = isoWeekStart(
    new Date(Date.now() - (WEEK_COUNT - 1) * 7 * DAY_MS),
  )
  const todayIso = new Date().toISOString().slice(0, 10)

  const [
    { data: activityRows },
    { data: nextRaceA },
    { data: doneRaces },
    { data: debriefsData },
    { data: fuelingData },
  ] = await Promise.all([
    supabase
      .from('activities')
      .select(
        'started_at, sport_type, distance_m, elevation_gain_m, moving_time_s',
      )
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: false }),
    supabase
      .from('races')
      .select(
        'id, name, race_date, location, distance_m, elevation_gain_m, priority',
      )
      .eq('priority', 'A')
      .gte('race_date', todayIso)
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('races')
      .select(
        'id, name, race_date, location, distance_m, elevation_gain_m, priority, status, result_time_s',
      )
      .eq('status', 'terminee')
      .lt('race_date', todayIso)
      .order('race_date', { ascending: false })
      .limit(8),
    supabase
      .from('debriefs')
      .select(
        'id, kind, narrative, what_worked, what_failed, focus_areas, created_at, race:races(name)',
      )
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('fueling_logs')
      .select(
        'activity_id, intake_pattern, carbs_g, carbs_g_per_hour, issue, post_window_fed, created_at, activity:activities!fueling_logs_activity_id_fkey(started_at, name, moving_time_s)',
      )
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const activities = (activityRows ?? []) as WeeklyActivity[]
  const weeks = aggregateByWeek(activities, WEEK_COUNT)
  const bySport = aggregateBySport(activities)

  const totalDistanceM = weeks.reduce((s, w) => s + w.distanceM, 0)
  const totalElevationM = weeks.reduce((s, w) => s + w.elevationM, 0)
  const totalSessions = weeks.reduce((s, w) => s + w.sessions, 0)
  const totalTimeS = weeks.reduce((s, w) => s + w.timeS, 0)
  const longestM = Math.max(0, ...weeks.map((w) => w.longestM))
  const maxWeekDistance = Math.max(1, ...weeks.map((w) => w.distanceM))
  const maxWeekElevation = Math.max(1, ...weeks.map((w) => w.elevationM))

  const debriefs = (debriefsData ?? []) as unknown as DebriefRow[]
  const latestDebrief = debriefs[0] ?? null
  const focusAreas = extractFocusAreas(latestDebrief?.focus_areas)

  // Longues sorties (>= 90 min) et leur fueling s'il existe.
  const longs = activities
    .filter((a) => (a.moving_time_s ?? 0) >= LONG_SECS)
    .slice(0, 8)
  const fuelingByDate = new Map<string, FuelingRow>()
  for (const f of (fuelingData ?? []) as unknown as FuelingRow[]) {
    if (f.activity?.started_at) {
      const key = f.activity.started_at.slice(0, 10)
      fuelingByDate.set(key, f)
    }
  }
  const fuelingLongs = longs
    .map((a) => {
      const key = a.started_at.slice(0, 10)
      const f = fuelingByDate.get(key)
      return { activity: a, fueling: f ?? null, activityName: f?.activity?.name ?? null }
    })
    .slice(0, 4)

  const races = (doneRaces ?? []) as RaceRow[]

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <ScreenTitle>Dashboard</ScreenTitle>

      {nextRaceA && <RaceHeader race={nextRaceA} />}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BigStat
          label={`km · ${WEEK_COUNT} sem.`}
          value={formatDistance(totalDistanceM)}
        />
        <BigStat
          label="D+ cumulé"
          value={formatDplus(totalElevationM)}
          highlight
        />
        <BigStat label="Séances" value={String(totalSessions)} />
        <BigStat label="Temps sur pieds" value={formatDuree(totalTimeS)} />
        <BigStat label="Plus longue" value={formatDistance(longestM)} />
      </section>

      <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Charge hebdo
          </h2>
          <span className="font-mono text-[10px] text-granit">
            {WEEK_COUNT} sem.
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {weeks.map((w) => {
            const distPct = (w.distanceM / maxWeekDistance) * 100
            const elevPct = (w.elevationM / maxWeekElevation) * 100
            return (
              <li
                key={w.key}
                className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[7rem_1fr_auto]"
              >
                <div className="tabular text-[10px] text-granit sm:text-xs">
                  <span className="font-mono">S{w.isoWeek}</span>
                  <span className="ml-1 hidden sm:inline">
                    {MONTH_LABEL.format(w.weekStart)}
                  </span>
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
                <div className="tabular text-right text-[10px] leading-tight sm:text-xs">
                  <div className="text-schiste">
                    {formatDistance(w.distanceM)}
                  </div>
                  <div className="text-granit">{formatDplus(w.elevationM)}</div>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 flex gap-3 font-mono text-[10px] text-granit">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-data bg-schiste" />
            distance
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-3 rounded-data bg-granit" />
            D+
          </span>
        </p>
      </section>

      {races.length > 0 && (
        <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Palmarès saison
          </h2>
          <ul className="mt-3 divide-y divide-brume">
            {races.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="tabular font-mono text-[10px] uppercase text-granit sm:w-16">
                  {r.priority}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/courses?edit=${r.id}`}
                    className="block truncate text-schiste hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="tabular font-mono text-[10px] text-granit">
                    {formatRaceDate(r.race_date)}
                    {r.distance_m ? ` · ${formatDistance(r.distance_m)}` : ''}
                    {r.elevation_gain_m
                      ? ` · ${formatDplus(r.elevation_gain_m)}`
                      : ''}
                  </div>
                </div>
                {r.result_time_s != null && (
                  <span className="tabular font-mono text-xs text-schiste">
                    {formatDuree(r.result_time_s)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {latestDebrief && focusAreas.length > 0 && (
        <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
              Axes actifs
            </h2>
            <span className="font-mono text-[10px] text-granit">
              {latestDebrief.race?.name ?? 'dernier débrief'}
            </span>
          </div>
          <ul className="mt-3 space-y-3">
            {focusAreas.slice(0, 5).map((focus, i) => {
              const isPriority = i === 0
              return (
                <li
                  key={focus}
                  className="border-l-2 pl-3 text-sm text-schiste"
                  style={{
                    borderLeftColor: isPriority ? '#d6423b' : '#c68a3e',
                  }}
                >
                  <div className="font-mono text-[10px] uppercase text-granit">
                    A{i + 1}
                    {isPriority && (
                      <span className="ml-1 text-balise">· priorité</span>
                    )}
                  </div>
                  <div className="mt-1">{focus}</div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {fuelingLongs.length > 0 && (
        <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            État fueling · dernières longues
          </h2>
          <ul className="mt-3 space-y-2">
            {fuelingLongs.map(({ activity, fueling, activityName }) => {
              const gph = computeGramsPerHour(fueling, activity.moving_time_s)
              const state = deriveFuelingState(fueling, gph)
              return (
                <li
                  key={activity.started_at}
                  className="flex items-center gap-3 text-sm"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: state.color }}
                    title={state.label}
                  />
                  <span className="tabular font-mono text-[10px] text-granit sm:w-16">
                    {MONTH_LABEL.format(new Date(activity.started_at))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-schiste">
                    {activityName ?? formatDistance(activity.distance_m)}
                  </span>
                  <span className="tabular text-right font-mono text-[10px] text-granit">
                    {gph != null
                      ? `${Math.round(gph)} g/h`
                      : fueling
                        ? 'loggé'
                        : 'non loggé'}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 border-t border-brume pt-2 text-[11px] italic text-granit">
            Additif jamais restrictif — repères 🟢 ≥ 50 g/h, 🟡 20-50 g/h, 🔴 &lt;
            20 g/h.
          </p>
        </section>
      )}

      <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Répartition sport
        </h2>
        <ul className="mt-3 space-y-2">
          {bySport.map((s) => {
            const share =
              totalSessions > 0 ? (s.sessions / totalSessions) * 100 : 0
            return (
              <li
                key={s.sport}
                className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-sm"
              >
                <div className="truncate text-xs text-schiste">{s.sport}</div>
                <div className="h-2 rounded-data bg-brume">
                  <div
                    className="h-2 rounded-data bg-schiste"
                    style={{ width: `${share}%` }}
                  />
                </div>
                <div className="tabular text-right font-mono text-[10px] text-granit">
                  {s.sessions}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}

function RaceHeader({
  race,
}: {
  race: {
    id: string
    name: string
    race_date: string
    location: string | null
    distance_m: number | null
    elevation_gain_m: number | null
  }
}) {
  const j = daysUntil(race.race_date)
  return (
    <section className="rounded-data border border-brume bg-craie p-4">
      <div className="font-mono text-[10px] uppercase tracking-wide text-granit">
        Cap sur
      </div>
      <h2 className="font-display mt-1 text-xl font-extrabold uppercase leading-tight tracking-[0.02em] text-schiste break-words sm:text-3xl">
        {race.name}
      </h2>
      <div className="mt-3 flex items-baseline justify-between border-t border-brume pt-3">
        <div>
          <div className="font-display text-4xl font-black leading-none text-balise">
            {formatJMinus(race.race_date)}
          </div>
          <div className="tabular mt-1 font-mono text-[10px] text-granit">
            {formatRaceDate(race.race_date)}
            {race.distance_m ? ` · ${formatDistance(race.distance_m)}` : ''}
            {race.elevation_gain_m
              ? ` · ${formatDplus(race.elevation_gain_m)}`
              : ''}
            {race.location ? ` · ${race.location}` : ''}
          </div>
        </div>
        <span className="tabular font-mono text-[10px] text-granit">
          {j > 0 ? `${j} j` : 'aujourd\'hui'}
        </span>
      </div>
    </section>
  )
}

function BigStat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-data border border-brume bg-craie px-3 py-2 sm:px-4 sm:py-3">
      <div
        className={
          'font-display text-xl font-extrabold leading-none sm:text-2xl ' +
          (highlight ? 'text-balise' : 'text-schiste')
        }
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] text-granit">{label}</div>
    </div>
  )
}

function extractFocusAreas(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    )
  }
  return []
}

/**
 * Etat fueling derive additif -- jamais restrictif. Reperes visuels
 * seulement, pas un score sur 100 (regle CLAUDE.md).
 * Trois cas : pas de log (gris granit), log sans g/h calculable (gris
 * fonce), log calculable avec 3 paliers verts/ocre/rouge.
 */
function deriveFuelingState(
  fueling: FuelingRow | null,
  gph: number | null,
): { color: string; label: string } {
  if (!fueling) return { color: '#c5c5c0', label: 'non loggé' }
  if (gph == null) return { color: '#767e7b', label: 'loggé sans g/h' }
  if (gph >= 50) return { color: '#9ba88d', label: 'bien' }
  if (gph >= 20) return { color: '#c68a3e', label: 'à monter' }
  return { color: '#d6423b', label: 'très bas' }
}

/** g/h calculable soit direct (carbs_g_per_hour renseigne) soit
 * derive de carbs_g / duree. Retourne null si aucun des deux. */
function computeGramsPerHour(
  fueling: FuelingRow | null,
  movingTimeS: number | null,
): number | null {
  if (!fueling) return null
  if (fueling.carbs_g_per_hour != null) return fueling.carbs_g_per_hour
  if (fueling.carbs_g != null && movingTimeS && movingTimeS > 0) {
    return (fueling.carbs_g * 3600) / movingTimeS
  }
  return null
}
