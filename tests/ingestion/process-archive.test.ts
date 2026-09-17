import { describe, it, expect, vi, beforeEach } from 'vitest'
import yazl from 'yazl'
import { STRAVA_CSV_COLUMN_MAP, STRAVA_CSV_EXPECTED_COLUMN_COUNT } from '@/lib/ingestion/csv-column-map'

const parseAsyncMock = vi.fn()
vi.mock('fit-file-parser', () => ({
  default: class {
    parseAsync = parseAsyncMock
  },
}))

const HEADER = STRAVA_CSV_COLUMN_MAP.map((c) => c.label)

function csvRow(overrides: Record<number, string>): string {
  const row = new Array(STRAVA_CSV_EXPECTED_COLUMN_COUNT).fill('')
  for (const [pos, value] of Object.entries(overrides)) row[Number(pos)] = value
  return row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
}

function buildZip(entries: { path: string; content: Buffer | string }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    for (const e of entries) {
      zip.addBuffer(Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content), e.path)
    }
    const chunks: Buffer[] = []
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
    zip.end()
  })
}

function fitHeader(): Buffer {
  const b = Buffer.alloc(20)
  b[0] = 14
  b.write('.FIT', 8, 'ascii')
  return b
}

const SAMPLE_GPX = `<?xml version="1.0"?><gpx><trk><trkseg>
  <trkpt lat="45.0" lon="5.0"><ele>200</ele><time>2026-07-01T06:00:00Z</time></trkpt>
  <trkpt lat="45.01" lon="5.01"><ele>210</ele><time>2026-07-01T06:10:00Z</time></trkpt>
</trkseg></trk></gpx>`

describe('processStravaArchive', () => {
  beforeEach(() => {
    parseAsyncMock.mockReset()
    parseAsyncMock.mockResolvedValue({
      sessions: [
        {
          start_time: new Date('2026-07-01T05:00:00.000Z'),
          total_timer_time: 1800,
          total_distance: 5000,
          avg_heart_rate: 140,
          sport: 'running',
        },
      ],
    })
  })

  it('assemble CSV + FIT + GPX, ignore le hors-perimetre, journalise les rejets', async () => {
    const csv = [
      HEADER.join(','),
      csvRow({ 0: '111', 2: 'Sortie FIT', 3: 'Run', 12: 'activities/111.fit', 43: '6' }),
    ].join('\n')

    const zip = await buildZip([
      { path: 'activities.csv', content: csv },
      { path: 'activities/111.fit', content: fitHeader() },
      { path: 'activities/222.gpx', content: SAMPLE_GPX },
      { path: 'contacts.csv', content: 'email\nx@example.com' },
      { path: 'activities/999.fit', content: Buffer.from('pas du tout un fit valide mais accepte par whitelist') },
    ])

    // Le troisieme FIT (999) simule un fichier corrompu.
    parseAsyncMock.mockResolvedValueOnce({
      sessions: [
        { start_time: new Date('2026-07-01T05:00:00.000Z'), total_timer_time: 1800, total_distance: 5000, avg_heart_rate: 140, sport: 'running' },
      ],
    })
    parseAsyncMock.mockRejectedValueOnce(new Error('crc invalide'))

    const { processStravaArchive } = await import('@/lib/ingestion/process-archive')
    const result = await processStravaArchive(zip, 'tenant-1')

    expect(result.activities).toHaveLength(2)

    const fitActivity = result.activities.find((a) => a.sourceFilename === 'activities/111.fit')
    expect(fitActivity?.name).toBe('Sortie FIT')
    expect(fitActivity?.rpe).toBe(6)
    expect(fitActivity?.distanceM).toBe(5000)
    expect(fitActivity?.health?.avgHr).toBe(140)
    expect(fitActivity?.provenance).toBe('strava_archive')

    const gpxActivity = result.activities.find((a) => a.sourceFilename === 'activities/222.gpx')
    expect(gpxActivity?.hasGps).toBe(true)
    expect(gpxActivity?.distanceM).toBeGreaterThan(0)

    expect(result.events.some((e) => e.filePath === 'contacts.csv' && e.event === 'ignored_not_whitelisted')).toBe(true)
    expect(result.events.some((e) => e.filePath === 'activities/999.fit' && e.event === 'rejected_format')).toBe(true)
  })

  it("fonctionne sans activities.csv (contexte vide, physio quand meme extraite)", async () => {
    const zip = await buildZip([{ path: 'activities/1.fit', content: fitHeader() }])
    const { processStravaArchive } = await import('@/lib/ingestion/process-archive')
    const result = await processStravaArchive(zip, 'tenant-1')
    expect(result.activities).toHaveLength(1)
    expect(result.activities[0].name).toBeUndefined()
    expect(result.activities[0].distanceM).toBe(5000)
  })
})
