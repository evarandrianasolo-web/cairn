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

const RACE_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function formatRaceDate(iso: string): string {
  return RACE_DATE.format(new Date(iso + 'T00:00:00Z'))
}

/**
 * Nombre de jours entre aujourd'hui et une date-cible.
 * Positif : la date est dans le futur (« J−73 »).
 * Négatif ou nul : passée ou aujourd'hui.
 */
export function daysUntil(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(iso + 'T00:00:00Z')
  const diff = target.getTime() - today.getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

/** Format J−X, J−0, ou J+X pour une date passée. */
export function formatJMinus(iso: string): string {
  const n = daysUntil(iso)
  if (n > 0) return `J−${n}`
  if (n === 0) return 'J−0'
  return `J+${-n}`
}

/**
 * Accepte plusieurs formats de saisie et retourne un nombre de secondes,
 * ou null si non parsable / vide.
 * Reconnu :
 *   « 3h45 » « 3 h 45 » « 3h45m »  → heures + minutes
 *   « 1:24:36 »                    → h:m:s
 *   « 3:45 »                       → h:m (chaîne < 3 caractères sur le 1er
 *                                    segment) ou m:s si tu préfères ? Ici
 *                                    on interprète 2 segments comme h:m.
 *   « 42min » « 42 m »             → minutes seules
 */
export function parseGoalTime(input: string | null | undefined): number | null {
  if (!input) return null
  const s = input.trim().toLowerCase()
  if (!s) return null

  const hm = s.match(/^(\d+)\s*h\s*(\d{0,2})\s*m?$/)
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2] || 0) * 60

  const colon = s.match(/^(\d+):(\d+)(?::(\d+))?$/)
  if (colon) {
    const a = Number(colon[1])
    const b = Number(colon[2])
    const c = colon[3] != null ? Number(colon[3]) : null
    if (c != null) return a * 3600 + b * 60 + c
    return a * 3600 + b * 60
  }

  const minutes = s.match(/^(\d+)\s*m(?:in)?$/)
  if (minutes) return Number(minutes[1]) * 60

  return null
}

/** Secondes → « 3 h 45 » (sans secondes) ou « 3 h 45 min 12 » si secondes. */
export function formatGoalTime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0 && s === 0) return `${h} h ${m.toString().padStart(2, '0')}`
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  if (s === 0) return `${m} min`
  return `${m}:${s.toString().padStart(2, '0')}`
}

/* --- Contraintes -------------------------------------------------------- */

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type WeekdayCode = (typeof WEEKDAY_CODES)[number]

export const WEEKDAY_LABELS: Record<WeekdayCode, string> = {
  MO: 'lun',
  TU: 'mar',
  WE: 'mer',
  TH: 'jeu',
  FR: 'ven',
  SA: 'sam',
  SU: 'dim',
}

export function buildWeeklyRRule(
  days: WeekdayCode[],
  interval = 1,
): string | null {
  if (days.length === 0) return null
  const ordered = WEEKDAY_CODES.filter((d) => days.includes(d))
  const parts = ['FREQ=WEEKLY']
  if (interval > 1) parts.push(`INTERVAL=${interval}`)
  parts.push(`BYDAY=${ordered.join(',')}`)
  return parts.join(';')
}

export function buildMonthlyRRule(dayOfMonth: number): string | null {
  if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return null
  return `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`
}

export function parseWeekdaysFromRRule(rrule: string | null | undefined): WeekdayCode[] {
  if (!rrule) return []
  const match = rrule.match(/BYDAY=([A-Z,]+)/)
  if (!match) return []
  return match[1]
    .split(',')
    .filter((d): d is WeekdayCode => (WEEKDAY_CODES as readonly string[]).includes(d))
}

function parseRRuleField(rrule: string, field: string): string | null {
  const m = rrule.match(new RegExp(`(?:^|;)${field}=([^;]+)`))
  return m ? m[1] : null
}

/**
 * Rend une RRULE en français lisible :
 *   « lun · mer · ven »                            (weekly, chaque semaine)
 *   « toutes les 2 semaines · mar · jeu »          (weekly avec INTERVAL)
 *   « le 15 de chaque mois »                       (monthly avec BYMONTHDAY)
 *   la RRULE brute en fallback, pour le mode personnalisé.
 */
export function formatRecurrence(rrule: string | null | undefined): string {
  if (!rrule) return '—'
  const freq = parseRRuleField(rrule, 'FREQ')

  if (freq === 'WEEKLY') {
    const interval = Number(parseRRuleField(rrule, 'INTERVAL') ?? '1')
    const days = parseWeekdaysFromRRule(rrule)
    if (days.length === 0) return rrule
    const daysLabel = days.map((d) => WEEKDAY_LABELS[d]).join(' · ')
    if (interval <= 1) return daysLabel
    return `toutes les ${interval} semaines · ${daysLabel}`
  }

  if (freq === 'MONTHLY') {
    const dom = parseRRuleField(rrule, 'BYMONTHDAY')
    if (dom) return `le ${dom} de chaque mois`
    return rrule
  }

  return rrule
}

export function formatConstraintPeriod(
  startsOn: string | null,
  endsOn: string | null,
): string {
  if (!startsOn) return '—'
  const start = formatRaceDate(startsOn)
  if (!endsOn || endsOn === startsOn) return `le ${start}`
  const end = formatRaceDate(endsOn)
  return `du ${start} au ${end}`
}

