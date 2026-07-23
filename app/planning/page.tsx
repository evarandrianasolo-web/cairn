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
import { isRaceEligibleSport } from '@/lib/race-matching'
import { IconFlag } from '@/components/icons'
import { DeuxBarres } from '@/components/marks/deux-barres'
import { deletePlanWeek, generatePlanWeek, readjustPlanWeek } from './actions'

// Types consideres comme 'jalons' de la semaine : c'est autour d'eux
// que se construit le reste (une LONGUE par semaine, une COURSE si
// c'est une semaine de competition). La marque DeuxBarres (rouge
// balise) signale visuellement 'sur l'itineraire' sans etre une
// couleur d'erreur (cf. CLAUDE.md).
const KEY_SESSION_TYPES = new Set(['longue', 'course'])

// Couleur de la barre pour la mini-timeline B (hauteur = duree, couleur
// = type). On regroupe par intention :
// - balise (rouge)  : jalons de la semaine (longue, course)
// - ocre            : intensite (seuil, vma, cote)
// - lichen (vert)   : recuperation (recup, rando)
// - schiste         : endurance de base
// - granit          : renfo, faisable hors course a pied
const SESSION_BAR_COLOR: Record<string, string> = {
  longue: 'bg-balise',
  course: 'bg-balise',
  seuil: 'bg-ocre',
  vma: 'bg-ocre',
  cote: 'bg-ocre',
  recup: 'bg-lichen',
  rando: 'bg-lichen',
  endurance: 'bg-schiste',
  renfo: 'bg-granit',
}

/** Duree de reference pour normaliser les hauteurs dans la mini-timeline
 * hebdo. 3 h de longue = 100 %. Coupe visuellement les valeurs > 3 h
 * mais garde la lisibilite des seances courtes (30 min = 17 %). */
const MINI_TIMELINE_REF_S = 3 * 60 * 60

// Session types de course a pied (non renfo, non rando) qui exigent une
// activite Run/TrailRun pour etre consideres comme realises.
const RUN_SESSION_TYPES = new Set([
  'endurance',
  'seuil',
  'vma',
  'cote',
  'longue',
  'recup',
  'course',
])

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

// Couleur de fond du retroplan par phase. Neutres qui montent en
// intensite : plus la phase est proche de la course, plus le fond est
// dense. On evite les couleurs semantiques (balise/lichen/ocre) qui
// portent deja un sens ailleurs.
const PHASE_BG: Record<string, string> = {
  base: 'bg-granit/30',
  specifique: 'bg-granit/50',
  choc: 'bg-granit/70',
  affutage: 'bg-granit/40',
  recup: 'bg-lichen/60',
  course: 'bg-balise',
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
  searchParams: Promise<{
    erreur?: string
    generated?: string
    readjusted?: string
    vue?: string
  }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur, generated, readjusted, vue } = await searchParams
  const gridView = vue === 'grille'

  const now = new Date()
  const currentMonday = isoWeekStart(now)
  const currentIsoWeek = isoWeekNumber(currentMonday)
  const targetMondayIso = currentMonday.toISOString().slice(0, 10)
  const todayIso = now.toISOString().slice(0, 10)

  // Prochaine course A pour le retroplan macro.
  const { data: nextRaceA } = await supabase
    .from('races')
    .select('id, name, race_date')
    .eq('priority', 'A')
    .gte('race_date', todayIso)
    .order('race_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Courses B/C dans les 12 prochaines semaines pour les marqueurs.
  const horizonIso = new Date(now.getTime() + 12 * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10)
  const { data: secondaryRaces } = await supabase
    .from('races')
    .select('id, name, race_date, priority')
    .in('priority', ['B', 'C'])
    .gte('race_date', todayIso)
    .lte('race_date', horizonIso)
    .order('race_date', { ascending: true })

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

      {nextRaceA && (
        <RetroplanMacro
          nextRaceA={nextRaceA}
          secondaryRaces={secondaryRaces ?? []}
          plannedWeeks={rows}
          currentMonday={currentMonday}
          todayIso={todayIso}
        />
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

      {rows.length > 0 && (
        <div className="flex gap-2 text-sm">
          <Link
            href="/planning"
            className={
              'rounded-data border px-3 py-1 ' +
              (!gridView
                ? 'border-schiste bg-schiste text-craie'
                : 'border-granit/40 text-schiste hover:bg-brume')
            }
          >
            Liste
          </Link>
          <Link
            href="/planning?vue=grille"
            className={
              'rounded-data border px-3 py-1 ' +
              (gridView
                ? 'border-schiste bg-schiste text-craie'
                : 'border-granit/40 text-schiste hover:bg-brume')
            }
          >
            Grille
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-granit">
          Aucune semaine planifiée pour l&apos;instant.
        </p>
      ) : gridView ? (
        <PlanningGrid
          weeks={rows}
          activitiesByDate={activitiesByDate}
          todayIso={todayIso}
        />
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

function RetroplanMacro({
  nextRaceA,
  secondaryRaces,
  plannedWeeks,
  currentMonday,
  todayIso,
}: {
  nextRaceA: { id: string; name: string; race_date: string }
  secondaryRaces: { id: string; name: string; race_date: string; priority: string }[]
  plannedWeeks: PlanWeekRow[]
  currentMonday: Date
  todayIso: string
}) {
  const raceDate = new Date(nextRaceA.race_date + 'T12:00:00Z')
  const raceMonday = isoWeekStart(raceDate)
  const totalWeeks =
    Math.max(1, Math.round((raceMonday.getTime() - currentMonday.getTime()) / (7 * DAY_MS))) + 1

  // Bornes affichees : min 6 semaines, max 20 pour rester lisible.
  const displayWeeks = Math.max(6, Math.min(20, totalWeeks))
  const daysUntilRace = Math.max(
    0,
    Math.round((raceDate.getTime() - new Date(todayIso + 'T12:00:00Z').getTime()) / DAY_MS),
  )

  const weeksByIso = new Map<string, PlanWeekRow>()
  for (const w of plannedWeeks) {
    weeksByIso.set(`${w.iso_year}-${w.iso_week}`, w)
  }
  const secondariesByIso = new Map<string, typeof secondaryRaces[number]>()
  for (const r of secondaryRaces) {
    const monday = isoWeekStart(new Date(r.race_date + 'T12:00:00Z'))
    secondariesByIso.set(monday.toISOString().slice(0, 10), r)
  }

  const cells = Array.from({ length: displayWeeks }, (_, i) => {
    const monday = new Date(currentMonday.getTime() + i * 7 * DAY_MS)
    const mondayIso = monday.toISOString().slice(0, 10)
    const iso = `${isoYearOf(monday)}-${isoWeekNumber(monday)}`
    const pw = weeksByIso.get(iso)
    const isRaceWeek = monday.getTime() === raceMonday.getTime()
    const secondary = secondariesByIso.get(mondayIso)
    return { monday, mondayIso, pw, isRaceWeek, secondary, isoWeek: isoWeekNumber(monday) }
  })

  return (
    <section className="rounded-data border border-brume bg-craie p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Rétroplan · {shortRaceName(nextRaceA.name)}
        </h2>
        <span className="tabular font-mono text-xs text-balise">
          J−{daysUntilRace}
        </span>
      </div>

      <div className="relative flex items-end gap-[3px] h-11">
        {cells.map((c) => {
          const isToday = c.mondayIso === isoWeekStart(new Date(todayIso + 'T12:00:00Z'))
            .toISOString()
            .slice(0, 10)
          const bg = c.isRaceWeek
            ? 'bg-balise'
            : c.pw
              ? PHASE_BG[c.pw.phase] ?? 'bg-granit/30'
              : 'bg-granit/15'
          const heightPx = c.isRaceWeek ? 44 : c.pw ? 33 : 18
          return (
            <div
              key={c.mondayIso}
              className="relative flex flex-1 flex-col items-center justify-end h-full"
              title={
                c.isRaceWeek
                  ? `S${c.isoWeek} · ${nextRaceA.name}`
                  : c.pw
                    ? `S${c.isoWeek} · ${PHASE_LABEL[c.pw.phase] ?? c.pw.phase}`
                    : `S${c.isoWeek} · à planifier`
              }
            >
              {isToday && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[9px] text-balise">
                  auj.
                </span>
              )}
              {c.secondary && !c.isRaceWeek && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-mono text-[9px] text-ocre">
                  {c.secondary.priority}
                </span>
              )}
              <div
                className={`w-full rounded-sm ${bg} ${
                  isToday ? 'ring-1 ring-balise' : ''
                }`}
                style={{ height: `${heightPx}px` }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-granit">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-granit/30" /> base
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-granit/50" /> spéc.
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-granit/70" /> choc
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-granit/40" /> affût.
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-balise" /> course
        </span>
      </div>
    </section>
  )
}

function shortRaceName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= 20) return trimmed
  return trimmed.slice(0, 18) + '…'
}

/** Annee ISO d'une date. Approximation suffisante pour les cellules du
 * retroplan (le mismatch bord d'annee ne toucherait qu'une case). */
function isoYearOf(d: Date): number {
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)
  if (d.getTime() < week1Monday.getTime()) return d.getUTCFullYear() - 1
  return d.getUTCFullYear()
}

/**
 * Vue grille : tableau semaines × jours a la Notion. Utile pour scanner
 * plusieurs semaines d'un coup. Sur mobile, scroll horizontal via
 * overflow-x-auto ; la premiere colonne (semaine) reste normale --
 * pas de sticky pour rester simple V0.
 */
function PlanningGrid({
  weeks,
  activitiesByDate,
  todayIso,
}: {
  weeks: PlanWeekRow[]
  activitiesByDate: Map<string, ActivityMatch[]>
  todayIso: string
}) {
  return (
    <div className="overflow-x-auto rounded-data border border-brume bg-craie">
      <div
        className="grid gap-px bg-brume p-px text-xs"
        style={{
          gridTemplateColumns: '90px repeat(7, minmax(140px, 1fr))',
          minWidth: 90 + 7 * 140,
        }}
      >
        {/* Header row */}
        <div className="bg-craie p-2 font-mono text-[10px] uppercase text-granit">
          semaine
        </div>
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="bg-craie p-2 font-mono text-[10px] uppercase text-granit"
          >
            {d}
          </div>
        ))}

        {/* Rows */}
        {weeks.map((w) => {
          const monday = isoWeekMonday(w.iso_year, w.iso_week)
          return (
            <GridRow
              key={w.id}
              week={w}
              monday={monday}
              activitiesByDate={activitiesByDate}
              todayIso={todayIso}
            />
          )
        })}
      </div>
    </div>
  )
}

function GridRow({
  week,
  monday,
  activitiesByDate,
  todayIso,
}: {
  week: PlanWeekRow
  monday: Date
  activitiesByDate: Map<string, ActivityMatch[]>
  todayIso: string
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const dateIso = d.toISOString().slice(0, 10)
    return {
      dateIso,
      sessions: week.planned_sessions.filter((s) => s.scheduled_on === dateIso),
      activities: activitiesByDate.get(dateIso) ?? [],
      isPast: dateIso < todayIso,
      isToday: dateIso === todayIso,
    }
  })
  return (
    <>
      <div className="bg-craie p-2">
        <div className="font-mono text-[10px] uppercase text-granit">
          S{week.iso_week}
        </div>
        <div className="tabular mt-1 text-[10px] text-granit">
          {formatDateCourte(monday.toISOString())}
        </div>
        <div className="mt-1 font-mono text-[9px] uppercase text-granit">
          {PHASE_LABEL[week.phase] ?? week.phase}
        </div>
      </div>
      {days.map((day) => (
        <GridCell key={day.dateIso} day={day} />
      ))}
    </>
  )
}

function GridCell({
  day,
}: {
  day: {
    dateIso: string
    sessions: PlanWeekRow['planned_sessions']
    activities: ActivityMatch[]
    isPast: boolean
    isToday: boolean
  }
}) {
  const s = day.sessions[0]
  const bg = day.isToday ? 'bg-brume' : 'bg-craie'
  const isKey = s && KEY_SESSION_TYPES.has(s.session_type)
  return (
    <div className={`${bg} p-2`}>
      {s ? (
        <>
          <div className="flex items-center gap-1">
            {isKey && <DeuxBarres size={10} />}
            <span
              className={
                'font-mono text-[10px] uppercase ' +
                (isKey ? 'font-medium text-balise' : 'text-schiste')
              }
            >
              {SESSION_TYPE_LABEL[s.session_type] ?? s.session_type}
            </span>
            {s.is_club && (
              <span className="rounded-data border border-granit/35 px-1 font-mono text-[9px] uppercase text-granit">
                club
              </span>
            )}
          </div>
          {s.intent && (
            <p className="mt-1 text-[11px] leading-snug text-schiste">
              {s.intent}
            </p>
          )}
          <p className="tabular mt-1 text-[10px] text-granit">
            {s.target_duration_s ? formatDuree(s.target_duration_s) : ''}
            {s.target_distance_m
              ? ` · ${formatDistance(s.target_distance_m)}`
              : ''}
            {s.target_elevation_m
              ? ` · ${formatDplus(s.target_elevation_m)}`
              : ''}
          </p>
        </>
      ) : (
        <span className="text-[11px] italic text-granit">repos</span>
      )}
      {day.activities.length > 0 && (
        <div className="mt-2 border-t border-brume pt-1">
          {day.activities.slice(0, 2).map((a) => (
            <Link
              key={a.id}
              href={`/activities/${a.id}`}
              className="flex items-baseline gap-1 text-[10px] text-lichen hover:underline"
            >
              <IconFlag size={9} className="shrink-0" />
              <span className="truncate text-schiste">
                {a.name ?? a.sport_type ?? '—'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

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

  // Detection : combien de seances de jours passes n'ont eu aucune
  // activite correspondante ? Le renfo est ignore car souvent fait sans
  // Strava. Seuil de declenchement du chip : au moins 1.
  const missedCount = isInProgress
    ? week.planned_sessions.filter((s) => {
        if (s.scheduled_on >= todayIso) return false
        if (s.session_type === 'renfo') return false
        const acts = activitiesByDate.get(s.scheduled_on) ?? []
        // Une seance de course a pied n'est pas 'realisee' par un renfo
        // ou une rando -- on exige une activite Run/TrailRun.
        if (RUN_SESSION_TYPES.has(s.session_type)) {
          return !acts.some((a) => isRaceEligibleSport(a.sport_type))
        }
        return acts.length === 0
      }).length
    : 0
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

      {/* Mini-timeline hebdo — hauteur = durée cible, couleur = type. */}
      <div className="mt-3">
        <div className="flex h-9 items-end gap-1">
          {days.map(({ dateIso, sessions }) => {
            const s = sessions[0]
            const dur = s?.target_duration_s ?? 0
            const heightPct =
              dur > 0
                ? Math.max(8, Math.min(100, (dur / MINI_TIMELINE_REF_S) * 100))
                : 0
            const color = s ? SESSION_BAR_COLOR[s.session_type] ?? 'bg-granit' : ''
            const label = s
              ? `${SESSION_TYPE_LABEL[s.session_type] ?? s.session_type} · ${dur ? formatDuree(dur) : '—'}`
              : 'repos'
            return (
              <div
                key={dateIso}
                className="flex-1"
                style={{ height: dur > 0 ? `${heightPct}%` : '2px' }}
                title={`${dateIso} · ${label}`}
              >
                <div
                  className={
                    (dur > 0 ? color : 'bg-granit/25') +
                    ' h-full w-full rounded-t-sm'
                  }
                />
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex gap-1">
          {days.map(({ dateIso, isToday }, i) => (
            <span
              key={dateIso}
              className={
                'flex-1 text-center font-mono text-[10px] ' +
                (isToday ? 'font-medium text-schiste' : 'text-granit')
              }
            >
              {WEEKDAY_LABELS[i]}
            </span>
          ))}
        </div>
      </div>

      {missedCount > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          <span className="flex-1">
            {missedCount} séance{missedCount > 1 ? 's' : ''} passée
            {missedCount > 1 ? 's' : ''} sans activité correspondante. Réajuster
            la suite ?
          </span>
          <form action={readjustPlanWeek}>
            <input type="hidden" name="plan_week_id" value={week.id} />
            <button
              type="submit"
              className="rounded-data border border-ocre/40 px-2 py-1 text-xs font-medium hover:bg-ocre/10"
            >
              Réajuster
            </button>
          </form>
        </div>
      )}

      <ul className="mt-3 space-y-3">
        {days.map(({ dateIso, sessions, activities, isPast, isToday }, i) => (
          <li
            key={dateIso}
            className="border-t border-granit/10 pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex items-baseline gap-2 text-xs">
              <span
                className={
                  'tabular font-mono uppercase ' +
                  (isToday ? 'font-medium text-schiste' : 'text-granit')
                }
              >
                {WEEKDAY_LABELS[i]} {formatDateCourte(new Date(dateIso).toISOString())}
              </span>
              {isToday && (
                <span className="rounded-data bg-schiste px-1.5 py-0.5 font-mono text-[10px] uppercase text-craie">
                  auj.
                </span>
              )}
            </div>
            {sessions.length === 0 && activities.length === 0 ? (
              <p className="mt-1 text-sm italic text-granit">repos</p>
            ) : (
              <div className="mt-1 space-y-2">
                {sessions.map((s) => {
                  const isKey = KEY_SESSION_TYPES.has(s.session_type)
                  return (
                    <div key={s.id} className="space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {isKey && (
                          <span className="inline-flex items-center gap-1">
                            <DeuxBarres size={14} />
                          </span>
                        )}
                        <span
                          className={
                            'font-mono text-xs uppercase ' +
                            (isKey ? 'text-balise font-medium' : 'text-schiste')
                          }
                        >
                          {SESSION_TYPE_LABEL[s.session_type] ?? s.session_type}
                        </span>
                        {s.is_club && (
                          <span
                            className="rounded-data border border-granit/35 px-1.5 py-0.5 font-mono text-[10px] uppercase text-granit"
                            title="Séance imposée par le club"
                          >
                            club
                          </span>
                        )}
                        <span className="tabular ml-auto text-xs text-granit">
                          {s.target_duration_s ? formatDuree(s.target_duration_s) : ''}
                          {s.target_distance_m
                            ? ` · ${formatDistance(s.target_distance_m)}`
                            : ''}
                          {s.target_elevation_m
                            ? ` · ${formatDplus(s.target_elevation_m)}`
                            : ''}
                        </span>
                      </div>
                      <p className="text-sm text-schiste">{s.intent}</p>
                    </div>
                  )
                })}
                {activities.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-granit"
                  >
                    <IconFlag className="shrink-0 text-lichen" title="réalisé" />
                    <Link
                      href={`/activities/${a.id}`}
                      className="text-schiste hover:underline"
                    >
                      {a.name ?? a.sport_type ?? '—'}
                    </Link>
                    <span className="tabular ml-auto">
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
                  sessions.some(
                    (s) =>
                      RUN_SESSION_TYPES.has(s.session_type) &&
                      !activities.some((a) => isRaceEligibleSport(a.sport_type)),
                  ) && (
                    <p className="text-xs italic text-ocre">
                      aucune activité de course correspondante — séance manquée ?
                    </p>
                  )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
