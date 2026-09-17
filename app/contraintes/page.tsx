import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatConstraintPeriod, formatRecurrence } from '@/lib/format'
import { NewConstraintForm } from './new-constraint-form'
import { EditConstraintForm } from './edit-constraint-form'
import { deleteConstraint } from './actions'

type Constraint = {
  id: string
  label: string
  kind: 'recurrente' | 'ponctuelle'
  type: string
  impact: 'bloque' | 'allege' | 'decale' | 'oriente'
  recurrence_rule: string | null
  starts_on: string | null
  ends_on: string | null
  notes: string | null
  focus: string | null
}

export default async function ContraintesPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; ok?: string; edit?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { erreur, edit: editingId } = await searchParams

  const { data: constraints } = await supabase
    .from('constraints')
    .select(
      'id, label, kind, type, impact, recurrence_rule, starts_on, ends_on, notes, focus',
    )
    .order('kind', { ascending: true })
    .order('starts_on', { ascending: true, nullsFirst: false })

  const rows = (constraints ?? []) as Constraint[]
  const today = new Date().toISOString().slice(0, 10)
  const recurrentes = rows.filter((c) => c.kind === 'recurrente')
  const aVenir = rows.filter(
    (c) => c.kind === 'ponctuelle' && (c.ends_on ?? c.starts_on ?? '') >= today,
  )
  const passees = rows.filter(
    (c) => c.kind === 'ponctuelle' && (c.ends_on ?? c.starts_on ?? '') < today,
  )

  const renderItem = (c: Constraint) =>
    c.id === editingId ? (
      <li key={c.id}>
        <EditConstraintForm c={c} />
      </li>
    ) : (
      <ConstraintItem key={c.id} c={c} />
    )

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ScreenTitle>Contraintes</ScreenTitle>

      {erreur && (
        // ocre = vigilance ; jamais balise pour un message d'erreur.
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}

      {!editingId && <NewConstraintForm />}

      {recurrentes.length > 0 && (
        <Section title="Récurrentes">{recurrentes.map(renderItem)}</Section>
      )}

      {aVenir.length > 0 && (
        <Section title="À venir">{aVenir.map(renderItem)}</Section>
      )}

      {passees.length > 0 && (
        <Section title="Passées">{passees.map(renderItem)}</Section>
      )}

      {rows.length === 0 && (
        <p className="text-base text-granit">
          Aucune contrainte. Les séances club, la garde alternée, les déplacements pro,
          la canicule — tout ce qui bloque, allège ou décale.
        </p>
      )}
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-mono text-xs uppercase tracking-wide text-granit">{title}</h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </section>
  )
}

function ConstraintItem({ c }: { c: Constraint }) {
  const when =
    c.kind === 'recurrente'
      ? formatRecurrence(c.recurrence_rule)
      : formatConstraintPeriod(c.starts_on, c.ends_on)

  return (
    <li className="rounded-data border border-brume bg-craie px-3 py-2">
      <div className="flex items-center gap-4">
        <span className="w-24 font-mono text-xs uppercase text-granit">
          {c.type}
        </span>
        <div className="flex-1">
          <p className="text-base text-schiste">{c.label}</p>
          <p className="tabular text-xs text-granit">{when}</p>
          {c.focus && (
            <p className="mt-1 text-xs italic text-schiste">→ {c.focus}</p>
          )}
        </div>
        <ImpactBadge impact={c.impact} />
        <Link
          href={`/contraintes?edit=${c.id}`}
          className="text-xs text-granit hover:text-schiste"
        >
          modifier
        </Link>
        <form action={deleteConstraint}>
          <input type="hidden" name="id" value={c.id} />
          <button
            type="submit"
            aria-label="Supprimer"
            className="text-granit hover:text-schiste"
          >
            ×
          </button>
        </form>
      </div>
      {c.notes && (
        <p className="mt-2 pl-28 text-xs text-granit whitespace-pre-line">{c.notes}</p>
      )}
    </li>
  )
}

function ImpactBadge({
  impact,
}: {
  impact: 'bloque' | 'allege' | 'decale' | 'oriente'
}) {
  const label = {
    bloque: 'bloque',
    allege: 'allège',
    decale: 'décale',
    oriente: 'oriente',
  }[impact]
  return (
    <span className="rounded-data border border-granit/35 px-2 py-0.5 text-xs text-granit">
      {label}
    </span>
  )
}
