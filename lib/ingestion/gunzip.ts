// =============================================================
// Decompression GZIP defensive.
// =============================================================
// Les fichiers `.fit.gz` (et certains `.gz` ambigus, question N4)
// de l'archive Strava sont un flux gzip contenant un FIT. Le ZIP
// externe est deja passe par les garde-fous de zip-reader.ts ; ce
// module protege la COUCHE GZIP INTERNE avec la meme logique
// (doc 02 §2.1.1) : `maxOutputLength` de Node fait echouer
// proprement plutot que d'allouer sans limite.
// =============================================================

import { gunzipSync } from 'node:zlib'

const MAX_GUNZIPPED_BYTES = 50 * 1024 * 1024 // aligne sur la taille max FIT (doc 02 §1.1)

export class GunzipError extends Error {}

export function safeGunzip(buffer: Buffer): Buffer {
  try {
    return gunzipSync(buffer, { maxOutputLength: MAX_GUNZIPPED_BYTES })
  } catch {
    throw new GunzipError('flux gzip invalide ou trop volumineux une fois decompresse')
  }
}
