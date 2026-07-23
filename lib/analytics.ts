/**
 * Agrégations partagées sur les activités.
 * Utilisées par le dashboard (rendu graphique) et le contexte coach (Markdown).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Lundi 00:00 UTC de la semaine ISO contenant la date. */
export function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7 // Lundi = 1 … Dimanche = 7
  d.setUTCDate(d.getUTCDate() - dayNum + 1)
  return d
}

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

/** Lundi 00:00 UTC de la semaine ISO donnee (annee ISO + numero). */
export function isoWeekMonday(isoYear: number, isoWeek: number): Date {
  // Jeudi de la semaine 1 = premier jeudi de l'annee ISO.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7 // lun=1..dim=7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)
  const monday = new Date(week1Monday)
  monday.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7)
  return monday
}

export type WeeklyActivity = {
  started_at: string
  sport_type: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  moving_time_s: number | null
}

export type WeekBucket = {
  key: string
  isoWeek: number
  weekStart: Date
  sessions: number
  distanceM: number
  elevationM: number
  timeS: number
  longestM: number
}

/**
 * Range les activités dans N buckets hebdo consécutifs, du plus ancien au
 * plus récent. Buckets vides inclus. `weekCount` = 12 par défaut (PRD §3.4).
 */
export function aggregateByWeek(
  activities: WeeklyActivity[],
  weekCount = 12,
): WeekBucket[] {
  const nowMonday = isoWeekStart(new Date())
  const buckets = new Map<string, WeekBucket>()
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = new Date(nowMonday.getTime() - i * 7 * DAY_MS)
    const key = start.toISOString().slice(0, 10)
    buckets.set(key, {
      key,
      isoWeek: isoWeekNumber(start),
      weekStart: start,
      sessions: 0,
      distanceM: 0,
      elevationM: 0,
      timeS: 0,
      longestM: 0,
    })
  }

  for (const a of activities) {
    const start = isoWeekStart(new Date(a.started_at))
    const key = start.toISOString().slice(0, 10)
    const b = buckets.get(key)
    if (!b) continue
    b.sessions += 1
    b.distanceM += a.distance_m ?? 0
    b.elevationM += a.elevation_gain_m ?? 0
    b.timeS += a.moving_time_s ?? 0
    if ((a.distance_m ?? 0) > b.longestM) b.longestM = a.distance_m ?? 0
  }

  return [...buckets.values()]
}

export type SportBucket = {
  sport: string
  sessions: number
  distanceM: number
  timeS: number
}

export function aggregateBySport(activities: WeeklyActivity[]): SportBucket[] {
  const map = new Map<string, SportBucket>()
  for (const a of activities) {
    const sport = a.sport_type ?? 'Autre'
    const b = map.get(sport) ?? { sport, sessions: 0, distanceM: 0, timeS: 0 }
    b.sessions += 1
    b.distanceM += a.distance_m ?? 0
    b.timeS += a.moving_time_s ?? 0
    map.set(sport, b)
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions)
}
