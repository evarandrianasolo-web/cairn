/**
 * Prompt + schema structure pour proposer une semaine d'entrainement.
 * Utilise structured outputs (output_config: json_schema) pour garantir
 * un JSON parsable. Consomme par app/planning/actions.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDistance, formatDplus, formatDuree } from '@/lib/format'

export const PLAN_WEEK_SYSTEM = `Tu es le coach trail d'Eva. Elle te demande de proposer une semaine d'entrainement (lundi -> dimanche) coherente avec son contexte : charge des 4 dernieres semaines, prochaine course A, contraintes actives, derniers debriefs et logs fueling.

Regles non negociables :
- Aucun plan alimentaire chiffre ni conseil medical. Pas de mention du poids, de l'IMC ou de la silhouette.
- Le module Fueling est additif : les intents fueling proposent d'ajouter ou de tester, jamais de restreindre.
- Contraintes club (mardi / jeudi actuellement) : tu adaptes l'intention de la seance ce jour-la si le club impose un contenu, mais tu ne places JAMAIS une seance concurrente le meme jour.
- Une seule sortie longue par semaine (samedi ou dimanche, selon course a venir).
- Un jour de repos complet par semaine minimum -- utilise session_type "recup" pour un footing tres doux, ou n'ajoute simplement rien pour du repos total.
- Progressivite raisonnable vs la moyenne des 4 dernieres semaines (+/- 10 a 15 % de charge, sauf indication contraire).
- Si un bloc 'Axes actifs' est fourni : au moins UNE seance de la semaine doit adresser l'axe 1 (priorite), et notes_week doit citer explicitement quels axes tu travailles. Un axe qui parle de renfo -> place un renfo cette semaine. Un axe fueling -> intent qui teste des grammes ou une texture. Un axe descente -> une seance cote / descente.

Choix des types (enum session_type) :
- endurance : footing EF, allure conversationnelle, 45-90 min
- seuil : fractionne court, 10-30 min d'effort au seuil
- vma : intervalles courts et intenses
- cote : cotes courtes ou repetees, D+ specifique
- longue : sortie longue, D+ ou plat selon course A
- recup : footing lent post-seance ou post-course
- renfo : renfo musculaire, gainage, PPG
- rando : rando active, marche + course tres douce
- course : jour de course

Format demande :
- phase : ou en est-elle dans le bloc ? base | specifique | choc | affutage | course | recup
- target_race_id : l'UUID de la course A si la semaine est orientee vers elle, sinon null
- notes_week : 1 a 2 phrases sur l'intention globale de la semaine
- sessions : liste ordonnee (0 a 8 elements) avec pour chaque item :
  - date : YYYY-MM-DD dans la semaine cible
  - session_type : un des enums ci-dessus
  - intent : DESCRIPTION RICHE et EXPLOITABLE le jour meme, 15-40 mots. DOIT contenir :
    1. La STRUCTURE precise (nombre de repetitions, duree ou distance des blocs, temps ou distance de recuperation entre blocs). Exemples : "3 x 8' seuil, r=2' EF", "5 x 1' vma, r=1'30 marche", "8 x 30/30".
    2. L'ALLURE CIBLE en s/km si les references sont fournies dans le contexte (ex : "4:35/km"). Sinon donner un repere de ressenti ("aisance 3/10", "au seuil", "conversation possible").
    3. Le TERRAIN ou RESSENTI attendu ("plat prefere", "cote courte", "cadence 175+", "jambes legeres").
    Exemples corrects :
      * "6 x 800m allure semi 4:35/km, r=1'30 EF, plat prefere, echauffement 15' + retour au calme 10'"
      * "EF vallonnee 6:15-6:45/km, cadence 175+, sensation aisance 3/10 sur la premiere heure"
      * "Longue 3h30 avec 800m D+, ravitos toutes les 45', tester 60 g/h glucides avec 2 compotes + boisson isotonique"
      * "Cotes 8 x 45\" en montee 85% intensite, retour trot 2', chercher jambes en descente relachees"
    Exemples INSUFFISANTS : "seance de seuil" / "sortie longue" (trop vague).
  - duration_min : duree cible en minutes (null si non applicable)
  - distance_km : distance cible en km (null si non applicable)
  - elevation_m : D+ cible en metres (null si non applicable)
  - is_club : true si c'est une seance imposee par le club (mardi / jeudi actuellement, ou selon contraintes)

Si le contexte fournit des ALLURES CIBLES calculees (EF / Seuil / VMA courte), utilise-les DIRECTEMENT dans les intents plutot que de dire "au seuil" abstraitement. Sans references, reste sur des reperes de ressenti.

Si le contexte fournit une BIBLIOTHEQUE PERSONNELLE DE SEANCES : ce sont des modeles qu'Eva a enregistres pour te rendre la vie plus facile. Tu peux les REUTILISER TELS QUELS quand ils correspondent (recopier l'intent, garder duree / distance / D+), ou t'en INSPIRER pour composer une variante calibree au contexte de la semaine. Ce n'est PAS une liste exclusive : si le contexte demande autre chose (une seance specifique liee a un axe, une adaptation a une contrainte), tu proposes librement, c'est ton role de coach.

Reponds UNIQUEMENT en JSON conforme au schema. Aucun preambule.`

export const PLAN_WEEK_SCHEMA = {
  type: 'object',
  properties: {
    phase: {
      type: 'string',
      enum: ['base', 'specifique', 'choc', 'affutage', 'course', 'recup'],
    },
    target_race_id: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    notes_week: { type: 'string' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          session_type: {
            type: 'string',
            enum: [
              'endurance',
              'seuil',
              'vma',
              'cote',
              'longue',
              'recup',
              'renfo',
              'rando',
              'course',
            ],
          },
          intent: { type: 'string' },
          duration_min: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          distance_km: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          elevation_m: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          is_club: { type: 'boolean' },
        },
        required: [
          'date',
          'session_type',
          'intent',
          'duration_min',
          'distance_km',
          'elevation_m',
          'is_club',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['phase', 'target_race_id', 'notes_week', 'sessions'],
  additionalProperties: false,
} as const

export type ProposedSession = {
  date: string
  session_type:
    | 'endurance'
    | 'seuil'
    | 'vma'
    | 'cote'
    | 'longue'
    | 'recup'
    | 'renfo'
    | 'rando'
    | 'course'
  intent: string
  duration_min: number | null
  distance_km: number | null
  elevation_m: number | null
  is_club: boolean
}

const TEMPLATE_TYPE_LABEL: Record<string, string> = {
  endurance: 'EF',
  seuil: 'Seuil',
  vma: 'VMA',
  cote: 'Cotes',
  longue: 'Longue',
  recup: 'Recup',
  renfo: 'Renfo',
  rando: 'Rando',
  course: 'Course',
}

/**
 * Bloc "Bibliotheque personnelle" injecte au userPrompt. Format
 * compact pour eviter de gonfler le contexte : nom + type + duree
 * + distance + D+, sans les intents complets (le coach peut piocher
 * via get_session_templates si besoin de detail).
 *
 * Retourne "" si la banque est vide -- pas d'entete inutile.
 */
export async function buildBibliothequeBlock(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from('session_templates')
    .select(
      'name, session_type, intent, default_duration_s, default_distance_m, default_elevation_m',
    )
    .order('session_type', { ascending: true })
    .order('name', { ascending: true })
    .limit(40)
  if (error || !data || data.length === 0) return ''

  const lines = data.map((t) => {
    const label = TEMPLATE_TYPE_LABEL[t.session_type ?? ''] ?? t.session_type
    const bits: string[] = []
    if (t.default_duration_s) bits.push(formatDuree(t.default_duration_s))
    if (t.default_distance_m) bits.push(formatDistance(t.default_distance_m))
    if (t.default_elevation_m) bits.push(formatDplus(t.default_elevation_m))
    const meta = bits.length > 0 ? ` (${bits.join(' · ')})` : ''
    const shortIntent =
      typeof t.intent === 'string' && t.intent.length > 0
        ? ` — ${t.intent.slice(0, 140)}`
        : ''
    return `- [${label}] ${t.name}${meta}${shortIntent}`
  })

  return `\n## Bibliotheque personnelle de seances (${data.length} modeles)\nInspiration -- non exclusive. Reutilise / adapte / ignore selon la semaine.\n${lines.join('\n')}\n`
}

export type ProposedWeek = {
  phase: 'base' | 'specifique' | 'choc' | 'affutage' | 'course' | 'recup'
  target_race_id: string | null
  notes_week: string
  sessions: ProposedSession[]
}
