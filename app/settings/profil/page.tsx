import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  derivePaces,
  formatPaceZone,
  formatTime,
  hasReferenceTimes,
} from '@/lib/paces'
import { updateReferenceTimes } from './actions'

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { ok, erreur } = await searchParams

  const { data: athlete } = await supabase
    .from('athletes')
    .select('ref_5km_s, ref_10km_s, ref_semi_s, ref_marathon_s')
    .maybeSingle()

  const refs = {
    ref_5km_s: athlete?.ref_5km_s ?? null,
    ref_10km_s: athlete?.ref_10km_s ?? null,
    ref_semi_s: athlete?.ref_semi_s ?? null,
    ref_marathon_s: athlete?.ref_marathon_s ?? null,
  }
  const paces = derivePaces(refs)
  const anyRef = hasReferenceTimes(refs)

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <ScreenTitle>Profil</ScreenTitle>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}
      {ok && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          Temps enregistrés.
        </p>
      )}

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Temps de référence
        </h2>
        <p className="mt-2 text-sm text-granit">
          Ces temps servent à calculer tes allures cibles (endurance
          fondamentale, seuil, VMA) et à cadrer les séances proposées par le
          coach. Remplis ce que tu connais, laisse vide le reste.
        </p>
        <p className="mt-1 text-xs italic text-granit">
          Format accepté : <span className="tabular font-mono">1:37:42</span>,{' '}
          <span className="tabular font-mono">20:51</span>, ou secondes brutes.
        </p>

        <form action={updateReferenceTimes} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">5 km</span>
              <input
                name="ref_5km_s"
                type="text"
                defaultValue={refs.ref_5km_s ? formatTime(refs.ref_5km_s) : ''}
                placeholder="20:51"
                className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">10 km</span>
              <input
                name="ref_10km_s"
                type="text"
                defaultValue={refs.ref_10km_s ? formatTime(refs.ref_10km_s) : ''}
                placeholder="43:20"
                className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">Semi</span>
              <input
                name="ref_semi_s"
                type="text"
                defaultValue={refs.ref_semi_s ? formatTime(refs.ref_semi_s) : ''}
                placeholder="1:37:42"
                className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">Marathon</span>
              <input
                name="ref_marathon_s"
                type="text"
                defaultValue={
                  refs.ref_marathon_s ? formatTime(refs.ref_marathon_s) : ''
                }
                placeholder="3:35:00"
                className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </section>

      {anyRef && (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Allures cibles dérivées
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <PaceRow label="Endurance fondamentale" zone={paces.ef} />
            <PaceRow label="Seuil (≈ allure semi)" zone={paces.seuil} />
            <PaceRow label="VMA courte (30/30)" zone={paces.vma} />
          </ul>
          <p className="mt-3 text-xs italic text-granit">
            Estimations basées sur ton meilleur temps disponible.{' '}
            {refs.ref_semi_s
              ? 'Le semi sert de référence pour le seuil.'
              : refs.ref_10km_s
                ? 'Le 10 km sert de référence pour le seuil.'
                : refs.ref_5km_s
                  ? 'Sans semi ni 10 km, le seuil est estimé depuis le 5 km avec marge de sécurité.'
                  : ''}
          </p>
        </section>
      )}
    </main>
  )
}

function PaceRow({
  label,
  zone,
}: {
  label: string
  zone: ReturnType<typeof derivePaces>['ef']
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-schiste">{label}</span>
      <span className="tabular font-mono text-sm text-schiste">
        {zone ? formatPaceZone(zone) : '—'}
      </span>
    </li>
  )
}
