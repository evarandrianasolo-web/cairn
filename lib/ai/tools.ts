/**
 * Outils du coach — implémentés en P2, tenant_id jamais en paramètre.
 *
 * Le tenant provient TOUJOURS de la session serveur authentifiée, jamais
 * d'un argument fourni par le modèle. Voir CLAUDE.md § Isolation jusqu'à
 * la couche IA.
 */
export const coachTools = [] as const
