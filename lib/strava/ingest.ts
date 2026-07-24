import type { StravaActivity, StravaLap, StravaStreams } from './api'

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
  elevation_loss_m: number | null
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
        elevation_loss_m: null,
        is_manual: isManual,
      }
    })
}

export type LapHealthRow = {
  activity_id: string
  lap_index: number
  min_hr: number | null
  avg_hr: number | null
  max_hr: number | null
}

/**
 * Calcule le D- d'un lap en parcourant le stream altitude entre
 * start_index et end_index. Une baisse d'altitude entre deux points
 * consecutifs = descente ; on cumule les descentes uniquement.
 */
function computeLapDMinus(
  altitude: number[] | null | undefined,
  startIdx: number,
  endIdx: number,
): number | null {
  if (!altitude || altitude.length === 0) return null
  const from = Math.max(0, startIdx)
  const to = Math.min(altitude.length - 1, endIdx)
  if (to <= from) return 0
  let loss = 0
  for (let i = from + 1; i <= to; i++) {
    const diff = altitude[i - 1] - altitude[i]
    if (diff > 0) loss += diff
  }
  return Math.round(loss)
}

/**
 * Extrait min / moyenne / max de FC entre start_index et end_index.
 * Retourne null si aucune donnee HR valide dans la plage (par ex.
 * moniteur decroche pendant ce lap).
 */
function computeLapHr(
  heartrate: number[] | null | undefined,
  startIdx: number,
  endIdx: number,
): { min: number | null; avg: number | null; max: number | null } {
  if (!heartrate || heartrate.length === 0) {
    return { min: null, avg: null, max: null }
  }
  const from = Math.max(0, startIdx)
  const to = Math.min(heartrate.length - 1, endIdx)
  if (to < from) return { min: null, avg: null, max: null }
  let sum = 0
  let count = 0
  let min = Infinity
  let max = -Infinity
  for (let i = from; i <= to; i++) {
    const v = heartrate[i]
    // Filtre les valeurs aberrantes (perte de signal, artefacts)
    if (typeof v !== 'number' || v < 30 || v > 250) continue
    sum += v
    count += 1
    if (v < min) min = v
    if (v > max) max = v
  }
  if (count === 0) return { min: null, avg: null, max: null }
  return {
    min: Math.round(min),
    avg: Math.round(sum / count),
    max: Math.round(max),
  }
}

/**
 * Enrichit les laps avec D- et FC agreges depuis les streams.
 * - LapRow[] recoit elevation_loss_m (donnee terrain, non sensible)
 * - LapHealthRow[] recoit min/avg/max hr, MAIS uniquement si fcConsent
 *   est true. Sinon on renvoie [] : la table sante ne se peuple JAMAIS
 *   sans consentement (regle CLAUDE.md).
 */
export function enrichLapsFromStreams(
  laps: StravaLap[],
  rawLaps: LapRow[],
  streams: StravaStreams,
  activityId: string,
  fcConsent: boolean,
): { laps: LapRow[]; health: LapHealthRow[] } {
  const altitude = streams.altitude?.data
  const heartrate = streams.heartrate?.data
  const health: LapHealthRow[] = []

  // On aligne rawLaps sur laps via lap_index -- Strava garantit
  // l'ordre mais on ne prend jamais de risque sur cette identite.
  const rawByIndex = new Map(rawLaps.map((r) => [r.lap_index, r]))
  const enrichedLaps: LapRow[] = []
  for (const raw of laps) {
    const existing = rawByIndex.get(raw.lap_index)
    if (!existing) continue
    const startIdx = raw.start_index ?? -1
    const endIdx = raw.end_index ?? -1
    const dMinus =
      startIdx >= 0 && endIdx >= startIdx
        ? computeLapDMinus(altitude, startIdx, endIdx)
        : null
    enrichedLaps.push({ ...existing, elevation_loss_m: dMinus })

    if (fcConsent && startIdx >= 0 && endIdx >= startIdx) {
      const { min, avg, max } = computeLapHr(heartrate, startIdx, endIdx)
      if (min != null || avg != null || max != null) {
        health.push({
          activity_id: activityId,
          lap_index: raw.lap_index,
          min_hr: min,
          avg_hr: avg,
          max_hr: max,
        })
      }
    }
  }

  return { laps: enrichedLaps, health }
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
