/**
 * Classification heuristique d'une seance de course a pied a partir
 * de l'activite Strava et de ses laps. Retourne un des types
 * `session_type` deja utilises dans le reste du produit.
 *
 * On ne fait AUCUNE inference basee sur le nom de l'activite -- les
 * noms Strava par defaut ("Course a pied en soiree") ne portent rien.
 * On se base sur la structure : nombre de laps, variance des paces,
 * profil D+ / distance / duree.
 *
 * Retourne null si aucune classification n'est fiable (activite non
 * course a pied, donnees insuffisantes, sport non gere).
 */

export type SessionKind =
  | 'vma'
  | 'seuil'
  | 'cote'
  | 'longue'
  | 'endurance'
  | 'recup'
  | 'rando'
  | 'course'
  | 'renfo'

export type ActivityForClassify = {
  sport_type: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
  avg_pace_s_per_km: number | null
}

export type LapForClassify = {
  distance_m: number
  moving_time_s: number
  is_manual: boolean
}

const LONG_SECS = 90 * 60
const ULTRA_SECS = 3 * 3600

export function classifySession(
  activity: ActivityForClassify,
  laps: LapForClassify[],
  raceLinked = false,
): SessionKind | null {
  const sport = (activity.sport_type ?? '').toLowerCase()

  // Sports non course : rando dediee, renfo, autre
  if (sport.includes('hike') || sport.includes('walk')) return 'rando'
  if (sport.includes('workout') || sport.includes('crossfit')) return 'renfo'
  if (!sport.includes('run') && sport !== '') return null

  const dur = activity.moving_time_s ?? 0
  const dist = activity.distance_m ?? 0
  const dPlus = activity.elevation_gain_m ?? 0
  const dPlusPerKm = dist > 0 ? (dPlus * 1000) / dist : 0
  const avgPace = activity.avg_pace_s_per_km ?? (dist > 0 ? dur / (dist / 1000) : 0)

  // Course reelle liee : prioritaire (result_time_s + status='terminee')
  if (raceLinked) return 'course'

  // Ultra ou longue
  if (dur >= ULTRA_SECS) return 'longue'
  if (dur >= LONG_SECS && dPlusPerKm >= 30) return 'longue'

  // Analyse via laps si dispos et manuels (au moins 2 laps effort)
  const manualLaps = laps.filter((l) => l.is_manual && l.distance_m > 0)
  if (manualLaps.length >= 3) {
    const paces = manualLaps.map((l) => l.moving_time_s / (l.distance_m / 1000))
    const sortedPaces = [...paces].sort((a, b) => a - b)
    const fastest = sortedPaces[0]
    const median = sortedPaces[Math.floor(sortedPaces.length / 2)]
    const distances = manualLaps.map((l) => l.distance_m)
    const minDist = Math.min(...distances)
    const maxDist = Math.max(...distances)

    // VMA : blocs courts (min < 600m), tres rapides (fastest < 4:00/km)
    if (minDist < 600 && fastest < 240) return 'vma'
    // Seuil : blocs longs (>= 1500m), rapides mais pas VMA (fastest 3:40-4:40)
    if (minDist >= 1500 && fastest >= 210 && fastest <= 280) return 'seuil'
    // Cotes : D+/km eleve avec efforts marques
    if (dPlusPerKm >= 30 && fastest < 300) return 'cote'
    // Fartlek / VMA melangee : variance de distances importante
    if (maxDist / Math.max(minDist, 1) >= 3 && fastest < 260) return 'vma'
    // Sinon effort tempo/seuil generique
    if (fastest < median - 30) return 'seuil'
  }

  // Cotes sans laps : denivele tres marque et duree moderee
  if (dPlusPerKm >= 40 && dur >= 40 * 60 && dur < LONG_SECS) return 'cote'

  // Recup : allure lente, courte duree
  if (dur < 45 * 60 && avgPace >= 400) return 'recup'

  // Sortie longue vallonnee
  if (dur >= LONG_SECS) return 'longue'

  // Par defaut : endurance (footing)
  return 'endurance'
}
