import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDistance, formatDplus, formatJMinus, formatRaceDate } from '@/lib/format'
import { NewRaceForm } from './new-race-form'
import { deleteRace } from './actions'

export default async function CoursesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: races } = await supabase
    .from('races')
    .select('id, name, race_date, location, distance_m, elevation_gain_m, priority, status')
    .order('race_date', { ascending: true })

  const aVenir = (races ?? []).filter((r) => new Date(r.race_date) >= startOfToday())
  const passees = (races ?? []).filter((r) => new Date(r.race_date) < startOfToday())

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ScreenTitle>Courses</ScreenTitle>

      <NewRaceForm />

      {aVenir.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            À venir
          </h2>
          <ul className="mt-3 space-y-2">
            {aVenir.map((r) => (
              <RaceItem key={r.id} race={r} />
            ))}
          </ul>
        </section>
      )}

      {passees.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Passées
          </h2>
          <ul className="mt-3 space-y-2">
            {passees.map((r) => (
              <RaceItem key={r.id} race={r} />
            ))}
          </ul>
        </section>
      )}

      {aVenir.length === 0 && passees.length === 0 && (
        <p className="text-base text-granit">
          Aucune course pour l&apos;instant. Ajoute-en une pour armer le compte à rebours.
        </p>
      )}
    </main>
  )
}

type Race = {
  id: string
  name: string
  race_date: string
  location: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  priority: 'A' | 'B' | 'C'
  status: string | null
}

function RaceItem({ race }: { race: Race }) {
  return (
    <li className="flex items-center gap-4 rounded-data border border-brume bg-craie px-3 py-2">
      <span className="w-8 text-center font-mono text-base font-medium text-schiste">
        {race.priority}
      </span>
      <div className="flex-1">
        <p className="text-base text-schiste">{race.name}</p>
        <p className="tabular text-xs text-granit">
          {formatRaceDate(race.race_date)}
          {race.location && ` · ${race.location}`}
        </p>
      </div>
      <div className="hidden sm:flex sm:flex-col sm:items-end sm:text-right">
        <span className="tabular text-sm text-schiste">
          {formatDistance(race.distance_m)}
        </span>
        <span className="tabular text-xs text-granit">
          {formatDplus(race.elevation_gain_m)}
        </span>
      </div>
      <span className="tabular w-14 text-right text-sm text-granit">
        {formatJMinus(race.race_date)}
      </span>
      <form action={deleteRace}>
        <input type="hidden" name="id" value={race.id} />
        <button
          type="submit"
          aria-label="Supprimer"
          className="text-granit hover:text-schiste"
        >
          ×
        </button>
      </form>
    </li>
  )
}

function startOfToday() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}
