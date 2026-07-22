'use client'

import { useState } from 'react'
import { WEEKDAY_CODES, WEEKDAY_LABELS, type WeekdayCode } from '@/lib/format'
import { addConstraint } from './actions'

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

export function NewConstraintForm() {
  const [kind, setKind] = useState<Kind>('recurrente')
  const [type, setType] = useState<ConstraintType>('club')
  const [impact, setImpact] = useState<Impact>('bloque')
  const [frequency, setFrequency] = useState<Frequency>('weekly-1')
  const [days, setDays] = useState<Set<WeekdayCode>>(new Set())

  function toggleDay(d: WeekdayCode) {
    setDays((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  const showDaysPicker = frequency === 'weekly-1' || frequency === 'weekly-N'

  return (
    <form
      action={addConstraint}
      className="rounded-surface border border-granit/20 bg-craie p-4"
    >
      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        Ajouter une contrainte
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
            placeholder={
              kind === 'recurrente' ? 'Club — mardi & jeudi' : 'Déplacement Rennes'
            }
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
            <label className="flex flex-col gap-1">
              <span className="text-xs text-granit">
                Intervalle <span className="text-granit/60">— toutes les N semaines</span>
              </span>
              <input
                name="interval"
                type="number"
                min={2}
                max={12}
                defaultValue={2}
                className="w-24 rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
              />
            </label>
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
                defaultValue={15}
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
                className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-sm tabular text-schiste focus:border-schiste focus:outline-none"
              />
              <span className="text-xs text-granit">
                Utile pour les cas non couverts par les options ci-dessus.
              </span>
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
          placeholder={
            kind === 'recurrente'
              ? "Intensité imposée, pas de fractionné le lendemain"
              : "Course annulée si > 32°C"
          }
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <button
        type="submit"
        className="mt-4 w-full rounded-surface bg-schiste px-3 py-2 text-base font-medium text-craie"
      >
        Ajouter
      </button>
    </form>
  )
}
