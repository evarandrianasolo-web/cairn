// =============================================================
// Orchestrateur : archive Strava (bulk export) -> activites normalisees.
// =============================================================
// Pur, sans effet de bord DB — ne fait que lire, decompresser,
// parser, normaliser. L'ecriture en base (dedup contre l'existant,
// insert/replace, journalisation) vit dans apply-import.ts, qui
// reste le seul endroit a toucher `activities`/`activity_health`.
// =============================================================

import { scanStravaArchive } from './zip-reader'
import { detectFormat } from './magic-bytes'
import { safeGunzip, GunzipError } from './gunzip'
import { parseFitFile, FitParseError } from './parsers/fit'
import { parseGpx, parseTcx, GpxTcxParseError } from './parsers/gpx-tcx'
import { parseStravaActivitiesCsv } from './parsers/activities-csv'
import { fromFitSummary, fromTrackSummary, csvRowToContext, normalizeFromFile, normalizeFromCsvOnly } from './normalize'
import { parseFrenchStravaDate } from './csv-date'
import type { NormalizedActivity, ImportEvent } from './types'

export type ProcessArchiveResult = {
  activities: NormalizedActivity[]
  events: ImportEvent[]
}

const ARCHIVE_INDEX_FILE = 'activities.csv'

function guessXmlKind(text: string): 'gpx' | 'tcx' | 'unknown' {
  const head = text.slice(0, 500).toLowerCase()
  if (head.includes('<gpx')) return 'gpx'
  if (head.includes('trainingcenterdatabase')) return 'tcx'
  return 'unknown'
}

function normalizeArchivePath(p: string): string {
  return p.replace(/\\/g, '/').trim().toLowerCase()
}

export async function processStravaArchive(
  zipBuffer: Buffer,
  tenantId: string,
): Promise<ProcessArchiveResult> {
  const events: ImportEvent[] = []
  const activities: NormalizedActivity[] = []

  const scan = await scanStravaArchive(zipBuffer)
  for (const skipped of scan.skipped) {
    events.push({ filePath: skipped.path, event: 'ignored_not_whitelisted', message: skipped.reason })
  }
  if (scan.aborted) {
    events.push({ event: 'rejected_format', message: `archive interrompue : ${scan.abortReason}` })
  }

  const csvEntry = scan.accepted.find((e) => normalizeArchivePath(e.path) === ARCHIVE_INDEX_FILE)
  const csvRowsByFilename = new Map<string, Record<string, string>>()
  const csvRowsUnmatched: Record<string, string>[] = []

  if (csvEntry) {
    const parsed = parseStravaActivitiesCsv(csvEntry.buffer.toString('utf8'))
    for (const r of parsed.rows) {
      if (!r.ok) {
        events.push({
          filePath: ARCHIVE_INDEX_FILE,
          event: 'rejected_format',
          message: `ligne ${r.index} : ${r.reason}`,
        })
        continue
      }
      const filename = r.row.strava_source_filename ? normalizeArchivePath(r.row.strava_source_filename) : undefined
      if (filename) {
        csvRowsByFilename.set(filename, r.row)
      } else {
        csvRowsUnmatched.push(r.row)
      }
    }
  }

  const activityFiles = scan.accepted.filter((e) => normalizeArchivePath(e.path) !== ARCHIVE_INDEX_FILE)
  const consumedFilenames = new Set<string>()

  for (const entry of activityFiles) {
    const key = normalizeArchivePath(entry.path)
    const csvRow = csvRowsByFilename.get(key)
    if (csvRow) consumedFilenames.add(key)
    const csvContext = csvRow ? csvRowToContext(csvRow) : undefined

    try {
      let payload = entry.buffer
      let format = detectFormat(payload)

      if (format === 'gzip') {
        payload = safeGunzip(payload)
        format = detectFormat(payload)
      }

      if (format === 'fit') {
        const summary = await parseFitFile(payload)
        activities.push(
          normalizeFromFile(fromFitSummary(summary), csvContext, {
            tenantId,
            sourceFilename: entry.path,
            payload,
          }),
        )
        continue
      }

      if (format === 'xml') {
        const text = payload.toString('utf8')
        const kind = guessXmlKind(text)
        if (kind === 'gpx') {
          const summary = parseGpx(text)
          activities.push(
            normalizeFromFile(fromTrackSummary(summary), csvContext, {
              tenantId,
              sourceFilename: entry.path,
              payload,
            }),
          )
          continue
        }
        if (kind === 'tcx') {
          const summary = parseTcx(text)
          activities.push(
            normalizeFromFile(fromTrackSummary(summary), csvContext, {
              tenantId,
              sourceFilename: entry.path,
              payload,
            }),
          )
          continue
        }
        events.push({ filePath: entry.path, event: 'rejected_format', message: 'XML non reconnu (ni GPX ni TCX)' })
        continue
      }

      events.push({ filePath: entry.path, event: 'rejected_format', message: `format non reconnu (${format})` })
    } catch (err) {
      const message =
        err instanceof FitParseError || err instanceof GpxTcxParseError || err instanceof GunzipError
          ? err.message
          : 'echec de parsing inattendu'
      events.push({ filePath: entry.path, event: 'rejected_format', message })
    }
  }

  // Lignes CSV sans fichier associe (rare, cf. normalize.ts) : Strava
  // autorise des activites saisies sans trace.
  const leftoverRows = [
    ...csvRowsUnmatched,
    ...[...csvRowsByFilename.entries()]
      .filter(([filename]) => !consumedFilenames.has(filename))
      .map(([, row]) => row),
  ]
  for (const row of leftoverRows) {
    const startedAt = parseFrenchStravaDate(row.started_at_date ?? '', row.started_at_time)
    if (!startedAt) {
      events.push({ event: 'rejected_format', message: `ligne CSV sans fichier et sans date exploitable (id ${row.strava_activity_id ?? '?'})` })
      continue
    }
    const activity = normalizeFromCsvOnly(row, startedAt, { tenantId })
    if (activity) activities.push(activity)
  }

  return { activities, events }
}
