import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDateCourte } from '@/lib/format'
import { ConsentForm } from './consent-form'
import { disconnectStrava, refreshStrava } from './actions'

export default async function StravaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; connecte?: string; imported?: string; consent?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: connection } = await supabase
    .from('strava_connections')
    .select('strava_athlete_id, connected_at, last_imported_at')
    .maybeSingle()

  const params = await searchParams

  return (
    <main className="mx-auto max-w-xl p-6">
      <ScreenTitle>Strava</ScreenTitle>

      {params.erreur && (
        // ocre = vigilance ; jamais balise pour un message d'erreur.
        <p className="mt-3 rounded-data bg-craie p-3 text-sm text-ocre">
          Erreur : {params.erreur}
        </p>
      )}

      {!connection ? (
        <div className="mt-6">
          <p className="text-sm text-granit">
            Connecte ton compte Strava pour importer tes activités.
          </p>
          <a
            href="/api/strava/authorize"
            className="mt-4 inline-block rounded-data bg-schiste px-3 py-2 text-sm text-craie"
          >
            Connecter Strava
          </a>
        </div>
      ) : !connection.last_imported_at ? (
        <div className="mt-6">
          <p className="text-sm text-schiste">
            Compte Strava connecté (#{connection.strava_athlete_id}).
          </p>
          <p className="mt-2 text-sm text-granit">
            Choisis maintenant ce que tu autorises côté fréquence cardiaque.
            Toutes les cases sont décochées par défaut ; l&apos;app fonctionne sans FC,
            elle fonctionne mieux avec.
          </p>
          <ConsentForm />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-schiste">
            Connecté à l&apos;athlète #{connection.strava_athlete_id}.
          </p>
          <p className="text-sm text-granit">
            Dernier import :{' '}
            <span className="tabular">
              {formatDateCourte(connection.last_imported_at)}
            </span>
            .
          </p>
          {params.imported && (
            <p className="rounded-data bg-craie p-3 text-sm text-schiste">
              <span className="tabular">{params.imported}</span> activités traitées.
            </p>
          )}
          <div className="flex gap-3">
            <form action={refreshStrava}>
              <button
                type="submit"
                className="rounded-data bg-schiste px-3 py-2 text-sm text-craie"
              >
                Rafraîchir depuis Strava
              </button>
            </form>
            <form action={disconnectStrava}>
              <button
                type="submit"
                className="rounded-data border border-granit px-3 py-2 text-sm text-schiste"
              >
                Déconnecter Strava
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
