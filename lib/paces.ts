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

export type ReferenceDates = {
  ref_5km_at: string | null
  ref_10km_at: string | null
  ref_semi_at: string | null
  ref_marathon_at: string | null
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

export type ActivityRefLite = {
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
  avg_pace_s_per_km: number | null
  started_at: string | null
  name: string | null
}

export type LapRefLite = {
  activity_id: string
  activity_name: string | null
  activity_started_at: string | null
  distance_m: number
  moving_time_s: number
  is_manual: boolean
  /**
   * D+ du lap lui-meme. Un lap en descente forte a un D+ tres faible
   * et une vitesse anormalement rapide (biais). Un lap en montee raide
   * a un D+ tres eleve et une vitesse anormalement lente (autre biais).
   * Dans les deux cas, l'extrapolation Riegel plate est faussee.
   */
  elevation_gain_m: number
  /**
   * D+/km de l'activite parente. Sert a rejeter les laps auto d'une
   * grosse course trail : un 1 km en 2:45 pris en descente sur une
   * cote roannaise n'est pas une reference d'allure horizontale.
   */
  parent_dplus_per_km: number
}

/**
 * Enrichit les refs saisies avec :
 *   - les meilleurs temps de courses terminees (route ou trail plat,
 *     < 300 m D+), Riegel adaptatif si distance proche d'une
 *     canonique (5 / 10 / 21 / 42 km, +/- 15 %)
 *   - les meilleurs temps deduits des activites recentes route/plates
 *     (< 90 j, D+/km < 15, allure moyenne < 6:00/km = effort reel).
 *     Cible : capter les fractionnes VMA / tempo / seuil recents qui
 *     refletent mieux la forme actuelle qu'un ref saisi ancien.
 *
 * Le meilleur temps par distance canonique l'emporte -- si Eva a
 * fait recemment une tempo 8 km a 4:35/km, l'equivalent 10 km via
 * Riegel remplacera son 10 km saisi de janvier.
 */
export type InferenceSource = {
  kind: 'race' | 'activity'
  label: string | null
  date: string | null
  equivalentS: number
}

export function inferReferenceTimes(
  saved: ReferenceTimes,
  races: RaceLite[],
  activities: ActivityRefLite[],
  laps: LapRefLite[] = [],
  now: Date = new Date(2000, 0, 1),
  savedDates: ReferenceDates = {
    ref_5km_at: null,
    ref_10km_at: null,
    ref_semi_at: null,
    ref_marathon_at: null,
  },
): {
  refs: ReferenceTimes
  inferred: Partial<Record<keyof ReferenceTimes, true>>
  bestFromActivity: Partial<Record<keyof ReferenceTimes, InferenceSource>>
  stale: Partial<Record<keyof ReferenceTimes, true>>
} {
  const cutoffRace = new Date(now.getTime() - 18 * 30 * 24 * 3600 * 1000)
  const cutoffAct = new Date(now.getTime() - 90 * 24 * 3600 * 1000)
  const cutoffStale = new Date(now.getTime() - 6 * 30 * 24 * 3600 * 1000)
  const inferred: Partial<Record<keyof ReferenceTimes, true>> = {}
  const bestFromActivity: Partial<Record<keyof ReferenceTimes, InferenceSource>> = {}
  const stale: Partial<Record<keyof ReferenceTimes, true>> = {}
  const result: ReferenceTimes = { ...saved }

  const dateKeyFor: Record<keyof ReferenceTimes, keyof ReferenceDates> = {
    ref_5km_s: 'ref_5km_at',
    ref_10km_s: 'ref_10km_at',
    ref_semi_s: 'ref_semi_at',
    ref_marathon_s: 'ref_marathon_at',
  }
  const isRefStale = (key: keyof ReferenceTimes): boolean => {
    const dateStr = savedDates[dateKeyFor[key]]
    if (!dateStr) return false
    return new Date(dateStr) < cutoffStale
  }

  const eligibleRaces = races.filter(
    (r) =>
      r.result_time_s != null &&
      r.result_time_s > 0 &&
      r.distance_m != null &&
      r.distance_m > 0 &&
      (r.elevation_gain_m ?? 0) < 300 &&
      (!r.race_date || new Date(r.race_date) > cutoffRace),
  )

  // Laps eligibles pour l'extrapolation d'allure plate :
  //   - >= 800 m, activite < 90 j, pace realiste [3:20 ; 6:30]/km
  //   - profil du lap lui-meme quasi plat : |D+/km| <= 15 m/km, sinon
  //     Riegel plate est biaise (descente = trop rapide, montee = trop
  //     lente). Ce filtre s'applique aussi aux manuels.
  //   - auto-laps rejetes sur activite parente vallonnee (D+/km > 15).
  //     Les manuels restent car ils isolent l'intention -- reste
  //     protege par le filtre "profil du lap" ci-dessus.
  const eligibleLaps = laps.filter((l) => {
    if (l.distance_m < 800 || l.moving_time_s <= 0) return false
    const pace = l.moving_time_s / (l.distance_m / 1000)
    if (pace < 200 || pace >= 390) return false
    if (l.activity_started_at && new Date(l.activity_started_at) < cutoffAct)
      return false
    if (!l.is_manual && l.parent_dplus_per_km > 15) return false
    const lapDPlusPerKm = (l.elevation_gain_m * 1000) / l.distance_m
    if (lapDPlusPerKm > 15) return false
    return true
  })

  // Activites "effort route" recentes : distance 5-25 km, D+/km bas,
  // duree >= 30 min, allure moyenne dans [3:20 ; 6:00]/km. Le pace min
  // filtre les donnees corrompues (GPS drift, arret montre) ; la duree
  // min ecarte les warm-ups isoles et petits sprints ; le pace max
  // ecarte les EF pures. Sur des seances fractionnees, avg_pace inclut
  // les recuperations, donc l'extrapolation Riegel est intrinsequement
  // conservatrice.
  const eligibleActs = activities.filter((a) => {
    if (
      a.distance_m == null ||
      a.distance_m < 5000 ||
      a.distance_m > 25000 ||
      a.moving_time_s == null ||
      a.moving_time_s < 30 * 60
    )
      return false
    const dPlusPerKm = ((a.elevation_gain_m ?? 0) * 1000) / a.distance_m
    if (dPlusPerKm > 15) return false
    const pace =
      a.avg_pace_s_per_km ?? (a.moving_time_s / (a.distance_m / 1000))
    if (pace < 200 || pace >= 360) return false
    if (a.started_at && new Date(a.started_at) < cutoffAct) return false
    return true
  })

  for (const target of CANONICAL_ROUTE) {
    // Si le ref saisi est stale (> 6 mois), on l'oublie pour la
    // comparaison "meilleur temps gagne" -- les activites recentes
    // reprennent la main. Ce comportement colle a la demande : un
    // 20:51 de janvier ne doit pas empecher un 22 min recent
    // d'apparaitre comme reference plus fidele a la forme actuelle.
    const refIsStale = isRefStale(target.key)
    if (refIsStale) stale[target.key] = true
    let best: number | null = refIsStale ? null : result[target.key]

    for (const r of eligibleRaces) {
      // Quand le ref saisi est jugé ancien (stale), on refuse aussi
      // les courses de la même periode. Sinon la course qui a servi a
      // caler le ref (souvent la meme perf) revient par la fenetre et
      // ecrase l'inference recente que l'on veut privilegier.
      if (refIsStale && r.race_date && new Date(r.race_date) < cutoffStale)
        continue
      const dKm = (r.distance_m as number) / 1000
      const ratio = dKm / target.km
      if (ratio < 0.85 || ratio > 1.15) continue
      const equivalent =
        (r.result_time_s as number) * Math.pow(target.km / dKm, RIEGEL_EXP)
      if (best == null || equivalent < best) {
        best = Math.round(equivalent)
        inferred[target.key] = true
      }
    }

    let bestActEquiv: number | null = null
    let bestActSource: InferenceSource | null = null

    // Laps en premier : les manuels priment sur les auto au meme
    // score en cas d'ex-aequo. Riegel classique s'applique.
    for (const l of eligibleLaps) {
      const dKm = l.distance_m / 1000
      const ratio = dKm / target.km
      // Un lap peut etre bien plus court que la distance cible (ex :
      // 1 km lap pour extrapoler un 10 km) -- tolerance large 0.1-2.
      if (ratio < 0.1 || ratio > 2) continue
      const equivalent = Math.round(
        l.moving_time_s * Math.pow(target.km / dKm, RIEGEL_EXP),
      )
      const isBetter =
        bestActEquiv == null ||
        equivalent < bestActEquiv ||
        // Egalite : le manuel prime
        (equivalent === bestActEquiv && l.is_manual)
      if (isBetter) {
        bestActEquiv = equivalent
        bestActSource = {
          kind: 'activity',
          label: l.activity_name
            ? `${l.activity_name} — lap ${(dKm).toFixed(1)} km ${l.is_manual ? '(manuel)' : '(auto)'}`
            : `lap ${dKm.toFixed(1)} km`,
          date: l.activity_started_at
            ? l.activity_started_at.slice(0, 10)
            : null,
          equivalentS: equivalent,
        }
      }
      if (best == null || equivalent < best) {
        best = equivalent
        inferred[target.key] = true
      }
    }

    for (const a of eligibleActs) {
      const dKm = (a.distance_m as number) / 1000
      const ratio = dKm / target.km
      // Tolerance plus large pour les activites (0.5-2x) : une VMA 8 km
      // est un bon indicateur pour un 5 km comme un 10 km via Riegel.
      if (ratio < 0.5 || ratio > 2) continue
      const equivalent = Math.round(
        (a.moving_time_s as number) * Math.pow(target.km / dKm, RIEGEL_EXP),
      )
      if (bestActEquiv == null || equivalent < bestActEquiv) {
        bestActEquiv = equivalent
        bestActSource = {
          kind: 'activity',
          label: a.name,
          date: a.started_at ? a.started_at.slice(0, 10) : null,
          equivalentS: equivalent,
        }
      }
      if (best == null || equivalent < best) {
        best = equivalent
        inferred[target.key] = true
      }
    }
    if (bestActSource) bestFromActivity[target.key] = bestActSource

    // Si le ref etait stale et qu'aucun deduit n'a ete trouve, on
    // remet la valeur saisie faute de mieux -- une vieille reference
    // vaut mieux qu'un trou.
    if (best == null && refIsStale) best = saved[target.key]
    if (best != null) result[target.key] = best
  }

  return { refs: result, inferred, bestFromActivity, stale }
}

/** @deprecated use inferReferenceTimes(saved, races, [], [], now, savedDates). */
export function inferReferenceTimesFromRaces(
  saved: ReferenceTimes,
  races: RaceLite[],
  now: Date = new Date(2000, 0, 1),
): { refs: ReferenceTimes; inferred: Partial<Record<keyof ReferenceTimes, true>> } {
  const { refs, inferred } = inferReferenceTimes(saved, races, [], [], now)
  return { refs, inferred }
}

// ------------------ Estimation temps course ------------------

export type RaceEstimate = {
  estimatedTimeS: number
  flatEquivalentTimeS: number
  averagePaceSPerKm: number
  verticalCostS: number
  source: 'reference' | 'route-refs' | 'refs+vspeed' | 'refs'
  referenceEffort: ReferenceEffort | null
  routeRefKm: number | null
}

export type SimilarEffort = {
  distance_m: number
  elevation_gain_m: number | null
  time_s: number
  kind: 'race' | 'activity'
  label: string | null
  date: string | null
}

/**
 * Constante de conversion "effort-km" (distance equivalente incluant
 * la contribution du D+). Sert uniquement au matching : au sein d'un
 * meme profil D+/km, le ratio effort_cible / effort_ref est peu
 * sensible a K. Choisi conservateur (0.05) pour ne pas ecraser les
 * differences de D+ dans le tri des candidats.
 */
const EFFORT_KM_PER_M_DPLUS = 0.05

function effortKm(distanceM: number, dplusM: number): number {
  return distanceM / 1000 + dplusM * EFFORT_KM_PER_M_DPLUS
}

/** Riegel-like exposant. Pour trail, on prend 1.05 (un peu plus
 *  doux que 1.06 route : les ultras sont deja au ralenti). */
const RIEGEL_TRAIL_EXP = 1.05

export type ReferenceEffort = {
  label: string | null
  date: string | null
  distance_m: number
  elevation_gain_m: number
  time_s: number
  kind: 'race' | 'activity'
}

/**
 * Trouve l'effort passe le plus comparable a la cible : ratio D+/km
 * proche (score = ecart relatif) et distance comparable (log-ratio).
 * Bonus a une course terminee vs un simple entrainement -- une perf
 * chronometree en compet est plus predictive qu'un footing long.
 *
 * Retourne l'effort match ET son score de similarite (0 = jumeau
 * parfait, plus grand = plus loin). On considere "utilisable" si
 * score < 0.55 (roughly : ecart ratio D+/km <= 30 % ET taille dans
 * un facteur 2).
 */
function findBestReference(
  target: { distance_m: number; elevation_gain_m: number },
  pool: SimilarEffort[],
): { ref: ReferenceEffort; score: number } | null {
  const targetKm = target.distance_m / 1000
  const targetRatio = target.elevation_gain_m / targetKm

  let best: { ref: ReferenceEffort; score: number } | null = null
  for (const e of pool) {
    if (e.distance_m < 5000 || e.time_s < 5 * 60) continue
    const km = e.distance_m / 1000
    const dplus = e.elevation_gain_m ?? 0
    const ratio = dplus / km

    const ratioDelta =
      targetRatio > 0
        ? Math.abs(ratio - targetRatio) / targetRatio
        : Math.abs(ratio) / 20
    const sizeDelta = Math.abs(Math.log(km / targetKm))
    // Bonus course : -0.15 sur le score (rend prioritaires les
    // resultats officiels vs les sorties d'entrainement)
    const kindBonus = e.kind === 'race' ? -0.15 : 0
    const score = ratioDelta + sizeDelta * 0.7 + kindBonus
    if (!best || score < best.score) {
      best = {
        ref: {
          label: e.label,
          date: e.date,
          distance_m: e.distance_m,
          elevation_gain_m: dplus,
          time_s: e.time_s,
          kind: e.kind,
        },
        score,
      }
    }
  }
  if (!best || best.score > 0.55) return null
  return best
}

/**
 * Extrapole depuis une reference dominante via un Riegel adapte au
 * trail sur "effort-km" (distance + D+ × K). Au sein d'un meme
 * profil D+/km, le ratio d'effort est robuste au choix de K.
 *
 * ex : UTMJ 90 km / 3400 m D+ en 14h07 → cible UTMJ 105 km / 4000 m
 *   effort_ref = 90 + 3400×0.05 = 260 ; effort_cible = 305
 *   ratio = 1.173 ; temps = 14h07 × 1.173^1.05 ≈ 16h44
 */
function estimateFromReference(
  target: { distance_m: number; elevation_gain_m: number },
  ref: ReferenceEffort,
): {
  estimatedTimeS: number
  averagePaceSPerKm: number
  verticalCostS: number
  flatEquivalentTimeS: number
} {
  const effortRef = effortKm(ref.distance_m, ref.elevation_gain_m)
  const effortTarget = effortKm(target.distance_m, target.elevation_gain_m)
  const scale = Math.pow(effortTarget / effortRef, RIEGEL_TRAIL_EXP)
  const estimatedTimeS = Math.round(ref.time_s * scale)
  const targetKm = target.distance_m / 1000

  // Repartition indicative : coût D+ = fraction du temps qui vient
  // du denivele, au prorata de sa contribution a l'effort-km.
  const dPlus = target.elevation_gain_m
  const verticalShare =
    effortTarget > 0
      ? (dPlus * EFFORT_KM_PER_M_DPLUS) / effortTarget
      : 0
  const verticalCostS = Math.round(estimatedTimeS * verticalShare)
  const flatEquivalentTimeS = estimatedTimeS - verticalCostS

  return {
    estimatedTimeS,
    averagePaceSPerKm: Math.round(estimatedTimeS / targetKm),
    verticalCostS,
    flatEquivalentTimeS,
  }
}

export type RaceTerrain = 'route' | 'trail' | 'mixte'

/**
 * Estime le temps sur une course. La strategie depend du terrain :
 *
 *   - route : Riegel direct depuis les temps de reference route.
 *     Aucun scan du pool trail -- il n'apporte rien pour du plat.
 *   - trail : cherche une reference dominante (course/activite au
 *     profil D+/km proche) et extrapole via Riegel effort-km.
 *     Fallback refs route + vSpeed si le pool est trop pauvre.
 *   - mixte : trail en premier ; si aucune reference trouvee, on
 *     mixe refs route (part flat) + vSpeed (part verticale).
 *
 * Un garde-fou auto-detecte le cas "route deguisee" : si D+/km < 5,
 * on force la strategie route meme si terrain='trail'.
 */
export function estimateRaceTime(
  race: {
    distance_m: number | null
    elevation_gain_m: number | null
    terrain?: RaceTerrain | null
  },
  refs: ReferenceTimes,
  vSpeed: VerticalSpeed | null,
  similar: SimilarEffort[] = [],
): RaceEstimate | null {
  if (!race.distance_m || race.distance_m <= 0) return null
  const dPlus = race.elevation_gain_m ?? 0
  const targetKm = race.distance_m / 1000
  const declaredTerrain = race.terrain ?? 'trail'
  // Course route deguisee : D+/km < 5 -> traitement route quoi qu'il arrive.
  const effectiveTerrain: RaceTerrain =
    dPlus / targetKm < 5 ? 'route' : declaredTerrain

  // === Mode route : Riegel refs direct, pas de scan pool. ===
  if (effectiveTerrain === 'route') {
    const routeEst = estimateRouteFromRefs(targetKm, dPlus, refs, vSpeed)
    return routeEst
  }

  // === Mode trail / mixte : cherche une reference dominante trail. ===
  const bestRef = findBestReference(
    { distance_m: race.distance_m, elevation_gain_m: dPlus },
    similar,
  )
  if (bestRef) {
    const est = estimateFromReference(
      { distance_m: race.distance_m, elevation_gain_m: dPlus },
      bestRef.ref,
    )
    return {
      ...est,
      source: 'reference',
      referenceEffort: bestRef.ref,
      routeRefKm: null,
    }
  }

  // === Fallback : refs route + cout D+. ===
  const routeRef = pickBestRef(refs)
  if (!routeRef) return null
  const flatBase =
    routeRef.timeS * Math.pow(targetKm / routeRef.km, RIEGEL_EXP)
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
    referenceEffort: null,
    routeRefKm: null,
  }
}

/**
 * Estimation dediee route : Riegel sur la ref la plus proche de la
 * distance cible + cout D+ eventuel (rare sur route mais un semi de
 * ville peut avoir 200-300 m D+).
 *
 * On choisit la ref dont la distance est la plus proche de la cible
 * plutot que "toujours prendre la plus longue" -- pour un 5 km,
 * partir du 5 km est plus fiable que partir du marathon.
 */
function estimateRouteFromRefs(
  targetKm: number,
  dPlus: number,
  refs: ReferenceTimes,
  vSpeed: VerticalSpeed | null,
): RaceEstimate | null {
  const candidates: { km: number; timeS: number }[] = []
  if (refs.ref_5km_s && refs.ref_5km_s > 0)
    candidates.push({ km: KM_5K, timeS: refs.ref_5km_s })
  if (refs.ref_10km_s && refs.ref_10km_s > 0)
    candidates.push({ km: KM_10K, timeS: refs.ref_10km_s })
  if (refs.ref_semi_s && refs.ref_semi_s > 0)
    candidates.push({ km: KM_SEMI, timeS: refs.ref_semi_s })
  if (refs.ref_marathon_s && refs.ref_marathon_s > 0)
    candidates.push({ km: KM_MARATHON, timeS: refs.ref_marathon_s })
  if (candidates.length === 0) return null

  // Ref la plus proche de la distance cible en log-ratio
  candidates.sort(
    (a, b) => Math.abs(Math.log(a.km / targetKm)) - Math.abs(Math.log(b.km / targetKm)),
  )
  const ref = candidates[0]
  const flatEquivalentTimeS = Math.round(
    ref.timeS * Math.pow(targetKm / ref.km, 1.06),
  )

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
    source: 'route-refs',
    referenceEffort: null,
    routeRefKm: ref.km,
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
