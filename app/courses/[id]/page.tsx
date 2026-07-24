import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  daysUntil,
  formatDistance,
  formatDplus,
  formatDuree,
  formatGoalTime,
  formatJMinus,
  formatRaceDate,
} from '@/lib/format'
import {
  computeVerticalSpeed,
  estimateRaceTime,
  formatPace,
  formatVerticalSpeed,
  inferReferenceTimes,
  type LapRefLite,
  type SimilarEffort,
} from '@/lib/paces'

const LONG_SECS = 90 * 60
const DAY_MS = 24 * 60 * 60 * 1000

type LapRow = {
  activity_id: string
  distance_m: number
  moving_time_s: number
  is_manual: boolean
  elevation_gain_m: number | null
  activity:
    | {
        name: string | null
        started_at: string | null
        distance_m: number | null
        elevation_gain_m: number | null
      }
    | {
        name: string | null
        started_at: string | null
        distance_m: number | null
        elevation_gain_m: number | null
      }[]
    | null
}

type FuelingLog = {
  activity_id: string
  intake_pattern: string
  carbs_g: number | null
  carbs_g_per_hour: number | null
  issue: string | null
  products: unknown
  notes: string | null
  activity:
    | {
        started_at: string
        name: string | null
        moving_time_s: number | null
      }
    | { started_at: string; name: string | null; moving_time_s: number | null }[]
    | null
}

export default async function CourseFichePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params

  const { data: race } = await supabase
    .from('races')
    .select(
      'id, name, race_date, location, distance_m, elevation_gain_m, priority, terrain, status, goal_time_s, result_time_s, notes',
    )
    .eq('id', id)
    .maybeSingle()
  if (!race) redirect('/courses')

  const DAY_MS = 24 * 60 * 60 * 1000
  const since90d = new Date(Date.now() - 90 * DAY_MS).toISOString()
  const since24m = new Date(Date.now() - 730 * DAY_MS).toISOString()
  const todayIso = new Date().toISOString().slice(0, 10)

  const [
    { data: linkedActivity },
    { data: debrief },
    { data: fuelingLogs },
    { data: athlete },
    { data: recentActs90 },
    { data: longActs },
    { data: doneRaces },
  ] = await Promise.all([
    supabase
      .from('activities')
      .select('id, name, distance_m, elevation_gain_m, moving_time_s, elapsed_time_s, user_notes')
      .eq('race_id', race.id)
      .maybeSingle(),
    supabase
      .from('debriefs')
      .select(
        'id, kind, narrative, what_worked, what_failed, focus_areas, created_at',
      )
      .eq('race_id', race.id)
      .maybeSingle(),
    supabase
      .from('fueling_logs')
      .select(
        'activity_id, intake_pattern, carbs_g, carbs_g_per_hour, issue, products, notes, activity:activities!fueling_logs_activity_id_fkey(started_at, name, moving_time_s)',
      )
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('athletes')
      .select('ref_5km_s, ref_10km_s, ref_semi_s, ref_marathon_s')
      .maybeSingle(),
    supabase
      .from('activities')
      .select('name, started_at, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km')
      .gte('started_at', since90d),
    supabase
      .from('activities')
      .select('name, started_at, distance_m, elevation_gain_m, moving_time_s')
      .gte('started_at', since24m)
      .or('moving_time_s.gte.5400,elevation_gain_m.gte.500'),
    supabase
      .from('races')
      .select('name, distance_m, elevation_gain_m, result_time_s, race_date')
      .eq('status', 'terminee')
      .lt('race_date', todayIso)
      .not('result_time_s', 'is', null)
      .neq('id', race.id)
      .order('race_date', { ascending: false })
      .limit(20),
  ])

  // Laps des activites recentes (90 j). Join a activities pour
  // recuperer nom + date + D+/km -- necessaire pour l'inference et
  // pour rejeter les laps auto sur trail vallonne.
  const { data: rawLaps } = await supabase
    .from('activity_laps')
    .select(
      'activity_id, distance_m, moving_time_s, is_manual, elevation_gain_m, activity:activities!inner(name, started_at, distance_m, elevation_gain_m)',
    )
    .gte('activity.started_at', since90d)
    .gte('distance_m', 800)

  const isUpcoming = !race.status || race.status !== 'terminee'
  const j = daysUntil(race.race_date)
  const goalS = race.goal_time_s ?? null
  const resultS = race.result_time_s ?? null

  const savedRefs = {
    ref_5km_s: athlete?.ref_5km_s ?? null,
    ref_10km_s: athlete?.ref_10km_s ?? null,
    ref_semi_s: athlete?.ref_semi_s ?? null,
    ref_marathon_s: athlete?.ref_marathon_s ?? null,
  }
  const { refs, bestFromActivity } = inferReferenceTimes(
    savedRefs,
    (doneRaces ?? []).map((r) => ({
      distance_m: r.distance_m,
      elevation_gain_m: r.elevation_gain_m,
      result_time_s: r.result_time_s,
      race_date: r.race_date,
    })),
    (recentActs90 ?? []).map((a) => ({
      distance_m: a.distance_m,
      elevation_gain_m: a.elevation_gain_m,
      moving_time_s: a.moving_time_s,
      avg_pace_s_per_km: a.avg_pace_s_per_km ?? null,
      started_at: a.started_at ?? null,
      name: a.name ?? null,
    })),
    ((rawLaps ?? []) as unknown as LapRow[]).map((l) => {
      const act = Array.isArray(l.activity) ? l.activity[0] : l.activity
      const parentD = act?.elevation_gain_m ?? 0
      const parentKm = act?.distance_m ? act.distance_m / 1000 : 0
      const parentDplusPerKm = parentKm > 0 ? parentD / parentKm : 0
      return {
        activity_id: l.activity_id,
        activity_name: act?.name ?? null,
        activity_started_at: act?.started_at ?? null,
        distance_m: l.distance_m,
        moving_time_s: l.moving_time_s,
        is_manual: l.is_manual,
        elevation_gain_m: l.elevation_gain_m ?? 0,
        parent_dplus_per_km: parentDplusPerKm,
      } satisfies LapRefLite
    }),
    new Date(),
  )
  const vSpeed = computeVerticalSpeed(recentActs90 ?? [])

  // Pool d'efforts comparables : longues sorties des 6 derniers mois
  // (>= 1h) + courses terminees (autres que celle-ci). Les courses
  // portent kind='race' -> bonus dans le scoring.
  const similarPool: SimilarEffort[] = [
    ...(longActs ?? [])
      .filter(
        (a) =>
          a.distance_m != null && a.distance_m > 0 && a.moving_time_s != null,
      )
      .map((a) => ({
        distance_m: a.distance_m as number,
        elevation_gain_m: a.elevation_gain_m,
        time_s: a.moving_time_s as number,
        kind: 'activity' as const,
        label: a.name ?? null,
        date: a.started_at ? a.started_at.slice(0, 10) : null,
      })),
    ...(doneRaces ?? [])
      .filter(
        (r) =>
          r.distance_m != null &&
          r.distance_m > 0 &&
          r.result_time_s != null &&
          r.result_time_s > 0,
      )
      .map((r) => ({
        distance_m: r.distance_m as number,
        elevation_gain_m: r.elevation_gain_m,
        time_s: r.result_time_s as number,
        kind: 'race' as const,
        label: r.name ?? null,
        date: r.race_date ?? null,
      })),
  ]

  const estimate = estimateRaceTime(
    {
      distance_m: race.distance_m,
      elevation_gain_m: race.elevation_gain_m,
      terrain: race.terrain,
    },
    refs,
    vSpeed,
    similarPool,
  )

  const longsFuelings = extractRelevantFuelings(
    (fuelingLogs ?? []) as FuelingLog[],
  )

  const plan = buildFuelingPlan(longsFuelings, goalS)

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-baseline justify-between text-xs text-granit">
        <Link href="/courses" className="hover:text-schiste">
          ← retour
        </Link>
        <span className="tabular">{formatRaceDate(race.race_date)}</span>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-wide text-granit">
          Priorité {race.priority}
          {race.terrain ? ` · ${race.terrain}` : ''}
          {race.location ? ` · ${race.location}` : ''}
        </div>
        <ScreenTitle>{race.name}</ScreenTitle>
      </div>

      <section className="rounded-data border border-brume bg-craie p-4">
        <div className="flex items-baseline gap-4">
          <div className="flex-1">
            <div className="font-display text-4xl font-black leading-none text-balise sm:text-5xl">
              {isUpcoming ? formatJMinus(race.race_date) : 'terminée'}
            </div>
            <div className="tabular mt-1 font-mono text-[10px] text-granit">
              {isUpcoming
                ? j > 0
                  ? `${j} jour${j > 1 ? 's' : ''} avant le départ`
                  : 'aujourd\'hui'
                : linkedActivity
                  ? `réalisée${resultS ? ` en ${formatDuree(resultS)}` : ''}`
                  : 'course passée'}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-brume pt-4 sm:grid-cols-4">
          <Stat label="Distance" value={formatDistance(race.distance_m)} />
          <Stat label="D+" value={formatDplus(race.elevation_gain_m)} />
          <Stat
            label="Objectif"
            value={goalS ? formatGoalTime(goalS) : '—'}
          />
          <Stat
            label={resultS ? 'Résultat' : 'Statut'}
            value={
              resultS
                ? formatDuree(resultS)
                : race.status === 'terminee'
                  ? 'terminée'
                  : 'à venir'
            }
            highlight={!!resultS}
          />
        </div>
      </section>

      {isUpcoming && estimate && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Estimation
          </h2>
          <p className="mt-2 break-words text-xs italic text-granit">
            {estimateSourceLabel(estimate, vSpeed?.medianMPerHour ?? null)}{' '}
            Estimation indicative, à confronter à tes sensations le jour J.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Temps estimé"
              value={formatDuree(estimate.estimatedTimeS)}
              highlight
            />
            <Stat
              label="Allure moyenne"
              value={formatPace(estimate.averagePaceSPerKm)}
            />
            {(race.elevation_gain_m ?? 0) > 0 && estimate.verticalCostS > 0 && (
              <Stat
                label={
                  estimate.source === 'reference' ? 'Dont D+ (indic.)' : 'Coût D+'
                }
                value={`+${formatDuree(estimate.verticalCostS)}`}
              />
            )}
          </div>
          {goalS && (
            <p className="mt-3 text-sm text-schiste">
              <span className="font-medium">Objectif saisi :</span>{' '}
              {formatDuree(goalS)}
              {' — '}
              {goalS < estimate.estimatedTimeS
                ? `${formatDuree(estimate.estimatedTimeS - goalS)} plus rapide que l'estimation.`
                : `${formatDuree(goalS - estimate.estimatedTimeS)} de marge sur l'estimation.`}
            </p>
          )}
          {estimate.source === 'route-refs' && estimate.routeRefKm && (
            <RecentSpeedContext
              refKm={estimate.routeRefKm}
              bestFromActivity={bestFromActivity}
              usedRefTimeS={pickRefTimeS(estimate.routeRefKm, refs)}
            />
          )}
        </section>
      )}

      {race.notes && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Notes stratégiques
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-schiste">
            {race.notes}
          </p>
        </section>
      )}

      {isUpcoming && plan && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Plan fueling · repères
          </h2>
          <p className="mt-2 text-xs italic text-granit">
            Additif jamais restrictif. Estimation à partir de tes {plan.sampleSize}{' '}
            dernière{plan.sampleSize > 1 ? 's' : ''} longue
            {plan.sampleSize > 1 ? 's' : ''} loggée
            {plan.sampleSize > 1 ? 's' : ''}.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="g/h récent" value={`${plan.averageGph} g/h`} />
            <Stat
              label="Cible course"
              value={`${plan.targetGph} g/h`}
              highlight
            />
            <Stat
              label={goalS ? 'Glucides total' : 'Total (obj. inconnu)'}
              value={plan.totalG ? `${plan.totalG} g` : '—'}
            />
          </div>

          <div className="mt-4 space-y-2 text-sm text-schiste">
            <p>
              <span className="font-medium">Rythme suggéré :</span>{' '}
              {plan.suggestion}
            </p>
            {plan.gapMessage && (
              <p className="text-ocre">{plan.gapMessage}</p>
            )}
            {plan.recentIssues.length > 0 && (
              <p>
                <span className="font-medium">Points de vigilance :</span>{' '}
                {plan.recentIssues.join(' · ')}
              </p>
            )}
          </div>

          {plan.productsSeen.length > 0 && (
            <div className="mt-3 border-t border-brume pt-3">
              <div className="font-mono text-[10px] uppercase text-granit">
                Produits que tu tolères
              </div>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-schiste">
                {plan.productsSeen.slice(0, 8).map((p) => (
                  <li
                    key={p}
                    className="rounded-data border border-granit/35 px-2 py-1"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {isUpcoming && !plan && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Plan fueling · repères
          </h2>
          <p className="mt-2 text-sm text-granit">
            Aucune longue loggée récemment. Ajoute un fueling log sur ta
            prochaine longue via{' '}
            <Link href="/activities" className="underline">
              Activités
            </Link>{' '}
            pour que le plan se construise à partir de tes vrais essais.
          </p>
        </section>
      )}

      {linkedActivity && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Activité liée
          </h2>
          <p className="mt-2 text-sm text-schiste">
            {linkedActivity.name ?? '—'} ·{' '}
            <span className="tabular font-mono text-xs">
              {formatDistance(linkedActivity.distance_m)} ·{' '}
              {formatDplus(linkedActivity.elevation_gain_m)} ·{' '}
              {formatDuree(
                linkedActivity.elapsed_time_s ?? linkedActivity.moving_time_s,
              )}
            </span>
          </p>
          <Link
            href={`/activities/${linkedActivity.id}`}
            className="mt-3 inline-block text-xs text-granit underline hover:text-schiste"
          >
            Ouvrir la séance →
          </Link>
        </section>
      )}

      {debrief && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Débrief
          </h2>
          {debrief.narrative && (
            <p className="mt-2 text-sm text-schiste italic">
              {truncate(debrief.narrative, 300)}
            </p>
          )}
          <Link
            href={`/debriefs?edit=${debrief.id}`}
            className="mt-3 inline-block text-xs text-granit underline hover:text-schiste"
          >
            Ouvrir le débrief →
          </Link>
        </section>
      )}

      <div className="flex gap-3 text-sm">
        <Link
          href={`/courses?edit=${race.id}`}
          className="rounded-surface border border-granit/40 px-4 py-2 text-schiste hover:bg-brume"
        >
          Modifier
        </Link>
      </div>
    </main>
  )
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
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

function estimateSourceLabel(
  est: NonNullable<ReturnType<typeof estimateRaceTime>>,
  medianVSpeed: number | null,
): string {
  if (est.source === 'reference' && est.referenceEffort) {
    const r = est.referenceEffort
    const kmLabel = (r.distance_m / 1000).toFixed(0)
    const dLabel = r.elevation_gain_m > 0 ? ` / ${r.elevation_gain_m} m D+` : ''
    const kind = r.kind === 'race' ? 'course' : 'sortie'
    const when = r.date ? ` du ${formatShortDate(r.date)}` : ''
    const shortLabel = r.label && r.label.length > 40 ? r.label.slice(0, 38).trim() + '…' : r.label
    const name = shortLabel ? ` « ${shortLabel} »` : ''
    return `Extrapolée depuis ta ${kind}${name}${when} (${kmLabel} km${dLabel} en ${formatDuree(r.time_s)}) via Riegel effort-km.`
  }
  if (est.source === 'route-refs') {
    const refLabel = est.routeRefKm ? formatKmLabel(est.routeRefKm) : 'refs route'
    const dNote = est.verticalCostS > 0 ? ' + coût D+' : ''
    return `Course route : Riegel depuis ton temps de référence ${refLabel}${dNote}. Renseigne tes temps dans /settings/profil pour affiner.`
  }
  if (est.source === 'refs+vspeed') {
    return `Riegel depuis ton meilleur temps route + coût D+ (${formatVerticalSpeed(medianVSpeed ?? 0)}). Aucune sortie comparable dans l'historique.`
  }
  return `Riegel + coût D+ standard (8 min / 100 m). Aucune sortie comparable dans l'historique — l'estimation gagnera en précision quand tu auras des trails passés.`
}

function formatKmLabel(km: number): string {
  if (Math.abs(km - 5) < 0.1) return '5 km'
  if (Math.abs(km - 10) < 0.1) return '10 km'
  if (Math.abs(km - 21.0975) < 0.1) return 'semi'
  if (Math.abs(km - 42.195) < 0.1) return 'marathon'
  return `${km.toFixed(1)} km`
}

function pickRefTimeS(
  km: number,
  refs: { ref_5km_s: number | null; ref_10km_s: number | null; ref_semi_s: number | null; ref_marathon_s: number | null },
): number | null {
  if (Math.abs(km - 5) < 0.1) return refs.ref_5km_s
  if (Math.abs(km - 10) < 0.1) return refs.ref_10km_s
  if (Math.abs(km - 21.0975) < 0.1) return refs.ref_semi_s
  if (Math.abs(km - 42.195) < 0.1) return refs.ref_marathon_s
  return null
}

function keyForKm(km: number): 'ref_5km_s' | 'ref_10km_s' | 'ref_semi_s' | 'ref_marathon_s' | null {
  if (Math.abs(km - 5) < 0.1) return 'ref_5km_s'
  if (Math.abs(km - 10) < 0.1) return 'ref_10km_s'
  if (Math.abs(km - 21.0975) < 0.1) return 'ref_semi_s'
  if (Math.abs(km - 42.195) < 0.1) return 'ref_marathon_s'
  return null
}

/**
 * Sous-bloc affiche en mode route : quand on utilise un ref saisi
 * (typiquement ancien) mais que des seances de vitesse recentes
 * pourraient etre pertinentes, on montre le calcul equivalent pour
 * qu'Eva puisse comparer et corriger si besoin.
 */
function RecentSpeedContext({
  refKm,
  bestFromActivity,
  usedRefTimeS,
}: {
  refKm: number
  bestFromActivity: Record<string, { label: string | null; date: string | null; equivalentS: number } | undefined>
  usedRefTimeS: number | null
}) {
  const key = keyForKm(refKm)
  const src = key ? bestFromActivity[key] : null
  if (!src) return null
  const shortLabel = src.label && src.label.length > 40 ? src.label.slice(0, 38).trim() + '…' : src.label
  const when = src.date ? ` du ${formatShortDate(src.date)}` : ''
  const usedIsBetter = usedRefTimeS != null && usedRefTimeS <= src.equivalentS
  return (
    <div className="mt-3 rounded-data border border-brume bg-brume/40 p-3">
      <div className="font-mono text-[10px] uppercase text-granit">
        Séances de vitesse récentes
      </div>
      <p className="mt-1 break-words text-xs text-schiste">
        Meilleur équivalent {formatKmLabel(refKm)} déduit : <span className="tabular font-medium">{formatDuree(src.equivalentS)}</span>
        {shortLabel ? ` — depuis « ${shortLabel} »` : ''}
        {when}.{' '}
        {usedIsBetter
          ? 'Ton temps de référence saisi reste plus rapide, on le garde.'
          : 'Utilisé pour l\'estimation.'}
      </p>
    </div>
  )
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

function extractRelevantFuelings(rows: FuelingLog[]) {
  return rows
    .map((r) => {
      const a = Array.isArray(r.activity) ? r.activity[0] : r.activity
      return { ...r, activity: a }
    })
    .filter(
      (r) =>
        r.activity &&
        r.activity.moving_time_s != null &&
        r.activity.moving_time_s >= LONG_SECS,
    )
    .slice(0, 5)
}

/**
 * Plan fueling additif -- jamais restrictif. On calcule un g/h moyen
 * depuis les longues loggees recentes, on propose une cible legerement
 * superieure (idee : progresser d'un cran a la fois, ~+10 g/h) sans
 * jamais depasser 90 g/h par prudence, et on additionne pour la
 * duree cible.
 */
function buildFuelingPlan(
  fuelings: ReturnType<typeof extractRelevantFuelings>,
  goalS: number | null,
): {
  averageGph: number
  targetGph: number
  totalG: number | null
  suggestion: string
  gapMessage: string | null
  sampleSize: number
  productsSeen: string[]
  recentIssues: string[]
} | null {
  if (fuelings.length === 0) return null

  const gphs: number[] = []
  const productsSet = new Set<string>()
  const issuesSet = new Set<string>()
  for (const f of fuelings) {
    const direct = f.carbs_g_per_hour
    const durS = f.activity?.moving_time_s ?? 0
    const gph =
      direct != null
        ? direct
        : f.carbs_g != null && durS > 0
          ? (f.carbs_g * 3600) / durS
          : null
    if (gph != null) gphs.push(gph)
    if (f.products && typeof f.products === 'object' && 'text' in f.products) {
      const t = (f.products as { text?: string }).text
      if (typeof t === 'string' && t.trim().length > 0) productsSet.add(t.trim())
    }
    if (f.issue && f.issue !== 'aucun') issuesSet.add(f.issue)
  }
  if (gphs.length === 0) return null

  const averageGph = Math.round(gphs.reduce((s, v) => s + v, 0) / gphs.length)
  const targetGph = Math.min(90, Math.max(averageGph, averageGph + 10))
  const totalG = goalS ? Math.round((targetGph * goalS) / 3600) : null

  const suggestion = suggestRhythm(targetGph)
  const gapMessage =
    targetGph - averageGph >= 15
      ? `Ecart important entre ce que tu tolères aujourd'hui (${averageGph} g/h) et la cible (${targetGph} g/h). Prochaines longues : monte progressivement d'un cran à la fois.`
      : null

  return {
    averageGph,
    targetGph,
    totalG,
    suggestion,
    gapMessage,
    sampleSize: fuelings.length,
    productsSeen: Array.from(productsSet),
    recentIssues: Array.from(issuesSet),
  }
}

function suggestRhythm(gph: number): string {
  if (gph >= 70)
    return `Une source solide + une source liquide toutes les 20 min, ou un gel + une gorgée boisson isotonique toutes les 25 min.`
  if (gph >= 45)
    return `Un ravito solide ou gel toutes les 30 min, complété par une boisson à 40 g/L en continu.`
  if (gph >= 25)
    return `Une compote ou barre toutes les 30-40 min + une boisson isotonique légère.`
  return `Tester d'abord un ravito toutes les 45 min sur les longues à venir, monter progressivement.`
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1) + '…'
}
