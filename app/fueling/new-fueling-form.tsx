'use client'

import { useState } from 'react'
import { formatDateCourte, formatDistance, formatDuree } from '@/lib/format'
import { addFuelingLog } from './actions'

type IntakePattern = 'rien' | 'un_peu' | 'regulierement'
type Issue = 'aucun' | 'oubli' | 'nausee' | 'pas_acces' | 'autre'

type Activity = {
  id: string
  name: string | null
  sport_type: string | null
  started_at: string
  distance_m: number | null
  moving_time_s: number | null
}

const INTAKE_PATTERNS: { code: IntakePattern; label: string }[] = [
  { code: 'rien', label: 'Rien' },
  { code: 'un_peu', label: 'Un peu' },
  { code: 'regulierement', label: 'Régulièrement' },
]

const ISSUES: { code: Issue; label: string; hint: string }[] = [
  { code: 'aucun', label: 'Aucun', hint: 'ça s\'est bien passé' },
  { code: 'oubli', label: 'Oublié', hint: 'j\'ai simplement pas pensé à manger' },
  { code: 'nausee', label: 'Nausée', hint: 'l\'estomac ne suivait plus' },
  { code: 'pas_acces', label: 'Pas d\'accès', hint: 'ravito loin, pas eu le temps' },
  { code: 'autre', label: 'Autre', hint: 'décrire dans les notes' },
]

export function NewFuelingForm({
  activities,
  defaultActivityId = null,
}: {
  activities: Activity[]
  defaultActivityId?: string | null
}) {
  const [intake, setIntake] = useState<IntakePattern>('regulierement')
  const [issue, setIssue] = useState<Issue>('aucun')

  return (
    <form
      action={addFuelingLog}
      className="rounded-surface border border-granit/20 bg-craie p-4"
    >
      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        Ajouter un fueling
      </p>

      <label className="mt-3 flex flex-col gap-1">
        <span className="text-xs text-granit">Séance concernée</span>
        <select
          required
          name="activity_id"
          defaultValue={defaultActivityId ?? ''}
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        >
          <option value="" disabled>
            Choisir une séance…
          </option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {formatDateCourte(a.started_at)} · {a.sport_type ?? '—'} ·{' '}
              {formatDistance(a.distance_m)} · {formatDuree(a.moving_time_s)} —{' '}
              {a.name ?? 'sans titre'}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">As-tu mangé pendant ?</span>
        <div className="flex gap-2">
          {INTAKE_PATTERNS.map((p) => {
            const actif = intake === p.code
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => setIntake(p.code)}
                className={
                  'flex-1 rounded-data border px-2 py-1.5 text-base ' +
                  (actif
                    ? 'border-schiste bg-schiste text-craie'
                    : 'border-granit/35 text-schiste')
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <input type="hidden" name="intake_pattern" value={intake} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">
            g/h glucides <span className="text-granit/60">— optionnel</span>
          </span>
          <input
            name="carbs_g_per_hour"
            type="number"
            min={0}
            step="0.1"
            placeholder="60"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">
            g total <span className="text-granit/60">— optionnel</span>
          </span>
          <input
            name="carbs_g"
            type="number"
            min={0}
            step="1"
            placeholder="120"
            className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base tabular text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">
          Produits ingérés{' '}
          <span className="text-granit/60">— texte libre, optionnel</span>
        </span>
        <input
          name="products_text"
          type="text"
          placeholder="compote 25g x2 · gel citron 30g · boisson 40g/L"
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">Souci pendant l&apos;effort ?</span>
        <div className="flex flex-wrap gap-2">
          {ISSUES.map((i) => {
            const actif = issue === i.code
            return (
              <button
                key={i.code}
                type="button"
                onClick={() => setIssue(i.code)}
                className={
                  'rounded-data border px-3 py-1.5 text-sm ' +
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
          {ISSUES.find((i) => i.code === issue)?.hint}
        </p>
        <input type="hidden" name="issue" value={issue} />
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-data border border-granit/35 bg-craie p-3">
        <input
          type="checkbox"
          name="post_window_fed"
          className="mt-1"
          defaultChecked
        />
        <span className="text-sm text-schiste">
          Mangé dans les 60–90 min après la séance
          <span className="mt-0.5 block text-xs text-granit">
            fenêtre de récupération glucidique
          </span>
        </span>
      </label>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs text-granit">
          Notes <span className="text-granit/60">— stratégie, observations</span>
        </span>
        <textarea
          name="notes"
          rows={2}
          placeholder="Bien passé jusqu'au km 40, un peu de mal en descente"
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <button
        type="submit"
        className="mt-4 w-full rounded-surface bg-schiste px-3 py-2 text-base font-medium text-craie"
      >
        Enregistrer
      </button>
    </form>
  )
}
