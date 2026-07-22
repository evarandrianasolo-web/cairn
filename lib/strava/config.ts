export const STRAVA_SCOPE = 'activity:read_all'
export const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

export function stravaClientId(): string {
  const v = process.env.STRAVA_CLIENT_ID
  if (!v) throw new Error('STRAVA_CLIENT_ID absent')
  return v
}

export function stravaClientSecret(): string {
  const v = process.env.STRAVA_CLIENT_SECRET
  if (!v) throw new Error('STRAVA_CLIENT_SECRET absent')
  return v
}

/**
 * Construit le redirect_uri à partir de la requête entrante.
 * Doit être byte-identique entre l'appel authorize et l'appel callback,
 * sinon Strava rejette l'échange.
 */
export function redirectUriFrom(request: Request): string {
  const url = new URL(request.url)
  return `${url.origin}/api/strava/callback`
}
