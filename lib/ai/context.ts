import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysUntil,
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'
import { aggregateByWeek, isoWeekStart } from '@/lib/analytics'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS_AGGREGATED = 12
const RECENT_DETAILED = 10
const CONSTRAINT_WINDOW_DAYS = 28

/**
 * Constructeur du contexte coach — PRD §3.4, budget 2 à 4 k tokens.
 * Contenu : profil + prochaine course A + charge hebdo 12 semaines
 * agrégées + 10 dernières séances détaillées + contraintes actives sur
 * les 4 prochaines semaines + dernier fueling log + dernier débrief.
 * Ainsi ce qui est saisi ailleurs (contrainte, fueling, débrief) est vu
 * automatiquement au message suivant sans qu'Eva ait à le rappeler.
 *
 * Les données de santé ne circulent JAMAIS en brut ici — dérivé uniquement
 * (drapeau, tendance).
 *
 * Ce fichier construit une chaîne de caractères injectée en premier message
 * user, PAS dans le system prompt (le system reste stable pour le cache
 * Anthropic, cf. skill claude-api § prefix match).
 */
export async function buildCoachContext(
  supabase: SupabaseClient,
): Promise<string> {
  const now = new Date()
  const since12w = new Date(isoWeekStart(now).getTime() - (WEEKS_AGGREGATED - 1) * 7 * DAY_MS)
  const todayIso = now.toISOString().slice(0, 10)
  const horizonIso = new Date(now.getTime() + CONSTRAINT_WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10)

  const [
    { data: athlete },
    weeklyRes,
    recentRes,
    raceRes,
    constraintsRes,
    lastFuelingRes,
    lastDebriefRes,
  ] = await Promise.all([
    supabase.from('athletes').select('display_name, timezone').maybeSingle(),
    // Toutes les activités des 12 dernières semaines pour l'agrégation.
    supabase
      .from('activities')
      .select('started_at, sport_type, distance_m, elevation_gain_m, moving_time_s')
      .gte('started_at', since12w.toISOString())
      .order('started_at', { ascending: false }),
    // Les 10 plus récentes détaillées (peuvent recouper les précédentes,
    // mais on garde le nom et l'allure ici).
    supabase
      .from('activities')
      .select('started_at, sport_type, name, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km')
      .order('started_at', { ascending: false })
      .limit(RECENT_DETAILED),
    supabase
      .from('races')
      .select('name, race_date, location, distance_m, elevation_gain_m, goal_time_s')
      .eq('priority', 'A')
      .gte('race_date', todayIso)
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Contraintes actives sur les 4 prochaines semaines : soit récurrentes
    // non expirées, soit ponctuelles qui recoupent la fenêtre.
    supabase
      .from('constraints')
      .select('label, kind, type, impact, recurrence_rule, starts_on, ends_on, focus, notes')
      .or(
        // Récurrentes : starts_on <= horizon, ends_on IS NULL or >= today
        `and(recurrence_rule.not.is.null,starts_on.lte.${horizonIso},or(ends_on.is.null,ends_on.gte.${todayIso})),` +
          // Ponctuelles : starts_on <= horizon, ends_on IS NULL or >= today
          `and(recurrence_rule.is.null,starts_on.lte.${horizonIso},or(ends_on.is.null,ends_on.gte.${todayIso}))`,
      )
      .order('starts_on', { ascending: true }),
    // Dernier fueling log — trié par date de l'activité liée.
    supabase
      .from('fueling_logs')
      .select(
        'intake_pattern, carbs_g, carbs_g_per_hour, products, issue, post_window_fed, notes, ' +
          'activity:activities!fueling_logs_activity_id_fkey(started_at, name, distance_m, moving_time_s)',
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Dernier débrief — celui qui porte les axes de travail en cours.
    supabase
      .from('debriefs')
      .select(
        'kind, period_start, period_end, narrative, what_worked, what_failed, focus_areas, ' +
          'race:races(name, race_date)',
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const weekly = aggregateByWeek(weeklyRes.data ?? [], WEEKS_AGGREGATED)
  const recent = recentRes.data ?? []
  const race = raceRes.data
  const constraints = constraintsRes.data ?? []
  const lastFueling = lastFuelingRes.data as LastFuelingRow | null
  const lastDebrief = lastDebriefRes.data as LastDebriefRow | null

  const lines: string[] = []
  lines.push(`# Contexte Eva`)
  if (athlete?.display_name) {
    lines.push(`Athlete : ${athlete.display_name}${athlete.timezone ? ` (${athlete.timezone})` : ''}`)
  }
  lines.push('')

  if (race) {
    const j = daysUntil(race.race_date)
    lines.push(`## Prochaine course A`)
    lines.push(
      `- ${race.name} — ${formatDateCourte(race.race_date)} (J−${j > 0 ? j : 0})` +
        (race.location ? ` · ${race.location}` : ''),
    )
    if (race.distance_m || race.elevation_gain_m) {
      lines.push(
        `- ${formatDistance(race.distance_m)} · ${formatDplus(race.elevation_gain_m)}` +
          (race.goal_time_s ? ` · objectif ${Math.round(race.goal_time_s / 60)} min` : ''),
      )
    }
    lines.push('')
  } else {
    lines.push(`## Prochaine course A`)
    lines.push(`- Pas de course A programmée.`)
    lines.push('')
  }

  lines.push(`## Charge hebdo — 12 dernières semaines`)
  lines.push(`(Semaine ISO · km · D+ · séances · plus longue sortie)`)
  for (const w of weekly) {
    const kmStr = w.distanceM > 0 ? `${(w.distanceM / 1000).toFixed(1)} km` : '—'
    const dPlus = w.elevationM > 0 ? `${w.elevationM} D+` : '—'
    const longest = w.longestM > 0 ? `plus longue ${(w.longestM / 1000).toFixed(1)} km` : ''
    lines.push(
      `- S${w.isoWeek} (${formatDateCourte(w.weekStart.toISOString())}) : ` +
        `${kmStr} · ${dPlus} · ${w.sessions} séance${w.sessions > 1 ? 's' : ''}` +
        (longest ? ` · ${longest}` : ''),
    )
  }
  lines.push('')

  if (recent.length > 0) {
    lines.push(`## ${recent.length} dernières séances`)
    for (const a of recent) {
      const paceStr =
        a.avg_pace_s_per_km && a.avg_pace_s_per_km > 0
          ? ` · ${Math.floor(a.avg_pace_s_per_km / 60)}:${String(Math.round(a.avg_pace_s_per_km % 60)).padStart(2, '0')}/km`
          : ''
      lines.push(
        `- ${formatDateCourte(a.started_at)} · ${a.sport_type ?? '—'} · ` +
          `${formatDistance(a.distance_m)} · ${formatDplus(a.elevation_gain_m)} · ` +
          `${formatDuree(a.moving_time_s)}${paceStr}${a.name ? ` — ${a.name}` : ''}`,
      )
    }
    lines.push('')
  }

  if (constraints.length > 0) {
    lines.push(`## Contraintes actives (4 prochaines semaines)`)
    for (const c of constraints) {
      const cadence = c.recurrence_rule
        ? summarizeRecurrence(c.recurrence_rule)
        : formatPunctual(c.starts_on, c.ends_on)
      const impactLabel = IMPACT_LABELS[c.impact] ?? c.impact
      const focusPart = c.focus ? ` — focus ${c.focus}` : ''
      const typePart = c.type ? ` (${c.type})` : ''
      lines.push(`- ${c.label}${typePart} · ${cadence} · ${impactLabel}${focusPart}`)
      if (c.notes) lines.push(`  note : ${c.notes}`)
    }
    lines.push('')
  }

  if (lastFueling) {
    const f = lastFueling
    lines.push(`## Dernier fueling logué`)
    const a = f.activity
    if (a) {
      lines.push(
        `- Séance ${formatDateCourte(a.started_at)}${a.name ? ` — ${a.name}` : ''} · ` +
          `${formatDistance(a.distance_m)} · ${formatDuree(a.moving_time_s)}`,
      )
    }
    const parts: string[] = []
    parts.push(`prise : ${FUELING_PATTERN_LABELS[f.intake_pattern] ?? f.intake_pattern}`)
    if (f.carbs_g_per_hour != null) parts.push(`${f.carbs_g_per_hour} g/h`)
    if (f.carbs_g != null) parts.push(`${f.carbs_g} g total`)
    if (f.issue && f.issue !== 'aucun') parts.push(FUELING_ISSUE_LABELS[f.issue] ?? f.issue)
    parts.push(f.post_window_fed ? 'refuel post OK' : 'refuel post manqué')
    lines.push(`- ${parts.join(' · ')}`)
    const productsText = extractProductsText(f.products)
    if (productsText) lines.push(`  produits : ${productsText}`)
    if (f.notes) lines.push(`  note : ${f.notes}`)
    lines.push('')
  }

  if (lastDebrief) {
    const d = lastDebrief
    lines.push(`## Dernier débrief`)
    const period =
      d.kind === 'course' && d.race
        ? `course ${d.race.name} (${formatDateCourte(d.race.race_date)})`
        : `bloc ${formatDateCourte(d.period_start)}${d.period_end ? ` → ${formatDateCourte(d.period_end)}` : ''}`
    lines.push(`- ${period}`)
    if (d.narrative) lines.push(`  déroulé : ${truncate(d.narrative, 400)}`)
    if (d.what_worked) lines.push(`  ce qui a tenu : ${truncate(d.what_worked, 300)}`)
    if (d.what_failed) lines.push(`  points de rupture : ${truncate(d.what_failed, 300)}`)
    const focus = extractFocusAreas(d.focus_areas)
    if (focus.length > 0) {
      lines.push(`  axes actifs :`)
      for (const ax of focus) lines.push(`    · ${ax}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

const IMPACT_LABELS: Record<string, string> = {
  bloque: 'bloque',
  allege: 'allège',
  decale: 'décale',
  oriente: 'oriente',
}

const FUELING_PATTERN_LABELS: Record<string, string> = {
  rien: 'rien',
  un_peu: 'un peu',
  regulierement: 'régulièrement',
}

const FUELING_ISSUE_LABELS: Record<string, string> = {
  oubli: 'oubli',
  nausee: 'nausée',
  pas_acces: 'pas d\'accès',
  autre: 'incident autre',
}

const RRULE_DAYS: Record<string, string> = {
  MO: 'lun',
  TU: 'mar',
  WE: 'mer',
  TH: 'jeu',
  FR: 'ven',
  SA: 'sam',
  SU: 'dim',
}

function summarizeRecurrence(rule: string): string {
  // Parse minimal RRULE pour un résumé lisible ; on ne cherche pas à valider,
  // juste à afficher un libellé plausible dans le contexte coach.
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  )
  const freq = parts.FREQ
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
  const byday = parts.BYDAY?.split(',').map((d) => RRULE_DAYS[d] ?? d).join('/')
  if (freq === 'WEEKLY') {
    const every = interval === 1 ? 'chaque semaine' : `toutes les ${interval} semaines`
    return byday ? `${byday} · ${every}` : every
  }
  if (freq === 'MONTHLY') {
    return interval === 1 ? 'chaque mois' : `tous les ${interval} mois`
  }
  return rule
}

function formatPunctual(startsOn: string | null, endsOn: string | null): string {
  if (!startsOn) return 'ponctuel'
  if (!endsOn || endsOn === startsOn) return `le ${formatDateCourte(startsOn)}`
  return `${formatDateCourte(startsOn)} → ${formatDateCourte(endsOn)}`
}

function extractProductsText(products: unknown): string | null {
  if (products && typeof products === 'object' && 'text' in products) {
    const t = (products as { text: unknown }).text
    if (typeof t === 'string' && t.trim().length > 0) return t.trim()
  }
  return null
}

function extractFocusAreas(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  }
  return []
}

function truncate(s: string, max: number): string {
  const trimmed = s.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1) + '…'
}

type LastFuelingRow = {
  intake_pattern: string
  carbs_g: number | null
  carbs_g_per_hour: number | null
  products: unknown
  issue: string | null
  post_window_fed: boolean | null
  notes: string | null
  activity: {
    started_at: string
    name: string | null
    distance_m: number | null
    moving_time_s: number | null
  } | null
}

type LastDebriefRow = {
  kind: string
  period_start: string
  period_end: string | null
  narrative: string | null
  what_worked: string | null
  what_failed: string | null
  focus_areas: unknown
  race: { name: string; race_date: string } | null
}
