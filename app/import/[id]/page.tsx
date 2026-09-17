import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'

const EVENT_LABELS: Record<string, string> = {
  created: 'ajoutée',
  replaced: 'remplacée (fichier plus riche)',
  ignored_duplicate: 'ignorée (doublon)',
  rejected_format: 'rejetée (format)',
  rejected_signature: 'rejetée (signature)',
  ignored_not_whitelisted: 'ignorée (hors périmètre)',
}

export default async function ImportReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: importRow } = await supabase
    .from('imports')
    .select(
      'id, outcome, filename_original, started_at, finished_at, error_summary, activities_created, activities_replaced, activities_ignored, activities_rejected',
    )
    .eq('id', id)
    .maybeSingle()

  if (!importRow) redirect('/import')

  const { data: events } = await supabase
    .from('import_events')
    .select('file_path, event, message')
    .eq('import_id', id)
    .order('created_at', { ascending: true })

  const stillRunning = importRow.outcome === 'in_progress' || importRow.outcome === null

  return (
    <main className="mx-auto max-w-2xl p-6">
      <ScreenTitle>Rapport d&apos;import</ScreenTitle>

      {stillRunning ? (
        <p className="mt-4 rounded-data bg-craie p-3 text-sm text-schiste">
          Import encore en cours de traitement — recharge la page dans un instant.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-granit">
            {importRow.filename_original ?? 'Archive'} —{' '}
            <span className="tabular">{importRow.outcome}</span>
          </p>

          {importRow.error_summary && (
            <p className="rounded-data bg-craie p-3 text-sm text-ocre">
              {importRow.error_summary}
            </p>
          )}

          <ul className="grid grid-cols-2 gap-3 text-sm text-schiste sm:grid-cols-4">
            <li className="rounded-data bg-craie p-3">
              <span className="tabular text-lg">{importRow.activities_created}</span>
              <br />
              ajoutées
            </li>
            <li className="rounded-data bg-craie p-3">
              <span className="tabular text-lg">{importRow.activities_replaced}</span>
              <br />
              remplacées
            </li>
            <li className="rounded-data bg-craie p-3">
              <span className="tabular text-lg">{importRow.activities_ignored}</span>
              <br />
              ignorées
            </li>
            <li className="rounded-data bg-craie p-3">
              <span className="tabular text-lg">{importRow.activities_rejected}</span>
              <br />
              rejetées
            </li>
          </ul>

          {events && events.length > 0 && (
            <details className="text-sm text-granit">
              <summary className="cursor-pointer text-schiste">
                Détail ({events.length} entrées)
              </summary>
              <ul className="mt-2 space-y-1">
                {events.map((e, i) => (
                  <li key={i}>
                    <span className="text-schiste">{EVENT_LABELS[e.event] ?? e.event}</span>
                    {e.file_path ? ` — ${e.file_path}` : ''}
                    {e.message ? ` (${e.message})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Link href="/activities" className="inline-block text-sm text-schiste underline">
            Voir mes activités
          </Link>
        </div>
      )}
    </main>
  )
}
