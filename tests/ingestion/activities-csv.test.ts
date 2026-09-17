import { describe, it, expect } from 'vitest'
import { parseStravaActivitiesCsv } from '@/lib/ingestion/parsers/activities-csv'
import { STRAVA_CSV_COLUMN_MAP, STRAVA_CSV_EXPECTED_COLUMN_COUNT } from '@/lib/ingestion/csv-column-map'

const HEADER = STRAVA_CSV_COLUMN_MAP.map((c) => c.label)

function buildRow(overrides: Record<number, string>): string[] {
  const row = new Array(STRAVA_CSV_EXPECTED_COLUMN_COUNT).fill('')
  for (const [pos, value] of Object.entries(overrides)) row[Number(pos)] = value
  return row
}

function toCsv(rows: string[][]): string {
  return [HEADER, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
}

describe('parseStravaActivitiesCsv', () => {
  it('mappe une ligne bien formee vers les champs canoniques par position', () => {
    const row = buildRow({
      0: '12345',
      2: 'Sortie matinale',
      3: 'Run',
      15: '3600',
      17: '10000',
      43: '7',
    })
    const result = parseStravaActivitiesCsv(toCsv([row]))
    expect(result.rows).toHaveLength(1)
    const first = result.rows[0]
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.row.strava_activity_id).toBe('12345')
      expect(first.row.name).toBe('Sortie matinale')
      expect(first.row.sport_type).toBe('Run')
      expect(first.row.elapsed_time_s).toBe('3600')
      expect(first.row.distance_m).toBe('10000')
      expect(first.row.rpe).toBe('7')
    }
  })

  it("rejette une ligne dont un champ BLOCKED (poids, calories) porte une valeur", () => {
    const row = buildRow({ 0: '1', 13: '68' }) // position 13 = Poids de l'athlete
    const result = parseStravaActivitiesCsv(toCsv([row]))
    expect(result.rows[0]).toEqual({ ok: false, reason: 'blocked_field_present', index: 1 })
  })

  it('rejette une ligne dont le nombre de colonnes ne correspond pas (derive de mapping)', () => {
    const malformed = 'a,b,c' // trois colonnes seulement
    const csv = [HEADER.join(','), malformed].join('\n')
    const result = parseStravaActivitiesCsv(csv)
    expect(result.rows[0]).toEqual({ ok: false, reason: 'malformed_row', index: 1 })
  })

  it('detecte un header qui a derive par rapport au hash attendu', () => {
    const row = buildRow({ 0: '1' })
    const result = parseStravaActivitiesCsv(toCsv([row]), 'hash-obsolete-non-correspondant')
    expect(result.headerMatches).toBe(false)
  })

  it('ne recupere jamais un champ marque IGNORE', () => {
    const row = buildRow({ 8: 'valeur-suffer-score-strava' }) // position 8 = Effort relatif (IGNORE)
    const result = parseStravaActivitiesCsv(toCsv([row]))
    expect(result.rows[0].ok).toBe(true)
    if (result.rows[0].ok) {
      expect(Object.values(result.rows[0].row)).not.toContain('valeur-suffer-score-strava')
    }
  })
})
