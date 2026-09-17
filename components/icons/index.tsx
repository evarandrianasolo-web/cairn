/**
 * Icones utilitaires (indicateurs d'etat dans les listes). Distinctes des
 * marques de balisage (components/marks) reservees a la semantique itineraire
 * du handoff (sur itineraire / adapter / ecart). Ici, ce sont juste des
 * pictos minimalistes qui n'engagent aucune valeur symbolique.
 *
 * currentColor : la couleur vient de la classe text-* du parent.
 */

type IconProps = { size?: number; className?: string; title?: string }

/** Drapeau -- indique qu'une activite est liee a une course. */
export function IconFlag({ size = 12, className, title }: IconProps) {
  return (
    <svg
      role={title ? 'img' : 'presentation'}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
    >
      {title && <title>{title}</title>}
      <path
        d="M2.5 1v10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
      />
      <path
        d="M3 1.5h6l-1.5 2L9 5.5H3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="miter"
        fill="currentColor"
        fillOpacity="0.15"
      />
    </svg>
  )
}

/** Chainon -- suggere une liaison possible (course candidate a lier). */
export function IconLink({ size = 12, className, title }: IconProps) {
  return (
    <svg
      role={title ? 'img' : 'presentation'}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
    >
      {title && <title>{title}</title>}
      <path
        d="M4.3 6.7L2.6 8.4a1.7 1.7 0 1 0 2.4 2.4l1.7-1.7M7.7 5.3l1.7-1.7a1.7 1.7 0 1 0-2.4-2.4L5.3 3M4.5 7.5l3-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

/** Crayon -- indique la presence de notes personnelles. */
export function IconPencil({ size = 12, className, title }: IconProps) {
  return (
    <svg
      role={title ? 'img' : 'presentation'}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
    >
      {title && <title>{title}</title>}
      <path
        d="M8.5 1.5l2 2L4 10 1.5 10.5 2 8l6.5-6.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="miter"
      />
      <path d="M7.5 2.5l2 2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
