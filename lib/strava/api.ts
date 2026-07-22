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
