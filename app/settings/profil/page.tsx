import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  computeVerticalSpeed,
  derivePaces,
  formatPaceZone,
  formatTime,
  formatVerticalSpeed,
  hasReferenceTimes,
  inferReferenceTimes,
  KM_LABEL,
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

  const todayIso = new Date().toISOString().slice(0, 10)
  const DAY_MS = 24 * 60 * 60 * 1000
  const since90d = new Date(Date.now() - 90 * DAY_MS).toISOString()

  const [{ data: athlete }, { data: doneRaces }, { data: recentActs }] =
    await Promise.all([
      supabase
        .from('athletes')
        .select('ref_5km_s, ref_10km_s, ref_semi_s, ref_marathon_s, ref_5km_at, ref_10km_at, ref_semi_at, ref_marathon_at')
        .maybeSingle(),
      supabase
        .from('races')
        .select('distance_m, elevation_gain_m, result_time_s, race_date')
        .eq('status', 'terminee')
        .lt('race_date', todayIso)
        .not('result_time_s', 'is', null)
        .order('race_date', { ascending: false })
        .limit(20),
      supabase
        .from('activities')
        .select('name, started_at, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km')
        .gte('started_at', since90d),
    ])

  const savedRefs = {
    ref_5km_s: athlete?.ref_5km_s ?? null,
    ref_10km_s: athlete?.ref_10km_s ?? null,
    ref_semi_s: athlete?.ref_semi_s ?? null,
    ref_marathon_s: athlete?.ref_marathon_s ?? null,
  }
  const savedRefDates = {
    ref_5km_at: athlete?.ref_5km_at ?? null,
    ref_10km_at: athlete?.ref_10km_at ?? null,
    ref_semi_at: athlete?.ref_semi_at ?? null,
    ref_marathon_at: athlete?.ref_marathon_at ?? null,
  }
  const { refs, inferred } = inferReferenceTimes(
    savedRefs,
    (doneRaces ?? []).map((r) => ({
      distance_m: r.distance_m,
      elevation_gain_m: r.elevation_gain_m,
      result_time_s: r.result_time_s,
      race_date: r.race_date,
    })),
    (recentActs ?? []).map((a) => ({
      distance_m: a.distance_m,
      elevation_gain_m: a.elevation_gain_m,
      moving_time_s: a.moving_time_s,
      avg_pace_s_per_km: (a as { avg_pace_s_per_km?: number | null }).avg_pace_s_per_km ?? null,
      started_at: (a as { started_at?: string | null }).started_at ?? null,
      name: (a as { name?: string | null }).name ?? null,
    })),
    [],
    new Date(),
  )
  const paces = derivePaces(refs)
  const anyRef = hasReferenceTimes(refs)
  const inferredKeys = Object.keys(inferred) as (keyof typeof inferred)[]

  const vSpeed = computeVerticalSpeed(recentActs ?? [])

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

        <form action={updateReferenceTimes} className="mt-4 space-y-4">
          <RefField
            label="5 km"
            nameTime="ref_5km_s"
            nameDate="ref_5km_at"
            defaultTime={savedRefs.ref_5km_s ? formatTime(savedRefs.ref_5km_s) : ''}
            defaultDate={savedRefDates.ref_5km_at ?? ''}
            placeholderTime="20:51"
          />
          <RefField
            label="10 km"
            nameTime="ref_10km_s"
            nameDate="ref_10km_at"
            defaultTime={savedRefs.ref_10km_s ? formatTime(savedRefs.ref_10km_s) : ''}
            defaultDate={savedRefDates.ref_10km_at ?? ''}
            placeholderTime="43:20"
          />
          <RefField
            label="Semi"
            nameTime="ref_semi_s"
            nameDate="ref_semi_at"
            defaultTime={savedRefs.ref_semi_s ? formatTime(savedRefs.ref_semi_s) : ''}
            defaultDate={savedRefDates.ref_semi_at ?? ''}
            placeholderTime="1:37:42"
          />
          <RefField
            label="Marathon"
            nameTime="ref_marathon_s"
            nameDate="ref_marathon_at"
            defaultTime={
              savedRefs.ref_marathon_s ? formatTime(savedRefs.ref_marathon_s) : ''
            }
            defaultDate={savedRefDates.ref_marathon_at ?? ''}
            placeholderTime="3:35:00"
          />
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
          {inferredKeys.length > 0 && (
            <p className="mt-2 text-xs italic text-granit">
              Certaines valeurs ont été affinées depuis tes courses terminées :{' '}
              {inferredKeys.map((k) => KM_LABEL[k]).join(', ')}.
            </p>
          )}
        </section>
      )}

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Vitesse verticale
        </h2>
        <p className="mt-2 text-sm text-granit">
          Calculée depuis tes activités des 90 derniers jours ayant au moins
          300 m D+. Sert à estimer le temps sur les courses de trail avec un
          gros dénivelé.
        </p>
        {vSpeed ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <VSpeedStat
              label="Médiane"
              value={formatVerticalSpeed(vSpeed.medianMPerHour)}
              hint={`sur ${vSpeed.sampleSize} sortie${vSpeed.sampleSize > 1 ? 's' : ''}`}
            />
            <VSpeedStat
              label="Meilleure"
              value={formatVerticalSpeed(vSpeed.bestMPerHour)}
              hint="max récent"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-granit">
            Aucune sortie ≥ 300 m D+ dans les 90 derniers jours — la mesure se
            débloquera dès qu&apos;une sortie vallonnée sera enregistrée.
          </p>
        )}
      </section>
    </main>
  )
}

function VSpeedStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-data border border-brume bg-brume/40 px-3 py-2">
      <div className="font-mono text-[10px] uppercase text-granit">{label}</div>
      <div className="tabular mt-1 font-mono text-lg text-schiste">{value}</div>
      <div className="mt-0.5 font-mono text-[10px] text-granit">{hint}</div>
    </div>
  )
}

function RefField({
  label,
  nameTime,
  nameDate,
  defaultTime,
  defaultDate,
  placeholderTime,
}: {
  label: string
  nameTime: string
  nameDate: string
  defaultTime: string
  defaultDate: string
  placeholderTime: string
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-granit">{label}</span>
        <input
          name={nameTime}
          type="text"
          defaultValue={defaultTime}
          placeholder={placeholderTime}
          className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base tabular text-schiste focus:border-schiste focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-granit">Date</span>
        <input
          name={nameDate}
          type="date"
          defaultValue={defaultDate}
          className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base tabular text-schiste focus:border-schiste focus:outline-none"
        />
      </label>
    </div>
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
