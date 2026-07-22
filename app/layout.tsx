import type { Metadata } from 'next'
import Link from 'next/link'
import { Archivo, Instrument_Sans, Martian_Mono } from 'next/font/google'
import './globals.css'

// Archivo variable — axe wdth ouvert pour supporter le stretch 125 imposé
// par le handoff sur les titres display.
const archivo = Archivo({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
})

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument',
  display: 'swap',
})

const martian = Martian_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-martian',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Cairn',
  description: 'Coach trail, un seul endroit pour tes données, tes objectifs et ton plan.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`h-full antialiased ${archivo.variable} ${instrument.variable} ${martian.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-granit/20 bg-craie">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/" className="font-display text-lg text-schiste">
              Cairn
            </Link>
            <div className="flex-1" />
            <Link href="/aujourdhui" className="text-schiste hover:underline">
              Aujourd&apos;hui
            </Link>
            <Link href="/activities" className="text-schiste hover:underline">
              Activités
            </Link>
            <Link href="/settings/strava" className="text-granit hover:underline">
              Strava
            </Link>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  )
}
