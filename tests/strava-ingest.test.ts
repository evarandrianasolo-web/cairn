import { describe, it, expect } from 'vitest'
import type { StravaActivity } from '@/lib/strava/api'
import { extractHealth, transformActivity } from '@/lib/strava/ingest'

const brute: StravaActivity = {
  id: 12345,
  name: 'sortie longue',
  description: null,
  sport_type: 'TrailRun',
  start_date: '2026-07-15T06:00:00Z',
  distance: 25000,
  total_elevation_gain: 900,
  moving_time: 10800,
  elapsed_time: 11400,
  average_speed: 2.31,
  average_cadence: 82.1,
  has_heartrate: true,
  average_heartrate: 148,
  max_heartrate: 172,
  suffer_score: 210,
}

describe("filtrage FC à l'ingestion", () => {
  it('sans consentement, extractHealth renvoie null', () => {
    expect(extractHealth(brute, false)).toBeNull()
  })

  it('avec consentement mais activité sans FC, extractHealth renvoie null', () => {
    expect(extractHealth({ ...brute, has_heartrate: false }, true)).toBeNull()
  })

  it('avec consentement et FC présente, extractHealth renvoie les valeurs', () => {
    expect(extractHealth(brute, true)).toEqual({
      avg_hr: 148,
      max_hr: 172,
      relative_effort: 210,
    })
  })

  it("transformActivity n'expose aucun champ de FC, quoi qu'il arrive", () => {
    const row = transformActivity(brute) as Record<string, unknown>
    for (const k of Object.keys(row)) {
      expect(k).not.toMatch(/hr|heartrate|effort/i)
    }
  })
})
