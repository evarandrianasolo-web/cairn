import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ScreenTitle } from '@/components/screen-title'

const DAY_MS = 24 * 60 * 60 * 1000

const FEATURE_LABEL: Record<string, string> = {
  'coach-chat': 'Coach chat',
  'debrief-from-notes': 'Débrief depuis notes',
  'fueling-from-notes': 'Fueling depuis notes',
  'plan-generate': 'Génération plan',
  'plan-readjust': 'Réajustement plan',
  'activity-analysis': 'Analyse activité',
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

type CallRow = {
  id: string
  feature: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd_x1e6: number
  meta: Record<string, unknown> | null
  created_at: string
}

export default async function AiUsagePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const { data: calls } = await supabase
    .from('ai_calls')
    .select('id, feature, model, tokens_in, tokens_out, cost_usd_x1e6, meta, created_at')
    .gte('created_at', since30)
    .order('created_at', { ascending: false })

  const rows = (calls ?? []) as CallRow[]

  const total = {
    calls: rows.length,
    tokensIn: rows.reduce((s, r) => s + r.tokens_in, 0),
    tokensOut: rows.reduce((s, r) => s + r.tokens_out, 0),
    costUsdX1e6: rows.reduce((s, r) => s + r.cost_usd_x1e6, 0),
  }

  const byFeature = new Map<
    string,
    { calls: number; tokensIn: number; tokensOut: number; costUsdX1e6: number }
  >()
  for (const r of rows) {
    const bucket =
      byFeature.get(r.feature) ??
      { calls: 0, tokensIn: 0, tokensOut: 0, costUsdX1e6: 0 }
    bucket.calls++
    bucket.tokensIn += r.tokens_in
    bucket.tokensOut += r.tokens_out
    bucket.costUsdX1e6 += r.cost_usd_x1e6
    byFeature.set(r.feature, bucket)
  }
  const featureRows = Array.from(byFeature.entries()).sort(
    (a, b) => b[1].costUsdX1e6 - a[1].costUsdX1e6,
  )

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <ScreenTitle>Coût IA</ScreenTitle>

      <p className="text-sm text-granit">
        Journal des appels Anthropic sur les 30 derniers jours. Aucun contenu
        de message n&apos;est stocké ici, uniquement des tokens et un coût
        estimé.
      </p>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BigStat label="Appels" value={String(total.calls)} />
        <BigStat label="Tokens in" value={formatK(total.tokensIn)} />
        <BigStat label="Tokens out" value={formatK(total.tokensOut)} />
        <BigStat
          label="Coût estimé"
          value={formatUsd(total.costUsdX1e6)}
          highlight
        />
      </section>

      {featureRows.length > 0 && (
        <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
            Par fonction
          </h2>
          <ul className="mt-3 divide-y divide-brume text-sm">
            {featureRows.map(([feature, s]) => (
              <li
                key={feature}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
              >
                <span className="flex-1 text-schiste">
                  {FEATURE_LABEL[feature] ?? feature}
                </span>
                <span className="tabular font-mono text-[10px] text-granit">
                  {s.calls} appel{s.calls > 1 ? 's' : ''}
                </span>
                <span className="tabular font-mono text-[10px] text-granit">
                  {formatK(s.tokensIn)} in · {formatK(s.tokensOut)} out
                </span>
                <span className="tabular font-mono text-xs text-schiste">
                  {formatUsd(s.costUsdX1e6)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-data border border-brume bg-craie p-3 sm:p-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-granit">
          20 derniers appels
        </h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-granit">
            Aucun appel IA depuis 30 jours. Va sur{' '}
            <Link href="/coach" className="underline">
              Coach
            </Link>{' '}
            ou{' '}
            <Link href="/planning" className="underline">
              Planning
            </Link>{' '}
            pour en générer.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-brume text-sm">
            {rows.slice(0, 20).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-xs"
              >
                <span className="tabular font-mono text-granit sm:w-24">
                  {DATE_FMT.format(new Date(r.created_at))}
                </span>
                <span className="flex-1 text-schiste">
                  {FEATURE_LABEL[r.feature] ?? r.feature}
                </span>
                <span className="tabular font-mono text-granit">
                  {formatK(r.tokens_in)} · {formatK(r.tokens_out)}
                </span>
                <span className="tabular font-mono text-schiste">
                  {formatUsd(r.cost_usd_x1e6)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function BigStat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-data border border-brume bg-craie px-3 py-2 sm:px-4 sm:py-3">
      <div
        className={
          'font-display text-xl font-extrabold leading-none sm:text-2xl ' +
          (highlight ? 'text-balise' : 'text-schiste')
        }
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] text-granit">{label}</div>
    </div>
  )
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k`
  return `${n}`
}

function formatUsd(x1e6: number): string {
  const usd = x1e6 / 1_000_000
  if (usd < 0.01) return `${(usd * 100).toFixed(2)} ¢`
  return `$${usd.toFixed(2)}`
}
