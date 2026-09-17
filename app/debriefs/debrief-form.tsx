'use client'

import Link from 'next/link'
import { useState } from 'react'
import { addDebrief, updateDebrief } from './actions'

type Kind = 'course' | 'bloc'

export type RaceOption = {
  id: string
  name: string
  race_date: string
}

export type DebriefInitial = {
  id: string
  kind: Kind
  race_id: string | null
  period_start: string | null
  period_end: string | null
  narrative: string | null
  what_worked: string | null
  what_failed: string | null
  focus_areas: string[] | null
}

/**
 * Formulaire partagé pour créer ou éditer un débrief.
 * Sans `initial` → mode création (action addDebrief).
 * Avec `initial` → mode édition (action updateDebrief avec id caché).
 */
export function DebriefForm({
  races,
  initial,
}: {
  races: RaceOption[]
  initial?: DebriefInitial
}) {
  const isEditing = initial != null
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'course')

  return (
    <form
      action={isEditing ? updateDebrief : addDebrief}
      className={
        'rounded-surface border p-4 ' +
        (isEditing
          ? 'border-schiste bg-craie'
          : 'border-granit/20 bg-craie')
      }
    >
      {isEditing && <input type="hidden" name="id" value={initial.id} />}

      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        {isEditing ? 'Modifier — débrief' : 'Ajouter un débrief'}
      </p>

      <div className="mt-3 flex gap-2">
        {(['course', 'bloc'] as const).map((k) => {
          const actif = kind === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                'flex-1 rounded-data border px-3 py-1.5 text-base capitalize ' +
                (actif
                  ? 'border-schiste bg-schiste text-craie'
                  : 'border-granit/35 text-schiste')
              }
            >
              {k}
            </button>
          )
        })}
      </div>
      <input type="hidden" name="kind" value={kind} />

      {kind === 'course' ? (
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-xs text-granit">Course</span>
          <select
            required
            name="race_id"
            defaultValue={initial?.race_id ?? ''}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          >
            <option value="" disabled>
              Choisir…
            </option>
            {races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.race_date} — {r.name}
              </option>
            ))}
          </select>
          {races.length === 0 && (
            <span className="mt-1 text-xs text-granit">
              Aucune course en base.{' '}
              <Link href="/courses" className="underline">
                Ajouter une course
              </Link>{' '}
              d&apos;abord.
            </span>
          )}
        </label>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Début du bloc</span>
            <input
              required
              name="period_start"
              type="date"
              defaultValue={initial?.period_start ?? ''}
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Fin du bloc</span>
            <input
              required
              name="period_end"
              type="date"
              defaultValue={initial?.period_end ?? ''}
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">
          Récit <span className="text-granit/60">— comment ça s&apos;est passé</span>
        </span>
        <textarea
          name="narrative"
          rows={4}
          defaultValue={initial?.narrative ?? ''}
          placeholder={
            kind === 'course'
              ? 'Chronologie de la course, sensations, moments clés…'
              : 'Comment le bloc s\'est déroulé, la charge, l\'adhérence au plan…'
          }
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Ce qui a marché</span>
          <textarea
            name="what_worked"
            rows={3}
            defaultValue={initial?.what_worked ?? ''}
            placeholder="Points d&apos;appui : pacing, fueling, mental, prépa…"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Ce qui a raté</span>
          <textarea
            name="what_failed"
            rows={3}
            defaultValue={initial?.what_failed ?? ''}
            placeholder="Douleurs, gestion, décisions à revoir…"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">
          Axes de travail{' '}
          <span className="text-granit/60">
            — une ligne = un axe, ces axes alimentent le bloc suivant
          </span>
        </span>
        <textarea
          name="focus_areas"
          rows={3}
          defaultValue={initial?.focus_areas?.join('\n') ?? ''}
          placeholder={
            'descente technique\nfueling au-delà de 60 g/h\ngainage sur longues sorties'
          }
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <div className="mt-4 flex gap-3">
        {isEditing && (
          <Link
            href="/debriefs"
            className="flex-1 rounded-surface border border-granit/35 px-3 py-2 text-center text-base font-medium text-schiste"
          >
            Annuler
          </Link>
        )}
        <button
          type="submit"
          className={
            'rounded-surface bg-schiste px-3 py-2 text-base font-medium text-craie ' +
            (isEditing ? 'flex-1' : 'w-full')
          }
        >
          {isEditing ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  )
}
