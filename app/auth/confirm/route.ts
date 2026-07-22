import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Cible du lien magique. Deux formes possibles selon la configuration
 * Supabase, on accepte les deux :
 *
 *   ?code=…                  flux PKCE, celui que @supabase/ssr produit
 *                            par défaut. L'échange exige le vérificateur
 *                            déposé en cookie lors de la demande : le lien
 *                            doit être ouvert dans le même navigateur.
 *
 *   ?token_hash=…&type=…     si le gabarit d'e-mail est personnalisé pour
 *                            utiliser {{ .TokenHash }}.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createServerSupabaseClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect('/')
    redirect('/login?erreur=echange')
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) redirect('/')
    redirect('/login?erreur=verification')
  }

  redirect('/login?erreur=lien')
}
