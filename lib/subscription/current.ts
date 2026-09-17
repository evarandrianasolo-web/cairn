/**
 * Helpers pour l'etat d'abonnement courant d'un tenant.
 *
 * L'abonnement courant est la ligne la plus recente dans `subscriptions`
 * pour ce tenant, quel que soit son status. Le status determine si
 * l'utilisateur a acces au produit :
 *   - trialing / active : acces complet
 *   - past_due : acces conserve (grace period), warning UI
 *   - canceled / expired : plus d'acces (V2 -- V1 laisse passer)
 *
 * Le trigger `create_trial_on_signup` garantit qu'une ligne existe
 * pour tout tenant nouvellement cree. Les tenants d'avant la migration
 * ont ete backfilles en 'beta' (dogfood).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

export type CurrentSubscription = {
  id: string
  plan_code: string
  status: SubscriptionStatus
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  canceled_at: string | null
  provider: string | null
}

export async function getCurrentSubscription(
  supabase: SupabaseClient,
): Promise<CurrentSubscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'id, plan_code, status, trial_end, current_period_start, current_period_end, canceled_at, provider',
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getCurrentSubscription: ${error.message}`)
  return (data as CurrentSubscription | null) ?? null
}

/** Vrai si l'utilisateur a acces au produit. */
export function hasProductAccess(sub: CurrentSubscription | null): boolean {
  if (!sub) return false
  return (
    sub.status === 'trialing' ||
    sub.status === 'active' ||
    sub.status === 'past_due'
  )
}

/**
 * Jours restants sur un trial. Null si pas en trial ou pas de
 * trial_end. Negatif si trial expire (peut se produire entre le
 * moment ou le trial expire et le webhook Paddle qui met a jour
 * status vers active ou expired).
 */
export function trialDaysLeft(sub: CurrentSubscription | null): number | null {
  if (!sub || !sub.trial_end) return null
  if (sub.status !== 'trialing') return null
  const diffMs = new Date(sub.trial_end).getTime() - Date.now()
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}

/** Libelle humain court d'un status. */
export function statusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case 'trialing':
      return 'Essai en cours'
    case 'active':
      return 'Actif'
    case 'past_due':
      return 'Paiement en retard'
    case 'canceled':
      return 'Annulé'
    case 'expired':
      return 'Expiré'
  }
}
