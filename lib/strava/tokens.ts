import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './crypto'
import { refreshTokens } from './oauth'

const REFRESH_MARGIN_S = 60

/**
 * Retourne un access_token utilisable. Rafraîchit et persiste si expiré
 * (ou sur le point de l'être). La RLS filtre la lecture et l'écriture ;
 * pas de .eq('tenant_id', ...).
 */
export async function getValidAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: conn, error } = await supabase
    .from('strava_connections')
    .select('access_token_encrypted, refresh_token_encrypted, expires_at')
    .maybeSingle()
  if (error) throw new Error(`Strava connection lookup: ${error.message}`)
  if (!conn) throw new Error('Aucune connexion Strava')

  const expiresAt = new Date(conn.expires_at).getTime() / 1000
  const now = Date.now() / 1000
  if (expiresAt - now > REFRESH_MARGIN_S) {
    return decrypt(conn.access_token_encrypted)
  }

  const refreshed = await refreshTokens(decrypt(conn.refresh_token_encrypted))
  const { error: upErr } = await supabase
    .from('strava_connections')
    .update({
      access_token_encrypted: encrypt(refreshed.accessToken),
      refresh_token_encrypted: encrypt(refreshed.refreshToken),
      expires_at: refreshed.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .not('id', 'is', null)
  if (upErr) throw new Error(`Strava token update: ${upErr.message}`)

  return refreshed.accessToken
}
