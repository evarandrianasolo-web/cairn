import { describe, it, expect, vi, beforeEach } from 'vitest'

const parseAsyncMock = vi.fn()

vi.mock('fit-file-parser', () => ({
  default: class {
    parseAsync = parseAsyncMock
  },
}))

describe('parseFitFile', () => {
  beforeEach(() => {
    parseAsyncMock.mockReset()
  })

  it('normalise une session FIT valide', async () => {
    parseAsyncMock.mockResolvedValue({
      sessions: [
        {
          start_time: new Date('2026-07-01T06:00:00.000Z'),
          total_timer_time: 3600,
          total_distance: 10000,
          total_ascent: 250,
          total_descent: 240,
          avg_heart_rate: 145,
          max_heart_rate: 168,
          sport: 'running',
          num_laps: 4,
        },
      ],
      laps: [{}, {}, {}, {}],
    })

    const { parseFitFile } = await import('@/lib/ingestion/parsers/fit')
    const result = await parseFitFile(Buffer.from('peu importe, le parseur est mocke'))

    expect(result.startedAt).toBe('2026-07-01T06:00:00.000Z')
    expect(result.durationS).toBe(3600)
    expect(result.distanceM).toBe(10000)
    expect(result.avgHr).toBe(145)
    expect(result.hasLaps).toBe(true)
    expect(result.hasHeartRate).toBe(true)
  })

  it('rejette en mode strict un FIT dont le parsing echoue (corrompu)', async () => {
    parseAsyncMock.mockRejectedValue(new Error('crc invalide'))
    const { parseFitFile, FitParseError } = await import('@/lib/ingestion/parsers/fit')
    await expect(parseFitFile(Buffer.from('corrompu'))).rejects.toBeInstanceOf(FitParseError)
  })

  it('rejette un FIT sans session exploitable', async () => {
    parseAsyncMock.mockResolvedValue({ sessions: [] })
    const { parseFitFile, FitParseError } = await import('@/lib/ingestion/parsers/fit')
    await expect(parseFitFile(Buffer.from('vide'))).rejects.toBeInstanceOf(FitParseError)
  })

  it('rejette un fichier au-dela de la taille max sans meme appeler le parseur', async () => {
    const { parseFitFile, FitParseError } = await import('@/lib/ingestion/parsers/fit')
    const tooLarge = Buffer.alloc(51 * 1024 * 1024)
    await expect(parseFitFile(tooLarge)).rejects.toBeInstanceOf(FitParseError)
    expect(parseAsyncMock).not.toHaveBeenCalled()
  })
})
