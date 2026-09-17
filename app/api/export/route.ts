import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Export RGPD art. 15 (droit d'acces) + art. 20 (portabilite).
 * Renvoie un JSON structure de toutes les donnees du tenant demandeur.
 * La RLS filtre naturellement : on ne peut lire que ses propres lignes.
 *
 * Format : { generated_at, tenant_id, tables: { <name>: [rows] } }
 * Content-Disposition attachment pour telechargement direct.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const tables = [
    'athletes',
    'activities',
    'activity_health',
    'health_access_logs',
    'strava_connections',
    'races',
    'constraints',
    'plan_weeks',
    'planned_sessions',
    'plan_revisions',
    'session_templates',
    'fueling_logs',
    'debriefs',
    'coach_threads',
    'coach_messages',
    'consent_records',
    'ai_calls',
  ] as const

  const dump: Record<string, unknown[]> = {}
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      dump[table] = [{ __export_error: error.message }]
    } else {
      dump[table] = data ?? []
    }
  }

  // Retire les tokens Strava chiffres du dump -- ils n'ont aucune valeur
  // en clair pour l'utilisateur et exposer le chiffre est inutile
  // (l'export sert a la portabilite fonctionnelle, pas au clonage
  // technique de la session Strava).
  if (Array.isArray(dump.strava_connections)) {
    dump.strava_connections = dump.strava_connections.map((row) => {
      if (typeof row !== 'object' || row === null) return row
      const r = row as Record<string, unknown>
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { access_token, refresh_token, ...rest } = r
      return { ...rest, tokens_omitted: true }
    })
  }

  const payload = {
    schema_version: '1',
    generated_at: new Date().toISOString(),
    tenant_id: user.id,
    email: user.email,
    tables: dump,
  }

  const filename = `cairn-export-${new Date().toISOString().slice(0, 10)}.json`

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
