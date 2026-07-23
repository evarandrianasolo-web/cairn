/**
 * Periodisation retroplan course A. Modele standard trail / ultra :
 * base -> specifique -> choc -> affutage -> course -> recup.
 *
 * Les paliers sont exprimes en jours AVANT la course A (positifs) ou
 * en jours APRES (negatifs pour la course elle-meme et la recup). Ces
 * valeurs sont volontairement rondes pour rester lisibles ; elles ne
 * pretendent pas se substituer a un entraineur.
 *
 * Consomme cote :
 * - RetroplanMacro (app/planning/page.tsx) pour la couleur theorique
 *   d'une semaine sans plan_week generee
 * - generatePlanWeek / readjustPlanWeek (app/planning/actions.ts) pour
 *   suggerer la phase au coach dans le prompt
 */

export type PlanPhase =
  | 'base'
  | 'specifique'
  | 'choc'
  | 'affutage'
  | 'course'
  | 'recup'

/** Palier en jours avant course A. La semaine dont le lundi tombe a
 * <= N jours de la course entre dans la phase associee. */
const PHASE_THRESHOLDS: { phase: PlanPhase; maxDaysBefore: number }[] = [
  { phase: 'course', maxDaysBefore: 6 }, // la semaine de la course
  { phase: 'affutage', maxDaysBefore: 20 }, // ~3 semaines avant
  { phase: 'choc', maxDaysBefore: 34 }, // ~5 semaines avant
  { phase: 'specifique', maxDaysBefore: 62 }, // ~9 semaines avant
]

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Phase attendue pour la semaine dont le lundi est mondayIso, sachant
 * qu'une course A a lieu a raceDate. Si raceDate est nul ou dans le
 * passe : base. Si le lundi est APRES la course : recup pendant 14
 * jours puis base.
 */
export function phaseFor(mondayIso: string, raceDate: string | null): PlanPhase {
  if (!raceDate) return 'base'
  const monday = new Date(mondayIso + 'T12:00:00Z').getTime()
  const race = new Date(raceDate + 'T12:00:00Z').getTime()
  const daysUntilRace = Math.round((race - monday) / DAY_MS)

  if (daysUntilRace < -14) return 'base'
  if (daysUntilRace < 0) return 'recup'
  for (const t of PHASE_THRESHOLDS) {
    if (daysUntilRace <= t.maxDaysBefore) return t.phase
  }
  return 'base'
}

/** Libelle humain pour rappels dans le prompt et l'UI. */
export const PHASE_INTENT: Record<PlanPhase, string> = {
  base: 'construire l\'endurance de base, volume progressif, pas d\'intensite prolongee',
  specifique: 'developper la specificite trail : cotes repetees, longue avec D+, seuil moyen',
  choc: 'pic de charge : longue tres longue une semaine, seances denses, sommeil et fueling scrutes',
  affutage: 'volume qui descend nettement, intensite courte preservee, on garde la vivacite sans se fatiguer',
  course: 'derniere semaine avant la course : allegement, focus sommeil et fueling, aucune seance longue nouvelle',
  recup: 'recuperation post-course : passif ou tres doux, aucune intensite, on ecoute le corps',
}
