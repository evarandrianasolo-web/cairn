'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CONSENT_POLICY_VERSION, CONSENT_TEXTS } from '@/lib/consent/policy'
import { getValidAccessToken } from '@/lib/strava/tokens'
import { listActivities } from '@/lib/strava/api'
import { extractHealth } from '@/lib/strava/ingest'

type SupabaseServer = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Révoque le consentement FC ET purge REELLEMENT les valeurs deja en
 * base. Le PRD §6.2 exige que le retrait entraine une suppression
 * effective (pas un simple flag d'affichage). On UPDATE toutes les
 * lignes activity_health du tenant en mettant avg_hr, max_hr et
 * relative_effort a NULL, puis on journalise cette purge dans
 * health_access_logs pour traçabilite.
 */
export async function revokeAndPurgeFc(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await recordConsent(supabase, user.id, 'fc_stockage', false)

  // activity_health ne se modifie pas (aucune policy UPDATE) : la
  // regle produit est "creation ou suppression, jamais modification".
  // Une revocation efface donc les lignes entieres -- c'est plus propre
  // qu'un UPDATE vers NULL puisque la table ne contient QUE des
  // champs de sante.
  const { data: purged, error: delErr } = await supabase
    .from('activity_health')
    .delete()
    .not('avg_hr', 'is', null)
    .select('activity_id')
  if (delErr) {
    redirect(
      '/settings/donnees-sante?erreur=' +
        encodeURIComponent(`Purge FC impossible : ${delErr.message}`),
    )
  }

  const rows = purged ?? []
  if (rows.length > 0) {
    const logRows = rows.map((r) => ({
      tenant_id: user.id,
      subject_table: 'activity_health',
      subject_id: r.activity_id,
      action: 'suppression' as const,
      actor: 'system' as const,
      context: 'retrait consentement fc_stockage',
    }))
    await supabase.from('health_access_logs').insert(logRows)
  }

  // Idem pour la FC par lap : purge stricte + log par activite touchee.
  const { data: purgedLap } = await supabase
    .from('activity_lap_health')
    .delete()
    .not('activity_id', 'is', null)
    .select('activity_id')
  const uniqueLapActivities = Array.from(
    new Set((purgedLap ?? []).map((r) => r.activity_id)),
  )
  if (uniqueLapActivities.length > 0) {
    const logRows = uniqueLapActivities.map((activityId) => ({
      tenant_id: user.id,
      subject_table: 'activity_lap_health',
      subject_id: activityId,
      action: 'suppression' as const,
      actor: 'system' as const,
      context: 'retrait consentement fc_stockage',
    }))
    await supabase.from('health_access_logs').insert(logRows)
  }

  revalidatePath('/settings/donnees-sante')
  redirect(
    `/settings/donnees-sante?revoked=1&purged=${rows.length + (purgedLap?.length ?? 0)}`,
  )
}

/**
 * Accorde ou re-accorde le consentement FC et re-fetche les donnees
 * Strava pour repeupler activity_health sur les activites deja en base
 * qui en manqueraient. On limite au dernier import (batch simple) pour
 * ne pas re-fetcher toute l'histoire.
 */
export async function grantAndFetchFc(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await recordConsent(supabase, user.id, 'fc_stockage', true)

  // Re-fetch le premier batch de 100 activites, extractHealth ecrira
  // maintenant que le consentement est ON.
  let refetched = 0
  try {
    const token = await getValidAccessToken(supabase)
    const batch = await listActivities(token, 1)
    if (batch.length > 0) {
      const { data: writtenActs } = await supabase
        .from('activities')
        .select('id, strava_activity_id')
        .in(
          'strava_activity_id',
          batch.map((a) => a.id),
        )
      const idByStrava = new Map(
        (writtenActs ?? []).map((r) => [r.strava_activity_id, r.id]),
      )
      const healthRows = batch
        .map((a) => {
          const h = extractHealth(a, true)
          if (!h) return null
          const actId = idByStrava.get(a.id)
          if (!actId) return null
          return { tenant_id: user.id, activity_id: actId, ...h }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      if (healthRows.length > 0) {
        // activity_health immuable : delete + insert plutot qu'upsert.
        await supabase
          .from('activity_health')
          .delete()
          .in('activity_id', healthRows.map((r) => r.activity_id))
        const { error: insErr } = await supabase
          .from('activity_health')
          .insert(healthRows)
        if (!insErr) {
          refetched = healthRows.length
          await supabase.from('health_access_logs').insert(
            healthRows.map((r) => ({
              tenant_id: user.id,
              subject_table: 'activity_health',
              subject_id: r.activity_id,
              action: 'ecriture' as const,
              actor: 'system' as const,
              context: 're-consentement fc_stockage',
            })),
          )
        }
      }
    }
  } catch {
    // Best-effort : le consentement est accorde meme si le re-fetch
    // echoue (connexion Strava, token). L'utilisateur peut retenter.
  }

  revalidatePath('/settings/donnees-sante')
  redirect(`/settings/donnees-sante?granted=1&refetched=${refetched}`)
}

async function recordConsent(
  supabase: SupabaseServer,
  tenantId: string,
  scope: 'fc_stockage',
  granted: boolean,
) {
  const { error } = await supabase.from('consent_records').insert({
    tenant_id: tenantId,
    scope,
    granted,
    policy_version: CONSENT_POLICY_VERSION,
    policy_text: CONSENT_TEXTS[scope],
    occurred_at: new Date().toISOString(),
  })
  if (error) {
    throw new Error(`recordConsent: ${error.message}`)
  }
}
