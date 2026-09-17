// =============================================================
// Liste blanche stricte de l'archive Bulk Export Strava.
// =============================================================
// Doc 02 §2.1.3 : c'est le controle le plus important pour la
// conformite, pas pour la securite. Une archive Strava contient des
// dizaines de categories de fichiers (contacts, photos, followers,
// posts...) pour lesquelles Cairn n'a aucune base legale de
// traitement. On n'extrait QUE l'index et les fichiers d'activite.
// =============================================================

const ARCHIVE_INDEX_FILE = 'activities.csv'
const ACTIVITY_DIR_PREFIX = 'activities/'

// Le spike du 27/07/2026 a trouve 449 '.gz' sans double extension
// visible en plus des 1434 '.fit.gz' — question N4 non tranchee.
// On les laisse passer la whitelist ; le detecteur de format
// (magic-bytes.ts) tranche ensuite s'il s'agit reellement d'un FIT
// gzippe ou d'autre chose (auquel cas le parseur rejette proprement).
const ALLOWED_EXTENSIONS = ['.fit.gz', '.fit', '.gpx', '.tcx', '.gz'] as const

/**
 * Vrai si le chemin d'entree d'archive fait partie du perimetre
 * traite par Cairn. Tout le reste doit etre ignore SANS etre lu,
 * y compris en memoire — voir zip-reader.ts.
 */
export function isWhitelistedArchiveEntry(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/')

  if (normalized === ARCHIVE_INDEX_FILE) return true

  if (!normalized.startsWith(ACTIVITY_DIR_PREFIX)) return false

  const rest = normalized.slice(ACTIVITY_DIR_PREFIX.length)
  if (rest.length === 0) return false
  // L'archive Strava met les fichiers d'activite a plat dans
  // activities/. Un chemin imbrique (ou une remontee ../) a cet
  // endroit est suspect — on ne descend jamais dans un sous-dossier.
  if (rest.includes('/') || rest.includes('..')) return false

  const lower = normalized.toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
