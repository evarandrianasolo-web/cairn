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

const LONG_SECS = 90 * 60
const DAY_MS = 24 * 60 * 60 * 1000

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
      'id, name, race_date, location, distance_m, elevation_gain_m, priority, status, goal_time_s, result_time_s, notes',
    )
    .eq('id', id)
    .maybeSingle()
  if (!race) redirect('/courses')

  const [{ data: linkedActivity }, { data: debrief }, { data: fuelingLogs }] =
    await Promise.all([
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
    ])

  const isUpcoming = !race.status || race.status !== 'terminee'
  const j = daysUntil(race.race_date)
  const goalS = race.goal_time_s ?? null
  const resultS = race.result_time_s ?? null

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
