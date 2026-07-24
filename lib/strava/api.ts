import { STRAVA_API_BASE } from './config'

/** Champs consommés sur une activité Strava résumée. FC séparée. */
export type StravaActivity = {
  id: number
  name: string | null
  description: string | null
  sport_type: string | null
  start_date: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  elapsed_time: number
  average_speed: number | null
  average_cadence: number | null
  has_heartrate: boolean
  average_heartrate: number | null
  max_heartrate: number | null
  suffer_score: number | null
}

export async function listActivities(
  accessToken: string,
  page: number,
  perPage = 100,
): Promise<StravaActivity[]> {
  const url = `${STRAVA_API_BASE}/athlete/activities?per_page=${perPage}&page=${page}`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Strava list activities: ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Récupère une activité Strava par son id (endpoint détail).
 * Différent de listActivities : ce endpoint renvoie `description` (les
 * notes personnelles Strava), absentes de la version résumée. Coûte
 * un appel API par activité — à réserver aux activités où l'on veut
 * vraiment récupérer les notes.
 */
export async function getActivityDetail(
  accessToken: string,
  stravaActivityId: number,
): Promise<StravaActivity> {
  const url = `${STRAVA_API_BASE}/activities/${stravaActivityId}`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Strava activity detail: ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Un lap tel que renvoye par l'endpoint `/activities/{id}/laps` de
 * Strava. Ce sont les splits enregistres par la montre : bouton lap
 * manuel ou auto-lap kilometrique selon les reglages. Aucun champ FC
 * n'est extrait.
 */
export type StravaLap = {
  id: number
  lap_index: number
  distance: number
  moving_time: number
  elapsed_time: number
  average_speed: number | null
  total_elevation_gain: number | null
}

export async function listActivityLaps(
  accessToken: string,
  stravaActivityId: number,
): Promise<StravaLap[]> {
  const url = `${STRAVA_API_BASE}/activities/${stravaActivityId}/laps`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Strava laps: ${res.status} ${await res.text()}`)
  return res.json()
}
