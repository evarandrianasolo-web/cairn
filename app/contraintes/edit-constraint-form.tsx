'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  WEEKDAY_CODES,
  WEEKDAY_LABELS,
  parseRecurrenceMode,
  type WeekdayCode,
} from '@/lib/format'
import { updateConstraint } from './actions'

type Kind = 'recurrente' | 'ponctuelle'
type Frequency = 'weekly-1' | 'weekly-N' | 'monthly' | 'custom'
type ConstraintType =
  | 'garde'
  | 'club'
  | 'deplacement'
  | 'vacances'
  | 'meteo'
  | 'blessure'
  | 'travail'
  | 'autre'
type Impact = 'bloque' | 'allege' | 'decale' | 'oriente'

type Constraint = {
  id: string
  label: string
  kind: Kind
  type: string
  impact: Impact
  recurrence_rule: string | null
  starts_on: string | null
  ends_on: string | null
  notes: string | null
  focus: string | null
}

const TYPES: { code: ConstraintType; label: string }[] = [
  { code: 'club', label: 'Club' },
  { code: 'garde', label: 'Garde' },
  { code: 'travail', label: 'Travail' },
  { code: 'deplacement', label: 'Déplacement' },
  { code: 'vacances', label: 'Vacances' },
  { code: 'meteo', label: 'Météo' },
  { code: 'blessure', label: 'Blessure' },
  { code: 'autre', label: 'Autre' },
]

const IMPACTS: { code: Impact; label: string; hint: string }[] = [
  { code: 'bloque', label: 'Bloque', hint: 'aucune séance possible' },
  { code: 'allege', label: 'Allège', hint: 'séance courte ou douce' },
  { code: 'decale', label: 'Décale', hint: 'à déplacer' },
  { code: 'oriente', label: 'Oriente', hint: 'pas de blocage, préférence de contenu' },
]

const FREQUENCIES: { code: Frequency; label: string }[] = [
  { code: 'weekly-1', label: 'Chaque semaine' },
  { code: 'weekly-N', label: 'Toutes les X semaines' },
  { code: 'monthly', label: 'Chaque mois' },
  { code: 'custom', label: 'Personnalisée' },
]

export function EditConstraintForm({ c }: { c: Constraint }) {
  const mode = parseRecurrenceMode(c.recurrence_rule)

  const [kind, setKind] = useState<Kind>(c.kind)
  const [type, setType] = useState<ConstraintType>(
    (TYPES.find((t) => t.code === c.type)?.code ?? 'autre') as ConstraintType,
  )
  const [impact, setImpact] = useState<Impact>(c.impact)
  const [frequency, setFrequency] = useState<Frequency>(mode.freq)
  const [days, setDays] = useState<Set<WeekdayCode>>(
    new Set('days' in mode ? mode.days : []),
  )

  function toggleDay(d: WeekdayCode) {
    setDays((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  const showDaysPicker = frequency === 'weekly-1' || frequency === 'weekly-N'
  const initialInterval = mode.freq === 'weekly-N' ? mode.interval : 2
  const initialDayOfMonth = mode.freq === 'monthly' ? mode.dayOfMonth : 15
  const initialCustom = mode.freq === 'custom' ? mode.raw : ''

  return (
    <form
      action={updateConstraint}
      className="rounded-surface border border-schiste bg-craie p-4"
    >
      <input type="hidden" name="id" value={c.id} />
      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        Modifier — {c.label}
      </p>

      <div className="mt-3 flex gap-2">
        {(['recurrente', 'ponctuelle'] as const).map((k) => {
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">Libellé</span>
          <input
            required
            name="label"
            type="text"
            defaultValue={c.label}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ConstraintType)}
            name="type"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">Impact</span>
          <div className="flex flex-wrap gap-2">
            {IMPACTS.map((i) => {
              const actif = impact === i.code
              return (
                <button
                  key={i.code}
                  type="button"
                  onClick={() => setImpact(i.code)}
                  className={
                    'flex-1 rounded-data border px-2 py-1.5 text-sm ' +
                    (actif
                      ? 'border-schiste bg-schiste text-craie'
                      : 'border-granit/35 text-schiste')
                  }
                >
                  {i.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-granit">
            {IMPACTS.find((i) => i.code === impact)?.hint}
          </p>
          <input type="hidden" name="impact" value={impact} />
        </div>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">
            Orientation <span className="text-granit/60">
              — préférence de contenu, optionnel
            </span>
          </span>
          <input
            name="focus"
            type="text"
            placeholder="randos privilégiées · pas de D+ · focus vitesse"
            defaultValue={c.focus ?? ''}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
      </div>

      {kind === 'recurrente' ? (
        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Fréquence</span>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              name="frequency"
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {frequency === 'weekly-N' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-granit">
                  Intervalle <span className="text-granit/60">— toutes les N semaines</span>
                </span>
                <input
                  name="interval"
                  type="number"
                  min={2}
                  max={12}
                  defaultValue={initialInterval}
                  className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-granit">
                  Ancrage <span className="text-granit/60">— 1er jour du cycle</span>
                </span>
                <input
                  required
                  name="anchor_date"
                  type="date"
                  defaultValue={c.starts_on ?? ''}
                  className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
                />
                <span className="text-xs italic text-granit">
                  Sans ancrage, l&apos;alternance n&apos;est pas calculable.
                </span>
              </label>
            </div>
          )}

          {showDaysPicker && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-granit">Jours</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_CODES.map((d) => {
                  const actif = days.has(d)
                  return (
                    <label
                      key={d}
                      className={
                        'cursor-pointer rounded-data border px-3 py-1.5 text-base capitalize ' +
                        (actif
                          ? 'border-schiste bg-schiste text-craie'
                          : 'border-granit/35 text-schiste')
                      }
                    >
                      <input
                        type="checkbox"
                        name={`day_${d}`}
                        checked={actif}
                        onChange={() => toggleDay(d)}
                        className="sr-only"
                      />
                      {WEEKDAY_LABELS[d]}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {frequency === 'monthly' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">
                Jour du mois <span className="text-granit/60">— 1 à 31</span>
              </span>
              <input
                name="day_of_month"
                type="number"
                min={1}
                max={31}
                defaultValue={initialDayOfMonth}
                className="w-24 rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
          )}

          {frequency === 'custom' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">
                Règle RRULE <span className="text-granit/60">— format RFC 5545</span>
              </span>
              <input
                name="custom_rrule"
                type="text"
                placeholder="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR"
                defaultValue={initialCustom}
                className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-sm tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Début</span>
            <input
              required
              name="starts_on"
              type="date"
              defaultValue={c.starts_on ?? ''}
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">
              Fin <span className="text-granit/60">— si période</span>
            </span>
            <input
              name="ends_on"
              type="date"
              defaultValue={c.ends_on ?? ''}
              className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">
          Notes <span className="text-granit/60">— optionnel</span>
        </span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={c.notes ?? ''}
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <div className="mt-4 flex gap-3">
        <Link
          href="/contraintes"
          className="flex-1 rounded-surface border border-granit/35 px-3 py-2 text-center text-base font-medium text-schiste"
        >
          Annuler
        </Link>
        <button
          type="submit"
          className="flex-1 rounded-surface bg-schiste px-3 py-2 text-base font-medium text-craie"
        >
          Enregistrer
        </button>
      </div>
    </form>
  )
}
