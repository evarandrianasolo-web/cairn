'use client'

/**
 * Écran provisoire, sera redessiné en P2 — ne pas en faire une référence
 * visuelle. Il n'existe que pour rendre l'authentification vérifiable à la
 * main. Aucun style au-delà des tokens de app/globals.css.
 */

import { useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

type Etat = 'saisie' | 'envoi' | 'envoye' | 'erreur'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [etat, setEtat] = useState<Etat>('saisie')
  const [message, setMessage] = useState('')

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    setEtat('envoi')

    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })

    if (error) {
      setEtat('erreur')
      setMessage(error.message)
      return
    }

    setEtat('envoye')
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-surface bg-craie p-6">
        <h1
          className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.03em] text-schiste"
          style={{ fontVariationSettings: "'wdth' 125" }}
        >
          Cairn
        </h1>
        <p className="mt-2 text-sm text-granit">
          Entre ton adresse, tu recevras un lien de connexion.
        </p>

        {etat === 'envoye' ? (
          <p className="mt-6 text-sm text-schiste">
            Lien envoyé à <span className="tabular">{email}</span>. Ouvre-le depuis cet
            appareil.
          </p>
        ) : (
          <form onSubmit={envoyer} className="mt-6">
            <label htmlFor="email" className="block text-xs text-granit">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-data border border-granit bg-craie px-3 py-2 text-base text-schiste"
            />

            <button
              type="submit"
              disabled={etat === 'envoi'}
              className="mt-4 w-full rounded-data bg-schiste px-3 py-2 text-sm text-craie"
            >
              {etat === 'envoi' ? 'Envoi…' : 'Recevoir le lien'}
            </button>

            {etat === 'erreur' && (
              <p className="mt-3 text-sm text-balise">{message}</p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
