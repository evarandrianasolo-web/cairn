// =============================================================
// Ecriture en base des activites normalisees d'un import.
// =============================================================
// Seul endroit du pipeline d'ingestion qui touche `activities` /
// `activity_health` / `imports` / `import_events`. Le client passe
// en parametre est TOUJOURS le client serveur authentifie (RLS
// active) — jamais un client admin. `tenant_id` est pose depuis le
// parametre `tenantId` fourni par l'appelant (session serveur),
// jamais depuis une valeur du fichier importe.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveDedupConflict } from './dedup'
import type { ImportEvent, NormalizedActivity } from './types'

export type ApplyImportSummary = {
  created: number
  replaced: number
  ignored: number
  rejected: number
}

type ExistingActivity = { id: string; dedup_signature: string | null; provenance: string }

function toDbRow(tenantId: string, importId: string, a: NormalizedActivity) {
  const avgPaceSPerKm =
    a.distanceM && a.distanceM > 0 && a.movingTimeS
      ? Number((a.movingTimeS / (a.distanceM / 1000)).toFixed(2))
      : null

  return {
    tenant_id: tenantId,
    import_id: importId,
    provenance: a.provenance,
    provenance_notes: a.provenanceNotes ?? null,
    content_hash: a.contentHash,
    dedup_signature: a.dedupSignature,
    name: a.name ?? null,
    sport_type: a.sportType ?? null,
    started_at: a.startedAt,
    distance_m: a.distanceM ?? null,
    // NB: activities n'a pas de colonne D- a ce jour (seule
    // activity_laps en porte une) — a.elevationLossM n'est donc pas
    // persiste au niveau activite. Pas une regression : ce champ
    // n'existait pas avant ce pipeline.
    elevation_gain_m: a.elevationGainM ?? null,
    moving_time_s: a.movingTimeS ?? null,
    elapsed_time_s: a.elapsedTimeS ?? null,
    avg_pace_s_per_km: avgPaceSPerKm,
    avg_cadence: a.avgCadence ?? null,
    user_notes: a.userNotes ?? null,
    has_gps: a.hasGps,
    has_heart_rate: a.hasHeartRate,
    has_cadence: a.hasCadence,
    has_laps: a.hasLaps,
  }
}

async function upsertHealth(
  supabase: SupabaseClient,
  tenantId: string,
  activityId: string,
  a: NormalizedActivity,
): Promise<void> {
  // Pattern etabli du projet (voir migration 20260722092912 et le
  // commit historique "activity_health en delete+insert au refresh") :
  // une mesure de sante ne se modifie pas, elle est recreee.
  await supabase.from('activity_health').delete().eq('activity_id', activityId)
  if (!a.health || (a.health.avgHr === undefined && a.health.maxHr === undefined)) return
  await supabase.from('activity_health').insert({
    tenant_id: tenantId,
    activity_id: activityId,
    avg_hr: a.health.avgHr ?? null,
    max_hr: a.health.maxHr ?? null,
  })
}

export async function applyImport(
  supabase: SupabaseClient,
  params: {
    tenantId: string
    importId: string
    activities: NormalizedActivity[]
    parseEvents: ImportEvent[]
  },
): Promise<ApplyImportSummary> {
  const { tenantId, importId, activities, parseEvents } = params

  // RLS filtre par tenant automatiquement — pas de .eq('tenant_id', ...)
  // ici, conformement a la regle CLAUDE.md d'isolation.
  const { data: existingRows, error: existingErr } = await supabase
    .from('activities')
    .select('id, dedup_signature, provenance')
    .is('deleted_at', null)
  if (existingErr) throw new Error(`applyImport lecture existant: ${existingErr.message}`)

  const existingBySignature = new Map<string, ExistingActivity>()
  for (const row of (existingRows ?? []) as ExistingActivity[]) {
    if (row.dedup_signature) existingBySignature.set(row.dedup_signature, row)
  }

  const events: ImportEvent[] = [...parseEvents]
  const summary: ApplyImportSummary = { created: 0, replaced: 0, ignored: 0, rejected: 0 }
  summary.rejected = parseEvents.filter((e) => e.event === 'rejected_format' || e.event === 'rejected_signature').length

  for (const activity of activities) {
    const existing = existingBySignature.get(activity.dedupSignature)

    if (!existing) {
      const { data: inserted, error: insErr } = await supabase
        .from('activities')
        .insert(toDbRow(tenantId, importId, activity))
        .select('id')
        .single()
      if (insErr) {
        events.push({ filePath: activity.sourceFilename, event: 'rejected_format', message: insErr.message })
        summary.rejected += 1
        continue
      }
      await upsertHealth(supabase, tenantId, inserted.id, activity)
      existingBySignature.set(activity.dedupSignature, { id: inserted.id, dedup_signature: activity.dedupSignature, provenance: activity.provenance })
      events.push({ filePath: activity.sourceFilename, event: 'created', message: `activite ${inserted.id}` })
      summary.created += 1
      continue
    }

    const decision = resolveDedupConflict(
      existing.provenance as NormalizedActivity['provenance'],
      activity.provenance,
    )

    if (decision === 'replace') {
      const { error: updErr } = await supabase
        .from('activities')
        .update(toDbRow(tenantId, importId, activity))
        .eq('id', existing.id)
      if (updErr) {
        events.push({ filePath: activity.sourceFilename, event: 'rejected_format', message: updErr.message })
        summary.rejected += 1
        continue
      }
      await upsertHealth(supabase, tenantId, existing.id, activity)
      events.push({ filePath: activity.sourceFilename, event: 'replaced', message: `activite ${existing.id}` })
      summary.replaced += 1
      continue
    }

    // 'ignore_incoming' ou 'keep_both_as_duplicate' : dans les deux
    // cas on ne touche pas l'existant, doc 03 §4.2.
    events.push({
      filePath: activity.sourceFilename,
      event: 'ignored_duplicate',
      message: `doublon de l'activite ${existing.id} (${decision})`,
    })
    summary.ignored += 1
  }

  if (events.length > 0) {
    const { error: eventsErr } = await supabase.from('import_events').insert(
      events.map((e) => ({
        import_id: importId,
        tenant_id: tenantId,
        file_path: e.filePath ?? null,
        event: e.event,
        message: e.message ?? null,
      })),
    )
    if (eventsErr) throw new Error(`applyImport journalisation: ${eventsErr.message}`)
  }

  const outcome = summary.created + summary.replaced === 0 && summary.rejected > 0 ? 'failed' : summary.rejected > 0 ? 'partial' : 'success'

  const { error: updateImportErr } = await supabase
    .from('imports')
    .update({
      finished_at: new Date().toISOString(),
      outcome,
      activities_created: summary.created,
      activities_replaced: summary.replaced,
      activities_ignored: summary.ignored,
      activities_rejected: summary.rejected,
    })
    .eq('id', importId)
  if (updateImportErr) throw new Error(`applyImport maj import: ${updateImportErr.message}`)

  return summary
}
