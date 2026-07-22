import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysUntil,
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'

/**
 * Constructeur du contexte coach — budget 2 à 4 k tokens (PRD §3.4).
 * V1 minimal : profil athlete + 10 dernières activités + prochaine course A.
 * Version étendue (contraintes actives, fueling, débriefs) : V2 quand le
 * volume aura été mesuré. Les données de santé ne circulent JAMAIS en brut
 * ici — dérivé uniquement (drapeau, tendance).
 *
 * Ce fichier construit une chaîne de caractères injectée en premier message
 * user, PAS dans le system prompt (le system reste stable pour le cache
 * Anthropic, cf. skill claude-api § prefix match).
 */
export async function buildCoachContext(
  supabase: SupabaseClient,
): Promise<string> {
  const [{ data: athlete }, activitiesRes, raceRes] = await Promise.all([
    supabase.from('athletes').select('display_name, timezone').maybeSingle(),
    supabase
      .from('activities')
      .select('started_at, sport_type, name, distance_m, elevation_gain_m, moving_time_s')
      .order('started_at', { ascending: false })
      .limit(10),
    supabase
      .from('races')
      .select('name, race_date, location, distance_m, elevation_gain_m, goal_time_s')
      .eq('priority', 'A')
      .gte('race_date', new Date().toISOString().slice(0, 10))
      .order('race_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const activities = activitiesRes.data ?? []
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

  if (activities.length > 0) {
    lines.push(`## 10 dernières activités`)
    for (const a of activities) {
      lines.push(
        `- ${formatDateCourte(a.started_at)} · ${a.sport_type ?? '—'} · ` +
          `${formatDistance(a.distance_m)} · ${formatDplus(a.elevation_gain_m)} · ` +
          `${formatDuree(a.moving_time_s)}${a.name ? ` — ${a.name}` : ''}`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
