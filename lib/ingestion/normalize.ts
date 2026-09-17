// =============================================================
// Assemblage CSV + fichier -> forme canonique activities/activity_health.
// =============================================================
// Doc 03 : le CSV apporte le contexte (nom, RPE, notes, sport
// declare), le fichier (FIT/GPX/TCX) apporte la physio et le GPS.
// Le fichier gagne sur les champs physio quand les deux existent —
// c'est la donnee la plus fiable (doc `csv-columns-mapping.md`,
// "le CSV apporte le contexte ... la donnee physio et GPS vient des
// FIT").
// =============================================================

import { computeContentHash, computeDedupSignature } from './dedup'
import type { NormalizedActivity } from './types'
import type { ParsedFitSummary } from './parsers/fit'
import type { ParsedTrackSummary } from './parsers/gpx-tcx'

export type ParsedSessionCommon = {
  startedAt: string
  durationS: number
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  avgHr?: number
  maxHr?: number
  avgCadence?: number
  sportType?: string
  hasGps: boolean
  hasHeartRate: boolean
  hasCadence: boolean
  hasLaps: boolean
}

export function fromFitSummary(s: ParsedFitSummary): ParsedSessionCommon {
  return {
    startedAt: s.startedAt,
    durationS: s.durationS,
    distanceM: s.distanceM,
    elevationGainM: s.elevationGainM,
    elevationLossM: s.elevationLossM,
    avgHr: s.avgHr,
    maxHr: s.maxHr,
    avgCadence: s.avgCadence,
    sportType: s.sportType,
    // Heuristique assumee : un FIT avec une distance non nulle a ete
    // enregistre avec une source de distance (GPS le plus souvent).
    // Un tapis de course sans GPS resterait mal classe ici — limite
    // connue, sans consequence sur les champs physio qui restent
    // corrects independamment de ce flag.
    hasGps: s.distanceM > 0,
    hasHeartRate: s.hasHeartRate,
    hasCadence: s.avgCadence !== undefined,
    hasLaps: s.hasLaps,
  }
}

export function fromTrackSummary(s: ParsedTrackSummary): ParsedSessionCommon {
  return {
    startedAt: s.startedAt,
    durationS: s.durationS,
    distanceM: s.distanceM,
    elevationGainM: s.elevationGainM,
    elevationLossM: s.elevationLossM,
    avgHr: s.avgHr,
    maxHr: s.maxHr,
    hasGps: s.hasGps,
    hasHeartRate: s.hasHeartRate,
    hasCadence: false,
    hasLaps: false,
  }
}

export type CsvContext = {
  name?: string
  sportType?: string
  rpe?: number
  userNotes?: string
  startedAtFallback?: string // depuis date+heure CSV, si aucun fichier
  distanceMFallback?: number
  durationSFallback?: number
  avgHrFallback?: number
  maxHrFallback?: number
}

export function csvRowToContext(row: Record<string, string>): CsvContext {
  const toNumber = (v: string | undefined): number | undefined => {
    if (!v) return undefined
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }

  return {
    name: row.name?.trim() || undefined,
    sportType: row.sport_type?.trim() || undefined,
    rpe: toNumber(row.rpe),
    userNotes: row.user_notes?.trim() || undefined,
    distanceMFallback: toNumber(row.distance_m),
    durationSFallback: toNumber(row.elapsed_time_s) ?? toNumber(row.stopwatch_time_s),
    avgHrFallback: toNumber(row.avg_hr),
    maxHrFallback: toNumber(row.max_hr),
  }
}

/**
 * Assemble une activite normalisee a partir d'un fichier parse
 * (FIT/GPX/TCX) et, si trouvee, la ligne CSV correspondante.
 */
export function normalizeFromFile(
  session: ParsedSessionCommon,
  csv: CsvContext | undefined,
  context: { tenantId: string; sourceFilename: string; payload: Buffer },
): NormalizedActivity {
  const contentHash = computeContentHash(context.payload)
  const dedupSignature = computeDedupSignature({
    tenantId: context.tenantId,
    startedAtUtc: session.startedAt,
    durationS: session.durationS,
    distanceM: session.distanceM,
  })

  return {
    provenance: 'strava_archive',
    startedAt: session.startedAt,
    name: csv?.name,
    sportType: csv?.sportType ?? session.sportType,
    distanceM: session.distanceM,
    elevationGainM: session.elevationGainM,
    elevationLossM: session.elevationLossM,
    movingTimeS: session.durationS,
    elapsedTimeS: session.durationS,
    avgCadence: session.avgCadence,
    rpe: csv?.rpe,
    userNotes: csv?.userNotes,
    health:
      session.avgHr !== undefined || session.maxHr !== undefined
        ? { avgHr: session.avgHr, maxHr: session.maxHr }
        : undefined,
    hasGps: session.hasGps,
    hasHeartRate: session.hasHeartRate,
    hasCadence: session.hasCadence,
    hasLaps: session.hasLaps,
    contentHash,
    dedupSignature,
    sourceFilename: context.sourceFilename,
  }
}

/**
 * Assemble une activite normalisee depuis le CSV SEUL — cas d'une
 * ligne Strava sans fichier associe (activite saisie manuellement
 * cote Strava, ou fichier absent de l'archive). Rare mais reel :
 * Strava autorise la creation d'activites sans trace GPS/fichier.
 */
export function normalizeFromCsvOnly(
  row: Record<string, string>,
  startedAt: string,
  context: { tenantId: string },
): NormalizedActivity | undefined {
  const csv = csvRowToContext(row)
  const distanceM = csv.distanceMFallback ?? 0
  const durationS = csv.durationSFallback ?? 0
  if (distanceM === 0 && durationS === 0) return undefined // rien d'exploitable

  // Pas de fichier source : hash canonique sur les champs retenus,
  // stable pour une meme ligne re-importee.
  const canonical = JSON.stringify({
    id: row.strava_activity_id,
    startedAt,
    distanceM,
    durationS,
  })
  const contentHash = computeContentHash(canonical)
  const dedupSignature = computeDedupSignature({
    tenantId: context.tenantId,
    startedAtUtc: startedAt,
    durationS,
    distanceM,
  })

  return {
    provenance: 'strava_archive',
    provenanceNotes: 'csv_only_no_file',
    startedAt,
    name: csv.name,
    sportType: csv.sportType,
    distanceM,
    elevationGainM: undefined,
    elevationLossM: undefined,
    movingTimeS: durationS,
    elapsedTimeS: durationS,
    rpe: csv.rpe,
    userNotes: csv.userNotes,
    health:
      csv.avgHrFallback !== undefined || csv.maxHrFallback !== undefined
        ? { avgHr: csv.avgHrFallback, maxHr: csv.maxHrFallback }
        : undefined,
    hasGps: false,
    hasHeartRate: csv.avgHrFallback !== undefined || csv.maxHrFallback !== undefined,
    hasCadence: false,
    hasLaps: false,
    contentHash,
    dedupSignature,
  }
}
