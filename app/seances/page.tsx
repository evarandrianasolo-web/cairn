import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'
import { formatDistance, formatDplus, formatDuree } from '@/lib/format'
import { createTemplate, deleteTemplate, seedDefaultTemplates } from './actions'

const TYPE_LABEL: Record<string, string> = {
  endurance: 'Endurance fondamentale',
  seuil: 'Seuil',
  vma: 'VMA',
  cote: 'Côtes',
  longue: 'Longue',
  recup: 'Récupération',
  renfo: 'Renforcement',
  rando: 'Rando active',
  course: 'Course',
}

const TYPE_ORDER = [
  'endurance',
  'seuil',
  'vma',
  'cote',
  'longue',
  'renfo',
  'recup',
  'rando',
  'course',
] as const

type Template = {
  id: string
  name: string
  session_type: string
  intent: string | null
  default_duration_s: number | null
  default_distance_m: number | null
  default_elevation_m: number | null
}

export default async function SeancesPage({
  searchParams,
}: {
  searchParams: Promise<{ seeded?: string; erreur?: string; ajoute?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { seeded, erreur, ajoute } = await searchParams

  const { data: templates } = await supabase
    .from('session_templates')
    .select(
      'id, name, session_type, intent, default_duration_s, default_distance_m, default_elevation_m',
    )
    .order('name', { ascending: true })

  const rows = (templates ?? []) as Template[]
  const byType = new Map<string, Template[]>()
  for (const t of rows) {
    const list = byType.get(t.session_type) ?? []
    list.push(t)
    byType.set(t.session_type, list)
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <ScreenTitle>Banque de séances</ScreenTitle>

      <p className="text-sm text-granit">
        Modèles de séances réutilisables. Le coach IA continue à générer à la
        volée dans /planning, cette banque te donne un référentiel visuel de
        ce qu&apos;on peut faire selon le type.
      </p>

      {erreur && (
        <p className="rounded-data border border-ocre/40 bg-craie px-3 py-2 text-sm text-ocre">
          {erreur}
        </p>
      )}
      {seeded && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          {seeded} modèles ajoutés à ta banque.
        </p>
      )}
      {ajoute && (
        <p className="rounded-data border border-lichen/40 bg-craie px-3 py-2 text-sm text-lichen">
          Modèle enregistré.
        </p>
      )}

      {rows.length > 0 && <NewTemplateForm />}

      {rows.length === 0 ? (
        <section className="rounded-data border border-brume bg-craie p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Aucun modèle
          </h2>
          <p className="mt-2 text-sm text-schiste">
            Charge une banque de départ (19 modèles calibrés trail/route mixte,
            EF / seuil / VMA / côtes / longue / renfo / récup / rando). Tu
            pourras ensuite en supprimer ou en ajouter.
          </p>
          <form action={seedDefaultTemplates} className="mt-3">
            <button
              type="submit"
              className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
            >
              Charger la banque de départ
            </button>
          </form>
        </section>
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.filter((t) => byType.has(t)).map((type) => {
            const items = byType.get(type)!
            return (
              <section key={type}>
                <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
                  {TYPE_LABEL[type] ?? type}
                </h2>
                <ul className="mt-3 space-y-2">
                  {items.map((t) => (
                    <TemplateRow key={t.id} template={t} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}

function NewTemplateForm() {
  return (
    <details className="rounded-data border border-brume bg-craie p-3 sm:p-4">
      <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide text-granit">
        + Ajouter un modèle
      </summary>
      <form action={createTemplate} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Nom</span>
            <input
              name="name"
              required
              placeholder="Ex : Fartlek 8x2'"
              className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Type</span>
            <select
              name="session_type"
              required
              defaultValue="endurance"
              className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm text-schiste focus:border-schiste focus:outline-none"
            >
              <option value="endurance">Endurance</option>
              <option value="seuil">Seuil</option>
              <option value="vma">VMA</option>
              <option value="cote">Côtes</option>
              <option value="longue">Longue</option>
              <option value="renfo">Renforcement</option>
              <option value="recup">Récupération</option>
              <option value="rando">Rando active</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-granit">
            Intent (structure + allure + terrain)
          </span>
          <textarea
            name="intent"
            required
            rows={3}
            placeholder="Ex : 15' echauffement + 8 x 2' allure semi 4:35/km, r=1' EF entre blocs, plat, + 10' retour au calme"
            className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm text-schiste focus:border-schiste focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Durée (min)</span>
            <input
              name="duration_min"
              type="number"
              min="1"
              placeholder="60"
              className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">Distance (km)</span>
            <input
              name="distance_km"
              type="text"
              inputMode="decimal"
              placeholder="10"
              className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-granit">D+ (m)</span>
            <input
              name="elevation_m"
              type="number"
              min="0"
              placeholder="100"
              className="rounded-data border border-granit/35 bg-craie px-3 py-2 text-sm tabular text-schiste focus:border-schiste focus:outline-none"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-surface bg-schiste px-4 py-2 text-sm font-medium text-craie"
          >
            Ajouter
          </button>
        </div>
      </form>
    </details>
  )
}

function TemplateRow({ template }: { template: Template }) {
  return (
    <li className="rounded-data border border-brume bg-craie p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-schiste">{template.name}</p>
        <form action={deleteTemplate}>
          <input type="hidden" name="id" value={template.id} />
          <button
            type="submit"
            aria-label="Supprimer"
            className="text-granit hover:text-schiste"
          >
            ×
          </button>
        </form>
      </div>
      {template.intent && (
        <p className="mt-1 text-sm text-schiste">{template.intent}</p>
      )}
      <p className="tabular mt-2 font-mono text-[10px] text-granit">
        {template.default_duration_s ? formatDuree(template.default_duration_s) : '—'}
        {template.default_distance_m
          ? ` · ${formatDistance(template.default_distance_m)}`
          : ''}
        {template.default_elevation_m
          ? ` · ${formatDplus(template.default_elevation_m)}`
          : ''}
      </p>
    </li>
  )
}
