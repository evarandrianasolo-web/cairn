import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function key(): Buffer {
  const raw = process.env.STRAVA_TOKEN_KEY
  if (!raw) {
    throw new Error(
      'STRAVA_TOKEN_KEY absent. Générer avec `openssl rand -base64 32` ' +
        'et renseigner dans .env.local.',
    )
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error(
      'STRAVA_TOKEN_KEY doit décoder à 32 octets exactement (AES-256). ' +
        `Longueur actuelle : ${buf.length}.`,
    )
  }
  return buf
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, enc, tag]).toString('base64')
}

export function decrypt(cipher: string): string {
  const buf = Buffer.from(cipher, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
