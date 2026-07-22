import Anthropic from '@anthropic-ai/sdk'

/**
 * Client Anthropic partagé. La clé est résolue depuis ANTHROPIC_API_KEY,
 * jamais exposée côté client. Ce fichier est le SEUL point d'appel API IA.
 */
let cached: Anthropic | null = null

export function anthropic(): Anthropic {
  if (cached) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY absent — impossible d\'appeler le coach.')
  }
  cached = new Anthropic({ apiKey })
  return cached
}

/** Modèle par défaut du coach. Cf. skill claude-api : Opus 4.8 pour ce que l'on peut. */
export const COACH_MODEL = 'claude-opus-4-8'
