import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDateCourte } from '@/lib/format'
import {
  addGoal,
  deleteGoal,
  toggleGoalStatus,
} from './actions'

const AREA_LABEL: Record<string, string> = {
  vitesse: 'vitesse',
  volume: 'volume',
  descente: 'descente',
  montee: 'montée',
  technique: 'technique',
  fueling: 'fueling',
  mental: 'mental',
  autre: 'autre',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'actif',
  atteint: 'atteint',
  abandonne: 'abandonné',
}

type Goal = {
  id: string
  label: string
  area: string | null
  status: 'active' | 'atteint' | 'abandonne'
  target_date: string | null
  notes: string | null
  created_at: string
}

export default async function ObjectifsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string; edit?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur, edit: editingId } = await searchParams

  const { data: goals } = await supabase
    .from('training_goals')
    .select('id, label, area, status, target_date, notes, created_at')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  const rows = (goals ?? []) as Goal[]
  const actives = rows.filter((g) => g.status === 'active')
  const archives = rows.filter((g) => g.status !== 'active')

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <ScreenTitle>Objectifs</ScreenTitle>

      <p className="text-sm text-granit">
        Objectifs transversaux qui orientent tes séances au-delà des courses.
        Le coach IA les intègre à chaque génération de plan et à ses réponses.
      </p>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}

      {!editingId && <NewGoalForm />}

      {actives.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Actifs
          </h2>
          <ul className="mt-3 space-y-2">
            {actives.map((g) => (
              <GoalRow key={g.id} goal={g} editable />
            ))}
          </ul>
        </section>
      )}

      {archives.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Archivés
          </h2>
          <ul className="mt-3 space-y-2">
            {archives.map((g) => (
              <GoalRow key={g.id} goal={g} />
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-granit italic">
          Aucun objectif pour l&apos;instant. Ajoute-en un pour que le coach les
          prenne en compte.
        </p>
      )}
    </main>
  )
}

function NewGoalForm() {
  return (
    <section className="rounded-data border border-brume bg-craie p-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
        Ajouter un objectif
      </h2>
      <form action={addGoal} className="mt-3 space-y-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Libellé</span>
          <input
            required
            name="label"
            type="text"
            placeholder="Améliorer la descente technique"
            className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Domaine</span>
            <select
              name="area"
              defaultValue="autre"
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
            >
              {Object.entries(AREA_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">
              Échéance <span className="text-granit/60">— optionnel</span>
            </span>
            <input
              name="target_date"
              type="date"
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">
            Notes <span className="text-granit/60">— optionnel</span>
          </span>
          <textarea
            name="notes"
            rows={2}
            placeholder="Comment tu veux t'y prendre, à quoi tu penses"
            className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
          >
            Ajouter
          </button>
        </div>
      </form>
    </section>
  )
}

function GoalRow({ goal, editable = false }: { goal: Goal; editable?: boolean }) {
  const areaLabel = goal.area ? AREA_LABEL[goal.area] ?? goal.area : null
  return (
    <li className="rounded-data border border-brume bg-craie p-3">
      <div className="flex items-baseline gap-3">
        <div className="flex-1">
          <p
            className={
              'text-base ' +
              (goal.status === 'active' ? 'text-schiste' : 'text-granit line-through')
            }
          >
            {goal.label}
          </p>
          <p className="tabular mt-1 font-mono text-[10px] text-granit">
            {areaLabel ? `${areaLabel}` : ''}
            {areaLabel && goal.target_date ? ' · ' : ''}
            {goal.target_date ? `→ ${formatDateCourte(goal.target_date)}` : ''}
            {(areaLabel || goal.target_date) && goal.status !== 'active' ? ' · ' : ''}
            {goal.status !== 'active' ? STATUS_LABEL[goal.status] : ''}
          </p>
          {goal.notes && (
            <p className="mt-1 text-sm text-granit whitespace-pre-line">
              {goal.notes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <>
              <form action={toggleGoalStatus}>
                <input type="hidden" name="id" value={goal.id} />
                <input type="hidden" name="status" value="atteint" />
                <button
                  type="submit"
                  className="rounded-data border border-lichen/50 px-2 py-1 font-mono text-[10px] uppercase text-lichen hover:bg-lichen/10"
                  title="Marquer comme atteint"
                >
                  atteint
                </button>
              </form>
              <form action={toggleGoalStatus}>
                <input type="hidden" name="id" value={goal.id} />
                <input type="hidden" name="status" value="abandonne" />
                <button
                  type="submit"
                  className="text-xs text-granit hover:text-schiste"
                >
                  archiver
                </button>
              </form>
            </>
          )}
          {!editable && (
            <form action={toggleGoalStatus}>
              <input type="hidden" name="id" value={goal.id} />
              <input type="hidden" name="status" value="active" />
              <button
                type="submit"
                className="text-xs text-granit hover:text-schiste"
              >
                réactiver
              </button>
            </form>
          )}
          <form action={deleteGoal}>
            <input type="hidden" name="id" value={goal.id} />
            <button
              type="submit"
              aria-label="Supprimer"
              className="text-granit hover:text-schiste"
            >
              ×
            </button>
          </form>
        </div>
      </div>
    </li>
  )
}
