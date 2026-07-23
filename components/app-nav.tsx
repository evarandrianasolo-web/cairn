'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

/**
 * Navigation globale du produit.
 * - Desktop (>= md) : nav horizontale, toutes les entrees visibles.
 * - Mobile (< md)   : bouton burger + drawer plein hauteur, regroupe
 *   les entrees en 3 sections (Quotidien, Ressources, Config).
 *
 * L'ecran actif porte une petite balise rouge a droite dans le drawer,
 * et un soulignement dans la nav horizontale.
 */
type NavItem = { href: string; label: string; muted?: boolean }
type NavSection = { title?: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Quotidien',
    items: [
      { href: '/aujourdhui', label: "Aujourd'hui" },
      { href: '/planning', label: 'Planning' },
      { href: '/coach', label: 'Coach' },
      { href: '/activities', label: 'Activités' },
    ],
  },
  {
    title: 'Ressources',
    items: [
      { href: '/courses', label: 'Courses' },
      { href: '/debriefs', label: 'Débriefs' },
      { href: '/contraintes', label: 'Contraintes' },
      { href: '/fueling', label: 'Fueling' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Config',
    items: [
      { href: '/settings/strava', label: 'Strava', muted: true },
      { href: '/settings/ai-usage', label: 'Coût IA', muted: true },
      { href: '/settings/donnees', label: 'Mes données', muted: true },
      { href: '/settings/donnees-sante', label: 'Données santé', muted: true },
    ],
  },
]

const FLAT_ITEMS = SECTIONS.flatMap((s) => s.items)

export function AppNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href) ?? false

  return (
    <header className="border-b border-granit/20 bg-craie">
      {/* Barre supérieure toujours visible */}
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="font-display text-lg text-schiste"
          onClick={() => setOpen(false)}
        >
          Cairn
        </Link>

        {/* Nav horizontale desktop */}
        <nav className="hidden flex-1 items-center justify-end gap-5 text-sm md:flex">
          {FLAT_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                (item.muted ? 'text-granit ' : 'text-schiste ') +
                'hover:underline ' +
                (isActive(item.href) ? 'underline underline-offset-4' : '')
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Bouton burger mobile */}
        <button
          type="button"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex flex-col gap-[5px] p-2 md:hidden"
        >
          {open ? (
            <span className="font-mono text-base text-schiste leading-none">×</span>
          ) : (
            <>
              <span className="block h-[1.5px] w-5 bg-schiste" />
              <span className="block h-[1.5px] w-5 bg-schiste" />
              <span className="block h-[1.5px] w-5 bg-schiste" />
            </>
          )}
        </button>
      </div>

      {/* Drawer mobile */}
      {open && (
        <div className="border-t border-granit/20 bg-craie md:hidden">
          <nav className="mx-auto max-w-5xl px-4 py-3">
            {SECTIONS.map((section) => (
              <div key={section.title ?? ''} className="mb-3 last:mb-0">
                {section.title && (
                  <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-granit">
                    {section.title}
                  </div>
                )}
                <ul className="flex flex-col">
                  {section.items.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={
                            'flex items-center justify-between px-3 py-3 text-base ' +
                            (active
                              ? 'bg-brume text-schiste'
                              : item.muted
                                ? 'text-granit hover:bg-brume/60'
                                : 'text-schiste hover:bg-brume/60')
                          }
                        >
                          <span>{item.label}</span>
                          {active && (
                            <span
                              className="ml-2 inline-block h-5 w-[3px] rounded-sm bg-balise"
                              aria-hidden="true"
                            />
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
