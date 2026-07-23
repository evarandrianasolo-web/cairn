import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import {
  formatDistance,
  formatDplus,
  formatDuree,
  formatGoalTime,
  formatJMinus,
  formatRaceDate,
} from '@/lib/format'
import { NewRaceForm } from './new-race-form'
import { EditRaceForm } from './edit-race-form'
import { deleteRace } from './actions'

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { edit: editingId } = await searchParams

  const { data: races } = await supabase
    .from('races')
    .select(
      'id, name, race_date, location, distance_m, elevation_gain_m, priority, status, goal_time_s, result_time_s, notes, activities(id)',
    )
    .order('race_date', { ascending: true })

  const rows = (races ?? []).map((r: RaceRaw): Race => ({
    ...r,
    linkedActivityId: r.activities?.[0]?.id ?? null,
  })) as Race[]
  const today = startOfTodayIso()
  const aVenir = rows.filter((r) => r.race_date >= today)
  const passees = rows.filter((r) => r.race_date < today)

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ScreenTitle>Courses</ScreenTitle>

      {!editingId && <NewRaceForm />}

      {aVenir.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            À venir
          </h2>
          <ul className="mt-3 space-y-2">
            {aVenir.map((r) =>
              r.id === editingId ? (
                <li key={r.id}>
                  <EditRaceForm race={r} />
                </li>
              ) : (
                <RaceItem key={r.id} race={r} />
              ),
            )}
          </ul>
        </section>
      )}

      {passees.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Passées
          </h2>
          <ul className="mt-3 space-y-2">
            {passees.map((r) =>
              r.id === editingId ? (
                <li key={r.id}>
                  <EditRaceForm race={r} />
                </li>
              ) : (
                <RaceItem key={r.id} race={r} />
              ),
            )}
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

type RaceRaw = {
  id: string
  name: string
  race_date: string
  location: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  priority: 'A' | 'B' | 'C'
  status: string | null
  goal_time_s: number | null
  result_time_s: number | null
  notes: string | null
  activities: { id: string }[] | null
}

type Race = Omit<RaceRaw, 'activities'> & {
  linkedActivityId: string | null
}

function RaceItem({ race }: { race: Race }) {
  const isDone = race.status === 'terminee'
  return (
    <li className="rounded-data border border-brume bg-craie px-3 py-2">
      <div className="flex items-center gap-4">
        <span className="w-8 text-center font-mono text-base font-medium text-schiste">
          {race.priority}
        </span>
        <div className="flex-1">
          <p className="text-base text-schiste">
            <Link
              href={`/courses/${race.id}`}
              className="hover:underline"
              title="Voir la fiche course"
            >
              {race.name}
            </Link>
            {isDone && (
              <span
                className="ml-2 rounded-data border border-lichen/50 px-1.5 py-0.5 font-mono text-xs uppercase text-lichen"
                title="course réalisée"
              >
                terminée
              </span>
            )}
          </p>
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
        {race.result_time_s != null ? (
          <span className="tabular hidden text-xs text-granit md:inline">
            fait en <span className="text-schiste">{formatDuree(race.result_time_s)}</span>
            {race.goal_time_s != null && (
              <>
                {' '}
                <span className="text-granit/70">
                  (obj. {formatGoalTime(race.goal_time_s)})
                </span>
              </>
            )}
          </span>
        ) : race.goal_time_s != null ? (
          <span className="tabular hidden text-xs text-granit md:inline">
            objectif <span className="text-schiste">{formatGoalTime(race.goal_time_s)}</span>
          </span>
        ) : null}
        <span className="tabular w-14 text-right text-sm text-granit">
          {formatJMinus(race.race_date)}
        </span>
        <Link
          href={`/courses?edit=${race.id}`}
          className="text-xs text-granit hover:text-schiste"
        >
          modifier
        </Link>
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
      </div>
      {race.notes && (
        <p className="mt-2 pl-12 text-xs text-granit whitespace-pre-line">
          {race.notes}
        </p>
      )}
    </li>
  )
}

function startOfTodayIso() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t.toISOString().slice(0, 10)
}
