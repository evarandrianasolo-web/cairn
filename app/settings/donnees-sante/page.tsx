import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { CONSENT_TEXTS, CONSENT_POLICY_VERSION } from '@/lib/consent/policy'
import { grantAndFetchFc, revokeAndPurgeFc } from './actions'

export default async function DonneesSantePage({
  searchParams,
}: {
  searchParams: Promise<{
    revoked?: string
    granted?: string
    purged?: string
    refetched?: string
    erreur?: string
  }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { revoked, granted, purged, refetched, erreur } = await searchParams

  // Etat courant du consentement fc_stockage = derniere ligne pour ce
  // scope. Append-only, on prend la plus recente.
  const { data: lastConsent } = await supabase
    .from('consent_records')
    .select('granted, occurred_at, policy_version')
    .eq('scope', 'fc_stockage')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const isGranted = lastConsent?.granted ?? false

  // Compter combien de lignes activity_health ont encore des valeurs FC.
  const { count } = await supabase
    .from('activity_health')
    .select('avg_hr', { count: 'exact', head: true })
    .not('avg_hr', 'is', null)

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <ScreenTitle>Données santé</ScreenTitle>

      <p className="text-sm text-granit">
        Ta fréquence cardiaque est une donnée sensible (art. 9 RGPD). Elle
        n&apos;est stockée que si tu l&apos;autorises explicitement, et la
        révocation entraîne une purge réelle des valeurs — pas juste un
        changement d&apos;affichage.
      </p>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}
      {revoked && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          Consentement FC révoqué. {purged} valeur{Number(purged) > 1 ? 's' : ''}{' '}
          purgée{Number(purged) > 1 ? 's' : ''} de la base.
        </p>
      )}
      {granted && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          Consentement FC accordé. {refetched} valeur
          {Number(refetched) > 1 ? 's' : ''} re-récupérée
          {Number(refetched) > 1 ? 's' : ''} depuis Strava.
        </p>
      )}

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Consentement fréquence cardiaque
        </h2>

        <div className="mt-3 flex items-baseline gap-3">
          <span
            className={
              'inline-block h-3 w-3 rounded-full ' +
              (isGranted ? 'bg-lichen' : 'bg-granit/40')
            }
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-base text-schiste">
              {isGranted ? 'Accordé' : 'Refusé'}
            </p>
            <p className="tabular font-mono text-[10px] text-granit">
              {lastConsent?.occurred_at
                ? `Dernier changement : ${formatDateTime(lastConsent.occurred_at)}`
                : 'Jamais renseigné explicitement — traité comme refusé.'}
              {lastConsent?.policy_version
                ? ` · politique ${lastConsent.policy_version}`
                : ''}
            </p>
          </div>
        </div>

        <p className="mt-3 whitespace-pre-line text-sm italic text-granit">
          {CONSENT_TEXTS.fc_stockage}
        </p>

        <p className="tabular mt-3 font-mono text-xs text-granit">
          Valeurs FC actuellement en base :{' '}
          <span className="text-schiste">{count ?? 0}</span> activité
          {(count ?? 0) > 1 ? 's' : ''}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          {isGranted ? (
            <form action={revokeAndPurgeFc}>
              <button
                type="submit"
                className="rounded-surface border border-balise bg-balise px-4 py-2 text-sm font-medium text-craie hover:bg-balise/90"
              >
                Révoquer et purger les valeurs
              </button>
            </form>
          ) : (
            <form action={grantAndFetchFc}>
              <button
                type="submit"
                className="rounded-surface border border-schiste bg-schiste px-4 py-2 text-sm font-medium text-craie"
              >
                Accorder et re-récupérer depuis Strava
              </button>
            </form>
          )}
        </div>

        <p className="mt-3 border-t border-brume pt-3 text-[11px] italic text-granit">
          À la révocation, un événement est journalisé dans
          <code className="mx-1 rounded bg-brume px-1 font-mono">
            health_access_logs
          </code>
          pour traçabilité — le journal n&apos;est pas purgé, il enregistre
          uniquement qui/quand/pourquoi de la suppression.
        </p>
      </section>

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Ce que Cairn stocke
        </h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-schiste">
          <li>
            FC moyenne, FC maximale, effort relatif Strava — dans une table
            séparée{' '}
            <code className="rounded bg-brume px-1 font-mono text-xs">
              activity_health
            </code>{' '}
            avec RLS stricte.
          </li>
          <li>
            <b>Aucune série FC brute</b>. Aucun échantillon seconde par
            seconde n&apos;entre en base.
          </li>
          <li>
            <b>Aucun accès du coach IA à ta FC en clair</b> — le contexte
            envoyé au modèle Anthropic ne contient que des tendances
            dérivées, jamais les valeurs.
          </li>
        </ul>
      </section>
    </main>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
