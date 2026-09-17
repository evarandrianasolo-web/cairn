// =============================================================
// Parseur FIT — wrapper autour de `fit-file-parser` (MIT).
// =============================================================
// Decision 16/09/2026 : `@garmin/fitsdk` ecarte. Sa licence est
// proprietaire Garmin ("usage commercial interne uniquement",
// interdiction de "rendre disponible a des tiers") — incompatible
// avec un usage SaaS sans lecture juridique dediee (question ouverte
// A5). `fit-file-parser` (MIT, github.com/jimmykane/fit-parser) est
// l'alternative deja identifiee par l'ADR ingestion comme solution
// de repli. Voir docs/architecture/ingestion/09-plan-bascule-execution.md.
//
// Limite connue vs le plan initial : cette librairie n'expose pas de
// `checkIntegrity()` distinct comme le SDK Garmin. Un fichier corrompu
// remonte une erreur de parsing generique — on le traite en rejet
// strict (doc 02 §2.3.1 mode strict), sans mode recuperation pour le
// moment. A revisiter si le besoin se confirme.
//
// Les types publies par `fit-file-parser` pour `ParsedFit` sont
// incomplets dans le paquet publie — d'ou le type structurel etroit
// ci-dessous plutot qu'un import du type de la lib.
// =============================================================

import FitParser from 'fit-file-parser'

const MAX_FIT_BYTES = 50 * 1024 * 1024 // doc 02 §1.1, taille max fichier isole
const PARSE_TIMEOUT_MS = 60_000 // doc 02 §3

export class FitParseError extends Error {}

type FitSession = {
  start_time?: string | Date
  total_elapsed_time?: number
  total_timer_time?: number
  total_distance?: number
  total_ascent?: number
  total_descent?: number
  avg_heart_rate?: number
  max_heart_rate?: number
  avg_cadence?: number
  sport?: string
  num_laps?: number
}

type FitParsedShape = {
  sessions?: FitSession[]
  laps?: unknown[]
}

export type ParsedFitSummary = {
  startedAt: string
  durationS: number
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  avgHr?: number
  maxHr?: number
  avgCadence?: number
  sportType?: string
  hasLaps: boolean
  hasHeartRate: boolean
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new FitParseError('parsing FIT trop long')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export async function parseFitFile(buffer: Buffer): Promise<ParsedFitSummary> {
  if (buffer.length > MAX_FIT_BYTES) {
    throw new FitParseError('fichier FIT trop volumineux')
  }

  const parser = new FitParser({
    force: true,
    speedUnit: 'm/s',
    lengthUnit: 'm',
    elapsedRecordField: true,
    mode: 'list',
  })

  // Le typage publie par la lib exige un ArrayBuffer strict (pas
  // SharedArrayBuffer) ; un Buffer Node est presque toujours adosse a
  // un ArrayBuffer reel, mais le typage generique de Buffer ne le
  // garantit pas au compilateur — on le rend explicite.
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer

  let parsed: FitParsedShape
  try {
    parsed = (await withTimeout(parser.parseAsync(arrayBuffer), PARSE_TIMEOUT_MS)) as unknown as FitParsedShape
  } catch {
    // Mode strict (doc 02 §2.3.1) : un FIT corrompu ou tronque est
    // rejete, pas recupere au mieux.
    throw new FitParseError('fichier FIT corrompu ou illisible')
  }

  const session = parsed.sessions?.[0]
  if (!session) {
    throw new FitParseError('FIT sans session exploitable')
  }

  const startedAt =
    session.start_time instanceof Date
      ? session.start_time.toISOString()
      : typeof session.start_time === 'string'
        ? session.start_time
        : undefined
  if (!startedAt) throw new FitParseError('FIT sans horodatage de depart')

  const durationS = session.total_timer_time ?? session.total_elapsed_time ?? 0
  const avgHr = session.avg_heart_rate
  const maxHr = session.max_heart_rate

  return {
    startedAt,
    durationS,
    distanceM: session.total_distance ?? 0,
    elevationGainM: session.total_ascent ?? 0,
    elevationLossM: session.total_descent ?? 0,
    avgHr,
    maxHr,
    avgCadence: session.avg_cadence,
    sportType: session.sport,
    hasLaps: (session.num_laps ?? 0) > 1 || (parsed.laps?.length ?? 0) > 1,
    hasHeartRate: avgHr !== undefined || maxHr !== undefined,
  }
}
