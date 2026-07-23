import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'
import { isoWeekStart, isoWeekNumber } from '@/lib/analytics'
import { deletePlanWeek, generatePlanWeek } from './actions'

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
  searchParams: Promise<{ erreur?: string; generated?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur, generated } = await searchParams

  const now = new Date()
  const currentMonday = isoWeekStart(now)
  const nextMonday = new Date(currentMonday.getTime() + 7 * DAY_MS)
  const nextIsoWeek = isoWeekNumber(nextMonday)
  const targetMondayIso = nextMonday.toISOString().slice(0, 10)

  const { data: weeks } = await supabase
    .from('plan_weeks')
    .select(
      'id, iso_year, iso_week, phase, target_distance_m, target_elevation_m, target_sessions, notes, target_race_id, planned_sessions(id, scheduled_on, session_type, intent, target_distance_m, target_elevation_m, target_duration_s, is_club, status)',
    )
    .order('iso_year', { ascending: false })
    .order('iso_week', { ascending: false })

  const rows = (weeks ?? []) as PlanWeekRow[]

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

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Semaine {nextIsoWeek} ·{' '}
          <span className="tabular">
            {formatDateCourte(nextMonday.toISOString())} →{' '}
            {formatDateCourte(
              new Date(nextMonday.getTime() + 6 * DAY_MS).toISOString(),
            )}
          </span>
        </h2>
        <p className="mt-2 text-sm text-granit">
          Le coach IA génère une semaine (lundi → dimanche) à partir de tes 4
          dernières semaines, ta prochaine course A, tes contraintes actives
          et tes derniers débriefs / logs fueling.
        </p>
        <form action={generatePlanWeek} className="mt-3 space-y-3">
          <input type="hidden" name="target_monday" value={targetMondayIso} />
          <textarea
            name="user_hint"
            rows={3}
            placeholder="Notes pour cette semaine (facultatif) — ex : « repos vendredi, sortie longue samedi 3h dans le Jura », « bloc côte », « fatigué, allègement »."
            className="w-full rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm text-schiste focus:border-schiste focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
          >
            Générer
          </button>
        </form>
      </section>

      {rows.length === 0 ? (
        <p className="text-sm text-granit">
          Aucune semaine planifiée pour l&apos;instant.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((w) => (
            <WeekBlock key={w.id} week={w} />
          ))}
        </div>
      )}
    </main>
  )
}

const WEEKDAY_LABELS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const

/** Retourne le lundi 00:00 UTC de la semaine ISO donnee (annee, numero). */
function isoWeekMonday(isoYear: number, isoWeek: number): Date {
  // Jeudi de la semaine 1 = premier jeudi de l'annee ISO.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7 // lun=1..dim=7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)
  const monday = new Date(week1Monday)
  monday.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7)
  return monday
}

function WeekBlock({ week }: { week: PlanWeekRow }) {
  const monday = isoWeekMonday(week.iso_year, week.iso_week)
  // On construit les 7 jours lundi -> dimanche ; chaque jour porte
  // les 0..N seances qui tombent dessus (souvent 0 ou 1).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const dateIso = d.toISOString().slice(0, 10)
    const sessions = week.planned_sessions.filter(
      (s) => s.scheduled_on === dateIso,
    )
    return { date: d, dateIso, sessions }
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

      {week.notes && (
        <p className="mt-2 text-sm text-schiste italic">{week.notes}</p>
      )}

      <ul className="mt-3 space-y-1">
        {days.map(({ date, dateIso, sessions }, i) => (
          <li
            key={dateIso}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          >
            <span className="tabular w-24 text-xs text-granit">
              <span className="font-mono uppercase">{WEEKDAY_LABELS[i]}</span>{' '}
              {formatDateCourte(date.toISOString())}
            </span>
            {sessions.length === 0 ? (
              <span className="flex-1 text-sm italic text-granit">repos</span>
            ) : (
              <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1"
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
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
