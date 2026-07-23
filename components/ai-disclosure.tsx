/**
 * Bandeau d'information IA -- AI Act art. 50 : "l'utilisateur doit
 * savoir qu'il parle a une IA des la premiere interaction". La mention
 * en CGU ne suffit pas (rappel CLAUDE.md § chantiers en cours).
 * Rendu volontairement visible : bord contraste, icone, texte schiste
 * lisible.
 */
export function AiDisclosure({
  compact = false,
}: {
  compact?: boolean
}) {
  return (
    <div
      role="note"
      aria-label="Information IA"
      className={
        'flex items-start gap-3 rounded-data border border-schiste/25 bg-brume px-3 py-2 text-sm text-schiste ' +
        (compact ? '' : 'sm:text-base')
      }
    >
      <span
        aria-hidden="true"
        className="mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-schiste/40 font-mono text-[10px] font-medium text-schiste"
      >
        IA
      </span>
      <div className="flex-1">
        <p className="font-medium">
          Réponses générées par une IA (Claude, Anthropic).
        </p>
        <p className="text-xs text-granit">
          Elle ne remplace ni médecin, ni kiné, ni diététicien. Consulte un
          professionnel pour tout diagnostic ou plan alimentaire chiffré.
        </p>
      </div>
    </div>
  )
}
