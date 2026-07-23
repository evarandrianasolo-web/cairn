/**
 * Auto-match activité ↔ course.
 * Règle du PRD §3.2 : ±1 jour, type compatible, écart de volume < 40 %.
 * Ici on relâche « type compatible » : le sport Strava n'est pas toujours
 * bien étiqueté par l'utilisateur ; on filtre juste sur date et distance.
 * Le tri suggère la meilleure candidate au premier plan.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Types Strava consideres comme une potentielle course a pied. Les autres
 * (Workout, WeightTraining, Ride, Yoga, etc.) ne sont jamais candidates a
 * une liaison course, meme si un jour et une distance matchent.
 */
export const RACE_ELIGIBLE_SPORT_TYPES = new Set([
  'Run',
  'TrailRun',
  'VirtualRun',
])

export function isRaceEligibleSport(sportType: string | null | undefined): boolean {
  return sportType != null && RACE_ELIGIBLE_SPORT_TYPES.has(sportType)
}

export type ActivityForMatch = {
  started_at: string
  distance_m: number | null
  sport_type?: string | null
}

export type RaceForMatch = {
  id: string
  name: string
  race_date: string
  distance_m: number | null
}

export type RaceCandidate = RaceForMatch & {
  dateDiffDays: number
  distanceRatio: number | null
  score: number
}

function daysBetween(iso1: string, iso2: string): number {
  const a = new Date(iso1).getTime()
  const b = new Date(iso2 + 'T12:00:00Z').getTime()
  return Math.abs(a - b) / DAY_MS
}

/** Retourne les courses candidates triées par pertinence (0 = meilleur). */
export function candidatesForActivity(
  activity: ActivityForMatch,
  races: RaceForMatch[],
): RaceCandidate[] {
  // Un sport hors course a pied n'est jamais candidat, meme si un jour et
  // une distance matcheraient. Court-circuit precoce.
  if (activity.sport_type !== undefined && !isRaceEligibleSport(activity.sport_type)) {
    return []
  }
  const out: RaceCandidate[] = []
  for (const race of races) {
    const dateDiffDays = daysBetween(activity.started_at, race.race_date)
    if (dateDiffDays > 1) continue // Fenêtre PRD : ±1 jour

    let distanceRatio: number | null = null
    if (race.distance_m != null && activity.distance_m != null && race.distance_m > 0) {
      distanceRatio =
        Math.abs(activity.distance_m - race.distance_m) / race.distance_m
      if (distanceRatio > 0.4) continue // Fenêtre PRD : écart < 40 %
    }

    // Score : plus c'est bas, mieux c'est. Le jour compte plus que la distance.
    const score = dateDiffDays * 2 + (distanceRatio ?? 0)
    out.push({ ...race, dateDiffDays, distanceRatio, score })
  }
  return out.sort((a, b) => a.score - b.score)
}
