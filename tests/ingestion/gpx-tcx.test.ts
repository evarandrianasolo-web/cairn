import { describe, it, expect } from 'vitest'
import { parseGpx, parseTcx, GpxTcxParseError } from '@/lib/ingestion/parsers/gpx-tcx'

const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx><trk><trkseg>
  <trkpt lat="45.1885" lon="5.7245"><ele>212.0</ele><time>2026-07-01T06:00:00Z</time></trkpt>
  <trkpt lat="45.1895" lon="5.7255"><ele>222.0</ele><time>2026-07-01T06:05:00Z</time></trkpt>
  <trkpt lat="45.1905" lon="5.7265"><ele>215.0</ele><time>2026-07-01T06:10:00Z</time></trkpt>
</trkseg></trk></gpx>`

const SAMPLE_TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase><Activities><Activity Sport="Running">
  <Id>2026-07-01T06:00:00Z</Id>
  <Lap StartTime="2026-07-01T06:00:00Z">
    <TotalTimeSeconds>1800</TotalTimeSeconds>
    <DistanceMeters>5000</DistanceMeters>
    <AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm>
    <MaximumHeartRateBpm><Value>172</Value></MaximumHeartRateBpm>
    <Track><Trackpoint><Position><LatitudeDegrees>45.1</LatitudeDegrees></Position></Trackpoint></Track>
  </Lap>
</Activity></Activities></TrainingCenterDatabase>`

describe('parseGpx', () => {
  it('extrait distance, duree et denivele depuis les trackpoints', () => {
    const r = parseGpx(SAMPLE_GPX)
    expect(r.startedAt).toBe('2026-07-01T06:00:00Z')
    expect(r.durationS).toBe(600)
    expect(r.distanceM).toBeGreaterThan(0)
    expect(r.elevationGainM).toBeCloseTo(10, 0) // 212->222
    expect(r.elevationLossM).toBeCloseTo(7, 0) // 222->215
    expect(r.hasGps).toBe(true)
    expect(r.hasHeartRate).toBe(false)
  })

  it('leve une erreur typee sur un GPX sans trace exploitable', () => {
    expect(() => parseGpx('<?xml version="1.0"?><gpx></gpx>')).toThrow(GpxTcxParseError)
  })

  it('ne resout jamais une entite externe (XXE neutralise)', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<gpx><trk><trkseg><trkpt lat="1" lon="1"><ele>&xxe;</ele><time>2026-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>`
    // processEntities:false => l'entite n'est pas resolue ; soit le
    // champ est ignore (NaN filtre), soit le parsing echoue proprement
    // — dans tous les cas, aucun contenu de /etc/passwd n'apparait.
    let result: ReturnType<typeof parseGpx> | undefined
    try {
      result = parseGpx(xxe)
    } catch (e) {
      expect(e).toBeInstanceOf(GpxTcxParseError)
      return
    }
    expect(JSON.stringify(result)).not.toContain('root:')
  })
})

describe('parseTcx', () => {
  it('agrege les laps en un resume de seance', () => {
    const r = parseTcx(SAMPLE_TCX)
    expect(r.startedAt).toBe('2026-07-01T06:00:00Z')
    expect(r.durationS).toBe(1800)
    expect(r.distanceM).toBe(5000)
    expect(r.avgHr).toBe(150)
    expect(r.maxHr).toBe(172)
    expect(r.hasHeartRate).toBe(true)
    expect(r.hasGps).toBe(true)
  })

  it('leve une erreur typee sur un TCX sans activite', () => {
    expect(() =>
      parseTcx('<?xml version="1.0"?><TrainingCenterDatabase><Activities/></TrainingCenterDatabase>'),
    ).toThrow(GpxTcxParseError)
  })
})
