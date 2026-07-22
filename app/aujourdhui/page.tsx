import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DeuxBarres } from '@/components/marks/deux-barres'
import { Chevron } from '@/components/marks/chevron'
import { Croix } from '@/components/marks/croix'
import { formatJMinus } from '@/lib/format'
import { JeNePeuxPas } from './je-ne-peux-pas'

type Etat = 'nominal' | 'reajustement' | 'repos'

type NextRace = { name: string; race_date: string } | null

const META_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
})

async function nextARace(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<NextRace> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('races')
    .select('name, race_date')
    .eq('priority', 'A')
    .gte('race_date', today)
    .order('race_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

const DISPLAY_STYLE = { fontVariationSettings: "'wdth' 125" } as const
const DATA_STYLE = { letterSpacing: '-0.03em' } as const

/**
 * Écran « Aujourd'hui » — première fidèle du handoff Claude Design.
 * Trois états statiques pour l'instant (?etat=nominal|reajustement|repos).
 * Le contenu est calqué sur la maquette : pas encore branché sur
 * planned_sessions / activities. La lecture réelle vient quand le plan est
 * peuplé et que le coach P2 arrive.
 */
export default async function AujourdhuiPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: Etat }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { etat = 'nominal' } = await searchParams
  const race = await nextARace(supabase)

  return (
    <main className="mx-auto flex min-h-[calc(100vh-52px)] w-full max-w-[390px] flex-col bg-brume px-[26px] py-8">
      <MetaLine race={race} />
      {etat === 'repos' ? <EtatRepos /> : <EtatSeance kind={etat} />}
      <DevSwitch etat={etat} />
    </main>
  )
}

function MetaLine({ race }: { race: NextRace }) {
  const dateLabel = META_DATE.format(new Date())
  return (
    <div className="flex justify-between font-mono text-xs text-granit" style={DATA_STYLE}>
      <span>{dateLabel}</span>
      {race ? (
        <span>
          {formatJMinus(race.race_date)} · {shortName(race.name)}
        </span>
      ) : (
        <span>pas de course A</span>
      )}
    </div>
  )
}

function shortName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= 6) return trimmed
  const initials = trimmed
    .split(/\s+/)
    .filter((w) => /^[A-ZÀ-Ý]/.test(w))
    .map((w) => w[0])
    .join('')
  return initials.length >= 2 ? initials : trimmed.slice(0, 6).toUpperCase()
}

function EtatRepos() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <DeuxBarres size={22} />
      <h1
        className="font-display text-display-l font-extrabold uppercase leading-none tracking-[0.05em] text-schiste"
        style={DISPLAY_STYLE}
      >
        Repos
      </h1>
    </div>
  )
}

function EtatSeance({ kind }: { kind: 'nominal' | 'reajustement' }) {
  const nominal = kind === 'nominal'
  const Mark = nominal ? DeuxBarres : Chevron
  const markSize = nominal ? 20 : 22
  const titre = nominal ? 'SORTIE LONGUE' : '6 × 1000 SEUIL'
  const donnees = nominal
    ? '2 h 15 · 850 D+ · EF 6:15–6:45'
    : "4:35/km · R = 2′ · 6 km d'effort"
  const coach = nominal
    ? "Deuxième semaine du bloc spécifique. L'objectif est la durabilité, pas l'allure : tu dois finir en pouvant repartir."
    : "Ton fractionné de mardi a sauté, tu étais en déplacement. Je le remets aujourd'hui : la charge de la semaine ne bouge pas, seul le jour change."
  const fuelMain = nominal ? '~60 g/h' : 'échauffe 20′'
  const fuelSuite = nominal
    ? '— la dernière fois : compote + boisson à 40 g/l.'
    : '— séance courte, hydratation seulement, pas de gel.'
  const changedOpen = !nominal

  return (
    <>
      <div className="mt-[46px]">
        <Mark size={markSize} />
      </div>

      <h1
        className="mt-[14px] font-display text-2xl font-extrabold uppercase leading-none tracking-[0.03em] text-schiste"
        style={DISPLAY_STYLE}
      >
        {titre}
      </h1>

      <p
        className="mt-3 font-mono text-sm text-schiste [font-variant-numeric:tabular-nums]"
        style={DATA_STYLE}
      >
        {donnees}
      </p>

      <div className="mt-[26px] rounded-surface border border-granit/20 bg-craie p-[18px]">
        <p className="text-lg leading-[1.5] text-schiste">{coach}</p>
      </div>

      <p className="mt-[14px] text-base text-granit">
        <span
          className="font-mono text-sm text-schiste [font-variant-numeric:tabular-nums]"
          style={DATA_STYLE}
        >
          {fuelMain}
        </span>{' '}
        {fuelSuite}
      </p>

      <div className="mt-[30px] flex gap-3">
        <JeNePeuxPas />
        <button
          type="button"
          className="flex-1 rounded-surface border border-schiste bg-schiste px-4 py-3 text-base font-medium text-craie"
        >
          En parler
        </button>
      </div>

      <div className="flex-1" />

      <details className="border-t border-granit/20 pt-[18px]" open={changedOpen}>
        <summary className="flex cursor-pointer list-none items-center gap-3 text-base font-medium text-schiste [&::-webkit-details-marker]:hidden">
          <Mark size={17} />
          <span className="flex-1">Ce qui a changé depuis hier</span>
          <span className="font-mono text-granit">{changedOpen ? '−' : '+'}</span>
        </summary>
        {nominal ? (
          <p className="mt-3 text-base text-granit">Rien.</p>
        ) : (
          <div className="mt-3 space-y-2 text-base text-granit">
            <p className="flex items-start gap-3">
              <Chevron size={17} />
              <span>
                Le fractionné passe de{' '}
                <span
                  className="font-mono text-sm text-schiste [font-variant-numeric:tabular-nums]"
                  style={DATA_STYLE}
                >
                  mar.
                </span>{' '}
                à{' '}
                <span
                  className="font-mono text-sm text-schiste [font-variant-numeric:tabular-nums]"
                  style={DATA_STYLE}
                >
                  mer.
                </span>
              </span>
            </p>
            <p className="flex items-start gap-3">
              <Croix size={16} />
              <span>
                Footing de récup de{' '}
                <span
                  className="font-mono text-sm [font-variant-numeric:tabular-nums]"
                  style={DATA_STYLE}
                >
                  lun.
                </span>{' '}
                — non fait.
              </span>
            </p>
          </div>
        )}
      </details>
    </>
  )
}

/**
 * Sélecteur d'état de dev, invisible en production. Permet de basculer entre
 * les trois maquettes sans taper l'URL à la main. À retirer quand l'état
 * viendra vraiment du plan.
 */
function DevSwitch({ etat }: { etat: Etat }) {
  const options: Etat[] = ['nominal', 'reajustement', 'repos']
  return (
    <div className="mt-6 flex justify-center gap-2 text-xs text-granit">
      {options.map((o) => (
        <a
          key={o}
          href={`/aujourdhui?etat=${o}`}
          className={
            'rounded-data border border-granit/20 px-2 py-0.5 ' +
            (etat === o ? 'bg-craie text-schiste' : '')
          }
        >
          {o}
        </a>
      ))}
    </div>
  )
}
