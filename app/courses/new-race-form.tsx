'use client'

import { useState } from 'react'
import { addRace } from './actions'

type RacePriority = 'A' | 'B' | 'C'

export function NewRaceForm() {
  const [priority, setPriority] = useState<RacePriority>('C')

  return (
    <form
      action={addRace}
      className="rounded-surface border border-granit/20 bg-craie p-4"
    >
      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        Ajouter une course
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">Nom</span>
          <input
            required
            name="name"
            type="text"
            placeholder="Ultra Trail des Montagnes du Jura"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Date</span>
          <input
            required
            name="race_date"
            type="date"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Lieu</span>
          <input
            name="location"
            type="text"
            placeholder="Métabief"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Distance (km)</span>
          <input
            name="distance_km"
            type="number"
            min={0}
            step="0.1"
            placeholder="105"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">D+ (m)</span>
          <input
            name="elevation_gain_m"
            type="number"
            min={0}
            placeholder="4000"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">
            Temps cible <span className="text-granit/60">— optionnel</span>
          </span>
          <input
            name="goal_time"
            type="text"
            placeholder="3h45  ·  1:24:36  ·  42min"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">
            Notes <span className="text-granit/60">— stratégie, matériel, contraintes</span>
          </span>
          <textarea
            name="notes"
            rows={2}
            placeholder="Objectif : finir. Nitrates J−3. Bâtons obligatoires au km 40."
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">Priorité</span>
          <div className="flex gap-2">
            {(['A', 'B', 'C'] as const).map((p) => {
              const actif = priority === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={
                    'flex-1 rounded-data border px-3 py-1.5 text-base ' +
                    (actif
                      ? 'border-schiste bg-schiste text-craie'
                      : 'border-granit/35 text-schiste')
                  }
                >
                  {p}
                </button>
              )
            })}
          </div>
          <input type="hidden" name="priority" value={priority} />
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 w-full rounded-surface bg-schiste px-3 py-2 text-base font-medium text-craie"
      >
        Ajouter
      </button>
    </form>
  )
}
