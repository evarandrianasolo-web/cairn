// =============================================================
// Parsing de la date/heure du CSV Strava en français.
// =============================================================
// Doc 07 Q8 : format observe "27 juil. 2026" (jour, mois abrege avec
// point, annee). N'est utilise qu'en dernier recours — quand une
// ligne du CSV n'a pas de fichier .fit/.gpx/.tcx associe et qu'on
// doit dater l'activite depuis le CSV seul (voir normalize.ts).
// =============================================================

const FRENCH_MONTHS: Record<string, number> = {
  'janv.': 0,
  'févr.': 1,
  mars: 2,
  'avr.': 3,
  mai: 4,
  juin: 5,
  'juil.': 6,
  août: 7,
  'sept.': 8,
  'oct.': 9,
  'nov.': 10,
  'déc.': 11,
}

/**
 * `dateStr` type "27 juil. 2026". `timeStr` optionnel type "06:15:32"
 * (24h) ou "6:15:32 AM" (12h). Renvoie un ISO UTC au mieux — si le
 * fuseau reel est inconnu, on traite l'heure comme locale Europe/Paris
 * approximee en UTC+2 (ete) / UTC+1 (hiver) n'est PAS calcule ici :
 * on renvoie une heure "naive" en UTC, moins precise qu'un FIT/GPX/TCX
 * mais suffisante pour une activite sans fichier associe (cas rare,
 * saisie CSV seule).
 */
export function parseFrenchStravaDate(dateStr: string, timeStr?: string): string | undefined {
  const match = dateStr.trim().match(/^(\d{1,2})\s+([a-zéû.]+)\s+(\d{4})$/i)
  if (!match) return undefined

  const day = Number(match[1])
  const month = FRENCH_MONTHS[match[2].toLowerCase()]
  const year = Number(match[3])
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return undefined

  let hours = 0
  let minutes = 0
  let seconds = 0

  if (timeStr) {
    const t = timeStr.trim()
    const twelveHour = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i)
    const twentyFourHour = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)

    if (twelveHour) {
      hours = Number(twelveHour[1]) % 12
      if (twelveHour[4].toUpperCase() === 'PM') hours += 12
      minutes = Number(twelveHour[2])
      seconds = Number(twelveHour[3] ?? 0)
    } else if (twentyFourHour) {
      hours = Number(twentyFourHour[1])
      minutes = Number(twentyFourHour[2])
      seconds = Number(twentyFourHour[3] ?? 0)
    }
    // Format non reconnu : on garde minuit plutot que d'echouer toute
    // la ligne pour un champ secondaire.
  }

  const iso = new Date(Date.UTC(year, month, day, hours, minutes, seconds)).toISOString()
  return iso
}
