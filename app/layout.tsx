import type { Metadata } from 'next'
import { Archivo, Instrument_Sans, Martian_Mono } from 'next/font/google'
import { AppNav } from '@/components/app-nav'
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
        <AppNav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  )
}
