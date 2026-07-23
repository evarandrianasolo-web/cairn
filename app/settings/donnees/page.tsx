import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { deleteMyAccount } from './actions'

export default async function DonneesPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur } = await searchParams

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <ScreenTitle>Mes données</ScreenTitle>

      <p className="text-sm text-granit">
        Droits RGPD sur ton compte. L&apos;export produit un JSON complet de
        toutes tes données. La suppression est immédiate et définitive.
      </p>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Export (accès + portabilité)
        </h2>
        <p className="mt-2 text-sm text-schiste">
          Télécharge un JSON contenant toutes tes données : activités, courses,
          contraintes, plan, débriefs, logs fueling, historique coach, journal
          santé, préférences. Format ré-exploitable.
        </p>
        <p className="mt-1 text-xs italic text-granit">
          Les tokens Strava chiffrés ne sont pas inclus (aucune utilité en
          clair pour toi, exposer le chiffré n&apos;a pas de sens).
        </p>
        <a
          href="/api/export"
          className="mt-3 inline-block rounded-surface border border-schiste bg-schiste px-4 py-2 text-sm font-medium text-craie"
          download
        >
          Télécharger mon export JSON
        </a>
      </section>

      <section className="rounded-data border border-balise/40 bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-balise">
          Suppression du compte
        </h2>
        <p className="mt-2 text-sm text-schiste">
          Cette action est <b>irréversible</b>. Elle efface définitivement :
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-schiste">
          <li>Ton compte et tes identifiants</li>
          <li>Toutes tes activités, notes personnelles et données santé</li>
          <li>Tes courses, contraintes, plan, débriefs, logs fueling</li>
          <li>L&apos;historique de tes conversations coach</li>
          <li>Tes préférences et ton consentement</li>
        </ul>
        <p className="mt-2 text-xs italic text-granit">
          Les journaux d&apos;accès aux données santé peuvent être conservés
          jusqu&apos;à 3 ans à des fins d&apos;audit sécurité (voir AIPD).
        </p>

        <form action={deleteMyAccount} className="mt-4 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">
              Pour confirmer, saisis ton e-mail{' '}
              <span className="tabular font-mono text-schiste">
                {user.email}
              </span>
            </span>
            <input
              required
              type="email"
              name="email_confirmation"
              placeholder={user.email ?? ''}
              autoComplete="off"
              className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base text-schiste focus:border-balise focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-surface border border-balise bg-balise px-4 py-2 text-sm font-medium text-craie hover:bg-balise/90"
          >
            Supprimer définitivement mon compte
          </button>
        </form>
      </section>
    </main>
  )
}
