'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatDateCourte, formatDistance, formatDuree } from '@/lib/format'
import { updateFuelingLog } from './actions'

type IntakePattern = 'rien' | 'un_peu' | 'regulierement'
type Issue = 'aucun' | 'oubli' | 'nausee' | 'pas_acces' | 'autre'

type FuelingLog = {
  id: string
  activity_id: string | null
  intake_pattern: IntakePattern
  carbs_g: number | null
  carbs_g_per_hour: number | null
  products: { text?: string } | null
  issue: Issue
  post_window_fed: boolean | null
  notes: string | null
  activities: {
    started_at: string
    name: string | null
    sport_type: string | null
    distance_m: number | null
    moving_time_s: number | null
  } | null
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

export function EditFuelingForm({ log }: { log: FuelingLog }) {
  const [intake, setIntake] = useState<IntakePattern>(log.intake_pattern)
  const [issue, setIssue] = useState<Issue>(log.issue)

  const activity = log.activities

  return (
    <form
      action={updateFuelingLog}
      className="rounded-surface border border-schiste bg-craie p-4"
    >
      <input type="hidden" name="id" value={log.id} />
      <p className="font-mono text-xs uppercase tracking-wide text-granit">
        Modifier — fueling
      </p>

      <div className="mt-3 rounded-data border border-granit/20 bg-brume px-3 py-2 text-sm text-schiste">
        {activity ? (
          <>
            <span className="tabular text-xs text-granit">
              {formatDateCourte(activity.started_at)}
            </span>{' '}
            · {activity.sport_type ?? '—'} · {formatDistance(activity.distance_m)} ·{' '}
            {formatDuree(activity.moving_time_s)} —{' '}
            {activity.name ?? 'sans titre'}
          </>
        ) : (
          <span className="italic text-granit">séance rattachée introuvable</span>
        )}
        <span className="mt-1 block text-xs text-granit">
          Pour changer de séance, supprime ce log et recrée-en un.
        </span>
      </div>

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
            defaultValue={log.carbs_g_per_hour ?? ''}
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
            defaultValue={log.carbs_g ?? ''}
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
          defaultValue={log.products?.text ?? ''}
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
          defaultChecked={log.post_window_fed ?? false}
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
          defaultValue={log.notes ?? ''}
          placeholder="Bien passé jusqu'au km 40, un peu de mal en descente"
          className="rounded-data border border-granit/35 bg-craie px-2 py-1.5 text-base text-schiste focus:border-schiste focus:outline-none"
        />
      </label>

      <div className="mt-4 flex gap-3">
        <Link
          href="/fueling"
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
