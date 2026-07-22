import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt } from './crypto'
import type { StravaTokens } from './oauth'

export async function upsertConnection(
  supabase: SupabaseClient,
  tenantId: string,
  tokens: StravaTokens,
): Promise<void> {
  const { error } = await supabase.from('strava_connections').upsert(
    {
      tenant_id: tenantId,
      strava_athlete_id: tokens.athleteId,
      access_token_encrypted: encrypt(tokens.accessToken),
      refresh_token_encrypted: encrypt(tokens.refreshToken),
      expires_at: tokens.expiresAt.toISOString(),
      scopes: tokens.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
  if (error) throw new Error(`upsertConnection: ${error.message}`)
}
