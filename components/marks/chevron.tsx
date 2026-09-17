/**
 * Chevron rouge de balisage — le plan bifurque.
 * Utilisé pour signaler un réajustement du plan.
 */
export function Chevron({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path
        d="M6 4 L13 10 L6 16"
        stroke="#D6423B"
        strokeWidth={3}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}
