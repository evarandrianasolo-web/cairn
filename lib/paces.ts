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
  source: 'similar' | 'refs+vspeed' | 'refs'
  sampleSize: number
  similarProfile: boolean
}

export type SimilarEffort = {
  distance_m: number
  elevation_gain_m: number | null
  time_s: number
}

/**
 * Estime a partir d'efforts similaires par regression lineaire :
 *   time_s ≈ a × distance_km + b × D+_m
 *
 * a = allure plate en s/km, b = cout par metre de D+ en s.
 * Les deux sont calibres sur les activites recentes de l'athlete --
 * pas de constante universelle : la meme UTMJ donnera un temps
 * different pour Eva et pour un traileur experimente.
 *
 * Selection du pool en 3 couches, du plus specifique au plus general :
 *   1. Efforts au meme profil (ratio D+/km +/- 30 %) ET taille
 *      comparable (>= 30 % de la distance cible)
 *   2. Efforts au meme profil, toute taille
 *   3. Toute sortie vallonnee (D+/km >= 15 m/km) OU pool entier
 *
 * La regression a besoin d'au moins 3 points ET d'assez de
 * variabilite en D+ (sinon b est indeterminable) ; sinon on retombe
 * sur une simple allure plate mediane, et le cout D+ est ajoute
 * ensuite via vSpeed / defaut.
 */
function fitLinearEffort(pool: SimilarEffort[]): {
  aSPerKm: number
  bSPerMDplus: number | null
} | null {
  if (pool.length === 0) return null
  const points = pool.map((e) => ({
    km: e.distance_m / 1000,
    dplus: e.elevation_gain_m ?? 0,
    t: e.time_s,
  }))
  if (points.length < 3) {
    // Pas assez pour deux inconnues -- allure plate seule
    const meanPace =
      points.reduce((s, p) => s + p.t / Math.max(p.km, 0.001), 0) /
      points.length
    return { aSPerKm: meanPace, bSPerMDplus: null }
  }

  // Systeme normal (moindres carres) sur [a, b]
  let sxx = 0
  let sxy = 0
  let syy = 0
  let tx = 0
  let ty = 0
  for (const p of points) {
    sxx += p.km * p.km
    sxy += p.km * p.dplus
    syy += p.dplus * p.dplus
    tx += p.km * p.t
    ty += p.dplus * p.t
  }
  const det = sxx * syy - sxy * sxy
  if (Math.abs(det) < 1e-6 || syy < 1) {
    // D+ trop uniforme, on ne peut pas separer les deux
    const meanPace = tx / sxx
    return { aSPerKm: meanPace, bSPerMDplus: null }
  }
  const a = (syy * tx - sxy * ty) / det
  const b = (sxx * ty - sxy * tx) / det
  return {
    aSPerKm: Math.max(a, 60), // garde-fou : au moins 1 min/km
    bSPerMDplus: Math.max(b, 0), // pas de coût D+ negatif
  }
}

function estimateFromSimilar(
  target: { distance_m: number; elevation_gain_m: number },
  pool: SimilarEffort[],
  vSpeed: VerticalSpeed | null,
): {
  estimatedTimeS: number
  averagePaceSPerKm: number
  verticalCostS: number
  flatEquivalentTimeS: number
  sampleSize: number
  similarProfile: boolean
} | null {
  const eligible = pool.filter(
    (e) =>
      e.distance_m >= 5000 &&
      e.time_s > 5 * 60 &&
      (e.elevation_gain_m ?? 0) >= 0,
  )
  if (eligible.length === 0) return null

  const targetKm = target.distance_m / 1000
  const targetRatio = target.elevation_gain_m / targetKm

  const tier1 = eligible.filter((e) => {
    const km = e.distance_m / 1000
    const ratio = (e.elevation_gain_m ?? 0) / km
    const ratioMatches =
      targetRatio > 0
        ? Math.abs(ratio - targetRatio) / targetRatio <= 0.3
        : ratio <= 20
    const sizeMatches = km >= targetKm * 0.3
    return ratioMatches && sizeMatches
  })
  const tier2 = eligible.filter((e) => {
    const km = e.distance_m / 1000
    const ratio = (e.elevation_gain_m ?? 0) / km
    return targetRatio > 0
      ? Math.abs(ratio - targetRatio) / targetRatio <= 0.3
      : ratio <= 20
  })
  const tier3 = eligible.filter((e) => {
    const km = e.distance_m / 1000
    return (e.elevation_gain_m ?? 0) / km >= 15
  })

  const [selected, similarProfile] =
    tier1.length >= 3
      ? [tier1, true]
      : tier2.length >= 3
        ? [tier2, true]
        : tier3.length >= 3
          ? [tier3, false]
          : [eligible, false]

  const fit = fitLinearEffort(selected)
  if (!fit) return null

  const flatEquivalentTimeS = Math.round(fit.aSPerKm * targetKm)
  let verticalCostS = 0
  if (target.elevation_gain_m > 0) {
    if (fit.bSPerMDplus != null && fit.bSPerMDplus > 0) {
      verticalCostS = Math.round(fit.bSPerMDplus * target.elevation_gain_m)
    } else if (vSpeed && vSpeed.medianMPerHour > 0) {
      verticalCostS = Math.round(
        (target.elevation_gain_m / vSpeed.medianMPerHour) * 3600,
      )
    } else {
      verticalCostS = Math.round((target.elevation_gain_m / 100) * 8 * 60)
    }
  }
  const estimatedTimeS = flatEquivalentTimeS + verticalCostS

  return {
    estimatedTimeS,
    averagePaceSPerKm: Math.round(estimatedTimeS / targetKm),
    verticalCostS,
    flatEquivalentTimeS,
    sampleSize: selected.length,
    similarProfile,
  }
}

/**
 * Estime le temps sur une course. Priorite absolue aux donnees
 * comparables :
 *
 *   1. Efforts similaires -- courses trail passees ou longues sorties
 *      au meme profil (ratio D+/km +/- 30 %). C'est le modele betrail :
 *      on regarde ce que l'athlete FAIT en trail, pas ce qu'on
 *      extrapole de son 10 km route.
 *   2. Refs route + vitesse verticale mesuree : deuxieme choix si on
 *      n'a rien de comparable. Riegel pour le flat + heures de D+
 *      selon la vSpeed mediane recente.
 *   3. Refs route + cout D+ standard : dernier recours.
 *
 * Une course de trail estimee depuis un 10 km route donne un chiffre
 * trompeur sur du D+ significatif ; l'ordre ci-dessus refuse cette
 * approche par defaut des qu'un pool similaire existe.
 */
export function estimateRaceTime(
  race: { distance_m: number | null; elevation_gain_m: number | null },
  refs: ReferenceTimes,
  vSpeed: VerticalSpeed | null,
  similar: SimilarEffort[] = [],
): RaceEstimate | null {
  if (!race.distance_m || race.distance_m <= 0) return null
  const dPlus = race.elevation_gain_m ?? 0
  const targetKm = race.distance_m / 1000

  // 1. Efforts similaires -- meilleure source pour le trail.
  const fromSimilar = estimateFromSimilar(
    { distance_m: race.distance_m, elevation_gain_m: dPlus },
    similar,
    vSpeed,
  )
  if (fromSimilar) {
    return {
      estimatedTimeS: fromSimilar.estimatedTimeS,
      flatEquivalentTimeS: fromSimilar.flatEquivalentTimeS,
      averagePaceSPerKm: fromSimilar.averagePaceSPerKm,
      verticalCostS: fromSimilar.verticalCostS,
      source: 'similar',
      sampleSize: fromSimilar.sampleSize,
      similarProfile: fromSimilar.similarProfile,
    }
  }

  // 2 + 3. Fallback route -- utile uniquement pour les courses tres
  // roulantes ou en l'absence de sortie vallonnee dans l'historique.
  const bestRef = pickBestRef(refs)
  if (!bestRef) return null
  const flatBase =
    bestRef.timeS * Math.pow(targetKm / bestRef.km, RIEGEL_EXP)
  const enduranceMul =
    targetKm > KM_SEMI ? 1 + ((targetKm - KM_SEMI) / 10) * 0.1 : 1
  const flatEquivalentTimeS = Math.round(flatBase * enduranceMul)

  let verticalCostS = 0
  let source: 'refs' | 'refs+vspeed' = 'refs'
  if (dPlus > 0) {
    if (vSpeed && vSpeed.medianMPerHour > 0) {
      verticalCostS = Math.round((dPlus / vSpeed.medianMPerHour) * 3600)
      source = 'refs+vspeed'
    } else {
      verticalCostS = Math.round((dPlus / 100) * 8 * 60)
    }
  }
  const estimatedTimeS = flatEquivalentTimeS + verticalCostS

  return {
    estimatedTimeS,
    flatEquivalentTimeS,
    averagePaceSPerKm: Math.round(estimatedTimeS / targetKm),
    verticalCostS,
    source,
    sampleSize: 0,
    similarProfile: false,
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
