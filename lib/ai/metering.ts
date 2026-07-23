/**
 * Metering des appels Anthropic. Utilise en fire-and-forget apres
 * chaque messages.create -- si l'insert echoue, on log console et on
 * continue (le fonctionnel ne doit jamais casser sur un pb de mesure).
 *
 * Le cout estime est stocke en USD * 1_000_000 en base pour eviter les
 * floats. Prix Anthropic Opus 4.8 au 2026-07 : $5/M input, $25/M output.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'

export type AiCallFeature =
  | 'coach-chat'
  | 'debrief-from-notes'
  | 'fueling-from-notes'
  | 'plan-generate'
  | 'plan-readjust'

const PRICES_USD_PER_TOKEN: Record<string, { input: number; output: number }> = {
  // Prix officiels Opus 4.8 : $5/M input, $25/M output.
  'claude-opus-4-8': { input: 5 / 1_000_000, output: 25 / 1_000_000 },
  // Fallback conservateur pour tout autre modele.
  default: { input: 5 / 1_000_000, output: 25 / 1_000_000 },
}

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = PRICES_USD_PER_TOKEN[model] ?? PRICES_USD_PER_TOKEN.default
  return tokensIn * p.input + tokensOut * p.output
}

/**
 * Log un appel Anthropic. Best-effort : si l'insert echoue on log
 * l'erreur sans propager, le flow principal n'est jamais bloque.
 */
export async function logAnthropicCall(
  supabase: SupabaseClient,
  tenantId: string,
  feature: AiCallFeature,
  model: string,
  usage: { input_tokens: number; output_tokens: number } | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (!usage) return
  const tokensIn = usage.input_tokens ?? 0
  const tokensOut = usage.output_tokens ?? 0
  const costUsd = estimateCostUsd(model, tokensIn, tokensOut)
  const costX1e6 = Math.round(costUsd * 1_000_000)

  try {
    const { error } = await supabase.from('ai_calls').insert({
      tenant_id: tenantId,
      feature,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd_x1e6: costX1e6,
      meta: meta ?? null,
    })
    if (error) console.warn(`ai_calls log failed: ${error.message}`)
  } catch (e) {
    console.warn(`ai_calls log exception: ${e instanceof Error ? e.message : e}`)
  }
}

/**
 * Additionne les usages de plusieurs reponses (utile pour la boucle
 * tool_use du coach chat qui fait plusieurs API calls pour un tour).
 */
export function sumUsage(
  responses: { usage: Anthropic.Usage }[],
): { input_tokens: number; output_tokens: number } {
  return responses.reduce(
    (acc, r) => ({
      input_tokens: acc.input_tokens + (r.usage.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (r.usage.output_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0 },
  )
}
