import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DeuxBarres } from '@/components/marks/deux-barres'
import { Chevron } from '@/components/marks/chevron'
import {
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
  formatJMinus,
} from '@/lib/format'
import { isoWeekStart, aggregateByWeek } from '@/lib/analytics'
import {
  candidatesForActivity,
  isRaceEligibleSport,
  type RaceForMatch,
} from '@/lib/race-matching'

type NextRace = {
  name: string
  race_date: string
  priority: 'A' | 'B' | 'C'
} | null

type LatestActivity = {
  id: string
  name: string | null
  sport_type: string | null
  started_at: string
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
  user_notes: string | null
  race_id: string | null
} | null

/**
 * Carte principale : action prioritaire a traiter, sinon recap de la
 * derniere activite. Une seule chose mise en avant a la fois, dans
 * l'esprit du handoff Claude Design.
 */
type PlannedToday = {
  sessionType: string
  intent: string | null
  durationS: number | null
  distanceM: number | null
  elevationM: number | null
  isClub: boolean
}

type MainCard =
  | { kind: 'planned-today'; planned: PlannedToday }
  | { kind: 'debrief-race'; activityId: string; raceName: string }
  | { kind: 'log-fueling'; activityId: string; activityName: string; durationS: number }
  | { kind: 'link-race'; activityId: string; activityName: string; raceName: string }
  | { kind: 'recap-activity'; activity: NonNullable<LatestActivity> }
  | { kind: 'nothing-recent' }

type WeekSummary = {
  isoWeek: number
  distanceM: number
  sessions: number
  avgDistanceM: number
  avgSessions: number
  constraintLabels: string[]
  nextSecondaryRace: { name: string; race_date: string; priority: 'B' | 'C' } | null
}

const META_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
})

const DISPLAY_STYLE = { fontVariationSettings: "'wdth' 125" } as const
const DATA_STYLE = { letterSpacing: '-0.03em' } as const

const DAY_MS = 24 * 60 * 60 * 1000
const LONG_SECS = 90 * 60
const LOOKBACK_DAYS = 7

/**
 * Ecran « Aujourd'hui ». Design du handoff, contenu tire des vraies
 * donnees : derniere activite, fueling/debrief manquants, candidats
 * course a lier, charge de la semaine, contraintes actives. Tant que
 * plan_weeks n'est pas peuple, on n'affiche pas de « seance du jour »
 * artificielle : la carte principale reflete ce qu'Eva a a traiter.
 */
export default async function AujourdhuiPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const view = await buildTodayView(supabase)

  return (
    <main className="mx-auto flex min-h-[calc(100vh-52px)] w-full max-w-[390px] flex-col bg-brume px-[26px] py-8">
      <MetaLine race={view.nextRaceA} />
      <MainCardView card={view.card} />
      <div className="flex-1" />
      <WeekSummaryView summary={view.week} />
    </main>
  )
}

async function buildTodayView(supabase: SupabaseClient) {
  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)
  const weekStart = isoWeekStart(now)
  const since4wIso = new Date(weekStart.getTime() - 3 * 7 * DAY_MS).toISOString()
  const lookbackIso = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString()

  const [
    nextARes,
    nextSecondaryRes,
    recentActivitiesRes,
    weeklyActivitiesRes,
    racesRes,
    constraintsRes,
    plannedTodayRes,
  ] = await Promise.all([
    supabase
      .from('races')
      .select('name, race_date, priority')
      .eq('priority', 'A')
      .gte('race_date', todayIso)
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('races')
      .select('name, race_date, priority')
      .in('priority', ['B', 'C'])
      .gte('race_date', todayIso)
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('activities')
      .select(
        'id, name, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s, user_notes, race_id, fueling_logs(id)',
      )
      .gte('started_at', lookbackIso)
      .order('started_at', { ascending: false }),
    supabase
      .from('activities')
      .select('started_at, sport_type, distance_m, elevation_gain_m, moving_time_s')
      .gte('started_at', since4wIso)
      .order('started_at', { ascending: false }),
    supabase
      .from('races')
      .select('id, name, race_date, distance_m')
      .order('race_date', { ascending: false })
      .limit(200),
    supabase
      .from('constraints')
      .select('label, starts_on, ends_on, recurrence_rule')
      .or(
        `and(recurrence_rule.not.is.null,starts_on.lte.${todayIso}),` +
          `and(recurrence_rule.is.null,starts_on.lte.${new Date(now.getTime() + 6 * DAY_MS).toISOString().slice(0, 10)},or(ends_on.is.null,ends_on.gte.${todayIso}))`,
      )
      .limit(5),
    // Seance du jour si le plan contient quelque chose et si elle n'est
    // pas deja realisee. Une seule ligne attendue -- s'il y en a plus,
    // on prend celle qui n'est pas encore accomplie.
    supabase
      .from('planned_sessions')
      .select(
        'session_type, intent, target_duration_s, target_distance_m, target_elevation_m, is_club, status, matched_activity_id',
      )
      .eq('scheduled_on', todayIso)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const recentActivities = (recentActivitiesRes.data ?? []) as RecentActivity[]
  const plannedTodayRaw = (plannedTodayRes.data ?? []) as {
    session_type: string
    intent: string | null
    target_duration_s: number | null
    target_distance_m: number | null
    target_elevation_m: number | null
    is_club: boolean
    status: string
    matched_activity_id: string | null
  }[]
  const plannedToday =
    plannedTodayRaw.find(
      (p) => p.status !== 'realisee' && p.matched_activity_id == null,
    ) ?? null
  const allRaces = (racesRes.data ?? []) as RaceForMatch[]
  const nextRaceA = nextARes.data as NextRace
  const nextSecondary = nextSecondaryRes.data as
    | { name: string; race_date: string; priority: 'B' | 'C' }
    | null

  const card = await pickMainCard(
    supabase,
    recentActivities,
    allRaces,
    plannedToday,
  )

  // Charge : semaine courante vs moyenne des 3 semaines precedentes.
  const weekly = aggregateByWeek(weeklyActivitiesRes.data ?? [], 4)
  const current = weekly[weekly.length - 1]
  const previous = weekly.slice(0, -1)
  const avgSessions =
    previous.length > 0
      ? previous.reduce((sum, w) => sum + w.sessions, 0) / previous.length
      : 0
  const avgDistanceM =
    previous.length > 0
      ? previous.reduce((sum, w) => sum + w.distanceM, 0) / previous.length
      : 0

  const constraintLabels =
    (constraintsRes.data ?? []).map((c) => c.label as string).filter(Boolean)

  const week: WeekSummary = {
    isoWeek: current?.isoWeek ?? 0,
    distanceM: current?.distanceM ?? 0,
    sessions: current?.sessions ?? 0,
    avgSessions,
    avgDistanceM,
    constraintLabels,
    nextSecondaryRace: nextSecondary,
  }

  return { nextRaceA, card, week }
}

type RecentActivity = NonNullable<LatestActivity> & {
  fueling_logs: { id: string }[] | null
}

async function pickMainCard(
  supabase: SupabaseClient,
  recent: RecentActivity[],
  allRaces: RaceForMatch[],
  plannedToday: {
    session_type: string
    intent: string | null
    target_duration_s: number | null
    target_distance_m: number | null
    target_elevation_m: number | null
    is_club: boolean
  } | null,
): Promise<MainCard> {
  // 0. La seance du jour du plan prime sur tout : c'est le motif meme
  //    de la venue d'Eva sur cet ecran.
  if (plannedToday) {
    return {
      kind: 'planned-today',
      planned: {
        sessionType: plannedToday.session_type,
        intent: plannedToday.intent,
        durationS: plannedToday.target_duration_s,
        distanceM: plannedToday.target_distance_m,
        elevationM: plannedToday.target_elevation_m,
        isClub: plannedToday.is_club,
      },
    }
  }
  if (recent.length === 0) return { kind: 'nothing-recent' }

  // 1. Course terminee recemment (activite liee a une race) sans debrief.
  const racedActivity = recent.find((a) => a.race_id)
  if (racedActivity) {
    const { data: debrief } = await supabase
      .from('debriefs')
      .select('id')
      .eq('race_id', racedActivity.race_id!)
      .maybeSingle()
    if (!debrief) {
      const race = allRaces.find((r) => r.id === racedActivity.race_id)
      return {
        kind: 'debrief-race',
        activityId: racedActivity.id,
        raceName: race?.name ?? racedActivity.name ?? 'ta course',
      }
    }
  }

  // 2. Longue sortie sans fueling loggue.
  const longWithoutFueling = recent.find(
    (a) =>
      a.moving_time_s != null &&
      a.moving_time_s >= LONG_SECS &&
      isRaceEligibleSport(a.sport_type) &&
      (!a.fueling_logs || a.fueling_logs.length === 0),
  )
  if (longWithoutFueling) {
    return {
      kind: 'log-fueling',
      activityId: longWithoutFueling.id,
      activityName: longWithoutFueling.name ?? 'ta longue sortie',
      durationS: longWithoutFueling.moving_time_s ?? 0,
    }
  }

  // 3. Activite recente sans race_id mais avec candidat course.
  for (const a of recent) {
    if (a.race_id) continue
    const cands = candidatesForActivity(a, allRaces)
    if (cands.length > 0) {
      return {
        kind: 'link-race',
        activityId: a.id,
        activityName: a.name ?? 'ta séance',
        raceName: cands[0].name,
      }
    }
  }

  // 4. Rien a traiter -> recap derniere activite.
  const latest = recent[0]
  return { kind: 'recap-activity', activity: latest }
}

function MetaLine({ race }: { race: NextRace }) {
  const dateLabel = META_DATE.format(new Date())
  return (
    <div className="flex justify-between font-mono text-xs text-granit" style={DATA_STYLE}>
      <span>{dateLabel}</span>
      {race ? (
        <span>
          {formatJMinus(race.race_date)} · {shortName(race.name)}
        </span>
      ) : (
        <span>pas de course A</span>
      )}
    </div>
  )
}

function shortName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= 6) return trimmed
  const initials = trimmed
    .split(/\s+/)
    .filter((w) => /^[A-ZÀ-Ý]/.test(w))
    .map((w) => w[0])
    .join('')
  return initials.length >= 2 ? initials : trimmed.slice(0, 6).toUpperCase()
}

const SESSION_TYPE_TITLE: Record<string, string> = {
  endurance: 'ENDURANCE FONDAMENTALE',
  seuil: 'SEUIL',
  vma: 'VMA',
  cote: 'CÔTES',
  longue: 'SORTIE LONGUE',
  recup: 'RÉCUP',
  renfo: 'RENFO',
  rando: 'RANDO',
  course: 'COURSE',
}

function MainCardView({ card }: { card: MainCard }) {
  if (card.kind === 'planned-today') {
    const p = card.planned
    const parts: string[] = []
    if (p.durationS) parts.push(formatDuree(p.durationS))
    if (p.distanceM) parts.push(formatDistance(p.distanceM))
    if (p.elevationM) parts.push(formatDplus(p.elevationM))
    const metrics = parts.join(' · ')
    const title = SESSION_TYPE_TITLE[p.sessionType] ?? p.sessionType.toUpperCase()
    return (
      <>
        <div className="mt-[46px]">
          <DeuxBarres size={22} />
        </div>
        <p className="mt-[14px] font-mono text-xs uppercase tracking-wide text-granit">
          Aujourd&apos;hui{p.isClub ? ' · club' : ''}
        </p>
        <h1
          className="mt-1 font-display text-2xl font-extrabold uppercase leading-tight tracking-[0.03em] text-schiste"
          style={DISPLAY_STYLE}
        >
          {title}
        </h1>
        {metrics && (
          <p
            className="mt-3 font-mono text-sm text-schiste [font-variant-numeric:tabular-nums]"
            style={DATA_STYLE}
          >
            {metrics}
          </p>
        )}
        {p.intent && (
          <div className="mt-[26px] rounded-surface border border-granit/20 bg-craie p-[18px]">
            <p className="text-base leading-[1.5] text-schiste">{p.intent}</p>
          </div>
        )}
        <div className="mt-[30px] flex gap-3">
          <Link
            href="/planning"
            className="flex-1 rounded-surface border border-schiste bg-schiste px-4 py-3 text-center text-base font-medium text-craie"
          >
            Voir la semaine
          </Link>
        </div>
      </>
    )
  }

  if (card.kind === 'nothing-recent') {
    return (
      <div className="mt-[46px] flex flex-col items-start gap-4">
        <DeuxBarres size={22} />
        <h1
          className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.03em] text-schiste"
          style={DISPLAY_STYLE}
        >
          Rien à traiter
        </h1>
        <p className="text-base text-granit">
          Aucune activité dans les 7 derniers jours. Une bonne semaine de repos,
          ou de la synchro Strava à lancer.
        </p>
        <Link
          href="/settings/strava"
          className="rounded-surface border border-granit/40 px-3 py-2 text-sm font-medium text-schiste"
        >
          Vérifier Strava
        </Link>
      </div>
    )
  }

  if (card.kind === 'recap-activity') {
    const a = card.activity
    return (
      <>
        <div className="mt-[46px]">
          <DeuxBarres size={20} />
        </div>
        <p className="mt-[14px] font-mono text-xs uppercase tracking-wide text-granit">
          Dernière séance
        </p>
        <h1
          className="mt-1 font-display text-2xl font-extrabold uppercase leading-tight tracking-[0.03em] text-schiste"
          style={DISPLAY_STYLE}
        >
          {a.name ?? '—'}
        </h1>
        <p
          className="mt-3 font-mono text-sm text-schiste [font-variant-numeric:tabular-nums]"
          style={DATA_STYLE}
        >
          {formatDateCourte(a.started_at)} · {formatDistance(a.distance_m)} ·{' '}
          {formatDplus(a.elevation_gain_m)} · {formatDuree(a.moving_time_s)}
        </p>
        <div className="mt-[26px] rounded-surface border border-granit/20 bg-craie p-[18px]">
          <p className="text-base leading-[1.5] text-schiste">
            {a.user_notes
              ? truncate(a.user_notes, 220)
              : 'Aucune note personnelle sur cette séance. Ajoute-les pour permettre l\'analyse du coach.'}
          </p>
        </div>
        <div className="mt-[30px] flex gap-3">
          <Link
            href={`/activities/${a.id}`}
            className="flex-1 rounded-surface border border-schiste bg-schiste px-4 py-3 text-center text-base font-medium text-craie"
          >
            Ouvrir la séance
          </Link>
        </div>
      </>
    )
  }

  // Action prioritaire — carte "à traiter".
  const { titre, phrase, href, cta } = actionLabels(card)
  return (
    <>
      <div className="mt-[46px]">
        <Chevron size={22} />
      </div>
      <p className="mt-[14px] font-mono text-xs uppercase tracking-wide text-granit">
        À traiter
      </p>
      <h1
        className="mt-1 font-display text-2xl font-extrabold uppercase leading-tight tracking-[0.03em] text-schiste"
        style={DISPLAY_STYLE}
      >
        {titre}
      </h1>
      <div className="mt-[26px] rounded-surface border border-granit/20 bg-craie p-[18px]">
        <p className="text-base leading-[1.5] text-schiste">{phrase}</p>
      </div>
      <div className="mt-[30px] flex gap-3">
        <Link
          href={href}
          className="flex-1 rounded-surface border border-schiste bg-schiste px-4 py-3 text-center text-base font-medium text-craie"
        >
          {cta}
        </Link>
      </div>
    </>
  )
}

function actionLabels(
  card: Exclude<
    MainCard,
    { kind: 'recap-activity' } | { kind: 'nothing-recent' } | { kind: 'planned-today' }
  >,
): { titre: string; phrase: string; href: string; cta: string } {
  switch (card.kind) {
    case 'debrief-race':
      return {
        titre: 'Débrief à écrire',
        phrase: `${card.raceName} est terminée mais n'a pas encore de débrief. Le coach peut le proposer à partir de tes notes personnelles.`,
        href: `/activities/${card.activityId}`,
        cta: 'Ouvrir la course',
      }
    case 'log-fueling':
      return {
        titre: 'Fueling à loguer',
        phrase: `${card.activityName} (${formatDuree(card.durationS)}) attend un log de fueling. Décris tes ravitos dans les notes, le coach peut structurer.`,
        href: `/activities/${card.activityId}`,
        cta: 'Ouvrir la séance',
      }
    case 'link-race':
      return {
        titre: 'Course à lier',
        phrase: `${card.activityName} pourrait correspondre à la course « ${card.raceName} » de ta liste. À confirmer pour armer le débrief.`,
        href: `/activities/${card.activityId}`,
        cta: 'Ouvrir la séance',
      }
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1) + '…'
}

function WeekSummaryView({ summary }: { summary: WeekSummary }) {
  const km = summary.distanceM > 0 ? (summary.distanceM / 1000).toFixed(1).replace('.', ',') : '0'
  const avgKm =
    summary.avgDistanceM > 0
      ? (summary.avgDistanceM / 1000).toFixed(0)
      : '0'
  const chargeLabel = summary.avgSessions > 0 ? `moy. 4 sem. ${avgKm} km · ${summary.avgSessions.toFixed(1)} séances` : null

  return (
    <details className="border-t border-granit/20 pt-[18px]">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-base font-medium text-schiste [&::-webkit-details-marker]:hidden">
        <DeuxBarres size={17} />
        <span className="flex-1">Cette semaine</span>
        <span
          className="font-mono text-sm text-granit [font-variant-numeric:tabular-nums]"
          style={DATA_STYLE}
        >
          {km} km · {summary.sessions}
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-base text-granit">
        {chargeLabel && <p className="text-sm">{chargeLabel}</p>}
        {summary.constraintLabels.length > 0 && (
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-granit">
              Contraintes actives
            </p>
            <ul className="mt-1 space-y-1 text-sm text-schiste">
              {summary.constraintLabels.map((label) => (
                <li key={label}>· {label}</li>
              ))}
            </ul>
          </div>
        )}
        {summary.nextSecondaryRace && (
          <p className="text-sm">
            Prochaine course {summary.nextSecondaryRace.priority} :{' '}
            <span className="text-schiste">{summary.nextSecondaryRace.name}</span>{' '}
            <span
              className="font-mono text-xs [font-variant-numeric:tabular-nums]"
              style={DATA_STYLE}
            >
              ({formatJMinus(summary.nextSecondaryRace.race_date)})
            </span>
          </p>
        )}
        {!chargeLabel &&
          summary.constraintLabels.length === 0 &&
          !summary.nextSecondaryRace && (
            <p className="text-sm italic">Rien à signaler.</p>
          )}
      </div>
    </details>
  )
}
