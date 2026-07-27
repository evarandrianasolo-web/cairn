/**
 * Bandeau d'information IA -- AI Act art. 50 : "l'utilisateur doit
 * savoir qu'il parle a une IA des la premiere interaction". La mention
 * en CGU ne suffit pas (rappel CLAUDE.md § chantiers en cours).
 * Rendu volontairement visible : bord contraste, icone, texte schiste
 * lisible.
 *
 * A utiliser en tete de tout ecran ou l'IA produit du contenu de
 * maniere permanente (coach, planning). Pour un contenu ponctuel
 * (une carte d'analyse, un debrief propose), preferer AiBadge en
 * marqueur inline.
 *
 * Couverture au 27/07/2026 (echeance AI Act art. 50 : 2 aout 2026) :
 * voir docs/ai-act-50-couverture.md.
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

/**
 * Marqueur inline "IA" pour signaler qu'un contenu specifique
 * (analyse d'activite, debrief propose, plan hebdo) a ete genere
 * par une IA. Utilise a cote d'un titre de carte ou d'un heading
 * de section.
 *
 * Conforme AI Act art. 50 § 2 : le contenu textuel synthetique
 * "genere ou manipule" doit etre "marque de maniere lisible par
 * une machine et detectable". La lisibilite humaine passe par ce
 * badge visible, la lisibilite machine est prevue par le
 * `data-ai-generated` attribut.
 */
export function AiBadge({
  label = 'IA',
  title,
}: {
  label?: string
  title?: string
}) {
  return (
    <span
      data-ai-generated="true"
      className="inline-flex items-center gap-1 rounded-data border border-schiste/40 bg-brume px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-schiste"
      title={
        title ?? 'Contenu généré par une IA (Claude, Anthropic). Non un avis médical.'
      }
    >
      <span aria-hidden="true">✦</span>
      {label}
    </span>
  )
}
