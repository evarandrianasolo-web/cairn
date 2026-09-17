import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { UploadForm } from './upload-form'

export default async function ImportPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="mx-auto max-w-xl p-6">
      <ScreenTitle>Importer mon historique</ScreenTitle>
      <p className="mt-3 text-sm text-granit">
        Cairn n&apos;utilise pas l&apos;API Strava. L&apos;historique se construit en
        important ton archive Strava (export Bulk Data) ou en saisissant tes séances au
        fil de l&apos;eau.
      </p>
      <UploadForm />
    </main>
  )
}
