import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getActivityDetail, listActivityLaps } from '@/lib/strava/api'
import {
  extractHealth,
  transformActivity,
  transformLaps,
} from '@/lib/strava/ingest'
import { getValidAccessTokenForTenant } from '@/lib/strava/tokens'

/**
 * Webhook Strava.
 * - GET  : validation d'abonnement (Strava envoie hub.mode / hub.challenge
 *          / hub.verify_token, on doit renvoyer { "hub.challenge": ... }).
 * - POST : evenements activity/athlete. Strava exige une reponse < 2 s ;
 *          on ACK immediat (200) puis on traite en background via
 *          request.waitUntil-like : ici on lance handleEvent en promise
 *          fire-and-forget.
 *
 * Isolation : le webhook n'a pas de session utilisateur. On utilise
 * SUPABASE_SERVICE_ROLE_KEY (bypass RLS) et on scope explicitement par
 * tenant_id resolu depuis owner_id (strava_athlete_id). Aucune donnee
 * inter-tenant possible : owner_id est fourni par Strava, on ne cherche
 * qu'une seule connexion via cet id.
 */

const STRAVA_ENV_MISSING =
  'STRAVA_WEBHOOK_VERIFY_TOKEN, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant en env.'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  const expected = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
  if (!expected) return new Response(STRAVA_ENV_MISSING, { status: 500 })

  if (mode === 'subscribe' && token === expected && challenge) {
    return Response.json({ 'hub.challenge': challenge })
  }
  return new Response('Forbidden', { status: 403 })
}

type StravaEvent = {
  object_type: 'activity' | 'athlete'
  object_id: number
  aspect_type: 'create' | 'update' | 'delete'
  owner_id: number
  subscription_id: number
  event_time: number
  updates?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return new Response(STRAVA_ENV_MISSING, { status: 500 })
  }

  let event: StravaEvent
  try {
    event = (await req.json()) as StravaEvent
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // ACK immediat -- Strava exige < 2 s. Le traitement se fait en
  // background ; s'il echoue, on log console et Strava re-notifiera.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  handleEvent(admin, event).catch((e) => {
    console.error(`strava webhook handle failed: ${e instanceof Error ? e.message : e}`)
  })

  return new Response('ok', { status: 200 })
}

async function handleEvent(
  admin: SupabaseClient,
  event: StravaEvent,
) {
  if (event.object_type !== 'activity') return

  // 1. Resoudre le tenant a partir de l'owner_id Strava.
  const { data: conn, error: connErr } = await admin
    .from('strava_connections')
    .select('tenant_id')
    .eq('strava_athlete_id', event.owner_id)
    .maybeSingle()
  if (connErr || !conn) {
    console.warn(
      `strava webhook: no connection for owner_id=${event.owner_id}`,
    )
    return
  }
  const tenantId = conn.tenant_id as string

  if (event.aspect_type === 'delete') {
    const { error } = await admin
      .from('activities')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('strava_activity_id', event.object_id)
    if (error) console.warn(`strava webhook delete: ${error.message}`)
    return
  }

  // 2. create / update : fetch le detail et upsert. Le trigger DB
  //    seed_user_notes_from_description s'appliquera automatiquement
  //    sur INSERT (create), pas sur UPDATE (les notes editees sont
  //    preservees en cas de re-import).
  let detail
  try {
    const token = await getValidAccessTokenForTenant(admin, tenantId)
    detail = await getActivityDetail(token, event.object_id)
  } catch (e) {
    console.warn(
      `strava webhook fetch failed for activity=${event.object_id}: ${
        e instanceof Error ? e.message : e
      }`,
    )
    return
  }

  const row = { tenant_id: tenantId, ...transformActivity(detail) }
  const { data: written, error: upErr } = await admin
    .from('activities')
    .upsert([row], { onConflict: 'tenant_id,strava_activity_id' })
    .select('id')
  if (upErr) {
    console.warn(`strava webhook upsert: ${upErr.message}`)
    return
  }

  // 3. FC : ecrire uniquement si consentement fc_stockage courant = true.
  const activityId = written?.[0]?.id
  if (!activityId) return

  // 2.b Laps : refetch a chaque webhook (activite creee ou updatee)
  // pour capter les corrections cote Strava (edit distance, etc.).
  try {
    const token = await getValidAccessTokenForTenant(admin, tenantId)
    const rawLaps = await listActivityLaps(token, event.object_id)
    await admin.from('activity_laps').delete().eq('activity_id', activityId)
    const lapRows = transformLaps(rawLaps, activityId).map((r) => ({
      tenant_id: tenantId,
      ...r,
    }))
    if (lapRows.length > 0) {
      const { error: lErr } = await admin
        .from('activity_laps')
        .insert(lapRows)
      if (lErr) console.warn(`strava webhook laps insert: ${lErr.message}`)
    }
  } catch (e) {
    console.warn(
      `strava webhook laps fetch failed activity=${event.object_id}: ${
        e instanceof Error ? e.message : e
      }`,
    )
  }

  const { data: consent } = await admin
    .from('consent_records')
    .select('granted')
    .eq('tenant_id', tenantId)
    .eq('scope', 'fc_stockage')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fcGranted = consent?.granted === true

  const health = extractHealth(detail, fcGranted)
  if (!health) return

  // activity_health est immuable (aucune policy UPDATE), donc on
  // supprime la ligne existante avant d'inserer la nouvelle. Le
  // service_role pourrait techniquement UPDATE, mais on respecte la
  // regle produit "creation ou suppression, jamais modification".
  await admin.from('activity_health').delete().eq('activity_id', activityId)
  const { error: hErr } = await admin
    .from('activity_health')
    .insert([{ tenant_id: tenantId, activity_id: activityId, ...health }])
  if (hErr) {
    console.warn(`strava webhook health insert: ${hErr.message}`)
    return
  }

  await admin.from('health_access_logs').insert({
    tenant_id: tenantId,
    subject_table: 'activity_health',
    subject_id: activityId,
    action: 'ecriture',
    actor: 'system',
    context: 'webhook Strava',
  })
}
