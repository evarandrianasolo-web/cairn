import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  getCurrentSubscription,
  hasProductAccess,
  statusLabel,
  trialDaysLeft,
} from '@/lib/subscription/current'

type PlanRow = {
  code: string
  name: string
  price_cents: number
  currency: string
  interval: 'month' | 'year' | 'trial'
  description: string | null
  is_public: boolean
  sort_order: number
}

const PLAN_LABEL: Record<string, string> = {
  beta: 'Beta interne',
  trial: 'Essai gratuit 7 jours',
  coach_mensuel: 'Coach mensuel',
  coach_annuel: 'Coach annuel',
}

export default async function AbonnementPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [sub, { data: plans }] = await Promise.all([
    getCurrentSubscription(supabase),
    supabase
      .from('subscription_plans')
      .select(
        'code, name, price_cents, currency, interval, description, is_public, sort_order',
      )
      .eq('is_public', true)
      .order('sort_order', { ascending: true }),
  ])

  const publicPlans = (plans ?? []) as PlanRow[]
  const daysLeft = trialDaysLeft(sub)
  const access = hasProductAccess(sub)

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <ScreenTitle>Abonnement</ScreenTitle>

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Statut actuel
        </h2>
        {sub ? (
          <>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-bold text-schiste">
                  {PLAN_LABEL[sub.plan_code] ?? sub.plan_code}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-granit">
                  {statusLabel(sub.status)}
                  {access ? '' : ' — accès limité'}
                </p>
              </div>
              {daysLeft != null && (
                <div className="text-right">
                  <p className="font-display text-3xl font-black leading-none text-balise">
                    {daysLeft > 0 ? `J−${daysLeft}` : 'aujourd\'hui'}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-granit">
                    fin d&apos;essai
                  </p>
                </div>
              )}
            </div>
            {sub.plan_code === 'beta' && (
              <p className="mt-3 text-xs italic text-granit">
                Compte interne dogfood — accès complet sans facturation. Pas
                impacté par l&apos;ouverture publique.
              </p>
            )}
            {sub.plan_code === 'trial' && daysLeft != null && daysLeft <= 0 && (
              <p className="mt-3 text-sm text-ocre">
                Ton essai est terminé. Souscrivez à un plan pour continuer à
                utiliser Cairn.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-granit">
            Aucun abonnement actif — contacte le support.
          </p>
        )}
      </section>

      <section className="rounded-data border border-brume bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          Plans disponibles
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {publicPlans.map((p) => (
            <PlanCard key={p.code} plan={p} />
          ))}
        </ul>
      </section>

      <section className="rounded-data border border-ocre/40 bg-craie p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-ocre">
          Ouverture publique — en attente
        </h2>
        <p className="mt-2 text-sm text-schiste">
          Cairn n&apos;accepte pas encore d&apos;abonnements payants. Trois
          chantiers de conformité doivent être validés avant :
        </p>
        <ul className="mt-3 space-y-1 text-sm text-schiste">
          <li>
            <span className="font-mono text-[10px] text-ocre">1.</span>{' '}
            <span className="font-medium">AIPD</span> — analyse d&apos;impact
            (art. 35 RGPD) obligatoire dès le premier utilisateur externe
            (données de santé + coach IA).
          </li>
          <li>
            <span className="font-mono text-[10px] text-ocre">2.</span>{' '}
            <span className="font-medium">
              Conditions commerciales Strava
            </span>{' '}
            — validation du modèle payant vs. les termes API.
          </li>
          <li>
            <span className="font-mono text-[10px] text-ocre">3.</span>{' '}
            <span className="font-medium">CGV + mentions légales</span> — texte
            à rédiger, obligation vente en ligne France.
          </li>
        </ul>
        <p className="mt-3 text-xs italic text-granit">
          Cf. <Link href="/" className="underline">CLAUDE.md § Chantiers en cours</Link>{' '}
          et <span className="tabular font-mono">docs/paiement-paddle.md</span>{' '}
          pour la séquence d&apos;activation Paddle.
        </p>
      </section>
    </main>
  )
}

function PlanCard({ plan }: { plan: PlanRow }) {
  const priceEur = (plan.price_cents / 100).toFixed(2).replace('.', ',')
  const intervalLabel = plan.interval === 'month' ? '/ mois' : '/ an'
  const yearlyDiscount =
    plan.code === 'coach_annuel' ? '2 mois offerts vs mensuel' : null

  return (
    <li className="flex flex-col rounded-data border border-brume bg-brume/30 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-schiste">{plan.name}</h3>
        {yearlyDiscount && (
          <span className="font-mono text-[10px] text-lichen">
            {yearlyDiscount}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-3xl font-black leading-none text-schiste">
        <span className="tabular">{priceEur}</span>
        <span className="ml-1 text-sm font-normal text-granit">€</span>
        <span className="ml-2 text-xs font-normal text-granit">
          {intervalLabel}
        </span>
      </p>
      {plan.description && (
        <p className="mt-3 text-xs text-granit">{plan.description}</p>
      )}
      <button
        type="button"
        disabled
        className="mt-4 cursor-not-allowed rounded-surface border border-granit/30 bg-brume/50 px-3 py-2 text-sm font-medium text-granit"
        title="Paiement non encore activé"
      >
        S&apos;abonner — bientôt
      </button>
    </li>
  )
}
