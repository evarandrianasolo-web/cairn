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
import { formatPace } from '@/lib/paces'

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
  {
    name: 'propose_race',
    description:
      'Propose l\'ajout d\'une course quand Eva mentionne un dossard qu\'elle vient de prendre ou une course qu\'elle vise. Le tool CREE UNE PROPOSITION EN ATTENTE, il n\'ecrit rien dans la table races. N\'appelle ce tool que si l\'information est explicite (nom + date au minimum). Ne l\'appelle pas si la course est deja dans le contexte.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom de la course.' },
        race_date: {
          type: 'string',
          description: 'Date YYYY-MM-DD.',
        },
        priority: {
          type: 'string',
          enum: ['A', 'B', 'C'],
          description:
            'A = course objectif majeur, B = course preparatoire, C = course plaisir / bench.',
        },
        location: { type: 'string', description: 'Optionnel. Lieu.' },
        distance_m: {
          type: 'integer',
          description: 'Optionnel. Distance en metres.',
        },
        elevation_gain_m: {
          type: 'integer',
          description: 'Optionnel. Denivele positif en metres.',
        },
        goal_time_s: {
          type: 'integer',
          description: 'Optionnel. Temps objectif en secondes.',
        },
        notes: {
          type: 'string',
          description:
            'Optionnel. Notes strategiques courtes (materiel, ravito, pacing).',
        },
      },
      required: ['name', 'race_date', 'priority'],
    },
  },
  {
    name: 'get_activity_laps',
    description:
      'Renvoie les laps (splits) d\'une activite d\'Eva : allure, distance et duree de chaque bloc, plus les meilleurs splits agreges. Utilise ce tool quand Eva veut un debrief technique d\'une seance de vitesse (VMA, seuil, fractionnes) ou quand tu veux commenter les blocs d\'effort separement de la moyenne. Les laps manuels (bouton lap sur la montre) sont plus fideles que les auto-lap kilometriques. Aucune donnee de FC n\'est renvoyee.',
    input_schema: {
      type: 'object',
      properties: {
        activity_id: {
          type: 'string',
          description:
            'UUID de l\'activite dont on veut les laps. Recuperable via les 10 dernieres seances du contexte ou via get_activity_detail.',
        },
      },
      required: ['activity_id'],
    },
  },
  {
    name: 'get_session_templates',
    description:
      'Renvoie la banque de modeles de seances d\'Eva (banque personnelle, editable). Utilise ce tool quand Eva demande "montre-moi mes seances VMA", "quels modeles de renfo j\'ai enregistres", ou quand tu dois piocher une idee de seance calibree pour composer un plan. Filtrable par type. Si vide, propose-lui d\'aller sur /seances pour charger la banque de depart.',
    input_schema: {
      type: 'object',
      properties: {
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
          description:
            'Optionnel. Restreint la liste a un type. Sans filtre, renvoie tous les templates groupes par type.',
        },
      },
      required: [],
    },
  },
  {
    name: 'propose_debrief_axis',
    description:
      'Propose l\'ajout d\'un axe de travail au DERNIER debrief d\'Eva quand elle mentionne un apprentissage post-course qui n\'est pas encore dans les axes actifs. Le tool CREE UNE PROPOSITION EN ATTENTE. N\'appelle ce tool que si l\'axe est explicite dans le message et absent du contexte (les axes actifs sont listes). Formule l\'axe en objectif actionnable, verbe a l\'infinitif.',
    input_schema: {
      type: 'object',
      properties: {
        axis: {
          type: 'string',
          description:
            'Libelle de l\'axe. Ex : "Tester des batons sur les longues avec D+", "Renfo excentrique quadriceps pour les descentes cassantes".',
        },
      },
      required: ['axis'],
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
  get_activity_laps: handleGetActivityLaps,
  get_session_templates: handleGetSessionTemplates,
  propose_constraint: handleProposeConstraint,
  propose_race: handleProposeRace,
  propose_debrief_axis: handleProposeDebriefAxis,
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

async function handleGetActivityLaps(
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

  // La RLS filtre : Eva ne peut lire que ses propres laps.
  const [{ data: activity }, { data: laps }] = await Promise.all([
    supabase
      .from('activities')
      .select('id, name, started_at, distance_m, elevation_gain_m, moving_time_s, avg_pace_s_per_km')
      .eq('id', activityId)
      .maybeSingle(),
    supabase
      .from('activity_laps')
      .select('lap_index, distance_m, moving_time_s, avg_pace_s_per_km, elevation_gain_m, is_manual')
      .eq('activity_id', activityId)
      .order('lap_index', { ascending: true }),
  ])

  if (!activity) return { error: 'activite introuvable' }
  if (!laps || laps.length === 0) {
    return {
      activity_id: activityId,
      name: activity.name,
      date: activity.started_at,
      laps: [],
      message:
        'Aucun lap enregistre pour cette activite. Eva peut lancer le backfill depuis /settings/strava.',
    }
  }

  const isManual = laps.some((l) => l.is_manual)

  // Meilleur split par distance canonique -- utile pour dire "meilleur
  // 1 km 4:01/km" sans que le modele ait a scanner tous les laps.
  const bestSplit = (targetKm: number) => {
    const candidates = laps
      .filter((l) => Math.abs(l.distance_m / 1000 - targetKm) / targetKm <= 0.1)
      .map((l) => ({
        pace: l.avg_pace_s_per_km ?? l.moving_time_s / (l.distance_m / 1000),
        lap_index: l.lap_index,
        distance_m: l.distance_m,
        moving_time_s: l.moving_time_s,
      }))
      .sort((a, b) => a.pace - b.pace)
    return candidates[0] ?? null
  }

  const best500 = bestSplit(0.5)
  const best1000 = bestSplit(1)
  const best2000 = bestSplit(2)

  return {
    activity_id: activityId,
    name: activity.name,
    date: activity.started_at,
    date_courte: formatDateCourte(activity.started_at),
    distance: formatDistance(activity.distance_m),
    duree: formatDuree(activity.moving_time_s),
    allure_moyenne: formatPace(activity.avg_pace_s_per_km),
    source_laps: isManual ? 'manuels' : 'auto-km',
    nb_laps: laps.length,
    meilleurs_splits: {
      '500m': best500
        ? {
            allure: formatPace(best500.pace),
            temps: formatDuree(best500.moving_time_s),
            lap: best500.lap_index,
          }
        : null,
      '1km': best1000
        ? {
            allure: formatPace(best1000.pace),
            temps: formatDuree(best1000.moving_time_s),
            lap: best1000.lap_index,
          }
        : null,
      '2km': best2000
        ? {
            allure: formatPace(best2000.pace),
            temps: formatDuree(best2000.moving_time_s),
            lap: best2000.lap_index,
          }
        : null,
    },
    // Limite a 40 laps pour eviter d'exploser le contexte : au-dela
    // c'est un signe de sortie longue avec auto-lap, l'agrege suffit.
    laps: laps.slice(0, 40).map((l) => {
      const pace =
        l.avg_pace_s_per_km ?? l.moving_time_s / (l.distance_m / 1000)
      return {
        n: l.lap_index,
        distance: `${(l.distance_m / 1000).toFixed(2)} km`,
        temps: formatDuree(l.moving_time_s),
        allure: formatPace(pace),
        d_plus: l.elevation_gain_m ?? 0,
      }
    }),
  }
}

const SESSION_TYPES = [
  'endurance',
  'seuil',
  'vma',
  'cote',
  'longue',
  'recup',
  'renfo',
  'rando',
  'course',
] as const

async function handleGetSessionTemplates(
  input: unknown,
  { supabase }: ToolContext,
): Promise<unknown> {
  const i = (input ?? {}) as Record<string, unknown>
  const filter = typeof i.session_type === 'string' ? i.session_type : null
  if (filter && !(SESSION_TYPES as readonly string[]).includes(filter)) {
    return { error: `session_type invalide (attendus : ${SESSION_TYPES.join(', ')})` }
  }

  let query = supabase
    .from('session_templates')
    .select(
      'name, session_type, intent, default_duration_s, default_distance_m, default_elevation_m',
    )
    .order('session_type', { ascending: true })
    .order('name', { ascending: true })
  if (filter) query = query.eq('session_type', filter)

  const { data, error } = await query
  if (error) return { error: `lecture templates : ${error.message}` }

  const rows = data ?? []
  if (rows.length === 0) {
    return {
      count: 0,
      message:
        'La banque est vide. Eva peut la remplir depuis /seances (bouton "Charger la banque de depart" pour un lot calibre, ou creation manuelle).',
    }
  }

  const grouped: Record<string, typeof rows> = {}
  for (const t of rows) {
    const key = t.session_type ?? 'autre'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  }

  return {
    count: rows.length,
    templates: Object.entries(grouped).map(([type, items]) => ({
      type,
      items: items.map((t) => ({
        name: t.name,
        intent: t.intent,
        duree: t.default_duration_s
          ? formatDuree(t.default_duration_s)
          : null,
        distance: t.default_distance_m
          ? formatDistance(t.default_distance_m)
          : null,
        d_plus: t.default_elevation_m
          ? formatDplus(t.default_elevation_m)
          : null,
      })),
    })),
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

const RACE_PRIORITIES = ['A', 'B', 'C'] as const

async function handleProposeRace(
  input: unknown,
  { supabase, tenantId, threadId }: ToolContext,
): Promise<unknown> {
  if (typeof input !== 'object' || input === null) return { error: 'input invalide' }
  const i = input as Record<string, unknown>
  const name = typeof i.name === 'string' ? i.name.trim() : ''
  const race_date = typeof i.race_date === 'string' ? i.race_date.trim() : ''
  const priority = String(i.priority ?? '')
  if (!name) return { error: 'name manquant' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(race_date))
    return { error: 'race_date doit etre au format YYYY-MM-DD' }
  if (!(RACE_PRIORITIES as readonly string[]).includes(priority))
    return {
      error: `priority invalide (attendus : ${RACE_PRIORITIES.join(', ')})`,
    }

  const toInt = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null

  const payload = {
    name,
    race_date,
    priority,
    location: typeof i.location === 'string' ? i.location.trim() || null : null,
    distance_m: toInt(i.distance_m),
    elevation_gain_m: toInt(i.elevation_gain_m),
    goal_time_s: toInt(i.goal_time_s),
    notes: typeof i.notes === 'string' ? i.notes.trim() || null : null,
  }

  const { data, error } = await supabase
    .from('coach_proposals')
    .insert({
      tenant_id: tenantId,
      thread_id: threadId,
      kind: 'race',
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
      'Proposition course enregistree. Bulle avec Accepter / Rejeter en fin de conversation.',
  }
}

async function handleProposeDebriefAxis(
  input: unknown,
  { supabase, tenantId, threadId }: ToolContext,
): Promise<unknown> {
  if (typeof input !== 'object' || input === null) return { error: 'input invalide' }
  const i = input as Record<string, unknown>
  const axis = typeof i.axis === 'string' ? i.axis.trim() : ''
  if (!axis) return { error: 'axis manquant' }
  if (axis.length > 300) return { error: 'axis trop long (300 caracteres max)' }

  // On lie a l'id du dernier debrief pour que l'acceptation puisse
  // append. Si aucun debrief : proposition refusee cote tool -- le
  // coach devrait alors passer par un debrief-from-notes.
  const { data: lastDebrief, error: dbErr } = await supabase
    .from('debriefs')
    .select('id, race:races(name)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (dbErr) return { error: `lookup debrief: ${dbErr.message}` }
  if (!lastDebrief)
    return {
      error:
        'Aucun debrief existant. Propose plutot d\'en creer un via l\'ecran /activities.',
    }

  const rawRace = (lastDebrief as { race?: { name: string } | { name: string }[] | null }).race
  const race = Array.isArray(rawRace) ? rawRace[0] ?? null : rawRace

  const payload = {
    axis,
    debrief_id: lastDebrief.id,
    debrief_race_name: race?.name ?? null,
  }

  const { data, error } = await supabase
    .from('coach_proposals')
    .insert({
      tenant_id: tenantId,
      thread_id: threadId,
      kind: 'debrief_axis',
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
      'Proposition d\'axe enregistree. L\'axe sera ajoute au dernier debrief si Eva accepte.',
  }
}
