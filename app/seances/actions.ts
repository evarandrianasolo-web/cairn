'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Templates par defaut inspires du contexte trail / ultra d'Eva.
 * Les intents sont deja formates a la maniere du prompt PLAN_WEEK_SYSTEM :
 * structure + allure/ressenti + terrain. Peuvent etre edites ou
 * supprimes plus tard par l'utilisateur.
 */
type SeedTemplate = {
  name: string
  session_type:
    | 'endurance'
    | 'seuil'
    | 'vma'
    | 'cote'
    | 'longue'
    | 'recup'
    | 'renfo'
    | 'rando'
  intent: string
  default_duration_s: number | null
  default_distance_m: number | null
  default_elevation_m: number | null
}

const DEFAULT_TEMPLATES: SeedTemplate[] = [
  {
    name: 'EF courte 45\'',
    session_type: 'endurance',
    intent:
      'Footing conversationnel 45 min, allure EF (6:15-6:45/km si allures cibles renseignees), cadence 175+, plat ou vallonne leger.',
    default_duration_s: 45 * 60,
    default_distance_m: 7000,
    default_elevation_m: 50,
  },
  {
    name: 'EF moyenne 1h',
    session_type: 'endurance',
    intent:
      'EF terrain roulant 1h, allure conversationnelle EF, cadence 175+, sensation aisance 3/10.',
    default_duration_s: 60 * 60,
    default_distance_m: 10000,
    default_elevation_m: 100,
  },
  {
    name: 'EF vallonnee 1h15',
    session_type: 'endurance',
    intent:
      'EF vallonnee 1h15 avec 300 m D+, marche autorisee en cote raide, garder cadence en descente.',
    default_duration_s: 75 * 60,
    default_distance_m: 11000,
    default_elevation_m: 300,
  },
  {
    name: 'Seuil 3 x 8\'',
    session_type: 'seuil',
    intent:
      '15 min echauffement EF progressif + 3 x 8 min allure semi (Seuil derive), r=2 min EF entre blocs, + 10 min retour au calme.',
    default_duration_s: 60 * 60,
    default_distance_m: 11000,
    default_elevation_m: 80,
  },
  {
    name: 'Seuil pyramide 5+8+10+8+5',
    session_type: 'seuil',
    intent:
      '15 min echauffement + pyramide 5-8-10-8-5 min allure semi, r=2 min EF, plat privilegie.',
    default_duration_s: 75 * 60,
    default_distance_m: 13000,
    default_elevation_m: 80,
  },
  {
    name: 'Seuil 4 x 2000 m',
    session_type: 'seuil',
    intent:
      '15 min echauffement + 4 x 2000 m allure 10 km r=2 min 30, piste ou plat, retour au calme 10 min.',
    default_duration_s: 65 * 60,
    default_distance_m: 12000,
    default_elevation_m: 40,
  },
  {
    name: 'VMA 12 x 30/30',
    session_type: 'vma',
    intent:
      '15 min echauffement + 12 x 30/30 allure VMA courte / trot recuperation + 10 min retour au calme, terrain plat.',
    default_duration_s: 50 * 60,
    default_distance_m: 9000,
    default_elevation_m: 30,
  },
  {
    name: 'VMA 6 x 500 m',
    session_type: 'vma',
    intent:
      '10 min echauffement + 6 x 500 m allure 5 km r=1 min 30 trot + 10 min retour au calme.',
    default_duration_s: 50 * 60,
    default_distance_m: 9000,
    default_elevation_m: 30,
  },
  {
    name: 'VMA 4 x 800 m',
    session_type: 'vma',
    intent:
      '15 min echauffement + 4 x 800 m allure 5 km, r=2 min EF, + 10 min retour au calme.',
    default_duration_s: 55 * 60,
    default_distance_m: 10000,
    default_elevation_m: 40,
  },
  {
    name: 'Cotes courtes 8 x 45"',
    session_type: 'cote',
    intent:
      '20 min echauffement + 8 x 45 s en cote a 85 % intensite, descente en trot relachee 2 min, + 10 min retour au calme.',
    default_duration_s: 70 * 60,
    default_distance_m: 10000,
    default_elevation_m: 300,
  },
  {
    name: 'Cotes longues 6 x 3\'',
    session_type: 'cote',
    intent:
      '15 min echauffement + 6 x 3 min cote au seuil, descente en trot leger, retour au calme 10 min.',
    default_duration_s: 75 * 60,
    default_distance_m: 11000,
    default_elevation_m: 400,
  },
  {
    name: 'Cotes bloc 3 x (3 x 1\')',
    session_type: 'cote',
    intent:
      '15 min echauffement + 3 blocs de 3 x 1 min cote r=1 min entre reps, r=3 min entre blocs, + retour au calme.',
    default_duration_s: 65 * 60,
    default_distance_m: 10000,
    default_elevation_m: 350,
  },
  {
    name: 'Longue plate 2h',
    session_type: 'longue',
    intent:
      'Sortie longue 2 h allure EF, ravitos toutes les 45 min, tester 50-60 g/h glucides (compotes + boisson isotonique).',
    default_duration_s: 120 * 60,
    default_distance_m: 20000,
    default_elevation_m: 200,
  },
  {
    name: 'Longue vallonnee 3h',
    session_type: 'longue',
    intent:
      'Sortie longue 3 h avec 800 m D+, marche en cote raide, allure aisance 3/10, viser 60 g/h glucides.',
    default_duration_s: 180 * 60,
    default_distance_m: 22000,
    default_elevation_m: 800,
  },
  {
    name: 'Longue avec D+ 4h',
    session_type: 'longue',
    intent:
      'Format course : 4 h avec 1200 m D+, tester materiel (sac, chaussures), fueling structure 60 g/h + 500 ml/h eau.',
    default_duration_s: 240 * 60,
    default_distance_m: 28000,
    default_elevation_m: 1200,
  },
  {
    name: 'Renfo bas du corps 30\'',
    session_type: 'renfo',
    intent:
      '3 x 8 squats charges + 3 x 6 fentes excentriques par jambe + 3 x 12 ponts fessiers + 2 x 45 s gainage.',
    default_duration_s: 30 * 60,
    default_distance_m: null,
    default_elevation_m: null,
  },
  {
    name: 'Renfo excentrique descente 40\'',
    session_type: 'renfo',
    intent:
      'Focus quadriceps excentriques : 4 x 8 step-downs par jambe + 3 x 8 squats bulgares + gainage lateral 3 x 30 s.',
    default_duration_s: 40 * 60,
    default_distance_m: null,
    default_elevation_m: null,
  },
  {
    name: 'Recup 30\'',
    session_type: 'recup',
    intent:
      'Footing tres doux 30 min, allure conversation, aucune intensite, ecoute des sensations.',
    default_duration_s: 30 * 60,
    default_distance_m: 4500,
    default_elevation_m: 20,
  },
  {
    name: 'Rando active 3h',
    session_type: 'rando',
    intent:
      'Marche + course douce alternee sur sentier technique, focus descente relachee, 3 h en montagne.',
    default_duration_s: 180 * 60,
    default_distance_m: 12000,
    default_elevation_m: 600,
  },
]

export async function seedDefaultTemplates(): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ne pas re-seeder si des templates existent deja pour ce tenant.
  const { count } = await supabase
    .from('session_templates')
    .select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    redirect(
      '/seances?erreur=' +
        encodeURIComponent(
          'Des templates existent deja. Supprime-les d\'abord si tu veux repartir de zero.',
        ),
    )
  }

  const rows = DEFAULT_TEMPLATES.map((t) => ({
    tenant_id: user.id,
    name: t.name,
    session_type: t.session_type,
    intent: t.intent,
    default_duration_s: t.default_duration_s,
    default_distance_m: t.default_distance_m,
    default_elevation_m: t.default_elevation_m,
  }))
  const { error } = await supabase.from('session_templates').insert(rows)
  if (error) {
    redirect(
      '/seances?erreur=' +
        encodeURIComponent(`Seed impossible : ${error.message}`),
    )
  }

  revalidatePath('/seances')
  redirect(`/seances?seeded=${rows.length}`)
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return

  const { error } = await supabase.from('session_templates').delete().eq('id', id)
  if (error) {
    redirect(
      '/seances?erreur=' +
        encodeURIComponent(`Suppression impossible : ${error.message}`),
    )
  }
  revalidatePath('/seances')
}
