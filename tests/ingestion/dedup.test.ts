import { describe, it, expect } from 'vitest'
import { computeContentHash, computeDedupSignature, resolveDedupConflict } from '@/lib/ingestion/dedup'

describe('idempotence par content_hash', () => {
  it('le meme contenu produit le meme hash', () => {
    expect(computeContentHash('meme fichier')).toBe(computeContentHash('meme fichier'))
  })

  it('un contenu different produit un hash different', () => {
    expect(computeContentHash('a')).not.toBe(computeContentHash('b'))
  })
})

describe('deduplication semantique par dedup_signature', () => {
  const base = { tenantId: 't1', startedAtUtc: '2026-07-01T06:00:00.000Z', durationS: 3600, distanceM: 10000 }

  it('deux imports de la meme seance (memes fenetres) donnent la meme signature', () => {
    const a = computeDedupSignature(base)
    const b = computeDedupSignature({ ...base, startedAtUtc: '2026-07-01T06:00:20.000Z' }) // +20s, meme fenetre 1 min
    expect(a).toBe(b)
  })

  it('un decalage au-dela des fenetres de tolerance change la signature', () => {
    const a = computeDedupSignature(base)
    const b = computeDedupSignature({ ...base, startedAtUtc: '2026-07-01T07:00:00.000Z' }) // +1h
    expect(a).not.toBe(b)
  })

  it('deux tenants differents ne collisionnent jamais', () => {
    const a = computeDedupSignature(base)
    const b = computeDedupSignature({ ...base, tenantId: 't2' })
    expect(a).not.toBe(b)
  })
})

describe('matrice de resolution de conflit (doc 03 §4.2)', () => {
  it('manuel puis fichier archive plus riche -> remplace', () => {
    expect(resolveDedupConflict('manual', 'strava_archive')).toBe('replace')
  })

  it('archive puis re-saisie manuelle plus pauvre -> ignore le nouvel entrant', () => {
    expect(resolveDedupConflict('strava_archive', 'manual')).toBe('ignore_incoming')
  })

  it('deux imports de meme richesse -> conserve le premier, trace un doublon', () => {
    expect(resolveDedupConflict('strava_archive', 'strava_archive')).toBe('keep_both_as_duplicate')
  })
})
