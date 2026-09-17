'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { processStravaArchive } from '@/lib/ingestion/process-archive'
import { applyImport } from '@/lib/ingestion/apply-import'

const BUCKET = 'import-quarantine'
const MAX_ARCHIVE_BYTES = 3 * 1024 ** 3 // 3 Go — voir doc 02 §1.1, revise a la hausse
// par rapport au brouillon initial (500 Mo) au vu du spike reel (archive de
// 2,44 Gio sur un compte de 4+ ans, doc 07-spike-resultats.md).

export type CreateImportUploadResult = {
  importId: string
  path: string
  token: string
}

/**
 * Cree la ligne `imports` et un token d'upload signe. L'upload des
 * octets se fait ensuite directement navigateur -> Storage en TUS
 * resumable (pas via ce serveur) : une archive de plusieurs Go ne
 * doit jamais transiter par une Server Action, qui a des limites de
 * taille de requete. Le token retourne par `createSignedUploadUrl`
 * est le meme que Supabase Storage accepte dans l'en-tete
 * `x-signature` du flux resumable (doc Supabase "Resumable uploads"
 * §Signed upload URLs) : pas besoin d'un token different pour TUS.
 */
export async function createImportUpload(formData: FormData): Promise<CreateImportUploadResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const filename = String(formData.get('filename') ?? '').trim()
  const size = Number(formData.get('size') ?? 0)

  if (!filename.toLowerCase().endsWith('.zip')) {
    throw new Error('Seule une archive .zip est acceptee (export Bulk Strava).')
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ARCHIVE_BYTES) {
    throw new Error(`Fichier invalide ou trop volumineux (max ${MAX_ARCHIVE_BYTES / 1024 ** 3} Go).`)
  }

  const { data: importRow, error: insErr } = await supabase
    .from('imports')
    .insert({
      tenant_id: user.id,
      source_kind: 'zip',
      filename_original: filename,
      size_bytes: size,
      outcome: 'in_progress',
    })
    .select('id')
    .single()
  if (insErr) throw new Error(`creation import: ${insErr.message}`)

  const path = `${user.id}/${importRow.id}.zip`
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)
  if (signErr) throw new Error(`url d'upload: ${signErr.message}`)

  return { importId: importRow.id as string, path, token: signed.token }
}

/**
 * Declenchee par le client une fois l'upload direct vers Storage
 * termine. Telecharge l'archive depuis la quarantaine, fait tourner
 * le pipeline, ecrit en base, purge le fichier source (doc 03 §7,
 * option A : purge par defaut).
 */
export async function processImport(formData: FormData): Promise<never> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const importId = String(formData.get('import_id') ?? '').trim()
  if (!importId) throw new Error('import_id manquant')

  const { data: importRow, error: readErr } = await supabase
    .from('imports')
    .select('id')
    .eq('id', importId)
    .maybeSingle()
  if (readErr) throw new Error(`lecture import: ${readErr.message}`)
  if (!importRow) redirect('/import')

  const path = `${user.id}/${importId}.zip`

  try {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path)
    if (dlErr || !blob) throw new Error(`telechargement archive: ${dlErr?.message ?? 'introuvable'}`)

    const buffer = Buffer.from(await blob.arrayBuffer())
    const { activities, events } = await processStravaArchive(buffer, user.id)
    await applyImport(supabase, { tenantId: user.id, importId, activities, parseEvents: events })
  } catch (err) {
    await supabase
      .from('imports')
      .update({
        finished_at: new Date().toISOString(),
        outcome: 'failed',
        error_summary: err instanceof Error ? err.message : 'erreur inattendue',
      })
      .eq('id', importId)
  } finally {
    // Le fichier source ne survit jamais a la tentative de traitement,
    // reussie ou non — c'est une zone de transit, pas un stockage.
    await supabase.storage.from(BUCKET).remove([path])
  }

  revalidatePath('/activities')
  redirect(`/import/${importId}`)
}
