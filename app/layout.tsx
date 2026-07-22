import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cairn',
  description: 'Coach trail, un seul endroit pour tes données, tes objectifs et ton plan.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-granit/30 bg-craie">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/" className="font-display text-lg text-schiste">
              Cairn
            </Link>
            <div className="flex-1" />
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
