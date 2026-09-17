// =============================================================
// Parseur GPX / TCX — durci contre XXE et billion laughs.
// =============================================================
// Doc 02 §2.2 : fast-xml-parser avec processEntities:false neutralise
// XXE et l'expansion d'entites — le parser ne resout aucune entite,
// il n'y a donc rien a exploiter. Ce wrapper est le SEUL point
// d'entree autorise vers fast-xml-parser dans ce projet : il impose
// la config, l'appelant ne peut pas la desactiver par erreur.
// =============================================================

import { XMLParser } from 'fast-xml-parser'

const MAX_XML_BYTES = 20 * 1024 * 1024 // doc 02 §2.2.4

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  allowBooleanAttributes: true,
})

export type ParsedTrackSummary = {
  startedAt: string // ISO 8601
  durationS: number
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  avgHr?: number
  maxHr?: number
  hasGps: boolean
  hasHeartRate: boolean
}

export class GpxTcxParseError extends Error {}

function stripLeadingNoise(xml: string): string {
  // Piege connu : le TCX genere par Strava peut commencer par un
  // espace avant '<?xml' (doc 02 §2.2.3 / Q9 spike).
  return xml.replace(/^﻿/, '').trimStart()
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function assertSize(xml: string): void {
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) {
    throw new GpxTcxParseError('fichier XML trop volumineux')
  }
}

export function parseGpx(xml: string): ParsedTrackSummary {
  assertSize(xml)
  const clean = stripLeadingNoise(xml)

  let doc: unknown
  try {
    doc = parser.parse(clean) as unknown
  } catch {
    throw new GpxTcxParseError('GPX illisible')
  }

  const root = doc as { gpx?: { trk?: unknown } }
  const tracks = asArray(root.gpx?.trk as unknown)
  const points: { lat: number; lon: number; ele?: number; time?: string; hr?: number }[] = []

  for (const trk of tracks) {
    const segments = asArray((trk as { trkseg?: unknown }).trkseg)
    for (const seg of segments) {
      const trkpts = asArray((seg as { trkpt?: unknown }).trkpt) as Record<string, unknown>[]
      for (const pt of trkpts) {
        const lat = Number(pt['@_lat'])
        const lon = Number(pt['@_lon'])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
        const ele = pt.ele !== undefined ? Number(pt.ele) : undefined
        const time = typeof pt.time === 'string' ? pt.time : undefined
        const ext = pt.extensions as Record<string, unknown> | undefined
        const hrRaw =
          (ext?.['gpxtpx:TrackPointExtension'] as Record<string, unknown> | undefined)?.[
            'gpxtpx:hr'
          ] ?? ext?.hr
        const hr = hrRaw !== undefined ? Number(hrRaw) : undefined
        points.push({ lat, lon, ele, time, hr: Number.isFinite(hr) ? hr : undefined })
      }
    }
  }

  if (points.length === 0) throw new GpxTcxParseError('GPX sans trace exploitable')

  let distanceM = 0
  let elevationGainM = 0
  let elevationLossM = 0
  for (let i = 1; i < points.length; i += 1) {
    distanceM += haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
    if (points[i].ele !== undefined && points[i - 1].ele !== undefined) {
      const delta = points[i].ele! - points[i - 1].ele!
      if (delta > 0) elevationGainM += delta
      else elevationLossM += Math.abs(delta)
    }
  }

  const times = points.map((p) => p.time).filter((t): t is string => !!t)
  const startedAt = times[0] ?? new Date().toISOString()
  const durationS =
    times.length >= 2
      ? Math.max(0, (new Date(times[times.length - 1]).getTime() - new Date(times[0]).getTime()) / 1000)
      : 0

  const hrSamples = points.map((p) => p.hr).filter((v): v is number => v !== undefined)

  return {
    startedAt,
    durationS,
    distanceM,
    elevationGainM,
    elevationLossM,
    avgHr: hrSamples.length > 0 ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) : undefined,
    maxHr: hrSamples.length > 0 ? Math.max(...hrSamples) : undefined,
    hasGps: true,
    hasHeartRate: hrSamples.length > 0,
  }
}

export function parseTcx(xml: string): ParsedTrackSummary {
  assertSize(xml)
  const clean = stripLeadingNoise(xml)

  let doc: unknown
  try {
    doc = parser.parse(clean) as unknown
  } catch {
    throw new GpxTcxParseError('TCX illisible')
  }

  const root = doc as { TrainingCenterDatabase?: { Activities?: { Activity?: unknown } } }
  const activities = asArray(root.TrainingCenterDatabase?.Activities?.Activity)
  if (activities.length === 0) throw new GpxTcxParseError('TCX sans activite exploitable')

  const activity = activities[0] as Record<string, unknown>
  const laps = asArray(activity.Lap) as Record<string, unknown>[]
  if (laps.length === 0) throw new GpxTcxParseError('TCX sans lap exploitable')

  let durationS = 0
  let distanceM = 0
  let weightedHrSum = 0
  let weightedHrTime = 0
  let maxHr: number | undefined
  let hasHeartRate = false
  let hasGps = false

  for (const lap of laps) {
    const lapDuration = Number(lap.TotalTimeSeconds ?? 0)
    const lapDistance = Number(lap.DistanceMeters ?? 0)
    durationS += Number.isFinite(lapDuration) ? lapDuration : 0
    distanceM += Number.isFinite(lapDistance) ? lapDistance : 0

    const avgHrValue = (lap.AverageHeartRateBpm as Record<string, unknown> | undefined)?.Value
    const maxHrValue = (lap.MaximumHeartRateBpm as Record<string, unknown> | undefined)?.Value
    const avgHr = avgHrValue !== undefined ? Number(avgHrValue) : undefined
    const lapMaxHr = maxHrValue !== undefined ? Number(maxHrValue) : undefined
    if (avgHr !== undefined && Number.isFinite(avgHr)) {
      weightedHrSum += avgHr * lapDuration
      weightedHrTime += lapDuration
      hasHeartRate = true
    }
    if (lapMaxHr !== undefined && Number.isFinite(lapMaxHr)) {
      maxHr = maxHr === undefined ? lapMaxHr : Math.max(maxHr, lapMaxHr)
      hasHeartRate = true
    }

    const trackpoints = asArray((lap.Track as Record<string, unknown> | undefined)?.Trackpoint)
    if (trackpoints.some((tp) => (tp as Record<string, unknown>).Position !== undefined)) {
      hasGps = true
    }
  }

  const startedAtRaw = activity.Id
  const startedAt = typeof startedAtRaw === 'string' ? startedAtRaw : new Date().toISOString()

  return {
    startedAt,
    durationS,
    distanceM,
    elevationGainM: 0, // non fiable au niveau lap TCX sans les trackpoints d'altitude
    elevationLossM: 0,
    avgHr: weightedHrTime > 0 ? Math.round(weightedHrSum / weightedHrTime) : undefined,
    maxHr,
    hasGps,
    hasHeartRate,
  }
}
