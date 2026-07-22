import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens } from '@/lib/strava/oauth'
import { upsertConnection } from '@/lib/strava/connections'
import { redirectUriFrom } from '@/lib/strava/config'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const stravaError = searchParams.get('error')

  if (stravaError) {
    return NextResponse.redirect(
      new URL(`/settings/strava?erreur=${encodeURIComponent(stravaError)}`, request.url),
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings/strava?erreur=params', request.url))
  }

  const cookieState = request.cookies.get('strava_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL('/settings/strava?erreur=state', request.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUriFrom(request))
    await upsertConnection(supabase, user.id, tokens)
  } catch (e) {
    console.error('Strava callback failed', e)
    return NextResponse.redirect(new URL('/settings/strava?erreur=echange', request.url))
  }

  const res = NextResponse.redirect(new URL('/settings/strava?connecte=1', request.url))
  res.cookies.delete('strava_oauth_state')
  return res
}
