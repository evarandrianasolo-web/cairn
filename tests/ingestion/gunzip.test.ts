import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { safeGunzip, GunzipError } from '@/lib/ingestion/gunzip'

describe('safeGunzip', () => {
  it('decompresse un flux gzip valide', () => {
    const original = Buffer.from('contenu FIT simule')
    const gzipped = gzipSync(original)
    expect(safeGunzip(gzipped).equals(original)).toBe(true)
  })

  it("leve une erreur typee sur un flux corrompu (pas de crash)", () => {
    expect(() => safeGunzip(Buffer.from('pas du gzip du tout'))).toThrow(GunzipError)
  })
})
