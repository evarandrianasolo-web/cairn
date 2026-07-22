'use client'

import { CONSENT_TEXTS, type ConsentScope } from '@/lib/consent/policy'
import { saveConsentAndImport } from './actions'

const SCOPES: ConsentScope[] = ['fc_stockage', 'fc_analyse_ia', 'stats_anonymes']

export function ConsentForm() {
  return (
    <form action={saveConsentAndImport} className="mt-6 space-y-4">
      {SCOPES.map((scope) => (
        <label
          key={scope}
          className="flex gap-3 rounded-data border border-granit bg-craie p-3"
        >
          <input type="checkbox" name={scope} className="mt-1" />
          <span className="text-sm text-schiste whitespace-pre-line">
            {CONSENT_TEXTS[scope]}
          </span>
        </label>
      ))}
      <button
        type="submit"
        className="mt-2 w-full rounded-data bg-schiste px-3 py-2 text-sm text-craie"
      >
        Enregistrer et importer mes activités
      </button>
    </form>
  )
}
