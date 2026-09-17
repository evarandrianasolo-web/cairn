import { describe, it, expect } from 'vitest'
import { detectFormat } from '@/lib/ingestion/magic-bytes'

describe('detection du format reel (magic bytes)', () => {
  it('detecte un ZIP', () => {
    expect(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe('zip')
  })

  it('detecte un GZIP', () => {
    expect(detectFormat(Buffer.from([0x1f, 0x8b, 0x08, 0x00]))).toBe('gzip')
  })

  it('detecte un FIT (".FIT" a l\'offset 8)', () => {
    const header = Buffer.alloc(14)
    header.write('.FIT', 8, 'ascii')
    expect(detectFormat(header)).toBe('fit')
  })

  it('detecte du XML standard', () => {
    expect(detectFormat(Buffer.from('<?xml version="1.0"?><gpx></gpx>'))).toBe('xml')
  })

  it('detecte du XML meme avec un espace de tete (piege TCX Strava)', () => {
    expect(detectFormat(Buffer.from('   <TrainingCenterDatabase></TrainingCenterDatabase>'))).toBe('xml')
  })

  it('rejette une extension .fit dont les octets reels sont un ZIP', () => {
    // Le scenario doc 02 §1.4 : jamais se fier a l'extension seule.
    expect(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).not.toBe('fit')
  })

  it('renvoie unknown pour un contenu non reconnu', () => {
    expect(detectFormat(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe('unknown')
  })
})
