# Strava OAuth + import initial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connecter le compte Strava d'Eva, recueillir les trois consentements FC, et importer ses ~350 dernières activités en base — avec filtrage FC à l'ingestion selon le consentement.

**Architecture :** OAuth2 authorization-code flow. Le secret client reste côté serveur ; les tokens d'accès et de rafraîchissement sont chiffrés en AES-256-GCM par l'application avant écriture en base, jamais transmis au navigateur. L'import initial est **synchrone** — un Server Action qui attend la fin des ~8 appels API Strava et des insertions correspondantes (30 s environ). La FC (`average_heartrate`, `max_heartrate`, `suffer_score`) est écartée du chemin d'écriture si le consentement `fc_stockage` n'est pas actif : elle transite en mémoire puis disparaît, jamais persistée.

**Tech Stack :** Next.js 16 App Router (Server Actions + Route Handlers), `@supabase/ssr`, Node `crypto` (chiffrement), API Strava v3.

## Global Constraints

- Une table `strava_connections` est ajoutée. Elle porte `tenant_id`, un index sur `tenant_id`, `enable` **et** `force row level security`, et quatre policies séparées — comme toutes les tables du projet.
- **La liste `TENANT_TABLES` de `tests/isolation.test.ts` doit être mise à jour dans la même tâche que la migration.** Sinon le test ignore la nouvelle table.
- **Aucune valeur brute de FC ne peut passer côté client**, jamais. Les objets d'activité renvoyés par les Server Actions ou les pages sont expurgés côté serveur avant retour.
- **Le poids** que Strava renvoie sur le profil athlète (`weight` en kg) n'est jamais lu, jamais stocké, jamais transmis. On ne demande pas le scope `profile:read_all` — le scope Strava se limite à `activity:read_all`.
- Les tokens (`access_token`, `refresh_token`) sont chiffrés **avant** insertion et déchiffrés uniquement dans le code serveur qui appelle l'API Strava. Une lecture directe de `strava_connections` n'expose que du base64 opaque.
- Aucune chaîne `SERVICE_ROLE` n'apparaît dans `app/` ou `lib/` — le test l'interdit (`isolation.test.ts:180-185`).
- Le `redirect_uri` transmis à Strava lors de l'échange **doit être byte-identique** à celui de la demande d'autorisation, sinon Strava rejette avec « Bad Request ».
- Chaque écriture dans `activity_health` s'accompagne d'un enregistrement dans `health_access_logs` (`action='ecriture'`, `actor='system'`).

---

### Task 1: Cryptographie serveur des tokens Strava

**Files:**
- Create: `lib/strava/crypto.ts`
- Create: `tests/strava-crypto.test.ts`
- Modify: `.env.example`
- Modify: `vitest.config.ts` (élargir le pattern d'exécution)

**Interfaces:**
- Produces: `encrypt(plaintext: string): string` et `decrypt(cipher: string): string` — chaîne base64 opaque, format `iv || ciphertext || authTag`.

**Contexte :** ces deux fonctions sont la seule voie d'écriture et de lecture des tokens Strava. Elles vivent isolées pour être testables sans base ni réseau. La clé est un secret **32 octets** stocké dans `STRAVA_TOKEN_KEY`. Si l'env var est absente ou mal formée, l'application refuse de démarrer plutôt que de tourner sans chiffrement.

- [ ] **Step 1: Générer une clé et la coller dans `.env.local`**

Commande à exécuter dans un terminal (pas via le chat) :

```bash
openssl rand -base64 32
```

Coller la sortie dans `.env.local` :

```
STRAVA_TOKEN_KEY=<sortie de openssl>
```

- [ ] **Step 2: Documenter dans `.env.example`**

Éditer `.env.example`, ajouter au bloc Strava :

```bash
# Clé symétrique pour chiffrer les tokens Strava au repos.
# Générer avec : openssl rand -base64 32
# Perdre cette clé rend tous les tokens illisibles → reconnexion Strava
# à la main pour chaque tenant. À sauvegarder hors dépôt.
STRAVA_TOKEN_KEY=
```

- [ ] **Step 3: Écrire le test qui échoue**

Créer `tests/strava-crypto.test.ts` :

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { encrypt, decrypt } from '@/lib/strava/crypto'

beforeAll(() => {
  process.env.STRAVA_TOKEN_KEY = randomBytes(32).toString('base64')
})

describe('chiffrement des tokens', () => {
  it('un tour d\'aller-retour rend la valeur d\'origine', () => {
    const clair = 'strava-refresh-token-abcdef1234567890'
    expect(decrypt(encrypt(clair))).toBe(clair)
  })

  it('deux chiffrements du même texte donnent des sorties différentes (IV aléatoire)', () => {
    expect(encrypt('même chose')).not.toBe(encrypt('même chose'))
  })

  it('un texte chiffré altéré lève une exception, il ne rend pas de valeur silencieuse', () => {
    const cipher = encrypt('secret')
    const altere = cipher.slice(0, -4) + 'AAAA'
    expect(() => decrypt(altere)).toThrow()
  })

  it('une clé absente fait échouer immédiatement', () => {
    const saved = process.env.STRAVA_TOKEN_KEY
    delete process.env.STRAVA_TOKEN_KEY
    expect(() => encrypt('x')).toThrow(/STRAVA_TOKEN_KEY/)
    process.env.STRAVA_TOKEN_KEY = saved
  })
})
```

- [ ] **Step 4: Lancer le test pour voir l'échec attendu**

Modifier temporairement `vitest.config.ts` — le champ `test.include` ne restreint pas encore l'exécution, `npm run test:isolation` cible un fichier précis. On ajoute un script dédié pour ce test.

Éditer `package.json`, section `scripts`, ajouter :

```json
"test:crypto": "vitest run tests/strava-crypto.test.ts"
```

```bash
npm run test:crypto
```

Attendu : FAIL sur `Cannot find module '@/lib/strava/crypto'`.

- [ ] **Step 5: Implémenter le module**

```ts
// lib/strava/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12    // GCM standard
const TAG_LEN = 16

function key(): Buffer {
  const raw = process.env.STRAVA_TOKEN_KEY
  if (!raw) {
    throw new Error(
      'STRAVA_TOKEN_KEY absent. Générer avec `openssl rand -base64 32` ' +
        'et renseigner dans .env.local.',
    )
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error(
      'STRAVA_TOKEN_KEY doit décoder à 32 octets exactement (AES-256). ' +
        `Longueur actuelle : ${buf.length}.`,
    )
  }
  return buf
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, enc, tag]).toString('base64')
}

export function decrypt(cipher: string): string {
  const buf = Buffer.from(cipher, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 6: Rejouer le test — doit passer**

```bash
npm run test:crypto
```

Attendu : 4 tests OK.

- [ ] **Step 7: Commit**

```bash
git add lib/strava/crypto.ts tests/strava-crypto.test.ts .env.example package.json
git commit -m "feat(strava): chiffrement AES-256-GCM des tokens serveur"
```

---

### Task 2: Migration `strava_connections` + mise à jour du test d'isolation

**Files:**
- Create: `supabase/migrations/20260722100000_strava_connections.sql` (renommer après application MCP)
- Modify: `tests/isolation.test.ts` (ajouter à `TENANT_TABLES`)

**Interfaces:**
- Consumes: `auth.users`.
- Produces: `public.strava_connections`, référencée par les tâches 3 à 5.

- [ ] **Step 1: Ajouter à `TENANT_TABLES`**

Éditer `tests/isolation.test.ts:25-39`, insérer `'strava_connections'` en gardant l'ordre alphabétique de la section correspondante (avant `'health_access_logs'` fonctionne, l'ordre exact n'est pas contrôlé par le test) :

```ts
const TENANT_TABLES = [
  'athletes',
  'activities',
  'activity_health',
  'health_access_logs',
  'strava_connections',
  'races',
  // ...
] as const
```

- [ ] **Step 2: Écrire la migration**

```sql
-- supabase/migrations/20260722100000_strava_connections.sql
-- Connexion OAuth2 Strava d'un athlete. Un compte Strava par tenant, d'où
-- le UNIQUE sur tenant_id.
--
-- Les tokens sont chiffrés côté application (AES-256-GCM, voir lib/strava/crypto.ts)
-- AVANT insertion. Le champ text stocke la sortie base64 opaque : lire ces
-- colonnes en SQL direct ne donne rien d'exploitable.

create table public.strava_connections (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null unique references auth.users(id) on delete cascade,

  strava_athlete_id         bigint not null,

  access_token_encrypted    text not null,
  refresh_token_encrypted   text not null,
  expires_at                timestamptz not null,

  scopes                    text[] not null default '{}',

  connected_at              timestamptz not null default now(),
  last_imported_at          timestamptz,
  updated_at                timestamptz not null default now()
);

create index strava_connections_tenant_id_idx on public.strava_connections (tenant_id);

alter table public.strava_connections enable row level security;
alter table public.strava_connections force row level security;

create policy "strava_connections_select_own"
  on public.strava_connections for select
  using (tenant_id = (select auth.uid()));

create policy "strava_connections_insert_own"
  on public.strava_connections for insert
  with check (tenant_id = (select auth.uid()));

create policy "strava_connections_update_own"
  on public.strava_connections for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "strava_connections_delete_own"
  on public.strava_connections for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 3: Appliquer via le MCP Supabase**

L'accès CLI est bloqué sur ce projet, on passe par le serveur MCP (voir `supabase-acces-cairn` en mémoire).

Appeler `apply_migration` avec `project_id: awlacbyaxcftlhntgpmm`, `name: strava_connections`, `query: <contenu SQL>`.

- [ ] **Step 4: Renommer le fichier local pour aligner sur la version MCP**

Lire le timestamp enregistré :

```sql
select version, name from supabase_migrations.schema_migrations
where name = 'strava_connections';
```

Renommer `20260722100000_strava_connections.sql` en `<version>_strava_connections.sql`.

- [ ] **Step 5: Lancer le test d'isolation**

```bash
npm run test:isolation
```

Attendu : 25/25 (14 tables × 1 lecture + les autres tests). Si le test échoue sur `strava_connections`, vérifier que RLS est bien `enable` **et** `force`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/isolation.test.ts
git commit -m "feat(strava): table strava_connections avec RLS"
```

---

### Task 3: OAuth flow — authorize + callback

**Files:**
- Create: `lib/strava/config.ts`
- Create: `lib/strava/oauth.ts`
- Create: `lib/strava/connections.ts`
- Create: `app/api/strava/authorize/route.ts`
- Create: `app/api/strava/callback/route.ts`

**Interfaces:**
- Consumes: `encrypt` (Task 1), `strava_connections` (Task 2), `createServerSupabaseClient` (Task 1 socle DB).
- Produces:
  - `buildAuthorizationUrl(state: string, redirectUri: string): string`
  - `exchangeCodeForTokens(code: string, redirectUri: string): Promise<StravaTokens>`
  - `upsertConnection(supabase, params: UpsertConnectionParams): Promise<void>`

**Contexte :** deux routes très minces. La logique complexe (construction d'URL, échange, écriture) vit dans `lib/strava/`. Le state OAuth est un token aléatoire posé en cookie httpOnly, comparé au retour — protection contre le CSRF sur ce flux.

- [ ] **Step 1: `lib/strava/config.ts`**

```ts
// lib/strava/config.ts
export const STRAVA_SCOPE = 'activity:read_all'
export const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

export function stravaClientId(): string {
  const v = process.env.STRAVA_CLIENT_ID
  if (!v) throw new Error('STRAVA_CLIENT_ID absent')
  return v
}

export function stravaClientSecret(): string {
  const v = process.env.STRAVA_CLIENT_SECRET
  if (!v) throw new Error('STRAVA_CLIENT_SECRET absent')
  return v
}

/**
 * Construit le redirect_uri à partir de la requête entrante.
 * Doit être byte-identique entre l'appel authorize et l'appel callback.
 */
export function redirectUriFrom(request: Request): string {
  const url = new URL(request.url)
  return `${url.origin}/api/strava/callback`
}
```

- [ ] **Step 2: `lib/strava/oauth.ts`**

```ts
// lib/strava/oauth.ts
import {
  STRAVA_AUTHORIZE_URL,
  STRAVA_TOKEN_URL,
  STRAVA_SCOPE,
  stravaClientId,
  stravaClientSecret,
} from './config'

export type StravaTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  athleteId: number
  scope: string[]
}

export function buildAuthorizationUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: stravaClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: STRAVA_SCOPE,
    approval_prompt: 'auto',
    state,
  })
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: stravaClientId(),
      client_secret: stravaClientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: data.athlete.id,
    scope: (data.scope ?? STRAVA_SCOPE).split(','),
  }
}

export async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: stravaClientId(),
      client_secret: stravaClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000),
    athleteId: 0, // pas fourni sur refresh, on garde celui déjà stocké
    scope: [],
  }
}
```

- [ ] **Step 3: `lib/strava/connections.ts`**

```ts
// lib/strava/connections.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt } from './crypto'
import type { StravaTokens } from './oauth'

export async function upsertConnection(
  supabase: SupabaseClient,
  tokens: StravaTokens,
): Promise<void> {
  const { error } = await supabase
    .from('strava_connections')
    .upsert(
      {
        tenant_id: (await supabase.auth.getUser()).data.user!.id,
        strava_athlete_id: tokens.athleteId,
        access_token_encrypted: encrypt(tokens.accessToken),
        refresh_token_encrypted: encrypt(tokens.refreshToken),
        expires_at: tokens.expiresAt.toISOString(),
        scopes: tokens.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    )
  if (error) throw new Error(`upsertConnection: ${error.message}`)
}
```

- [ ] **Step 4: Route authorize**

```ts
// app/api/strava/authorize/route.ts
import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildAuthorizationUrl } from '@/lib/strava/oauth'
import { redirectUriFrom } from '@/lib/strava/config'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const state = randomBytes(32).toString('hex')
  const url = buildAuthorizationUrl(state, redirectUriFrom(request))

  const res = NextResponse.redirect(url)
  res.cookies.set('strava_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // 10 minutes
  })
  return res
}
```

- [ ] **Step 5: Route callback**

```ts
// app/api/strava/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens } from '@/lib/strava/oauth'
import { upsertConnection } from '@/lib/strava/connections'
import { redirectUriFrom } from '@/lib/strava/config'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) return NextResponse.redirect(new URL(`/settings/strava?erreur=${error}`, request.url))
  if (!code || !state) return NextResponse.redirect(new URL('/settings/strava?erreur=params', request.url))

  const cookieState = request.cookies.get('strava_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL('/settings/strava?erreur=state', request.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUriFrom(request))
    await upsertConnection(supabase, tokens)
  } catch (e) {
    console.error('Strava callback failed', e)
    return NextResponse.redirect(new URL('/settings/strava?erreur=echange', request.url))
  }

  const res = NextResponse.redirect(new URL('/settings/strava?connecte=1', request.url))
  res.cookies.delete('strava_oauth_state')
  return res
}
```

- [ ] **Step 6: Vérifier le build**

```bash
npm run build
```

Attendu : succès, deux nouvelles routes détectées.

- [ ] **Step 7: Commit**

```bash
git add lib/strava app/api/strava
git commit -m "feat(strava): flux OAuth2 (authorize + callback), tokens chiffrés en base"
```

---

### Task 4: Écran `/settings/strava` + formulaire de consentement FC

**Files:**
- Create: `lib/consent/policy.ts`
- Create: `app/settings/strava/actions.ts`
- Create: `app/settings/strava/consent-form.tsx`
- Create: `app/settings/strava/page.tsx`

**Interfaces:**
- Consumes: `strava_connections` (Task 2), `consent_records` (schéma existant).
- Produces: Server Action `saveConsentAndImport(formData)` — signature détaillée en Task 5.

**Contexte :** page unique en trois états.

| État | Contenu |
|---|---|
| Non connecté | Bouton « Connecter Strava » → `/api/strava/authorize` |
| Connecté, pas encore d'import | Formulaire de trois cases décochées, bouton « Enregistrer et importer » |
| Connecté et importé | Récap : « connecté à l'athlète #X, N activités importées le … » + bouton reconnecter/déconnecter |

- [ ] **Step 1: Texte de politique versionné**

```ts
// lib/consent/policy.ts
export const CONSENT_POLICY_VERSION = 'v1-2026-07'

export const CONSENT_TEXTS = {
  fc_stockage: `Stocker ma fréquence cardiaque pour l'analyse.
Sans ce consentement, la FC est filtrée à l'ingestion et jamais écrite en base.`,
  fc_analyse_ia: `Autoriser le coach IA à utiliser ma FC dans son analyse.
Le coach ne reçoit jamais de valeurs brutes, uniquement des tendances dérivées.`,
  stats_anonymes: `Contribuer à des statistiques agrégées et anonymisées.
Aucun impact sur mon expérience d'utilisation.`,
} as const

export type ConsentScope = keyof typeof CONSENT_TEXTS
```

- [ ] **Step 2: Server Action `saveConsentAndImport` — squelette**

Implémentation vide à ce stade, complétée en Task 5. On pose la signature pour que la page compile.

```ts
// app/settings/strava/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CONSENT_POLICY_VERSION, CONSENT_TEXTS, type ConsentScope } from '@/lib/consent/policy'

export async function saveConsentAndImport(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const scopes: ConsentScope[] = ['fc_stockage', 'fc_analyse_ia', 'stats_anonymes']
  const now = new Date().toISOString()

  const rows = scopes.map((scope) => ({
    tenant_id: user.id,
    scope,
    granted: formData.get(scope) === 'on',
    policy_version: CONSENT_POLICY_VERSION,
    policy_text: CONSENT_TEXTS[scope],
    occurred_at: now,
  }))

  const { error } = await supabase.from('consent_records').insert(rows)
  if (error) throw new Error(`saveConsent: ${error.message}`)

  // TODO Task 5: lancer l'import initial ici.

  revalidatePath('/settings/strava')
  redirect('/settings/strava?consent=1')
}

export async function disconnectStrava() {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('strava_connections').delete().not('id', 'is', null)
  if (error) throw new Error(`disconnect: ${error.message}`)
  revalidatePath('/settings/strava')
}
```

- [ ] **Step 3: Formulaire client**

```tsx
// app/settings/strava/consent-form.tsx
'use client'

import { CONSENT_TEXTS, type ConsentScope } from '@/lib/consent/policy'
import { saveConsentAndImport } from './actions'

const SCOPES: ConsentScope[] = ['fc_stockage', 'fc_analyse_ia', 'stats_anonymes']

export function ConsentForm() {
  return (
    <form action={saveConsentAndImport} className="mt-6 space-y-4">
      {SCOPES.map((scope) => (
        <label key={scope} className="flex gap-3 rounded-data border border-granit bg-craie p-3">
          <input type="checkbox" name={scope} className="mt-1" />
          <span className="text-sm text-schiste whitespace-pre-line">{CONSENT_TEXTS[scope]}</span>
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
```

- [ ] **Step 4: Page serveur — décide de l'état**

```tsx
// app/settings/strava/page.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ConsentForm } from './consent-form'
import { disconnectStrava } from './actions'

export default async function StravaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; connecte?: string; imported?: string }>
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: connection } = await supabase
    .from('strava_connections')
    .select('strava_athlete_id, connected_at, last_imported_at')
    .maybeSingle()

  const params = await searchParams

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="font-display text-xl text-schiste">Strava</h1>

      {params.erreur && (
        <p className="mt-3 rounded-data bg-craie p-3 text-sm text-balise">
          Erreur : {params.erreur}
        </p>
      )}

      {!connection ? (
        <div className="mt-6">
          <p className="text-sm text-granit">
            Connecte ton compte Strava pour importer tes activités.
          </p>
          <a
            href="/api/strava/authorize"
            className="mt-4 inline-block rounded-data bg-schiste px-3 py-2 text-sm text-craie"
          >
            Connecter Strava
          </a>
        </div>
      ) : !connection.last_imported_at ? (
        <div className="mt-6">
          <p className="text-sm text-schiste">
            Compte Strava connecté (#{connection.strava_athlete_id}).
          </p>
          <p className="mt-2 text-sm text-granit">
            Choisis maintenant ce que tu autorises côté fréquence cardiaque.
            Toutes les cases sont décochées par défaut ; l'app fonctionne sans FC,
            elle fonctionne mieux avec.
          </p>
          <ConsentForm />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-schiste">
            Connecté à l'athlète #{connection.strava_athlete_id}.
          </p>
          <p className="text-sm text-granit">
            Dernier import :{' '}
            <span className="tabular">{connection.last_imported_at}</span>.
          </p>
          <form action={disconnectStrava}>
            <button
              type="submit"
              className="rounded-data border border-granit px-3 py-2 text-sm text-schiste"
            >
              Déconnecter Strava
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Vérifier le build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add app/settings lib/consent
git commit -m "feat(strava): écran de connexion + formulaire de consentement FC"
```

---

### Task 5: Import initial des activités, avec filtrage FC selon consentement

**Files:**
- Create: `lib/strava/tokens.ts`
- Create: `lib/strava/api.ts`
- Create: `lib/strava/ingest.ts`
- Create: `tests/strava-ingest.test.ts`
- Modify: `app/settings/strava/actions.ts` (compléter le TODO de Task 4)

**Interfaces:**
- Consumes: `refreshTokens` et `encrypt`/`decrypt` (Tasks 1 et 3), `strava_connections`, `activities`, `activity_health`, `consent_records`, `health_access_logs`.
- Produces:
  - `getValidAccessToken(supabase): Promise<string>` — retourne un token utilisable, en rafraîchit un si expiré.
  - `listActivities(accessToken, page): Promise<StravaActivity[]>`
  - `transformActivity(raw)` — activités sans champ FC, prêtes à insertion dans `activities`.
  - `extractHealth(raw)` — les champs FC (ou `null` si absents).

**Contexte :** l'import est un Server Action qui **attend** la fin des appels — 7 à 8 requêtes Strava pour ~350 activités, ~30 s au total. C'est acceptable pour un dogfood solo. Pas de file d'attente, pas de webhook, pas de re-run partiel : si l'import échoue en cours de route, on relance depuis zéro (les insertions sont idempotentes sur `(tenant_id, strava_activity_id)`).

- [ ] **Step 1: `lib/strava/tokens.ts`**

```ts
// lib/strava/tokens.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './crypto'
import { refreshTokens } from './oauth'

const REFRESH_MARGIN_S = 60

export async function getValidAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: conn, error } = await supabase
    .from('strava_connections')
    .select('access_token_encrypted, refresh_token_encrypted, expires_at')
    .maybeSingle()
  if (error) throw new Error(`Strava connection lookup: ${error.message}`)
  if (!conn) throw new Error('Aucune connexion Strava')

  const expiresAt = new Date(conn.expires_at).getTime() / 1000
  const now = Date.now() / 1000
  if (expiresAt - now > REFRESH_MARGIN_S) {
    return decrypt(conn.access_token_encrypted)
  }

  const refreshed = await refreshTokens(decrypt(conn.refresh_token_encrypted))
  const { error: upErr } = await supabase
    .from('strava_connections')
    .update({
      access_token_encrypted: encrypt(refreshed.accessToken),
      refresh_token_encrypted: encrypt(refreshed.refreshToken),
      expires_at: refreshed.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .not('id', 'is', null)
  if (upErr) throw new Error(`Strava token update: ${upErr.message}`)

  return refreshed.accessToken
}
```

- [ ] **Step 2: `lib/strava/api.ts` — client d'API minimal**

```ts
// lib/strava/api.ts
import { STRAVA_API_BASE } from './config'

/** Ce qu'on lit sur une activité Strava résumée. FC séparée en `heartrate`. */
export type StravaActivity = {
  id: number
  name: string | null
  description: string | null
  sport_type: string | null
  start_date: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  elapsed_time: number
  average_speed: number | null
  average_cadence: number | null
  has_heartrate: boolean
  average_heartrate: number | null
  max_heartrate: number | null
  suffer_score: number | null
}

export async function listActivities(
  accessToken: string,
  page: number,
  perPage = 100,
): Promise<StravaActivity[]> {
  const url = `${STRAVA_API_BASE}/athlete/activities?per_page=${perPage}&page=${page}`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Strava list activities: ${res.status} ${await res.text()}`)
  return res.json()
}
```

- [ ] **Step 3: `lib/strava/ingest.ts` — la seule fonction responsable du filtre FC**

```ts
// lib/strava/ingest.ts
import type { StravaActivity } from './api'

export type ActivityRow = {
  strava_activity_id: number
  source: 'strava'
  name: string | null
  description: string | null
  sport_type: string | null
  started_at: string
  distance_m: number
  elevation_gain_m: number
  moving_time_s: number
  elapsed_time_s: number
  avg_pace_s_per_km: number | null
  avg_cadence: number | null
}

export type HealthRow = {
  avg_hr: number | null
  max_hr: number | null
  relative_effort: number | null
}

export function transformActivity(raw: StravaActivity): ActivityRow {
  const paceSPerKm =
    raw.average_speed && raw.average_speed > 0 ? 1000 / raw.average_speed : null

  return {
    strava_activity_id: raw.id,
    source: 'strava',
    name: raw.name,
    description: raw.description,
    sport_type: raw.sport_type,
    started_at: raw.start_date,
    distance_m: Math.round(raw.distance),
    elevation_gain_m: Math.round(raw.total_elevation_gain),
    moving_time_s: raw.moving_time,
    elapsed_time_s: raw.elapsed_time,
    avg_pace_s_per_km: paceSPerKm ? Number(paceSPerKm.toFixed(2)) : null,
    avg_cadence: raw.average_cadence,
  }
}

/** Retourne null si le consentement fc_stockage n'est pas actif OU si Strava n'a pas de FC. */
export function extractHealth(raw: StravaActivity, fcConsent: boolean): HealthRow | null {
  if (!fcConsent) return null
  if (!raw.has_heartrate) return null
  return {
    avg_hr: raw.average_heartrate ?? null,
    max_hr: raw.max_heartrate ?? null,
    relative_effort: raw.suffer_score ?? null,
  }
}
```

- [ ] **Step 4: Tests du filtre FC**

```ts
// tests/strava-ingest.test.ts
import { describe, it, expect } from 'vitest'
import type { StravaActivity } from '@/lib/strava/api'
import { extractHealth, transformActivity } from '@/lib/strava/ingest'

const brute: StravaActivity = {
  id: 12345,
  name: 'sortie longue',
  description: null,
  sport_type: 'TrailRun',
  start_date: '2026-07-15T06:00:00Z',
  distance: 25000,
  total_elevation_gain: 900,
  moving_time: 10800,
  elapsed_time: 11400,
  average_speed: 2.31,
  average_cadence: 82.1,
  has_heartrate: true,
  average_heartrate: 148,
  max_heartrate: 172,
  suffer_score: 210,
}

describe('filtrage FC à l\'ingestion', () => {
  it('sans consentement, extractHealth renvoie null', () => {
    expect(extractHealth(brute, false)).toBeNull()
  })

  it('avec consentement mais activité sans FC, extractHealth renvoie null', () => {
    expect(extractHealth({ ...brute, has_heartrate: false }, true)).toBeNull()
  })

  it('avec consentement et FC présente, extractHealth renvoie les valeurs', () => {
    expect(extractHealth(brute, true)).toEqual({
      avg_hr: 148,
      max_hr: 172,
      relative_effort: 210,
    })
  })

  it('transformActivity n\'expose aucun champ de FC, quoi qu\'il arrive', () => {
    const row = transformActivity(brute) as Record<string, unknown>
    for (const k of Object.keys(row)) {
      expect(k).not.toMatch(/hr|heartrate|effort/i)
    }
  })
})
```

Ajouter le script :

```json
"test:ingest": "vitest run tests/strava-ingest.test.ts"
```

```bash
npm run test:ingest
```

Attendu : 4 tests OK.

- [ ] **Step 5: Compléter le Server Action pour lancer l'import**

Remplacer le TODO de `app/settings/strava/actions.ts` par un appel à `runInitialImport(supabase, user.id, fcConsent)`. Fonction à ajouter en tête du fichier :

```ts
import { getValidAccessToken } from '@/lib/strava/tokens'
import { listActivities } from '@/lib/strava/api'
import { extractHealth, transformActivity } from '@/lib/strava/ingest'

async function runInitialImport(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tenantId: string,
  fcConsent: boolean,
): Promise<number> {
  const accessToken = await getValidAccessToken(supabase)

  let page = 1
  let inserted = 0

  while (true) {
    const batch = await listActivities(accessToken, page)
    if (batch.length === 0) break

    // 1. Activités « sèches », sans aucun champ FC.
    const activityRows = batch.map((a) => ({
      tenant_id: tenantId,
      ...transformActivity(a),
    }))
    const { data: written, error } = await supabase
      .from('activities')
      .upsert(activityRows, { onConflict: 'tenant_id,strava_activity_id' })
      .select('id, strava_activity_id')
    if (error) throw new Error(`Import activités: ${error.message}`)

    // 2. Ligne santé UNIQUEMENT si consentement, activité par activité.
    if (fcConsent) {
      const idByStrava = new Map(written!.map((r) => [r.strava_activity_id, r.id]))
      const healthRows = batch
        .map((a) => {
          const h = extractHealth(a, true)
          if (!h) return null
          return {
            tenant_id: tenantId,
            activity_id: idByStrava.get(a.id)!,
            ...h,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (healthRows.length > 0) {
        const { error: hErr } = await supabase.from('activity_health').upsert(healthRows, {
          onConflict: 'activity_id',
        })
        if (hErr) throw new Error(`Import santé: ${hErr.message}`)

        const logRows = healthRows.map((r) => ({
          tenant_id: tenantId,
          subject_table: 'activity_health',
          subject_id: r.activity_id,
          action: 'ecriture' as const,
          actor: 'system' as const,
          context: 'import initial Strava',
        }))
        await supabase.from('health_access_logs').insert(logRows)
      }
    }

    inserted += batch.length
    page += 1

    if (batch.length < 100) break // dernière page
  }

  await supabase
    .from('strava_connections')
    .update({ last_imported_at: new Date().toISOString() })
    .not('id', 'is', null)

  return inserted
}
```

Modifier ensuite le `saveConsentAndImport` :

```ts
export async function saveConsentAndImport(formData: FormData) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fcStockage = formData.get('fc_stockage') === 'on'
  const scopes: ConsentScope[] = ['fc_stockage', 'fc_analyse_ia', 'stats_anonymes']
  const now = new Date().toISOString()

  const rows = scopes.map((scope) => ({
    tenant_id: user.id,
    scope,
    granted: formData.get(scope) === 'on',
    policy_version: CONSENT_POLICY_VERSION,
    policy_text: CONSENT_TEXTS[scope],
    occurred_at: now,
  }))

  const { error } = await supabase.from('consent_records').insert(rows)
  if (error) throw new Error(`saveConsent: ${error.message}`)

  const imported = await runInitialImport(supabase, user.id, fcStockage)

  revalidatePath('/settings/strava')
  redirect(`/settings/strava?imported=${imported}`)
}
```

- [ ] **Step 6: Vérifier le build et l'isolation**

```bash
npm run build && npm run test:isolation && npm run test:crypto && npm run test:ingest
```

Attendu : tout OK. Modifier `scripts` en `test` global si besoin de rassembler.

- [ ] **Step 7: Vérification manuelle de bout en bout**

- Ouvrir http://localhost:3100/settings/strava → « Connecter Strava »
- Approuver côté Strava
- Retour sur `/settings/strava` avec `?connecte=1`
- Cocher les cases souhaitées, soumettre
- Attendre ~30 s
- Redirection avec `?imported=N`

Vérifier ensuite en SQL (via MCP) :

```sql
select count(*) from public.activities;
select count(*) from public.activity_health;
select scope, granted from public.consent_records order by occurred_at desc;
select count(*) from public.health_access_logs;
```

L'utilisatrice ayant coché `fc_stockage` verra un compte `activity_health` correspondant au nombre d'activités avec cardio. Sinon, `activity_health` reste vide.

- [ ] **Step 8: Commit**

```bash
git add lib/strava app/settings tests
git commit -m "feat(strava): import initial des activités, filtrage FC à l'ingestion"
```

---

## Points d'interprétation

**Consentement demandé avant l'import initial.** Le PRD §6.2 décrit une demande contextuelle à la première activité avec cardio. Simplification assumée pour la V1 : trois cases à cocher, avant l'import, sur l'écran de connexion Strava. Le résultat juridique est identique — trois consentements séparés et décochés par défaut, journalisés avec le texte exact — et l'expérience contextuelle reviendra en beta, quand on aura un onboarding à orchestrer.

**Import synchrone, pas de file d'attente.** Un Server Action qui attend 30 s est acceptable pour un dogfood solo. Un job d'arrière-plan (BullMQ, Trigger.dev, Supabase Edge Functions) devient utile en beta, quand plusieurs imports peuvent s'entasser. Pas maintenant.

**Pas de scope `profile:read_all`.** Strava renvoie le poids dans le profil athlète. On ne demande pas ce scope, donc on ne peut pas y accéder par mégarde. Corollaire : les zones cardiaques calibrées côté Strava ne sont pas récupérables tant que ce scope n'est pas ajouté. On les calibrera plus tard, quand le consentement FC sera un fait acquis pour une part des utilisateurs.

**Pas de webhook, pas d'écriture retour vers Strava.** Le PRD §4.1 mentionne les deux comme cibles à terme. Le webhook exige un endpoint HTTPS public — incompatible avec localhost — et l'écriture retour est explicitement classée V1.5. Reportés.

**`transformActivity` est une frontière de sécurité.** Elle n'accepte pas d'objet générique : elle prend un `StravaActivity` typé et produit un `ActivityRow` sans aucun champ FC dans son type de sortie. Ajouter une clé FC à `ActivityRow` déclencherait un fail TS au premier consommateur. Le test unitaire vérifie qu'aucune clé du résultat n'inclut le motif « hr|heartrate|effort ».

**Le champ `weight` du profil athlète n'entre nulle part.** Interdit dans le schéma, absent des types, hors scope OAuth. Trois barrières, chacune suffisante.
