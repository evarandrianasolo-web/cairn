import { describe, it, expect } from 'vitest'
import { isWhitelistedArchiveEntry } from '@/lib/ingestion/whitelist'

describe('whitelist archive Strava', () => {
  it('accepte activities.csv', () => {
    expect(isWhitelistedArchiveEntry('activities.csv')).toBe(true)
  })

  it('accepte les fichiers a plat dans activities/', () => {
    expect(isWhitelistedArchiveEntry('activities/12345.fit.gz')).toBe(true)
    expect(isWhitelistedArchiveEntry('activities/12345.fit')).toBe(true)
    expect(isWhitelistedArchiveEntry('activities/12345.gpx')).toBe(true)
    expect(isWhitelistedArchiveEntry('activities/12345.tcx')).toBe(true)
    expect(isWhitelistedArchiveEntry('activities/12345.gz')).toBe(true)
  })

  it('rejette tout ce qui est hors perimetre (contacts, photos, posts...)', () => {
    expect(isWhitelistedArchiveEntry('contacts.csv')).toBe(false)
    expect(isWhitelistedArchiveEntry('profile.jpg')).toBe(false)
    expect(isWhitelistedArchiveEntry('media/12345-1.jpg')).toBe(false)
    expect(isWhitelistedArchiveEntry('posts.csv')).toBe(false)
    expect(isWhitelistedArchiveEntry('messaging.json')).toBe(false)
  })

  it('rejette un sous-dossier imbrique sous activities/', () => {
    expect(isWhitelistedArchiveEntry('activities/sub/12345.fit')).toBe(false)
  })

  it('rejette une tentative de remontee de chemin', () => {
    expect(isWhitelistedArchiveEntry('activities/../../../etc/passwd')).toBe(false)
    expect(isWhitelistedArchiveEntry('../../etc/passwd')).toBe(false)
  })

  it('rejette une extension non reconnue meme sous activities/', () => {
    expect(isWhitelistedArchiveEntry('activities/12345.exe')).toBe(false)
    expect(isWhitelistedArchiveEntry('activities/12345.jpg')).toBe(false)
  })
})
