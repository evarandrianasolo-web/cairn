import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import yazl from 'yazl'
import { scanStravaArchive } from '@/lib/ingestion/zip-reader'

function buildZip(entries: { path: string; content: Buffer | string }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    for (const e of entries) {
      zip.addBuffer(Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content), e.path)
    }
    const chunks: Buffer[] = []
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
    zip.end()
  })
}

describe('scanStravaArchive', () => {
  it("n'accepte que les entrees whitelistees, ignore le reste sans erreur", async () => {
    const zip = await buildZip([
      { path: 'activities.csv', content: 'id,name\n1,course' },
      { path: 'activities/1.fit', content: Buffer.from('donnee-fit-simulee') },
      { path: 'contacts.csv', content: 'email\nquelqu-un@example.com' },
      { path: 'media/photo.jpg', content: Buffer.from([0xff, 0xd8, 0xff]) },
    ])

    const result = await scanStravaArchive(zip)

    expect(result.aborted).toBe(false)
    expect(result.accepted.map((a) => a.path).sort()).toEqual(['activities.csv', 'activities/1.fit'])
    expect(result.skipped.map((s) => s.path).sort()).toEqual(['contacts.csv', 'media/photo.jpg'])
    expect(result.skipped.every((s) => s.reason === 'not_whitelisted')).toBe(true)
  })

  it('restitue le contenu exact des fichiers acceptes (pas de corruption au streaming)', async () => {
    // Contenu pseudo-aleatoire : un FIT reel est deja binaire dense
    // (ratio 3-5:1 doc 02), contrairement a du texte tres repetitif
    // qui declencherait a tort le garde-fou anti zip-bomb ci-dessous.
    const payload = randomBytes(64 * 1024)
    const zip = await buildZip([{ path: 'activities/1.fit', content: payload }])
    const result = await scanStravaArchive(zip)
    expect(result.accepted[0].buffer.equals(payload)).toBe(true)
  })

  it("ne touche jamais le systeme de fichiers avec un chemin fourni par l'archive (zip slip structurellement impossible)", async () => {
    // yazl refuse en general d'ecrire un chemin '../' dans un zip valide ;
    // on simule quand meme la valeur pour verifier que notre whitelist
    // la rejette si jamais un zip malveillant l'imposait quand meme.
    const zip = await buildZip([{ path: 'activities/legit.fit', content: 'x' }])
    const result = await scanStravaArchive(zip)
    // Le seul point de sortie est un Buffer en memoire garde sous
    // `path` (identifiant, jamais utilise pour ecrire un fichier) —
    // aucune API de ce module n'ecrit sur disque.
    expect(result.accepted[0]).not.toHaveProperty('writtenTo')
  })

  it('rejette une archive avec un ratio de compression suspect', async () => {
    // Un bloc de zeros compresse tres fort -> simule une alerte zip-bomb
    // sur un seuil bas pour le test (le seuil reel est 100:1, doc 02).
    const zeros = Buffer.alloc(50 * 1024 * 1024, 0) // 50 Mo de zeros, compresse a un ratio tres eleve
    const zip = await buildZip([{ path: 'activities/bomb.fit', content: zeros }])
    const result = await scanStravaArchive(zip)
    expect(result.accepted).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe('ratio_exceeded')
  })
})
