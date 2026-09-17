/**
 * Croix rouge de balisage — « mauvaise direction ».
 * SEULE marque qui signale une erreur dans tout le produit.
 * Ne jamais utiliser pour un ✕ de fermeture (utiliser un ✕ granit).
 */
export function Croix({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        stroke="#D6423B"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  )
}
