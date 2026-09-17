// =============================================================
// Parseur de activities.csv (index de l'archive Bulk Strava).
// =============================================================
// Doc 03 : le CSV apporte le contexte (RPE, notes, materiel, nom de
// fichier pour reconcilier avec activities/) — la donnee physio et
// GPS vient des FIT/GPX/TCX. Parse par POSITION (doc02 §2.1.3, N2) :
// les en-tetes sont dupliques dans le CSV Strava, un lookup par nom
// perdrait des colonnes.
// =============================================================

import { parse } from 'csv-parse/sync'
import { createHash } from 'node:crypto'
import {
  STRAVA_CSV_BLOCKED_POSITIONS,
  STRAVA_CSV_COLUMN_MAP,
  STRAVA_CSV_EXPECTED_COLUMN_COUNT,
} from '../csv-column-map'

export type CsvRowResult =
  | { ok: true; row: Record<string, string> }
  | { ok: false; reason: 'malformed_row' | 'blocked_field_present'; index: number }

export type CsvParseResult = {
  headerMatches: boolean
  headerHash: string
  rows: CsvRowResult[]
}

function hashHeader(header: string[]): string {
  return createHash('sha256').update(header.join('|')).digest('hex')
}

/**
 * `expected` = hash du header au moment ou le mapping courant a ete
 * valide (voir csv-columns-mapping.md). Absent = pas de comparaison
 * (premier appel de reference, ou test).
 */
export function parseStravaActivitiesCsv(csvText: string, expectedHeaderHash?: string): CsvParseResult {
  const records: string[][] = parse(csvText, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  })

  const header = records[0] ?? []
  const headerHash = hashHeader(header)
  const headerMatches = expectedHeaderHash === undefined ? true : headerHash === expectedHeaderHash

  const rows: CsvRowResult[] = []
  for (let i = 1; i < records.length; i += 1) {
    const raw = records[i]

    if (raw.length !== STRAVA_CSV_EXPECTED_COLUMN_COUNT) {
      rows.push({ ok: false, reason: 'malformed_row', index: i })
      continue
    }

    // Defense en profondeur : un champ BLOCKED avec une valeur non
    // vide est un signal que le mapping a derive (colonne deplacee)
    // — on rejette la ligne plutot que de risquer d'ecrire un poids
    // ou une calorie en base par une erreur de position.
    const hasBlockedValue = STRAVA_CSV_BLOCKED_POSITIONS.some((pos) => (raw[pos] ?? '').trim().length > 0)
    if (hasBlockedValue) {
      rows.push({ ok: false, reason: 'blocked_field_present', index: i })
      continue
    }

    const row: Record<string, string> = {}
    STRAVA_CSV_COLUMN_MAP.forEach((spec, position) => {
      if (spec.category === 'kept' && spec.field) {
        row[spec.field] = raw[position] ?? ''
      }
    })
    rows.push({ ok: true, row })
  }

  return { headerMatches, headerHash, rows }
}
