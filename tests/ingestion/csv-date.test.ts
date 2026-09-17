import { describe, it, expect } from 'vitest'
import { parseFrenchStravaDate } from '@/lib/ingestion/csv-date'

describe('parseFrenchStravaDate', () => {
  it('parse une date francaise abregee avec heure 24h', () => {
    expect(parseFrenchStravaDate('27 juil. 2026', '06:15:32')).toBe(
      new Date(Date.UTC(2026, 6, 27, 6, 15, 32)).toISOString(),
    )
  })

  it('parse une heure au format 12h AM/PM', () => {
    expect(parseFrenchStravaDate('1 janv. 2026', '6:05:00 PM')).toBe(
      new Date(Date.UTC(2026, 0, 1, 18, 5, 0)).toISOString(),
    )
  })

  it('retombe sur minuit si l\'heure est absente ou illisible', () => {
    expect(parseFrenchStravaDate('9 août 2026')).toBe(new Date(Date.UTC(2026, 7, 9, 0, 0, 0)).toISOString())
  })

  it('renvoie undefined sur une date non reconnue', () => {
    expect(parseFrenchStravaDate('n\'importe quoi')).toBeUndefined()
  })
})
