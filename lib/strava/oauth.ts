import {
  STRAVA_AUTHORIZE_URL,
  STRAVA_TOKEN_URL,
  STRAVA_SCOPE,
  stravaClientId,
  stravaClientSecret,
} from './config'

export type StravaTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  athleteId: number
  scope: string[]
}

export function buildAuthorizationUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: stravaClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: STRAVA_SCOPE,
    approval_prompt: 'auto',
    state,
  })
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: stravaClientId(),
      client_secret: stravaClientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: data.athlete.id,
    scope: (data.scope ?? STRAVA_SCOPE).split(','),
  }
}

/**
 * Rafraîchit un access_token à partir d'un refresh_token.
 * Strava ne renvoie PAS l'athlete lors d'un refresh — on garde celui stocké.
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<Omit<StravaTokens, 'athleteId' | 'scope'>> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: stravaClientId(),
      client_secret: stravaClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
  }
}
