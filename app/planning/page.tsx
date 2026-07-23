import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'
import { isoWeekStart, isoWeekNumber, isoWeekMonday } from '@/lib/analytics'
import { IconFlag } from '@/components/icons'
import { deletePlanWeek, generatePlanWeek, readjustPlanWeek } from './actions'

const DAY_MS = 24 * 60 * 60 * 1000

const SESSION_TYPE_LABEL: Record<string, string> = {
  endurance: 'EF',
  seuil: 'seuil',
  vma: 'VMA',
  cote: 'côte',
  longue: 'longue',
  recup: 'récup',
  renfo: 'renfo',
  rando: 'rando',
  course: 'course',
}

const PHASE_LABEL: Record<string, string> = {
  base: 'base',
  specifique: 'spécifique',
  choc: 'choc',
  affutage: 'affûtage',
  course: 'course',
  recup: 'récup',
}

type ActivityMatch = {
  id: string
  name: string | null
  sport_type: string | null
  started_at: string
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
}

type PlanWeekRow = {
  id: string
  iso_year: number
  iso_week: number
  phase: string
  target_distance_m: number | null
  target_elevation_m: number | null
  target_sessions: number | null
  notes: string | null
  target_race_id: string | null
  planned_sessions: {
    id: string
    scheduled_on: string
    session_type: string
    intent: string | null
    target_distance_m: number | null
    target_elevation_m: number | null
    target_duration_s: number | null
    is_club: boolean
    status: string
  }[]
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; generated?: string; readjusted?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur, generated, readjusted } = await searchParams

  const now = new Date()
  const currentMonday = isoWeekStart(now)
  const currentIsoWeek = isoWeekNumber(currentMonday)
  const targetMondayIso = currentMonday.toISOString().slice(0, 10)

  const { data: weeks } = await supabase
    .from('plan_weeks')
    .select(
      'id, iso_year, iso_week, phase, target_distance_m, target_elevation_m, target_sessions, notes, target_race_id, planned_sessions(id, scheduled_on, session_type, intent, target_distance_m, target_elevation_m, target_duration_s, is_club, status)',
    )
    .order('iso_year', { ascending: true })
    .order('iso_week', { ascending: true })

  const rows = (weeks ?? []) as PlanWeekRow[]

  // Fenetre englobante des semaines affichees pour rapatrier les
  // activites qui les touchent : min(monday) -> max(sunday).
  const activitiesByDate = new Map<string, ActivityMatch[]>()
  if (rows.length > 0) {
    const mondays = rows.map((w) => isoWeekMonday(w.iso_year, w.iso_week))
    const minMonday = new Date(Math.min(...mondays.map((d) => d.getTime())))
    const maxSunday = new Date(
      Math.max(...mondays.map((d) => d.getTime())) + 6 * DAY_MS,
    )
    const { data: acts } = await supabase
      .from('activities')
      .select(
        'id, name, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s',
      )
      .gte('started_at', minMonday.toISOString())
      .lte('started_at', new Date(maxSunday.getTime() + DAY_MS).toISOString())
      .order('started_at', { ascending: true })
    for (const a of (acts ?? []) as ActivityMatch[]) {
      const key = a.started_at.slice(0, 10)
      const list = activitiesByDate.get(key) ?? []
      list.push(a)
      activitiesByDate.set(key, list)
    }
  }
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <ScreenTitle>Planning</ScreenTitle>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}
      {generated && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          Semaine générée. Relis ci-dessous, tu peux la supprimer si elle ne
          convient pas.
        </p>
      )}
      {readjusted && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          Semaine réajustée à partir d&apos;aujourd&apos;hui. Les jours passés
          sont conservés.
        </p>
      )}

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          À partir de la semaine {currentIsoWeek} ·{' '}
          <span className="tabular">
            {formatDateCourte(currentMonday.toISOString())}
          </span>
        </h2>
        <p className="mt-2 text-sm text-granit">
          Le coach IA génère une à trois semaines consécutives (lundi →
          dimanche) à partir de tes 4 dernières semaines, ta prochaine course
          A, tes contraintes actives et tes derniers débriefs / logs fueling.
          Les semaines déjà planifiées sont ignorées.
        </p>
        <form action={generatePlanWeek} className="mt-3 space-y-3">
          <input type="hidden" name="target_monday" value={targetMondayIso} />
          <textarea
            name="user_hint"
            rows={3}
            placeholder="Notes pour la période (facultatif) — ex : « repos vendredi, sortie longue samedi 3h dans le Jura », « bloc côte », « fatigué, allègement »."
            className="w-full rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm text-schiste focus:border-schiste focus:outline-none"
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">
                Nombre de semaines à générer
              </span>
              <select
                name="weeks_count"
                defaultValue="3"
                className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              >
                <option value="1">1 semaine</option>
                <option value="2">2 semaines</option>
                <option value="3">3 semaines</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
            >
              Générer
            </button>
          </div>
        </form>
      </section>

      {rows.length === 0 ? (
        <p className="text-sm text-granit">
          Aucune semaine planifiée pour l&apos;instant.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((w) => (
            <WeekBlock
              key={w.id}
              week={w}
              activitiesByDate={activitiesByDate}
              todayIso={todayIso}
            />
          ))}
        </div>
      )}
    </main>
  )
}

const WEEKDAY_LABELS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const

function WeekBlock({
  week,
  activitiesByDate,
  todayIso,
}: {
  week: PlanWeekRow
  activitiesByDate: Map<string, ActivityMatch[]>
  todayIso: string
}) {
  const monday = isoWeekMonday(week.iso_year, week.iso_week)
  const sundayIso = new Date(monday.getTime() + 6 * DAY_MS)
    .toISOString()
    .slice(0, 10)
  const mondayIso = monday.toISOString().slice(0, 10)
  const isInProgress = todayIso >= mondayIso && todayIso <= sundayIso
  // On construit les 7 jours lundi -> dimanche ; chaque jour porte
  // les 0..N seances qui tombent dessus et les 0..N activites reelles
  // rapportees depuis Strava.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const dateIso = d.toISOString().slice(0, 10)
    const sessions = week.planned_sessions.filter(
      (s) => s.scheduled_on === dateIso,
    )
    const activities = activitiesByDate.get(dateIso) ?? []
    const isPast = dateIso < todayIso
    const isToday = dateIso === todayIso
    return { date: d, dateIso, sessions, activities, isPast, isToday }
  })
  return (
    <section className="rounded-data border border-brume bg-craie p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wide text-granit">
            Semaine {week.iso_week} / {week.iso_year} · phase{' '}
            {PHASE_LABEL[week.phase] ?? week.phase}
          </h3>
          <p className="tabular mt-1 text-xs text-granit">
            {week.target_sessions ?? 0} séance
            {(week.target_sessions ?? 0) > 1 ? 's' : ''}
            {week.target_distance_m
              ? ` · ${formatDistance(week.target_distance_m)}`
              : ''}
            {week.target_elevation_m
              ? ` · ${formatDplus(week.target_elevation_m)}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isInProgress && (
            <form action={readjustPlanWeek}>
              <input type="hidden" name="plan_week_id" value={week.id} />
              <button
                type="submit"
                title="Régénère les jours à partir d'aujourd'hui en tenant compte de ce qui a été fait"
                className="rounded-data border border-granit/40 px-2 py-1 text-xs text-schiste hover:bg-brume"
              >
                réajuster à partir d&apos;aujourd&apos;hui
              </button>
            </form>
          )}
          <form action={deletePlanWeek}>
            <input type="hidden" name="plan_week_id" value={week.id} />
            <button
              type="submit"
              className="text-xs text-granit hover:text-schiste"
            >
              supprimer
            </button>
          </form>
        </div>
      </div>

      {week.notes && (
        <p className="mt-2 text-sm text-schiste italic">{week.notes}</p>
      )}

      <ul className="mt-3 space-y-2">
        {days.map(({ dateIso, sessions, activities, isPast, isToday }, i) => (
          <li key={dateIso} className="border-t border-granit/10 pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular w-24 text-xs text-granit">
                <span
                  className={
                    'font-mono uppercase ' +
                    (isToday ? 'text-schiste font-medium' : '')
                  }
                >
                  {WEEKDAY_LABELS[i]}
                </span>{' '}
                {formatDateCourte(new Date(dateIso).toISOString())}
              </span>
              {sessions.length === 0 && activities.length === 0 ? (
                <span className="flex-1 text-sm italic text-granit">repos</span>
              ) : (
                <div className="flex-1 space-y-1">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <span className="w-16 font-mono text-xs uppercase text-schiste">
                        {SESSION_TYPE_LABEL[s.session_type] ?? s.session_type}
                      </span>
                      <span className="flex-1 text-sm text-schiste">
                        {s.intent}
                      </span>
                      <span className="tabular text-xs text-granit">
                        {s.target_duration_s ? formatDuree(s.target_duration_s) : '—'}
                        {s.target_distance_m
                          ? ` · ${formatDistance(s.target_distance_m)}`
                          : ''}
                        {s.target_elevation_m
                          ? ` · ${formatDplus(s.target_elevation_m)}`
                          : ''}
                      </span>
                      {s.is_club && (
                        <span
                          className="rounded-data border border-granit/35 px-1.5 py-0.5 font-mono text-xs uppercase text-granit"
                          title="Séance imposée par le club"
                        >
                          club
                        </span>
                      )}
                    </div>
                  ))}
                  {activities.map((a) => (
                    <div
                      key={a.id}
                      className="ml-16 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-granit"
                    >
                      <IconFlag className="shrink-0 text-lichen" title="réalisé" />
                      <Link
                        href={`/activities/${a.id}`}
                        className="text-schiste hover:underline"
                      >
                        {a.name ?? a.sport_type ?? '—'}
                      </Link>
                      <span className="tabular">
                        {formatDistance(a.distance_m)}
                        {a.elevation_gain_m
                          ? ` · ${formatDplus(a.elevation_gain_m)}`
                          : ''}
                        {a.moving_time_s
                          ? ` · ${formatDuree(a.moving_time_s)}`
                          : ''}
                      </span>
                    </div>
                  ))}
                  {isPast &&
                    sessions.length > 0 &&
                    activities.length === 0 &&
                    !sessions.every((s) => s.session_type === 'renfo') && (
                      <p className="ml-16 text-xs italic text-ocre">
                        aucune activité correspondante — séance manquée ?
                      </p>
                    )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
