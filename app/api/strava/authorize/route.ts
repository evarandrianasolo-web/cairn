import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildAuthorizationUrl } from '@/lib/strava/oauth'
import { redirectUriFrom } from '@/lib/strava/config'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const state = randomBytes(32).toString('hex')
  const url = buildAuthorizationUrl(state, redirectUriFrom(request))

  const res = NextResponse.redirect(url)
  res.cookies.set('strava_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  return res
}
