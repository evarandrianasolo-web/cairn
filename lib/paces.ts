/**
 * Derive les allures cibles (EF, seuil, VMA courte) a partir des
 * temps de reference d'un athlete, et estime la vitesse verticale
 * ainsi que le temps sur une course a venir.
 *
 * Approche pragmatique inspiree de Daniels VDOT (allures route) et
 * Riegel (extrapolation entre distances). Retourne des intervalles
 * (min, max) pour chaque zone, ou null si la donnee sous-jacente
 * n'est pas renseignee.
 *
 * Consomme par /dashboard, /settings/profil, /courses/[id], et
 * injecte dans le prompt de generation du plan.
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

/**
 * Vitesse verticale : metres de D+ par heure de mouvement.
 * On mesure sur les activites suffisamment vallonnees (>= 300 m D+)
 * et on garde la mediane pour lisser un effet d'unique sortie tres
 * roulante ou tres cassante.
 */
export type VerticalSpeed = {
  medianMPerHour: number
  bestMPerHour: number
  sampleSize: number
}

export type RaceActivityLite = {
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
}

export type RaceLite = {
  distance_m: number | null
  elevation_gain_m: number | null
  result_time_s: number | null
  race_date: string | null
}

const KM_SEMI = 21.0975
const KM_5K = 5
const KM_10K = 10
const KM_MARATHON = 42.195
const RIEGEL_EXP = 1.06

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

/** Formate une vitesse verticale "N m/h" (arrondi 10). */
export function formatVerticalSpeed(mPerHour: number | null | undefined): string {
  if (mPerHour == null || mPerHour <= 0 || !Number.isFinite(mPerHour)) return '—'
  const rounded = Math.round(mPerHour / 10) * 10
  return `${rounded} m/h`
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

// ------------------ Vitesse verticale ------------------

/**
 * Estime la vitesse verticale (m D+ / h) sur les activites vallonnees.
 * On ne considere que celles avec >= 300 m D+ et duree renseignee,
 * pour eviter l'effet des sorties plates qui donneraient 0 ou des
 * valeurs aberrantes.
 */
export function computeVerticalSpeed(
  activities: RaceActivityLite[],
): VerticalSpeed | null {
  const values: number[] = []
  for (const a of activities) {
    if (
      a.elevation_gain_m != null &&
      a.elevation_gain_m >= 300 &&
      a.moving_time_s != null &&
      a.moving_time_s > 0
    ) {
      const mph = (a.elevation_gain_m * 3600) / a.moving_time_s
      // Garde-fou : plus de 1500 m/h en pur trail est irrealiste.
      if (mph > 0 && mph < 1500) values.push(mph)
    }
  }
  if (values.length === 0) return null
  values.sort((x, y) => x - y)
  const mid = Math.floor(values.length / 2)
  const median =
    values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid]
  return {
    medianMPerHour: median,
    bestMPerHour: values[values.length - 1],
    sampleSize: values.length,
  }
}

// ------------------ Refs virtuels depuis les courses ------------------

const CANONICAL_ROUTE = [
  { key: 'ref_5km_s' as const, km: KM_5K, label: '5 km' },
  { key: 'ref_10km_s' as const, km: KM_10K, label: '10 km' },
  { key: 'ref_semi_s' as const, km: KM_SEMI, label: 'Semi' },
  { key: 'ref_marathon_s' as const, km: KM_MARATHON, label: 'Marathon' },
]

/**
 * Enrichit les refs saisies avec les meilleurs temps de courses
 * terminees. On ne prend en compte que les courses route ou trail
 * peu vallonne (< 300 m D+ total, sinon Riegel devient absurde),
 * dans les 18 derniers mois. Riegel etend a une distance canonique
 * proche (tolerance +/- 15 %). Le meilleur temps entre saisie et
 * course l'emporte.
 */
export function inferReferenceTimesFromRaces(
  saved: ReferenceTimes,
  races: RaceLite[],
  now: Date = new Date(2000, 0, 1),
): { refs: ReferenceTimes; inferred: Partial<Record<keyof ReferenceTimes, true>> } {
  const cutoff = new Date(now.getTime() - 18 * 30 * 24 * 3600 * 1000)
  const inferred: Partial<Record<keyof ReferenceTimes, true>> = {}
  const result: ReferenceTimes = { ...saved }

  const eligible = races.filter(
    (r) =>
      r.result_time_s != null &&
      r.result_time_s > 0 &&
      r.distance_m != null &&
      r.distance_m > 0 &&
      (r.elevation_gain_m ?? 0) < 300 &&
      (!r.race_date || new Date(r.race_date) > cutoff),
  )

  for (const target of CANONICAL_ROUTE) {
    let best: number | null = result[target.key]
    for (const r of eligible) {
      const dKm = (r.distance_m as number) / 1000
      const ratio = dKm / target.km
      if (ratio < 0.85 || ratio > 1.15) continue
      // Riegel : T2 = T1 * (D2/D1)^1.06
      const equivalent = (r.result_time_s as number) * Math.pow(target.km / dKm, RIEGEL_EXP)
      if (best == null || equivalent < best) {
        best = Math.round(equivalent)
        inferred[target.key] = true
      }
    }
    if (best != null) result[target.key] = best
  }

  return { refs: result, inferred }
}

// ------------------ Estimation temps course ------------------

export type RaceEstimate = {
  estimatedTimeS: number
  flatEquivalentTimeS: number
  averagePaceSPerKm: number
  verticalCostS: number
  source: 'refs' | 'refs+vspeed'
}

/**
 * Estime le temps sur une course (flat -> Riegel puis coût D+).
 *
 * flat part : depuis le meilleur ref, on utilise Riegel pour
 * extrapoler a la distance cible. On applique une petite penalite
 * "endurance" au-dela du semi (10 % ajoute par tranche de 10 km
 * au-dela de 21 km) : Riegel sous-estime les longues distances
 * pour un athlete non specifique ultra.
 *
 * cout D+ : si on a une vitesse verticale mesuree, on la applique.
 * Sinon, heuristique conservatrice de 8 min par 100 m D+ (typique
 * ultra amateur).
 */
export function estimateRaceTime(
  race: { distance_m: number | null; elevation_gain_m: number | null },
  refs: ReferenceTimes,
  vSpeed: VerticalSpeed | null,
): RaceEstimate | null {
  if (!race.distance_m || race.distance_m <= 0) return null

  const bestRef = pickBestRef(refs)
  if (!bestRef) return null

  const targetKm = race.distance_m / 1000
  const flatBase =
    bestRef.timeS * Math.pow(targetKm / bestRef.km, RIEGEL_EXP)

  // Penalite endurance ultra : +10 % par 10 km au-dela de 21 km.
  const enduranceMul =
    targetKm > KM_SEMI ? 1 + ((targetKm - KM_SEMI) / 10) * 0.1 : 1
  const flatEquivalentTimeS = Math.round(flatBase * enduranceMul)

  // Cout D+ : m D+ / (m/h) -> heures.
  const dPlus = race.elevation_gain_m ?? 0
  let verticalCostS = 0
  let source: 'refs' | 'refs+vspeed' = 'refs'
  if (dPlus > 0) {
    if (vSpeed && vSpeed.medianMPerHour > 0) {
      verticalCostS = Math.round((dPlus / vSpeed.medianMPerHour) * 3600)
      source = 'refs+vspeed'
    } else {
      // 8 min par 100 m D+ -- fallback ultra amateur conservateur.
      verticalCostS = Math.round((dPlus / 100) * 8 * 60)
    }
  }

  const estimatedTimeS = flatEquivalentTimeS + verticalCostS
  const averagePaceSPerKm = Math.round(estimatedTimeS / targetKm)

  return {
    estimatedTimeS,
    flatEquivalentTimeS,
    averagePaceSPerKm,
    verticalCostS,
    source,
  }
}

function pickBestRef(refs: ReferenceTimes): { km: number; timeS: number } | null {
  // On prefere la ref la plus proche des semi/marathon pour extrapoler
  // long : moins de biais que le 5 km. Ordre : semi, marathon, 10, 5.
  if (refs.ref_semi_s && refs.ref_semi_s > 0)
    return { km: KM_SEMI, timeS: refs.ref_semi_s }
  if (refs.ref_marathon_s && refs.ref_marathon_s > 0)
    return { km: KM_MARATHON, timeS: refs.ref_marathon_s }
  if (refs.ref_10km_s && refs.ref_10km_s > 0)
    return { km: KM_10K, timeS: refs.ref_10km_s }
  if (refs.ref_5km_s && refs.ref_5km_s > 0)
    return { km: KM_5K, timeS: refs.ref_5km_s }
  return null
}
