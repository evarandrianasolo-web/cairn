import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { encrypt, decrypt } from '@/lib/strava/crypto'

beforeAll(() => {
  process.env.STRAVA_TOKEN_KEY = randomBytes(32).toString('base64')
})

describe('chiffrement des tokens', () => {
  it("un tour d'aller-retour rend la valeur d'origine", () => {
    const clair = 'strava-refresh-token-abcdef1234567890'
    expect(decrypt(encrypt(clair))).toBe(clair)
  })

  it('deux chiffrements du même texte donnent des sorties différentes (IV aléatoire)', () => {
    expect(encrypt('même chose')).not.toBe(encrypt('même chose'))
  })

  it('un texte chiffré altéré lève une exception, il ne rend pas de valeur silencieuse', () => {
    const cipher = encrypt('secret')
    const altere = cipher.slice(0, -4) + 'AAAA'
    expect(() => decrypt(altere)).toThrow()
  })

  it('une clé absente fait échouer immédiatement', () => {
    const saved = process.env.STRAVA_TOKEN_KEY
    delete process.env.STRAVA_TOKEN_KEY
    expect(() => encrypt('x')).toThrow(/STRAVA_TOKEN_KEY/)
    process.env.STRAVA_TOKEN_KEY = saved
  })
})
