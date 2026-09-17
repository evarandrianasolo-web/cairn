// =============================================================
// Types partages du pipeline d'ingestion fichier.
// =============================================================
// Deux provenances seulement a ce stade : l'archive Strava (bulk
// export, §6.6 + art. 20 RGPD) et la saisie manuelle. Pas de FIT/GPX/
// TCX isole, pas de CSV template, pas d'API constructeur — decision
// produit du 16/09/2026 : l'historique se construit par import
// d'archive OU au fil de l'eau en saisie manuelle, rien d'autre.
// Voir docs/architecture/ingestion/09-plan-bascule-execution.md.
// =============================================================

export type Provenance = 'strava_archive' | 'manual'

export type NormalizedActivity = {
  provenance: Provenance
  provenanceNotes?: string

  startedAt: string // ISO 8601, UTC
  name?: string
  sportType?: string

  distanceM?: number
  elevationGainM?: number
  elevationLossM?: number
  movingTimeS?: number
  elapsedTimeS?: number
  avgPaceSPerKm?: number
  avgCadence?: number

  rpe?: number
  userNotes?: string

  health?: {
    avgHr?: number
    maxHr?: number
  }

  hasGps: boolean
  hasHeartRate: boolean
  hasCadence: boolean
  hasLaps: boolean

  // Idempotence — doc 03 §4.
  contentHash: string
  dedupSignature: string

  sourceFilename?: string
}

export type ImportEventOutcome =
  | 'created'
  | 'replaced'
  | 'ignored_duplicate'
  | 'rejected_format'
  | 'rejected_signature'
  | 'ignored_not_whitelisted'

export type ImportEvent = {
  filePath?: string
  event: ImportEventOutcome
  message?: string
}
