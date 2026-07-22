/**
 * Formatters partagés. Locale fr-FR partout, chiffres tabulaires côté CSS
 * via la classe `tabular` (ou l'attribut data-numeric) définie dans globals.css.
 */

const DATE_COURTE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function formatDateCourte(iso: string): string {
  return DATE_COURTE.format(new Date(iso))
}

/** Métres → « 12,4 km » avec une décimale, ou « — » si nul/zéro. */
export function formatDistance(m: number | null): string {
  if (m == null || m <= 0) return '—'
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

/** Métres → « 900 m » entier, ou « — » si nul/zéro. */
export function formatDplus(m: number | null): string {
  if (m == null || m <= 0) return '—'
  return `${m} m`
}

/** Secondes → « 1 h 24 » ou « 42 min », ou « — ». */
export function formatDuree(s: number | null): string {
  if (s == null || s <= 0) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')}`
  return `${m} min`
}

/** Secondes/km → « 5:24/km », ou « — ». */
export function formatAllure(sPerKm: number | null): string {
  if (sPerKm == null || sPerKm <= 0) return '—'
  const m = Math.floor(sPerKm / 60)
  const s = Math.round(sPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}
