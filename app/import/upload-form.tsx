'use client'

import { useRef, useState, useTransition } from 'react'
import * as tus from 'tus-js-client'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { createImportUpload, createImportPartUploadUrl, processImport } from './actions'
import { IMPORT_PART_SIZE_BYTES } from './constants'

const BUCKET = 'import-quarantine'

// Le hostname direct du storage (pas l'URL API generique) est recommande par
// Supabase pour les uploads resumables — voir doc "Resumable uploads".
const SUPABASE_PROJECT_ID = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
const TUS_ENDPOINT = `https://${SUPABASE_PROJECT_ID}.storage.supabase.co/storage/v1/upload/resumable`

// Impose par Supabase pour les uploads resumables : "it must be set to 6MB
// (for now) do not change it".
const TUS_CHUNK_SIZE = 6 * 1024 * 1024

type Step = 'idle' | 'uploading' | 'upload-failed' | 'processing'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  const units = ['Ko', 'Mo', 'Gio']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

export function UploadForm() {
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [bytesUploaded, setBytesUploaded] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [partsLabel, setPartsLabel] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<File | null>(null)
  const importIdRef = useRef<string | null>(null)
  const totalPartsRef = useRef<number | null>(null)
  const currentPartIndexRef = useRef(0)

  // Le flux resumable de Supabase Storage exige les deux : le token de
  // signed-upload-url (`x-signature`, scope l'ecriture a ce chemin precis)
  // ET l'access_token de session (`authorization`, identifie le role
  // authenticated pour la RLS du bucket). Verifie empiriquement — la doc
  // Supabase ne montre jamais les deux combines dans un seul exemple.
  // L'access_token expire (1h par defaut) bien avant qu'un upload de
  // plusieurs Go ne se termine sur une connexion lente : on le relit avant
  // chaque morceau pour repartir avec un token frais.
  async function getAccessToken(): Promise<string> {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expiree, reconnecte-toi.')
    return session.access_token
  }

  // Upload d'un seul morceau. Un fingerprint stable (pas celui par defaut
  // de tus-js-client, pense pour des File et pas des Blob issus de
  // `.slice()`) permet a `findPreviousUploads` de retrouver un morceau
  // interrompu et de reprendre exactement au bon octet, meme apres un
  // rechargement de page.
  async function uploadPart(
    file: File,
    importId: string,
    partIndex: number,
    onPartProgress: (uploaded: number, total: number) => void,
  ): Promise<void> {
    const start = partIndex * IMPORT_PART_SIZE_BYTES
    const end = Math.min(start + IMPORT_PART_SIZE_BYTES, file.size)
    const blob = file.slice(start, end)

    const partFormData = new FormData()
    partFormData.set('import_id', importId)
    partFormData.set('part_index', String(partIndex))
    const { path, token } = await createImportPartUploadUrl(partFormData)
    const accessToken = await getAccessToken()

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(blob, {
        endpoint: TUS_ENDPOINT,
        headers: { authorization: `Bearer ${accessToken}`, 'x-signature': token, 'x-upsert': 'true' },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        chunkSize: TUS_CHUNK_SIZE,
        fingerprint: async () => `cairn-import-${importId}-part-${partIndex}`,
        metadata: {
          bucketName: BUCKET,
          objectName: path,
          contentType: 'application/octet-stream',
          cacheControl: '3600',
        },
        onProgress: onPartProgress,
        onError: reject,
        onSuccess: () => resolve(),
      })
      upload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
    })
  }

  // Enchaine les morceaux a partir de `fromPart` (0 au premier essai, ou
  // le morceau qui a echoue lors d'une reprise). Un echec sur un morceau ne
  // fait perdre que ce morceau : les precedents restent acquis cote
  // Storage, et `currentPartIndexRef` garde la position pour la reprise.
  async function runUpload(file: File, importId: string, totalParts: number, fromPart: number) {
    for (let i = fromPart; i < totalParts; i += 1) {
      currentPartIndexRef.current = i
      setPartsLabel(`morceau ${i + 1} / ${totalParts}`)
      const completedBytes = i * IMPORT_PART_SIZE_BYTES
      await uploadPart(file, importId, i, (uploaded) => {
        setBytesUploaded(Math.min(completedBytes + uploaded, file.size))
      })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Choisis une archive .zip.')
      return
    }
    fileRef.current = file
    setError(null)
    setBytesUploaded(0)
    setBytesTotal(file.size)

    startTransition(async () => {
      try {
        setStep('uploading')
        const createFormData = new FormData()
        createFormData.set('filename', file.name)
        createFormData.set('size', String(file.size))
        const { importId, totalParts } = await createImportUpload(createFormData)
        importIdRef.current = importId
        totalPartsRef.current = totalParts

        await runUpload(file, importId, totalParts, 0)

        setStep('processing')
        setPartsLabel(null)
        const processFormData = new FormData()
        processFormData.set('import_id', importId)
        processFormData.set('total_parts', String(totalParts))
        await processImport(processFormData) // redirige vers /import/[id]
      } catch (err) {
        setStep((prev) => (prev === 'uploading' ? 'upload-failed' : 'idle'))
        setError(err instanceof Error ? err.message : "Echec de l'import.")
      }
    })
  }

  function handleRetry() {
    const file = fileRef.current
    const importId = importIdRef.current
    const totalParts = totalPartsRef.current
    if (!file || !importId || !totalParts) return
    setError(null)

    startTransition(async () => {
      try {
        setStep('uploading')
        await runUpload(file, importId, totalParts, currentPartIndexRef.current)

        setStep('processing')
        setPartsLabel(null)
        const processFormData = new FormData()
        processFormData.set('import_id', importId)
        processFormData.set('total_parts', String(totalParts))
        await processImport(processFormData)
      } catch (err) {
        setStep('upload-failed')
        setError(err instanceof Error ? err.message : "Echec de l'envoi.")
      }
    })
  }

  const busy = isPending || step === 'uploading' || step === 'processing'
  const progressPct = bytesTotal > 0 ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)) : 0

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="block text-sm text-granit" htmlFor="archive">
          Archive Strava (export Bulk Data, fichier .zip)
        </label>
        <input
          ref={inputRef}
          id="archive"
          type="file"
          accept=".zip"
          disabled={busy}
          className="mt-2 block w-full text-sm text-schiste"
        />
      </div>

      {error && (
        <p className="rounded-data bg-craie p-3 text-sm text-ocre">Erreur : {error}</p>
      )}

      {(step === 'uploading' || step === 'upload-failed') && bytesTotal > 0 && (
        <div className="rounded-data bg-craie p-3">
          <div className="h-2 w-full overflow-hidden rounded-data bg-brume">
            <div className="h-full bg-schiste" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-sm tabular-nums text-schiste">
            {formatBytes(bytesUploaded)} / {formatBytes(bytesTotal)} — {progressPct}%
            {partsLabel && ` (${partsLabel})`}
            {step === 'uploading' && ' — envoi en cours'}
            {step === 'upload-failed' && ' — envoi interrompu'}
          </p>
          <p className="mt-1 text-xs text-granit">
            L&apos;archive est envoyée par morceaux ; l&apos;envoi reprend au morceau
            interrompu en cas de coupure réseau — inutile de recommencer depuis le début.
          </p>
        </div>
      )}

      {step === 'processing' && (
        <p className="rounded-data bg-craie p-3 text-sm text-schiste">
          Archive reçue, extraction et analyse en cours...
        </p>
      )}

      {step === 'upload-failed' ? (
        <button
          type="button"
          onClick={handleRetry}
          disabled={isPending}
          className="rounded-data bg-schiste px-3 py-2 text-sm text-craie disabled:opacity-50"
        >
          Reprendre l&apos;envoi
        </button>
      ) : (
        <button
          type="submit"
          disabled={busy}
          className="rounded-data bg-schiste px-3 py-2 text-sm text-craie disabled:opacity-50"
        >
          Importer l&apos;archive
        </button>
      )}

      <p className="text-xs italic text-granit">
        Seuls l&apos;index (activities.csv) et les fichiers d&apos;activité
        (.fit/.gpx/.tcx) sont lus. Contacts, photos, followers et posts de
        l&apos;archive sont ignorés et jamais écrits en base.
      </p>
    </form>
  )
}
