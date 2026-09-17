// =============================================================
// Detection du format reel par magic bytes.
// =============================================================
// Doc 02 §1.4 : jamais se fier a l'extension seule. Un '.fit' avec
// des magic bytes de ZIP est un rejet motive, pas une tentative de
// parsing.
// =============================================================

export type DetectedFormat = 'zip' | 'gzip' | 'fit' | 'xml' | 'unknown'

export function detectFormat(buffer: Buffer): DetectedFormat {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'zip'
  }

  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return 'gzip'
  }

  // Header FIT : octet 0 = taille du header, 8-11 = ASCII ".FIT".
  if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === '.FIT') {
    return 'fit'
  }

  // XML (GPX/TCX) — piege connu : le TCX genere par Strava peut
  // commencer par un espace ou un BOM avant '<?xml'. Doc 02 §2.2.3.
  const head = buffer
    .subarray(0, 64)
    .toString('utf8')
    .replace(/^﻿/, '')
    .trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<')) {
    return 'xml'
  }

  return 'unknown'
}
