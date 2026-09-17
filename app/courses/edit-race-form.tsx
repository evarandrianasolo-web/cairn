'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatGoalTime } from '@/lib/format'
import { updateRace } from './actions'

type RacePriority = 'A' | 'B' | 'C'

type RaceTerrain = 'route' | 'trail' | 'mixte'

type Race = {
  id: string
  name: string
  race_date: string
  location: string | null
  distance_m: number | null
  elevation_gain_m: number | null
  priority: RacePriority
  terrain: RaceTerrain
  goal_time_s: number | null
  notes: string | null
}

/** Convertit les secondes en une chaîne réinjectable dans le champ texte. */
function formatGoalForInput(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return ''
  const formatted = formatGoalTime(seconds)
  return formatted === '—' ? '' : formatted
}

export function EditRaceForm({ race }: { race: Race }) {
  const [priority, setPriority] = useState<RacePriority>(race.priority)

  return (
    <form
      action={updateRace}
      className="rounded-surface border border-schiste bg-craie p-4"
    >
      <input type="hidden" name="id" value={race.id} />
      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        Modifier — {race.name}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">Nom</span>
          <input
            required
            name="name"
            type="text"
            defaultValue={race.name}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Date</span>
          <input
            required
            name="race_date"
            type="date"
            defaultValue={race.race_date}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">Lieu</span>
          <input
            name="location"
            type="text"
            defaultValue={race.location ?? ''}
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
            defaultValue={race.distance_m != null ? race.distance_m / 1000 : ''}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">D+ (m)</span>
          <input
            name="elevation_gain_m"
            type="number"
            min={0}
            defaultValue={race.elevation_gain_m ?? ''}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">Terrain</span>
          <select
            name="terrain"
            defaultValue={race.terrain}
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
          >
            <option value="route">Route (plat, asphalte)</option>
            <option value="trail">Trail (nature, dénivelé)</option>
            <option value="mixte">Mixte</option>
          </select>
        </label>

        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-granit">
            Temps cible <span className="text-granit/60">— optionnel</span>
          </span>
          <input
            name="goal_time"
            type="text"
            placeholder="3h45  ·  1:24:36  ·  42min"
            defaultValue={formatGoalForInput(race.goal_time_s)}
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
            defaultValue={race.notes ?? ''}
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

      <div className="mt-4 flex gap-3">
        <Link
          href="/courses"
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
