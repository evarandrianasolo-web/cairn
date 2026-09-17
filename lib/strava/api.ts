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
  /** start_index et end_index pointent dans les streams (time / distance /
   *  altitude / heartrate) et permettent de decouper par lap sans avoir
   *  a re-aligner sur la distance ou le temps. */
  start_index: number | null
  end_index: number | null
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

/**
 * Streams Strava. Ne demande que ce dont on a besoin (altitude pour
 * calculer le D- par lap, heartrate pour FC min/avg/max par lap) --
 * garde la reponse legere.
 *
 * Retourne un dict {altitude: {data: number[]}, heartrate: {...}}.
 * Un type absent (activite sans altimetre ou sans capteur FC) est
 * simplement omis de la reponse.
 */
export type StravaStream = { data: number[]; original_size: number }
export type StravaStreams = {
  altitude?: StravaStream
  heartrate?: StravaStream
  time?: StravaStream
  distance?: StravaStream
}

export async function getActivityStreams(
  accessToken: string,
  stravaActivityId: number,
  keys: readonly ('altitude' | 'heartrate' | 'time' | 'distance')[] = [
    'altitude',
    'heartrate',
  ],
): Promise<StravaStreams> {
  const keysParam = keys.join(',')
  const url = `${STRAVA_API_BASE}/activities/${stravaActivityId}/streams?keys=${keysParam}&key_by_type=true`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (res.status === 404) return {}
  if (!res.ok)
    throw new Error(`Strava streams: ${res.status} ${await res.text()}`)
  return res.json()
}
