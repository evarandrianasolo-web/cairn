'use client'

import { useRef, useState, useTransition } from 'react'
import * as tus from 'tus-js-client'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { createImportUpload, processImport } from './actions'

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
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<tus.Upload | null>(null)
  const importIdRef = useRef<string | null>(null)
  const signatureTokenRef = useRef<string | null>(null)

  // Le flux resumable de Supabase Storage exige les deux : le token de
  // signed-upload-url (`x-signature`, scope l'ecriture a ce chemin precis)
  // ET l'access_token de session (`authorization`, identifie le role
  // authenticated pour la RLS du bucket). Verifie empiriquement — la doc
  // Supabase ne montre jamais les deux combines dans un seul exemple.
  // L'access_token expire (1h par defaut) bien avant qu'un upload de
  // plusieurs Go ne se termine sur une connexion lente : on le relit a
  // chaque tentative pour repartir avec un token frais.
  async function getAccessToken(): Promise<string> {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expiree, reconnecte-toi.')
    return session.access_token
  }

  // Demarre (ou reprend, si un upload interrompu correspond deja a ce
  // fichier) l'upload TUS, puis declenche le traitement serveur une fois
  // les octets recus. Reutilise pour le premier essai et pour "Reessayer".
  function startOrResumeUpload(upload: tus.Upload) {
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }
      upload.start()
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Choisis une archive .zip.')
      return
    }
    setError(null)
    setBytesUploaded(0)
    setBytesTotal(file.size)

    startTransition(async () => {
      try {
        setStep('uploading')
        const createFormData = new FormData()
        createFormData.set('filename', file.name)
        createFormData.set('size', String(file.size))
        const { importId, path, token } = await createImportUpload(createFormData)
        importIdRef.current = importId
        signatureTokenRef.current = token
        const accessToken = await getAccessToken()

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: TUS_ENDPOINT,
            headers: { authorization: `Bearer ${accessToken}`, 'x-signature': token, 'x-upsert': 'true' },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            chunkSize: TUS_CHUNK_SIZE,
            metadata: {
              bucketName: BUCKET,
              objectName: path,
              contentType: 'application/zip',
              cacheControl: '3600',
            },
            onProgress: (uploaded, total) => {
              setBytesUploaded(uploaded)
              setBytesTotal(total)
            },
            onError: (err) => {
              uploadRef.current = upload
              reject(err)
            },
            onSuccess: () => resolve(),
          })
          uploadRef.current = upload
          startOrResumeUpload(upload)
        })

        setStep('processing')
        const processFormData = new FormData()
        processFormData.set('import_id', importId)
        await processImport(processFormData) // redirige vers /import/[id]
      } catch (err) {
        setStep((prev) => (prev === 'uploading' ? 'upload-failed' : 'idle'))
        setError(err instanceof Error ? err.message : "Echec de l'import.")
      }
    })
  }

  function handleRetry() {
    const upload = uploadRef.current
    const importId = importIdRef.current
    const signatureToken = signatureTokenRef.current
    if (!upload || !importId || !signatureToken) return
    setError(null)

    startTransition(async () => {
      try {
        setStep('uploading')
        const accessToken = await getAccessToken()
        await new Promise<void>((resolve, reject) => {
          upload.options.headers = {
            authorization: `Bearer ${accessToken}`,
            'x-signature': signatureToken,
            'x-upsert': 'true',
          }
          upload.options.onError = (err) => reject(err)
          upload.options.onSuccess = () => resolve()
          startOrResumeUpload(upload)
        })

        setStep('processing')
        const processFormData = new FormData()
        processFormData.set('import_id', importId)
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
            {step === 'uploading' && ' — envoi en cours'}
            {step === 'upload-failed' && ' — envoi interrompu'}
          </p>
          <p className="mt-1 text-xs text-granit">
            L&apos;envoi reprend a l&apos;octet ou il s&apos;est arrete en cas de coupure
            reseau — inutile de recommencer depuis le debut.
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
