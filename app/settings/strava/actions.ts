'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  CONSENT_POLICY_VERSION,
  CONSENT_TEXTS,
  type ConsentScope,
} from '@/lib/consent/policy'
import { getValidAccessToken } from '@/lib/strava/tokens'
import { listActivities, listActivityLaps } from '@/lib/strava/api'
import {
  extractHealth,
  transformActivity,
  transformLaps,
} from '@/lib/strava/ingest'

type SupabaseServer = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function runInitialImport(
  supabase: SupabaseServer,
  tenantId: string,
  fcConsent: boolean,
): Promise<number> {
  const accessToken = await getValidAccessToken(supabase)

  let page = 1
  let inserted = 0

  while (true) {
    const batch = await listActivities(accessToken, page)
    if (batch.length === 0) break

    // 1. Activités sans aucun champ FC. Le type ActivityRow le garantit.
    const activityRows = batch.map((a) => ({
      tenant_id: tenantId,
      ...transformActivity(a),
    }))
    const { data: written, error } = await supabase
      .from('activities')
      .upsert(activityRows, { onConflict: 'tenant_id,strava_activity_id' })
      .select('id, strava_activity_id')
    if (error) throw new Error(`Import activités: ${error.message}`)

    // 2. Ligne santé UNIQUEMENT si le consentement fc_stockage est actif.
    if (fcConsent && written) {
      const idByStrava = new Map(written.map((r) => [r.strava_activity_id, r.id]))
      const healthRows = batch
        .map((a) => {
          const h = extractHealth(a, true)
          if (!h) return null
          const activityId = idByStrava.get(a.id)
          if (!activityId) return null
          return {
            tenant_id: tenantId,
            activity_id: activityId,
            ...h,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (healthRows.length > 0) {
        const { error: hErr } = await supabase
          .from('activity_health')
          .upsert(healthRows, { onConflict: 'activity_id' })
        if (hErr) throw new Error(`Import santé: ${hErr.message}`)

        const logRows = healthRows.map((r) => ({
          tenant_id: tenantId,
          subject_table: 'activity_health',
          subject_id: r.activity_id,
          action: 'ecriture' as const,
          actor: 'system' as const,
          context: 'import initial Strava',
        }))
        const { error: lErr } = await supabase.from('health_access_logs').insert(logRows)
        if (lErr) throw new Error(`Log accès santé: ${lErr.message}`)
      }
    }

    inserted += batch.length
    page += 1

    if (batch.length < 100) break
  }

  const { error: connErr } = await supabase
    .from('strava_connections')
    .update({ last_imported_at: new Date().toISOString() })
    .not('id', 'is', null)
  if (connErr) throw new Error(`Mise à jour last_imported_at: ${connErr.message}`)

  return inserted
}

export async function saveConsentAndImport(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fcStockage = formData.get('fc_stockage') === 'on'
  const scopes: ConsentScope[] = ['fc_stockage', 'fc_analyse_ia', 'stats_anonymes']
  const now = new Date().toISOString()

  const rows = scopes.map((scope) => ({
    tenant_id: user.id,
    scope,
    granted: formData.get(scope) === 'on',
    policy_version: CONSENT_POLICY_VERSION,
    policy_text: CONSENT_TEXTS[scope],
    occurred_at: now,
  }))

  const { error } = await supabase.from('consent_records').insert(rows)
  if (error) throw new Error(`saveConsent: ${error.message}`)

  const imported = await runInitialImport(supabase, user.id, fcStockage)

  revalidatePath('/settings/strava')
  redirect(`/settings/strava?imported=${imported}`)
}

/**
 * Lit le dernier événement de consentement pour fc_stockage. Le journal étant
 * append-only, l'état courant = la ligne la plus récente pour ce scope.
 */
async function currentFcConsent(supabase: SupabaseServer): Promise<boolean> {
  const { data, error } = await supabase
    .from('consent_records')
    .select('granted')
    .eq('scope', 'fc_stockage')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Lecture consentement FC: ${error.message}`)
  return data?.granted ?? false
}

export async function refreshStrava() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fcConsent = await currentFcConsent(supabase)
  const imported = await runInitialImport(supabase, user.id, fcConsent)

  revalidatePath('/settings/strava')
  revalidatePath('/activities')
  redirect(`/settings/strava?imported=${imported}`)
}

/**
 * Backfill des laps pour les activites recentes qui n'en ont pas
 * encore. Limite fort pour respecter le rate limit Strava (100 req/
 * 15 min, 1000/j). On ne traite que les 90 derniers jours et max
 * 40 activites par appel.
 */
export async function backfillRecentLaps() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
  const { data: acts, error } = await supabase
    .from('activities')
    .select('id, strava_activity_id')
    .gte('started_at', since)
    .not('strava_activity_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(60)
  if (error) throw new Error(`Backfill laps read: ${error.message}`)
  if (!acts || acts.length === 0) {
    redirect('/settings/strava?laps_backfilled=0')
  }

  // On saute celles qui ont deja des laps -- economie d'API.
  const ids = acts.map((a) => a.id)
  const { data: existing } = await supabase
    .from('activity_laps')
    .select('activity_id')
    .in('activity_id', ids)
  const already = new Set((existing ?? []).map((r) => r.activity_id))
  const todo = acts.filter((a) => !already.has(a.id)).slice(0, 40)

  const accessToken = await getValidAccessToken(supabase)
  let processed = 0
  for (const a of todo) {
    try {
      const raws = await listActivityLaps(accessToken, a.strava_activity_id)
      const rows = transformLaps(raws, a.id).map((r) => ({
        tenant_id: user.id,
        ...r,
      }))
      if (rows.length > 0) {
        await supabase.from('activity_laps').insert(rows)
      }
      processed += 1
    } catch (e) {
      // Une activite en erreur ne doit pas bloquer les autres.
      console.warn(
        `backfill laps activity=${a.strava_activity_id}: ${e instanceof Error ? e.message : e}`,
      )
    }
  }

  revalidatePath('/settings/strava')
  revalidatePath('/activities')
  redirect(`/settings/strava?laps_backfilled=${processed}`)
}

export async function disconnectStrava() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // La RLS filtre : pas de .eq('tenant_id', ...) applicatif.
  const { error } = await supabase.from('strava_connections').delete().not('id', 'is', null)
  if (error) throw new Error(`disconnect: ${error.message}`)

  revalidatePath('/settings/strava')
}
