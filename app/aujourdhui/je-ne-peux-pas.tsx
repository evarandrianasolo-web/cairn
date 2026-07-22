'use client'

import { useState } from 'react'

const RAISONS = ['Séance club', 'Garde des enfants', 'Déplacement', 'Fatiguée'] as const
type Portee = 'jour' | 'semaine'

/**
 * Feuille modale « Je ne peux pas ».
 * Placeholder d'action : « Prévenir le coach » ne fait rien encore — le coach
 * arrive en P2. On journalise l'intention et on ferme.
 */
export function JeNePeuxPas() {
  const [open, setOpen] = useState(false)
  const [portee, setPortee] = useState<Portee>('jour')
  const [choix, setChoix] = useState<string | null>(null)
  const [autreOuvert, setAutreOuvert] = useState(false)
  const [autreTexte, setAutreTexte] = useState('')

  function fermer() {
    setOpen(false)
    setAutreOuvert(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 rounded-surface border border-granit/35 bg-transparent px-4 py-3 text-base font-medium text-schiste"
      >
        Je ne peux pas
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal>
          <button
            type="button"
            aria-label="Fermer"
            onClick={fermer}
            className="absolute inset-0 bg-schiste/40"
          />
          <div className="relative z-10 w-full rounded-t-surface bg-craie px-6 pt-[22px] pb-[30px]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-schiste">Je ne peux pas</h2>
                <p className="mt-1 text-base text-granit">Qu&apos;est-ce qui bouge ?</p>
              </div>
              <button
                type="button"
                onClick={fermer}
                aria-label="Fermer"
                className="text-2xl leading-none text-granit"
              >
                ×
              </button>
            </div>

            <div className="mt-5 flex gap-2">
              {(['jour', 'semaine'] as const).map((p) => {
                const actif = portee === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPortee(p)}
                    className={
                      'flex-1 rounded-surface px-4 py-3 text-base ' +
                      (actif
                        ? 'bg-schiste text-craie'
                        : 'border border-granit/35 text-schiste')
                    }
                  >
                    {p === 'jour' ? "Aujourd'hui" : 'Cette semaine'}
                  </button>
                )
              })}
            </div>

            <p className="mt-5 font-mono text-xs uppercase tracking-wide text-granit">
              Pourquoi
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {RAISONS.map((r) => {
                const actif = choix === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setChoix(r)
                      setAutreOuvert(false)
                    }}
                    className={
                      'rounded-surface border px-4 py-2 text-base ' +
                      (actif
                        ? 'border-schiste bg-schiste text-craie'
                        : 'border-granit/35 text-schiste')
                    }
                  >
                    {r}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  setAutreOuvert(true)
                  setChoix('Autre')
                }}
                className={
                  'rounded-surface border px-4 py-2 text-base ' +
                  (autreOuvert
                    ? 'border-schiste bg-schiste text-craie'
                    : 'border-granit/35 text-schiste')
                }
              >
                Autre…
              </button>
            </div>

            {autreOuvert && (
              <input
                type="text"
                value={autreTexte}
                onChange={(e) => setAutreTexte(e.target.value)}
                placeholder="Dis-moi ce qui bloque"
                className="mt-3 w-full rounded-surface border border-granit/35 bg-craie px-3 py-2 text-base text-schiste focus:border-schiste focus:outline-none"
              />
            )}

            <button
              type="button"
              onClick={fermer}
              className="mt-6 w-full rounded-surface bg-schiste px-4 py-3 text-base font-medium text-craie"
            >
              Prévenir le coach
            </button>
          </div>
        </div>
      )}
    </>
  )
}
