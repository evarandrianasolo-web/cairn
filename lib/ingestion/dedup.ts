// =============================================================
// Idempotence et deduplication — doc 03 §4.
// =============================================================

import { createHash } from 'node:crypto'
import type { Provenance } from './types'

export function computeContentHash(source: Buffer | string): string {
  return createHash('sha256').update(source).digest('hex')
}

/**
 * Signature semantique : deux fichiers differents (contenu, donc
 * content_hash different) peuvent decrire la meme seance — import
 * archive puis, plus tard, le meme fichier renvoye a la main.
 * Fenetre de tolerance volontairement large (doc 03 §4.2).
 */
export function computeDedupSignature(input: {
  tenantId: string
  startedAtUtc: string // ISO 8601
  durationS: number
  distanceM: number
}): string {
  const startedWindow = Math.floor(new Date(input.startedAtUtc).getTime() / 1000 / 60) // fenetre 1 min
  const durationWindow = Math.round(input.durationS / 10) // fenetre 10 s
  const distanceWindow = Math.round(input.distanceM / 100) // fenetre 100 m
  return createHash('sha256')
    .update(`${input.tenantId}|${startedWindow}|${durationWindow}|${distanceWindow}`)
    .digest('hex')
}

// Rangement de richesse doc 03 §4.2 — le format le plus riche gagne.
const RICHNESS_ORDER: Record<Provenance, number> = {
  manual: 0,
  strava_archive: 1,
}

export type DedupDecision = 'replace' | 'ignore_incoming' | 'keep_both_as_duplicate'

/**
 * Decide quoi faire quand un import touche une activite dont la
 * dedup_signature correspond deja a une activite existante.
 * Ne tranche jamais a l'aveugle : `manual` remplacee par
 * `strava_archive` (plus riche), l'inverse est ignore.
 */
export function resolveDedupConflict(
  existingProvenance: Provenance,
  incomingProvenance: Provenance,
): DedupDecision {
  const existingRank = RICHNESS_ORDER[existingProvenance]
  const incomingRank = RICHNESS_ORDER[incomingProvenance]
  if (incomingRank > existingRank) return 'replace'
  if (incomingRank < existingRank) return 'ignore_incoming'
  // Meme rang (ex: deux imports d'archive) : on garde le premier et
  // on trace le second comme doublon semantique, sans l'ecraser a
  // l'aveugle — doc 03 §4.2 cas C.
  return 'keep_both_as_duplicate'
}
