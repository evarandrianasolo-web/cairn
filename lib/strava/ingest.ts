import type { StravaActivity } from './api'

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

/** null si le consentement fc_stockage est OFF, ou si Strava n'a pas de FC. */
export function extractHealth(raw: StravaActivity, fcConsent: boolean): HealthRow | null {
  if (!fcConsent) return null
  if (!raw.has_heartrate) return null
  return {
    avg_hr: raw.average_heartrate ?? null,
    max_hr: raw.max_heartrate ?? null,
    relative_effort: raw.suffer_score ?? null,
  }
}
