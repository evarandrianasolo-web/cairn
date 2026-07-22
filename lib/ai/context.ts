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

/**
 * Constructeur du contexte coach — PRD §3.4, budget 2 à 4 k tokens.
 * V1 : profil + 12 dernières semaines agrégées + 10 dernières séances
 * détaillées + prochaine course A. Extensions à venir : contraintes
 * actives (4 semaines), dernier débrief, état fueling dérivé.
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
  const since12w = new Date(isoWeekStart(new Date()).getTime() - (WEEKS_AGGREGATED - 1) * 7 * DAY_MS)

  const [{ data: athlete }, weeklyRes, recentRes, raceRes] = await Promise.all([
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
      .gte('race_date', new Date().toISOString().slice(0, 10))
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const weekly = aggregateByWeek(weeklyRes.data ?? [], WEEKS_AGGREGATED)
  const recent = recentRes.data ?? []
  const race = raceRes.data

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

  return lines.join('\n')
}
