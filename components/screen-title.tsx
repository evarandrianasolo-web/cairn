/**
 * Titre d'écran — Archivo, weight 800, wdth 125, uppercase, letter-spacing.
 * Le handoff impose « ≤ 1 élément Archivo par écran » : ce composant est
 * ce seul élément. Le reste du produit reste en Instrument Sans / Martian Mono.
 */
export function ScreenTitle({ children, className = '' }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h1
      className={
        'font-display text-xl font-extrabold uppercase leading-tight tracking-[0.02em] text-schiste break-words ' +
        className
      }
      style={{ fontVariationSettings: "'wdth' 125" }}
    >
      {children}
    </h1>
  )
}
