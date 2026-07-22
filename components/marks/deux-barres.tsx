/**
 * Marque de balisage GR à deux barres — blanc au-dessus, rouge en dessous.
 * Signifie « sur l'itinéraire ». Présente en permanence sans dramatisation.
 * Voir _handoff/README.md § Règle critique.
 */
export function DeuxBarres({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <rect x={5} y={3} width={10} height={14} fill="#FBFBF9" />
      <rect x={5} y={10} width={10} height={7} fill="#D6423B" />
      <rect
        x={5}
        y={3}
        width={10}
        height={14}
        fill="none"
        stroke="#767E7B"
        strokeWidth={1.25}
      />
    </svg>
  )
}
