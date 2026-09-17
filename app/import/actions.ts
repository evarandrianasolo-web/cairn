'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { processStravaArchive } from '@/lib/ingestion/process-archive'
import { applyImport } from '@/lib/ingestion/apply-import'
import { IMPORT_PART_SIZE_BYTES } from './constants'

const BUCKET = 'import-quarantine'
const MAX_ARCHIVE_BYTES = 3 * 1024 ** 3 // 3 Go — voir doc 02 §1.1, revise a la hausse
// par rapport au brouillon initial (500 Mo) au vu du spike reel (archive de
// 2,44 Gio sur un compte de 4+ ans, doc 07-spike-resultats.md).

function partPath(userId: string, importId: string, partIndex: number): string {
  return `${userId}/${importId}/part-${partIndex}`
}

export type CreateImportUploadResult = {
  importId: string
  totalParts: number
}

/**
 * Cree la ligne `imports`. L'upload des octets se fait ensuite directement
 * navigateur -> Storage (pas via ce serveur, qui a des limites de taille de
 * requete), en plusieurs morceaux — voir `createImportPartUploadUrl`. Le
 * decoupage n'est pas un choix d'architecture, c'est une contrainte du plan
 * Supabase Free (limite globale d'upload a 50 Mio, non contournable
 * autrement que par un upgrade de plan — doc 09).
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

  const totalParts = Math.max(1, Math.ceil(size / IMPORT_PART_SIZE_BYTES))

  return { importId: importRow.id as string, totalParts }
}

export type CreatePartUploadResult = {
  path: string
  token: string
}

/**
 * Un token d'upload signe par morceau. Appelee une fois par morceau cote
 * client, dans l'ordre — chaque morceau est un objet Storage independant,
 * donc son propre flux TUS resumable independant (une coupure reseau ne
 * fait perdre au pire que le morceau en cours, pas tout le transfert).
 */
export async function createImportPartUploadUrl(formData: FormData): Promise<CreatePartUploadResult> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const importId = String(formData.get('import_id') ?? '').trim()
  const partIndex = Number(formData.get('part_index') ?? -1)
  if (!importId || !Number.isInteger(partIndex) || partIndex < 0) {
    throw new Error('parametres de morceau invalides')
  }

  const { data: importRow, error: readErr } = await supabase
    .from('imports')
    .select('id')
    .eq('id', importId)
    .maybeSingle()
  if (readErr) throw new Error(`lecture import: ${readErr.message}`)
  if (!importRow) throw new Error('import introuvable')

  const path = partPath(user.id, importId, partIndex)
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)
  if (signErr) throw new Error(`url d'upload: ${signErr.message}`)

  return { path, token: signed.token }
}

/**
 * Declenchee par le client une fois tous les morceaux uploades. Telecharge
 * et reassemble l'archive depuis la quarantaine, fait tourner le pipeline,
 * ecrit en base, purge les morceaux source (doc 03 §7, option A : purge par
 * defaut).
 */
export async function processImport(formData: FormData): Promise<never> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const importId = String(formData.get('import_id') ?? '').trim()
  const totalParts = Number(formData.get('total_parts') ?? 0)
  if (!importId) throw new Error('import_id manquant')
  if (!Number.isInteger(totalParts) || totalParts < 1) throw new Error('total_parts invalide')

  const { data: importRow, error: readErr } = await supabase
    .from('imports')
    .select('id')
    .eq('id', importId)
    .maybeSingle()
  if (readErr) throw new Error(`lecture import: ${readErr.message}`)
  if (!importRow) redirect('/import')

  const paths = Array.from({ length: totalParts }, (_, i) => partPath(user.id, importId, i))

  try {
    const chunks: Buffer[] = []
    for (const path of paths) {
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path)
      if (dlErr || !blob) throw new Error(`telechargement morceau ${path}: ${dlErr?.message ?? 'introuvable'}`)
      chunks.push(Buffer.from(await blob.arrayBuffer()))
    }
    const buffer = Buffer.concat(chunks)

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
    // Les morceaux source ne survivent jamais a la tentative de traitement,
    // reussie ou non — c'est une zone de transit, pas un stockage.
    await supabase.storage.from(BUCKET).remove(paths)
  }

  revalidatePath('/activities')
  redirect(`/import/${importId}`)
}
