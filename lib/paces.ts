/**
 * Derive les allures cibles (EF, seuil, VMA courte) a partir des
 * temps de reference d'un athlete. Approche pragmatique inspiree de
 * Daniels VDOT : le seuil suit l'allure semi, l'EF est 90 a 125 s/km
 * plus lente, la VMA courte 15 a 30 s/km plus rapide que l'allure 5km.
 *
 * Retourne des intervalles (min, max) pour chaque zone, ou null si le
 * temps de reference sous-jacent n'est pas renseigne.
 *
 * Consomme par /dashboard, /settings/profil, et injecte dans le prompt
 * de generation du plan.
 */

export type ReferenceTimes = {
  ref_5km_s: number | null
  ref_10km_s: number | null
  ref_semi_s: number | null
  ref_marathon_s: number | null
}

export type PaceZone = {
  minSPerKm: number
  maxSPerKm: number
}

export type DerivedPaces = {
  ef: PaceZone | null
  seuil: PaceZone | null
  vma: PaceZone | null
}

const KM_SEMI = 21.0975
const KM_5K = 5
const KM_10K = 10
const KM_MARATHON = 42.195

/**
 * Formate une allure en secondes/km vers "m:ss/km" pour l'UI.
 * Renvoie "—" pour toute valeur nulle ou invalide.
 */
export function formatPace(sPerKm: number | null | undefined): string {
  if (sPerKm == null || sPerKm <= 0 || !Number.isFinite(sPerKm)) return '—'
  const m = Math.floor(sPerKm / 60)
  const s = Math.round(sPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

/** Formate une plage d'allure "m:ss - m:ss/km". */
export function formatPaceZone(zone: PaceZone | null | undefined): string {
  if (!zone) return '—'
  return `${formatPace(zone.minSPerKm)}–${formatPace(zone.maxSPerKm).replace('/km', '/km')}`
}

/**
 * Prend une chaine "hh:mm:ss", "mm:ss" ou secondes et retourne le
 * total en secondes, ou null si non parsable.
 */
export function parseTimeToSeconds(raw: string | null | undefined): number | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t) return null
  if (/^\d+$/.test(t)) return parseInt(t, 10)
  const parts = t.split(':').map((p) => p.trim())
  if (parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map((p) => parseInt(p, 10))
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return null
}

/** Formate un total de secondes vers "h:mm:ss" ou "m:ss". */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Extrait le meilleur temps de reference disponible pour le seuil
 * (priorite : semi puis 10 km puis 5 km).
 */
function bestSeuilBase(refs: ReferenceTimes): number | null {
  if (refs.ref_semi_s && refs.ref_semi_s > 0) return refs.ref_semi_s / KM_SEMI
  if (refs.ref_10km_s && refs.ref_10km_s > 0) return refs.ref_10km_s / KM_10K
  if (refs.ref_5km_s && refs.ref_5km_s > 0)
    return refs.ref_5km_s / KM_5K + 20 // le 5 km est bien plus rapide que seuil
  return null
}

function bestVmaBase(refs: ReferenceTimes): number | null {
  if (refs.ref_5km_s && refs.ref_5km_s > 0) return refs.ref_5km_s / KM_5K
  if (refs.ref_10km_s && refs.ref_10km_s > 0) return refs.ref_10km_s / KM_10K - 15
  return null
}

/** Derive les 3 zones d'allure a partir des temps de reference. */
export function derivePaces(refs: ReferenceTimes): DerivedPaces {
  const seuilBase = bestSeuilBase(refs)
  const vmaBase = bestVmaBase(refs)

  const seuil: PaceZone | null = seuilBase
    ? { minSPerKm: seuilBase - 5, maxSPerKm: seuilBase + 5 }
    : null

  const ef: PaceZone | null = seuilBase
    ? { minSPerKm: seuilBase + 90, maxSPerKm: seuilBase + 125 }
    : null

  const vma: PaceZone | null = vmaBase
    ? { minSPerKm: vmaBase - 15, maxSPerKm: vmaBase + 5 }
    : null

  return { ef, seuil, vma }
}

/** Vrai si au moins un temps de reference est renseigne. */
export function hasReferenceTimes(refs: ReferenceTimes): boolean {
  return (
    !!(refs.ref_5km_s && refs.ref_5km_s > 0) ||
    !!(refs.ref_10km_s && refs.ref_10km_s > 0) ||
    !!(refs.ref_semi_s && refs.ref_semi_s > 0) ||
    !!(refs.ref_marathon_s && refs.ref_marathon_s > 0)
  )
}

export const KM_LABEL = {
  ref_5km_s: '5 km',
  ref_10km_s: '10 km',
  ref_semi_s: 'Semi',
  ref_marathon_s: 'Marathon',
} as const
