/**
 * Outils exposes au coach IA.
 *
 * Regle absolue (CLAUDE.md § Isolation jusqu'a la couche IA) :
 * le tenant vient TOUJOURS de la session serveur authentifiee -- il
 * n'apparait JAMAIS dans un input_schema. Si un tool a besoin de scoper
 * une lecture, il utilise le client Supabase authentifie passe en second
 * argument du handler, et laisse la RLS filtrer.
 *
 * Regle sante (CLAUDE.md § Donnees de sante) :
 * aucun handler ne renvoie de valeur brute de FC. Seules des donnees
 * derivees (drapeau, tendance) peuvent transiter -- V1 : rien.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import {
  formatAllure,
  formatDateCourte,
  formatDistance,
  formatDplus,
  formatDuree,
} from '@/lib/format'

// ---------- Definitions envoyees a l'API ----------

export const coachTools: Anthropic.Tool[] = [
  {
    name: 'get_activity_detail',
    description:
      'Renvoie le detail complet d\'une activite d\'Eva : metriques precises, notes personnelles, fueling log associe et debrief lie a la course si applicable. Utilise ce tool quand Eva mentionne une seance specifique (par sa date, son nom, ou son emplacement dans la liste) et que le resume du contexte ne suffit pas. Ne renvoie aucune donnee de frequence cardiaque.',
    input_schema: {
      type: 'object',
      properties: {
        activity_id: {
          type: 'string',
          description:
            'UUID de l\'activite. Recuperable via les 10 dernieres seances listees dans le contexte (le premier segment de la ligne, ou par recherche sur date/nom si l\'utilisateur le fournit).',
        },
      },
      required: ['activity_id'],
    },
  },
  {
    name: 'propose_constraint',
    description:
      'Propose la creation d\'une contrainte quand Eva mentionne une information susceptible d\'orienter le plan : garde d\'enfants recurrente, deplacement pro, vacances, blessure, seance club nouvelle. Le tool CREE UNE PROPOSITION EN ATTENTE de validation par Eva -- il n\'ecrit RIEN dans la table constraints. Une bulle apparaitra dans la conversation avec les boutons Accepter/Rejeter. N\'appelle ce tool que si l\'information est explicite dans le message d\'Eva (ne devine pas). Ne l\'appelle pas si la contrainte existe deja (le contexte liste les contraintes actives).',
    input_schema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description:
            'Libelle court, mode telegramme. Ex : "Garde des enfants", "Deplacement Lyon", "Vacances Grau", "Douleur mollet gauche".',
        },
        kind: {
          type: 'string',
          enum: ['recurrente', 'ponctuelle'],
          description:
            'recurrente si evenement cyclique (semaine sur deux, chaque jeudi...). ponctuelle si sur une periode fixe.',
        },
        type: {
          type: 'string',
          enum: ['garde', 'club', 'deplacement', 'vacances', 'meteo', 'blessure', 'travail', 'autre'],
        },
        impact: {
          type: 'string',
          enum: ['bloque', 'allege', 'decale', 'oriente'],
          description:
            'bloque = pas d\'entrainement possible. allege = capacite reduite. decale = seance a bouger. oriente = pas de blocage mais preference de contenu (ex: pas de longue).',
        },
        focus: {
          type: 'string',
          description:
            'Optionnel. Libelle court de la preference si impact=oriente. Ex : "sorties moins longues", "randos privilegiees".',
        },
        starts_on: {
          type: 'string',
          description: 'Optionnel. Date de debut YYYY-MM-DD si connue (obligatoire cote form pour ponctuelle et pour recurrente avec INTERVAL > 1).',
        },
        ends_on: {
          type: 'string',
          description: 'Optionnel. Date de fin YYYY-MM-DD si periode fermee.',
        },
        recurrence_rule: {
          type: 'string',
          description:
            'Optionnel. RRULE format RFC 5545 pour recurrente. Ex : "FREQ=WEEKLY;BYDAY=TU,TH", "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU".',
        },
        notes: {
          type: 'string',
          description: 'Optionnel. Note libre courte pour contexte additionnel.',
        },
      },
      required: ['label', 'kind', 'type', 'impact'],
    },
  },
]

// ---------- Dispatcher ----------

export type ToolContext = {
  supabase: SupabaseClient
  tenantId: string
  threadId: string
}

type ToolHandler = (
  input: unknown,
  ctx: ToolContext,
) => Promise<unknown>

const handlers: Record<string, ToolHandler> = {
  get_activity_detail: handleGetActivityDetail,
  propose_constraint: handleProposeConstraint,
}

/**
 * Execute un tool call reclame par le modele. Retourne le contenu texte
 * a mettre dans le block tool_result. En cas d'erreur, on renvoie un
 * objet {error} plutot que de throw : le modele saura reagir.
 */
export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  const handler = handlers[name]
  if (!handler) {
    return JSON.stringify({ error: `tool inconnu: ${name}` })
  }
  try {
    const result = await handler(input, ctx)
    return JSON.stringify(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return JSON.stringify({ error: msg })
  }
}

// ---------- Handlers ----------

async function handleGetActivityDetail(
  input: unknown,
  { supabase }: ToolContext,
): Promise<unknown> {
  if (typeof input !== 'object' || input === null || !('activity_id' in input)) {
    return { error: 'activity_id manquant' }
  }
  const activityId = String((input as { activity_id: unknown }).activity_id)
  if (!/^[0-9a-fA-F-]{36}$/.test(activityId)) {
    return { error: 'activity_id doit etre un UUID' }
  }

  const { data: activity, error } = await supabase
    .from('activities')
    .select(
      'id, name, sport_type, started_at, distance_m, elevation_gain_m, moving_time_s, elapsed_time_s, avg_pace_s_per_km, avg_cadence, user_notes, race_id',
    )
    .eq('id', activityId)
    .maybeSingle()
  if (error) return { error: `lecture activite : ${error.message}` }
  if (!activity) return { error: 'activite introuvable' }

  const [{ data: fueling }, raceRes] = await Promise.all([
    supabase
      .from('fueling_logs')
      .select(
        'intake_pattern, carbs_g, carbs_g_per_hour, products, issue, post_window_fed, notes',
      )
      .eq('activity_id', activity.id)
      .maybeSingle(),
    activity.race_id
      ? supabase
          .from('races')
          .select(
            'id, name, race_date, priority, distance_m, elevation_gain_m, goal_time_s, result_time_s, location',
          )
          .eq('id', activity.race_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let debrief = null
  if (activity.race_id) {
    const { data } = await supabase
      .from('debriefs')
      .select('kind, narrative, what_worked, what_failed, focus_areas, created_at')
      .eq('race_id', activity.race_id)
      .maybeSingle()
    debrief = data
  }

  const race = raceRes.data as
    | {
        name: string
        race_date: string
        priority: string
        distance_m: number | null
        elevation_gain_m: number | null
        goal_time_s: number | null
        result_time_s: number | null
        location: string | null
      }
    | null

  return {
    id: activity.id,
    date: activity.started_at,
    date_courte: formatDateCourte(activity.started_at),
    name: activity.name,
    sport_type: activity.sport_type,
    distance: formatDistance(activity.distance_m),
    elevation: formatDplus(activity.elevation_gain_m),
    moving_time: formatDuree(activity.moving_time_s),
    elapsed_time: formatDuree(activity.elapsed_time_s),
    avg_pace: formatAllure(activity.avg_pace_s_per_km),
    avg_cadence: activity.avg_cadence,
    user_notes: activity.user_notes,
    race: race
      ? {
          name: race.name,
          date: race.race_date,
          priority: race.priority,
          distance: formatDistance(race.distance_m),
          elevation: formatDplus(race.elevation_gain_m),
          location: race.location,
          goal_time: race.goal_time_s ? formatDuree(race.goal_time_s) : null,
          result_time: race.result_time_s ? formatDuree(race.result_time_s) : null,
        }
      : null,
    fueling: fueling
      ? {
          intake_pattern: fueling.intake_pattern,
          carbs_g_per_hour: fueling.carbs_g_per_hour,
          carbs_g_total: fueling.carbs_g,
          products:
            (fueling.products as { text?: string } | null)?.text ?? null,
          issue: fueling.issue,
          post_window_fed: fueling.post_window_fed,
          notes: fueling.notes,
        }
      : null,
    debrief: debrief
      ? {
          kind: debrief.kind,
          narrative: debrief.narrative,
          what_worked: debrief.what_worked,
          what_failed: debrief.what_failed,
          focus_areas: debrief.focus_areas,
        }
      : null,
  }
}

const CONSTRAINT_KINDS = ['recurrente', 'ponctuelle'] as const
const CONSTRAINT_TYPES = [
  'garde',
  'club',
  'deplacement',
  'vacances',
  'meteo',
  'blessure',
  'travail',
  'autre',
] as const
const CONSTRAINT_IMPACTS = ['bloque', 'allege', 'decale', 'oriente'] as const

async function handleProposeConstraint(
  input: unknown,
  { supabase, tenantId, threadId }: ToolContext,
): Promise<unknown> {
  if (typeof input !== 'object' || input === null) {
    return { error: 'input invalide' }
  }
  const i = input as Record<string, unknown>
  const label = typeof i.label === 'string' ? i.label.trim() : ''
  const kind = String(i.kind ?? '')
  const type = String(i.type ?? '')
  const impact = String(i.impact ?? '')
  if (!label) return { error: 'label manquant' }
  if (!(CONSTRAINT_KINDS as readonly string[]).includes(kind))
    return { error: `kind invalide (attendus : ${CONSTRAINT_KINDS.join(', ')})` }
  if (!(CONSTRAINT_TYPES as readonly string[]).includes(type))
    return { error: `type invalide (attendus : ${CONSTRAINT_TYPES.join(', ')})` }
  if (!(CONSTRAINT_IMPACTS as readonly string[]).includes(impact))
    return {
      error: `impact invalide (attendus : ${CONSTRAINT_IMPACTS.join(', ')})`,
    }

  const payload = {
    label,
    kind,
    type,
    impact,
    focus: typeof i.focus === 'string' ? i.focus.trim() || null : null,
    starts_on: typeof i.starts_on === 'string' ? i.starts_on : null,
    ends_on: typeof i.ends_on === 'string' ? i.ends_on : null,
    recurrence_rule:
      typeof i.recurrence_rule === 'string' ? i.recurrence_rule : null,
    notes: typeof i.notes === 'string' ? i.notes.trim() || null : null,
  }

  const { data, error } = await supabase
    .from('coach_proposals')
    .insert({
      tenant_id: tenantId,
      thread_id: threadId,
      kind: 'constraint',
      payload,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) return { error: `insert proposal: ${error.message}` }

  return {
    ok: true,
    proposal_id: data.id,
    message:
      'Proposition enregistree. Une bulle apparaitra dans la conversation avec les boutons Accepter / Rejeter pour qu\'Eva confirme.',
  }
}
