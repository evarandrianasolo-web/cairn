// =============================================================
// Lecture securisee d'une archive Bulk Export Strava.
// =============================================================
// Doc 02 §2.1 — quatre classes d'attaque a couvrir : zip bomb, zip
// slip, fichiers hors perimetre, metadonnees falsifiees.
//
// Design cle : on n'ecrit JAMAIS un fichier extrait sur disque avec
// un chemin fourni par l'archive. Les entrees whitelistees sont
// lues en flux et rendues en memoire (Buffer). Zip slip / path
// traversal devient donc structurellement impossible ici, pas
// seulement filtre — il n'y a pas de deuxieme cible sur laquelle
// l'attaque pourrait porter.
// =============================================================

import yauzl from 'yauzl'
import { isWhitelistedArchiveEntry } from './whitelist'

const MAX_ENTRIES = 100_000
// Taille decompressee totale de l'archive — doc 02 §2.1.1.
const MAX_TOTAL_UNCOMPRESSED_BYTES = 5 * 1024 ** 3
// Une activite individuelle (FIT/GPX/TCX) ne depasse jamais quelques
// Mo dans la vraie vie ; grande marge pour ne pas rejeter a tort.
const MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
// Ratio OWASP standard — un FIT gzippe fait 3-5:1, un CSV 10-20:1.
const MAX_COMPRESSION_RATIO = 100

export type ExtractedEntry = { path: string; buffer: Buffer }

export type SkippedEntry = {
  path: string
  reason: 'not_whitelisted' | 'size_exceeded' | 'ratio_exceeded' | 'stream_error'
}

export type ArchiveScanResult = {
  accepted: ExtractedEntry[]
  skipped: SkippedEntry[]
  aborted: boolean
  abortReason?: 'entry_count_exceeded' | 'total_size_exceeded'
}

export function scanStravaArchive(zipBuffer: Buffer): Promise<ArchiveScanResult> {
  return new Promise((resolve, reject) => {
    const accepted: ExtractedEntry[] = []
    const skipped: SkippedEntry[] = []
    let totalUncompressed = 0
    let entryCount = 0
    let settled = false

    const settle = (result: ArchiveScanResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('archive illisible'))
        return
      }

      zipfile.on('error', (streamErr) => {
        if (!settled) reject(streamErr)
      })

      zipfile.on('end', () => settle({ accepted, skipped, aborted: false }))

      zipfile.on('entry', (entry) => {
        entryCount += 1
        if (entryCount > MAX_ENTRIES) {
          zipfile.close()
          settle({ accepted, skipped, aborted: true, abortReason: 'entry_count_exceeded' })
          return
        }

        // Repertoire : rien a lire, mais on continue le scan.
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry()
          return
        }

        if (!isWhitelistedArchiveEntry(entry.fileName)) {
          skipped.push({ path: entry.fileName, reason: 'not_whitelisted' })
          zipfile.readEntry()
          return
        }

        if (entry.uncompressedSize > MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES) {
          skipped.push({ path: entry.fileName, reason: 'size_exceeded' })
          zipfile.readEntry()
          return
        }

        if (entry.compressedSize > 0) {
          const ratio = entry.uncompressedSize / entry.compressedSize
          if (ratio > MAX_COMPRESSION_RATIO) {
            skipped.push({ path: entry.fileName, reason: 'ratio_exceeded' })
            zipfile.readEntry()
            return
          }
        }

        totalUncompressed += entry.uncompressedSize
        if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
          zipfile.close()
          settle({ accepted, skipped, aborted: true, abortReason: 'total_size_exceeded' })
          return
        }

        zipfile.openReadStream(entry, (openErr, readStream) => {
          if (openErr || !readStream) {
            skipped.push({ path: entry.fileName, reason: 'stream_error' })
            zipfile.readEntry()
            return
          }

          const chunks: Buffer[] = []
          let receivedBytes = 0
          let entryFailed = false

          readStream.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length
            // Defense en profondeur : meme si l'en-tete ZIP ment sur
            // la taille annoncee, on coupe au flux reel.
            if (receivedBytes > MAX_SINGLE_ENTRY_UNCOMPRESSED_BYTES) {
              entryFailed = true
              readStream.destroy()
            } else {
              chunks.push(chunk)
            }
          })

          readStream.on('close', () => {
            if (entryFailed) {
              skipped.push({ path: entry.fileName, reason: 'size_exceeded' })
            } else {
              accepted.push({ path: entry.fileName, buffer: Buffer.concat(chunks) })
            }
            zipfile.readEntry()
          })

          readStream.on('error', () => {
            entryFailed = true
          })
        })
      })

      zipfile.readEntry()
    })
  })
}
