import type { StravaActivity, StravaLap } from './api'

export type ActivityRow = {
  strava_activity_id: number
  source: 'strava'
  name: string | null
  description: string | null
  sport_type: string | null
  started_at: string
  distance_m: number
  elevation_gain_m: number
  moving_time_s: number
  elapsed_time_s: number
  avg_pace_s_per_km: number | null
  avg_cadence: number | null
}

export type HealthRow = {
  avg_hr: number | null
  max_hr: number | null
  relative_effort: number | null
}

/**
 * Transforme une activité Strava brute en ligne prête à insérer.
 * Type de sortie SANS aucun champ de FC : un ajout accidentel de clé cardio
 * ici serait une erreur TypeScript, pas un oubli au runtime.
 */
export function transformActivity(raw: StravaActivity): ActivityRow {
  const paceSPerKm =
    raw.average_speed && raw.average_speed > 0 ? 1000 / raw.average_speed : null

  return {
    strava_activity_id: raw.id,
    source: 'strava',
    name: raw.name,
    description: raw.description,
    sport_type: raw.sport_type,
    started_at: raw.start_date,
    distance_m: Math.round(raw.distance),
    elevation_gain_m: Math.round(raw.total_elevation_gain),
    moving_time_s: raw.moving_time,
    elapsed_time_s: raw.elapsed_time,
    avg_pace_s_per_km: paceSPerKm ? Number(paceSPerKm.toFixed(2)) : null,
    avg_cadence: raw.average_cadence,
  }
}

export type LapRow = {
  activity_id: string
  lap_index: number
  distance_m: number
  moving_time_s: number
  elapsed_time_s: number | null
  avg_pace_s_per_km: number | null
  elevation_gain_m: number | null
  is_manual: boolean
}

/**
 * Heuristique manuel vs auto-lap : quand un utilisateur presse le
 * bouton lap, les splits ont des distances tres variables (400 m,
 * 1000 m, 800 m, etc.). Un auto-lap kilometrique donne des splits
 * ~1000 m sauf le dernier. On considere manuel si la variance des
 * distances (hors dernier lap) depasse 10 % de la moyenne, OU si la
 * mediane s'ecarte franchement de 1000 m / 1609 m (mile).
 */
function detectManualLaps(laps: StravaLap[]): boolean {
  if (laps.length < 2) return false
  // Retire le dernier lap qui est souvent une queue plus courte.
  const inner = laps.slice(0, -1)
  if (inner.length === 0) return false
  const distances = inner.map((l) => l.distance).filter((d) => d > 0)
  if (distances.length === 0) return false
  const mean = distances.reduce((s, d) => s + d, 0) / distances.length
  const variance =
    distances.reduce((s, d) => s + (d - mean) ** 2, 0) / distances.length
  const stddev = Math.sqrt(variance)
  const cv = stddev / mean // coefficient de variation
  // Auto-lap = distances tres regulieres. Manuel des que ca diverge.
  if (cv > 0.1) return true
  // Auto-lap kilometrique ~1000 m ; mile ~1609 m. Sinon manuel.
  const closeToKm = Math.abs(mean - 1000) < 60
  const closeToMile = Math.abs(mean - 1609) < 80
  return !closeToKm && !closeToMile
}

export function transformLaps(
  raws: StravaLap[],
  activityId: string,
): LapRow[] {
  if (raws.length === 0) return []
  const isManual = detectManualLaps(raws)
  return raws
    .filter((l) => l.distance > 0 && l.moving_time > 0)
    .map((l) => {
      const paceSPerKm =
        l.average_speed && l.average_speed > 0 ? 1000 / l.average_speed : null
      return {
        activity_id: activityId,
        lap_index: l.lap_index,
        distance_m: Math.round(l.distance),
        moving_time_s: Math.round(l.moving_time),
        elapsed_time_s: l.elapsed_time != null ? Math.round(l.elapsed_time) : null,
        avg_pace_s_per_km: paceSPerKm ? Number(paceSPerKm.toFixed(2)) : null,
        elevation_gain_m:
          l.total_elevation_gain != null
            ? Math.round(l.total_elevation_gain)
            : null,
        is_manual: isManual,
      }
    })
}

/** null si le consentement fc_stockage est OFF, ou si Strava n'a pas de FC. */
export function extractHealth(raw: StravaActivity, fcConsent: boolean): HealthRow | null {
  if (!fcConsent) return null
  if (!raw.has_heartrate) return null
  return {
    // Strava renvoie parfois des décimales (moyennes du signal).
    // Les colonnes sont en smallint côté base — on arrondit à l'entier
    // le plus proche à l'ingestion.
    avg_hr: raw.average_heartrate != null ? Math.round(raw.average_heartrate) : null,
    max_hr: raw.max_heartrate != null ? Math.round(raw.max_heartrate) : null,
    relative_effort: raw.suffer_score != null ? Math.round(raw.suffer_score) : null,
  }
}
