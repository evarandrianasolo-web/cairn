export const CONSENT_POLICY_VERSION = 'v1-2026-07'

export const CONSENT_TEXTS = {
  fc_stockage: `Stocker ma fréquence cardiaque pour l'analyse.
Sans ce consentement, la FC est filtrée à l'ingestion et jamais écrite en base.`,
  fc_analyse_ia: `Autoriser le coach IA à utiliser ma FC dans son analyse.
Le coach ne reçoit jamais de valeurs brutes, uniquement des tendances dérivées.`,
  stats_anonymes: `Contribuer à des statistiques agrégées et anonymisées.
Aucun impact sur mon expérience d'utilisation.`,
} as const

export type ConsentScope = keyof typeof CONSENT_TEXTS
