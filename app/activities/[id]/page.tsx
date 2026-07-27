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
  formatGoalTime,
  formatRaceDate,
} from '@/lib/format'
import {
  candidatesForActivity,
  isRaceEligibleSport,
  type RaceForMatch,
} from '@/lib/race-matching'
import { classifySession, type SessionKind } from '@/lib/analytics/classify-session'
import { AiBadge } from '@/components/ai-disclosure'
import {
  analyzeActivity,
  createRaceFromActivity,
  linkActivityToRace,
  proposeDebriefFromActivity,
  proposeFuelingFromActivity,
  pullStravaDescription,
  toggleTodoDismissed,
  updateActivityNotes,
} from '../actions'

const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  vma: 'VMA · fractionnés',
  seuil: 'Seuil',
  cote: 'Côtes',
  longue: 'Sortie longue',
  endurance: 'Endurance fondamentale',
  recup: 'Récupération',
  rando: 'Rando active',
  course: 'Course',
  renfo: 'Renforcement',
}

const DISMISS_LABEL: Record<string, string> = {
  debrief: 'débrief non nécessaire',
  fueling: 'fueling non nécessaire',
  link: 'aucune course à lier',
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

type LapDisplay = {
  lap_index: number
  distance_m: number
  moving_time_s: number
  avg_pace_s_per_km: number | null
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  is_manual: boolean
  min_hr?: number | null
  avg_hr?: number | null
  max_hr?: number | null
}

type LinkedRace = {
  id: string
  name: string
  race_date: string
  location: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  priority: 'A' | 'B' | 'C'
  goal_time_s: number | null
  result_time_s: number | null
}

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; linked?: string; erreur?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const { ok, linked, erreur } = await searchParams

  const { data: activity } = await supabase
    .from('activities')
    .select(
      'id, name, description, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s, elapsed_time_s, avg_pace_s_per_km, avg_cadence, strava_activity_id, user_notes, race_id, todo_dismissed, ai_summary, ai_summary_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (!activity) redirect('/activities')

  const [fuelingRes, linkedRaceRes, allRacesRes, existingDebriefRes, lapsRes, healthRes] = await Promise.all([
    supabase
      .from('fueling_logs')
      .select(
        'id, intake_pattern, carbs_g, carbs_g_per_hour, products, issue, post_window_fed, notes',
      )
      .eq('activity_id', activity.id)
      .maybeSingle(),
    activity.race_id
      ? supabase
          .from('races')
          .select(
            'id, name, race_date, location, distance_m, elevation_gain_m, priority, goal_time_s, result_time_s',
          )
          .eq('id', activity.race_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('races')
      .select('id, name, race_date, distance_m')
      .order('race_date', { ascending: false })
      .limit(100),
    activity.race_id
      ? supabase
          .from('debriefs')
          .select('id')
          .eq('race_id', activity.race_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('activity_laps')
      .select(
        'lap_index, distance_m, moving_time_s, avg_pace_s_per_km, elevation_gain_m, elevation_loss_m, is_manual',
      )
      .eq('activity_id', activity.id)
      .order('lap_index', { ascending: true }),
    supabase
      .from('activity_health')
      .select('avg_hr, max_hr')
      .eq('activity_id', activity.id)
      .maybeSingle(),
  ])

  const fueling = fuelingRes.data
  const linkedRace = linkedRaceRes.data as LinkedRace | null
  const allRaces = (allRacesRes.data ?? []) as RaceForMatch[]
  const existingDebriefId = (existingDebriefRes.data as { id: string } | null)?.id ?? null
  const hasNotes = (activity.user_notes ?? '').trim().length > 0
  const rawLaps = (lapsRes.data ?? []) as LapDisplay[]
  const activityHealth = healthRes.data as
    | { avg_hr: number | null; max_hr: number | null }
    | null

  // FC par lap : table sante separee, filtree par RLS. Si le
  // consentement fc_stockage est OFF il n'y a rien a merger.
  const { data: lapHealth } = await supabase
    .from('activity_lap_health')
    .select('lap_index, min_hr, avg_hr, max_hr')
    .eq('activity_id', activity.id)
  const hrByIndex = new Map<number, { min_hr: number | null; avg_hr: number | null; max_hr: number | null }>()
  for (const h of lapHealth ?? []) {
    hrByIndex.set(h.lap_index, { min_hr: h.min_hr, avg_hr: h.avg_hr, max_hr: h.max_hr })
  }
  const laps: LapDisplay[] = rawLaps.map((l) => {
    const hr = hrByIndex.get(l.lap_index)
    return hr ? { ...l, ...hr } : l
  })
  const hasLapHealth = hrByIndex.size > 0
  const sessionKind = classifySession(
    {
      sport_type: activity.sport_type,
      distance_m: activity.distance_m,
      elevation_gain_m: activity.elevation_gain_m,
      moving_time_s: activity.moving_time_s,
      avg_pace_s_per_km: activity.avg_pace_s_per_km,
    },
    laps.map((l) => ({
      distance_m: l.distance_m,
      moving_time_s: l.moving_time_s,
      is_manual: l.is_manual,
    })),
    !!linkedRace,
  )

  const isLongEnough =
    activity.moving_time_s != null && activity.moving_time_s >= LONG_SECS

  const stravaUrl = activity.strava_activity_id
    ? `https://www.strava.com/activities/${activity.strava_activity_id}`
    : null

  const raceEligible = isRaceEligibleSport(activity.sport_type)
  const candidates = candidatesForActivity(activity, allRaces)
  const bestCandidate = candidates[0] ?? null

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

      <div>
        {sessionKind && (
          <div className="font-mono text-[10px] uppercase tracking-wide text-granit">
            {SESSION_KIND_LABEL[sessionKind]}
          </div>
        )}
        <ScreenTitle>{activity.name ?? 'Séance sans titre'}</ScreenTitle>
      </div>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}

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
        {activityHealth?.avg_hr != null && (
          <Stat label="FC moy" value={`${activityHealth.avg_hr}`} />
        )}
        {activityHealth?.max_hr != null && (
          <Stat label="FC max" value={`${activityHealth.max_hr}`} />
        )}
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-granit">
            Analyse
            {activity.ai_summary && <AiBadge />}
          </h2>
          {activity.ai_summary_at && (
            <span className="tabular font-mono text-[10px] text-granit">
              généré le {formatDateCourte(activity.ai_summary_at)}
            </span>
          )}
        </div>
        {activity.ai_summary ? (
          <div className="mt-2 rounded-data border border-brume bg-craie p-3">
            <p className="whitespace-pre-line text-sm text-schiste">
              {activity.ai_summary}
            </p>
            <form action={analyzeActivity} className="mt-3">
              <input type="hidden" name="activity_id" value={activity.id} />
              <button
                type="submit"
                className="text-xs text-granit underline hover:text-schiste"
              >
                regénérer l&apos;analyse
              </button>
            </form>
          </div>
        ) : (
          <form action={analyzeActivity} className="mt-2">
            <input type="hidden" name="activity_id" value={activity.id} />
            <button
              type="submit"
              className="rounded-surface border border-schiste bg-schiste px-3 py-2 text-sm font-medium text-craie"
            >
              Analyser cette séance
            </button>
            <p className="mt-2 text-xs italic text-granit">
              Résumé court (2 à 4 phrases). Pour une analyse poussée, ouvre une
              conversation avec le{' '}
              <Link href="/coach" className="underline">
                coach
              </Link>
              .
            </p>
          </form>
        )}
      </section>

      {laps.length > 0 && <LapsSection laps={laps} hasHealth={hasLapHealth} />}

      <section>
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Course
        </h2>

        {linkedRace ? (
          <div className="mt-3 rounded-data border border-brume bg-craie px-3 py-3">
            <p className="text-base text-schiste">
              <span className="mr-2 rounded-data border border-granit/35 px-1.5 py-0.5 font-mono text-xs uppercase text-granit">
                {linkedRace.priority}
              </span>
              {linkedRace.name}
              {linkedRace.location && (
                <span className="text-granit"> · {linkedRace.location}</span>
              )}
            </p>
            <p className="tabular mt-1 text-xs text-granit">
              {formatRaceDate(linkedRace.race_date)}
              {linkedRace.distance_m != null &&
                ` · prévu ${formatDistance(linkedRace.distance_m)}`}
              {linkedRace.elevation_gain_m != null &&
                ` · ${formatDplus(linkedRace.elevation_gain_m)}`}
            </p>
            <p className="tabular mt-2 text-sm text-schiste">
              temps réel{' '}
              <span className="font-medium">
                {formatDuree(activity.elapsed_time_s ?? activity.moving_time_s)}
              </span>
              {linkedRace.goal_time_s != null && (
                <span className="text-granit">
                  {' '}
                  · objectif {formatGoalTime(linkedRace.goal_time_s)}
                </span>
              )}
            </p>
            {linked === '1' && (
              <p className="mt-2 text-xs text-granit">Liaison enregistrée.</p>
            )}

            <div className="mt-3 border-t border-granit/20 pt-3">
              {existingDebriefId ? (
                <Link
                  href={`/debriefs?edit=${existingDebriefId}`}
                  className="inline-block text-xs text-granit hover:text-schiste"
                >
                  voir le débrief →
                </Link>
              ) : hasNotes ? (
                <form action={proposeDebriefFromActivity}>
                  <input type="hidden" name="activity_id" value={activity.id} />
                  <button
                    type="submit"
                    className="rounded-surface border border-schiste bg-schiste px-3 py-2 text-sm font-medium text-craie"
                  >
                    Proposer un débrief à partir de mes notes
                  </button>
                  <p className="mt-1 text-xs text-granit">
                    Le coach lit tes notes ci-dessous, puis te propose un
                    débrief structuré à valider.
                  </p>
                </form>
              ) : (
                <p className="text-xs text-granit">
                  Ajoute des notes personnelles ci-dessous pour permettre
                  l&apos;analyse et proposer un débrief.
                </p>
              )}
            </div>

            <form action={linkActivityToRace} className="mt-3">
              <input type="hidden" name="activity_id" value={activity.id} />
              <input type="hidden" name="race_id" value="" />
              <button
                type="submit"
                className="text-xs text-granit hover:text-schiste"
              >
                dissocier
              </button>
            </form>
          </div>
        ) : !raceEligible ? (
          <div className="mt-3 rounded-data border border-brume bg-craie px-3 py-3">
            <p className="text-sm text-granit">
              Type <span className="text-schiste">{activity.sport_type ?? '—'}</span>{' '}
              — pas de liaison à une course de trail/run.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2 rounded-data border border-brume bg-craie px-3 py-3">
            <p className="text-sm text-granit">
              Cette activité correspond-elle à une course de ta liste ?
            </p>
            {bestCandidate && (
              <p className="text-xs italic text-granit">
                Suggéré : <span className="text-schiste">{bestCandidate.name}</span>{' '}
                — {formatRaceDate(bestCandidate.race_date)}
                {bestCandidate.dateDiffDays === 0
                  ? ' (même jour)'
                  : ` (à ${Math.round(bestCandidate.dateDiffDays * 24)} h près)`}
                {bestCandidate.distanceRatio != null &&
                  ` · écart distance ${Math.round(bestCandidate.distanceRatio * 100)} %`}
              </p>
            )}
            <form action={linkActivityToRace} className="flex flex-wrap gap-2">
              <input type="hidden" name="activity_id" value={activity.id} />
              <select
                name="race_id"
                defaultValue={bestCandidate?.id ?? ''}
                className="flex-1 rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
              >
                <option value="" disabled>
                  Choisir une course…
                </option>
                {candidates.length > 0 && (
                  <optgroup label="Candidates (même jour ±1)">
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatRaceDate(c.race_date)} — {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {allRaces.length > 0 && (
                  <optgroup label="Toutes les courses">
                    {allRaces.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatRaceDate(r.race_date)} — {r.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="submit"
                className="rounded-surface bg-schiste px-3 py-2 text-sm font-medium text-craie"
              >
                Lier
              </button>
            </form>

            <div className="mt-3 border-t border-brume pt-3">
              <p className="text-xs text-granit">
                Ou crée une nouvelle course à partir de cette séance :
              </p>
              <form
                action={createRaceFromActivity}
                className="mt-2 flex flex-wrap items-baseline gap-2"
              >
                <input type="hidden" name="activity_id" value={activity.id} />
                <label className="flex items-baseline gap-1 text-xs text-granit">
                  priorité
                  <select
                    name="priority"
                    defaultValue="B"
                    className="rounded-data border border-granit/35 bg-craie px-2 py-1 text-sm font-mono text-schiste focus:border-schiste focus:outline-none"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-surface border border-granit/40 px-3 py-2 text-sm text-schiste hover:bg-brume"
                >
                  Créer et lier
                </button>
              </form>
              <p className="mt-1 text-[11px] italic text-granit">
                Course pré-remplie (nom, date, distance, D+, temps) et marquée
                terminée.
              </p>
            </div>
          </div>
        )}
      </section>

      {activity.description &&
        activity.description.trim() !== (activity.user_notes ?? '').trim() && (
          <section>
            <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
              Depuis Strava
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-granit">
              {activity.description}
            </p>
            <p className="mt-1 text-xs text-granit italic">
              Version d&apos;origine. Tes notes ci-dessous en ont divergé.
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
            <div className="flex flex-wrap gap-2">
              {hasNotes && (
                <form action={proposeFuelingFromActivity}>
                  <input type="hidden" name="activity_id" value={activity.id} />
                  <button
                    type="submit"
                    className="rounded-surface border border-schiste bg-schiste px-3 py-2 text-sm font-medium text-craie"
                  >
                    Proposer un fueling à partir de mes notes
                  </button>
                </form>
              )}
              <Link
                href={`/fueling?activity=${activity.id}`}
                className={
                  'inline-block rounded-surface px-3 py-2 text-sm font-medium ' +
                  (hasNotes
                    ? 'border border-granit/35 text-schiste'
                    : 'border border-schiste bg-schiste text-craie')
                }
              >
                Logger manuellement
              </Link>
            </div>
            <p className="mt-2 text-xs text-granit">
              {hasNotes
                ? 'Le coach lit tes notes ci-dessous et te propose un log structuré à valider.'
                : 'Astuce : décris tes ravitos dans les notes ci-dessous, le fueling pourra alors être prérempli automatiquement.'}
            </p>
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
        {!activity.user_notes && !activity.description && activity.strava_activity_id && (
          <form action={pullStravaDescription} className="mt-2">
            <input type="hidden" name="activity_id" value={activity.id} />
            <button
              type="submit"
              className="text-xs text-granit underline hover:text-schiste"
            >
              ↓ récupérer la description depuis Strava
            </button>
          </form>
        )}
        <form action={updateActivityNotes} className="mt-3">
          <input type="hidden" name="id" value={activity.id} />
          <textarea
            name="user_notes"
            rows={5}
            defaultValue={activity.user_notes ?? ''}
            placeholder="Sensations, ravitos, ce qui a marché ou pas. Ces notes servent à proposer un débrief et un log de fueling ci-dessus. Elles ne sont jamais écrasées par un re-import Strava."
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

      {(activity.todo_dismissed ?? []).length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            À traiter — écarté
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {(activity.todo_dismissed as string[]).map((r) => (
              <li key={r}>
                <form action={toggleTodoDismissed} className="inline-flex">
                  <input type="hidden" name="activity_id" value={activity.id} />
                  <input type="hidden" name="reason" value={r} />
                  <button
                    type="submit"
                    className="rounded-data border border-granit/40 px-2 py-1 text-granit hover:bg-craie hover:text-schiste"
                    title="Restaurer cette raison dans la liste à traiter"
                  >
                    {DISMISS_LABEL[r] ?? r} · restaurer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

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

/**
 * Table des laps d'une seance : chaque lap affiche distance, temps,
 * allure. On surligne les blocs les plus rapides (par rapport a la
 * mediane des paces) et on badge manuel vs auto. Sur une seance
 * fractionnee, ca permet de lire d'un coup d'oeil "j'ai tourne a
 * 3:50 sur mes 5 x 1 km".
 */
function LapsSection({
  laps,
  hasHealth,
}: {
  laps: LapDisplay[]
  hasHealth: boolean
}) {
  const isManual = laps[0]?.is_manual ?? false
  const paces = laps
    .map((l) => l.avg_pace_s_per_km ?? l.moving_time_s / (l.distance_m / 1000))
    .filter((p) => Number.isFinite(p) && p > 0)
  const sorted = [...paces].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? null
  const effortThreshold = median != null ? median - 30 : null

  return (
    <details className="group">
      <summary className="flex cursor-pointer items-baseline justify-between list-none">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Laps ({laps.length}) — <span className="text-schiste group-open:hidden">voir</span><span className="hidden text-schiste group-open:inline">masquer</span>
        </h2>
        <span className="font-mono text-[10px] uppercase text-granit">
          {isManual ? 'manuels' : 'auto-km'}
          {hasHealth ? ' · avec FC' : ''}
        </span>
      </summary>
      <ul className="mt-3 divide-y divide-brume rounded-data border border-brume bg-craie">
        {laps.map((lap) => {
          const pace =
            lap.avg_pace_s_per_km ??
            lap.moving_time_s / (lap.distance_m / 1000)
          const isEffort =
            effortThreshold != null && pace <= effortThreshold
          const dPlus = lap.elevation_gain_m ?? 0
          const dMinus = lap.elevation_loss_m ?? 0
          return (
            <li
              key={lap.lap_index}
              className={
                'px-3 py-2 text-sm ' + (isEffort ? 'bg-brume/40' : '')
              }
            >
              <div className="grid grid-cols-[2rem_1fr_1fr_1fr] items-baseline gap-2">
                <span className="tabular font-mono text-[10px] text-granit">
                  #{lap.lap_index}
                </span>
                <span className="tabular font-mono text-xs text-schiste">
                  {(lap.distance_m / 1000).toFixed(2)} km
                </span>
                <span className="tabular font-mono text-xs text-granit">
                  {formatDuree(lap.moving_time_s)}
                </span>
                <span
                  className={
                    'tabular font-mono text-xs ' +
                    (isEffort ? 'font-semibold text-schiste' : 'text-schiste')
                  }
                >
                  {formatPaceFromS(pace)}
                </span>
              </div>
              {(dPlus > 0 || dMinus > 0 || lap.avg_hr != null) && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-8 font-mono text-[10px] text-granit">
                  {(dPlus > 0 || dMinus > 0) && (
                    <span className="tabular">
                      {dPlus > 0 ? `+${dPlus} m` : ''}
                      {dPlus > 0 && dMinus > 0 ? ' · ' : ''}
                      {dMinus > 0 ? `−${dMinus} m` : ''}
                    </span>
                  )}
                  {lap.avg_hr != null && (
                    <span className="tabular">
                      FC moy {lap.avg_hr}
                      {lap.max_hr != null ? ` · max ${lap.max_hr}` : ''}
                      {lap.min_hr != null ? ` · min ${lap.min_hr}` : ''}
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {isManual && (
        <p className="mt-2 text-[11px] italic text-granit">
          Laps pressés au bouton pendant la séance — les blocs surlignés sont
          plus rapides que la médiane et servent de référence pour l&apos;estimation
          course.
        </p>
      )}
    </details>
  )
}

function formatPaceFromS(sPerKm: number): string {
  if (!Number.isFinite(sPerKm) || sPerKm <= 0) return '—'
  const m = Math.floor(sPerKm / 60)
  const s = Math.round(sPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
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
