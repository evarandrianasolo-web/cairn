# Socle base de données Cairn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les 13 tables du PRD §3.1 avec RLS Postgres stricte, l'authentification Supabase, et faire passer `npm run test:isolation` au vert.

**Architecture:** Sept migrations SQL, une par domaine métier, chacune contenant table + index `tenant_id` + `enable`/`force row level security` + quatre policies séparées, conformément à `docs/rls-pattern.sql`. L'authentification s'appuie sur `@supabase/ssr` : un client navigateur, un client serveur porteur de la session, un middleware de rafraîchissement. Aucun filtrage d'isolation applicatif nulle part.

**Tech Stack:** Postgres (Supabase), `@supabase/supabase-js` 2.x, `@supabase/ssr` (nouvelle dépendance), Next.js 16 App Router, TypeScript strict, Vitest 4.

## Global Constraints

- Toute table porte `tenant_id uuid not null references auth.users(id) on delete cascade`.
- Toute table a un index sur `tenant_id`.
- Toute table a `enable row level security` **et** `force row level security`.
- Quatre policies séparées par table (`select`/`insert`/`update`/`delete`) — jamais `for all`. Seule exception : `activity_health`, trois policies, pas d'UPDATE (patron `rls-pattern.sql:103`).
- La liste `TENANT_TABLES` de `tests/isolation.test.ts:25-39` fait foi. Aucune table hors de ces treize.
- **Mots interdits dans `supabase/migrations/**` — y compris dans les commentaires** : `weight`, `poids`, `body_mass`, `bmi`, `imc`, `body_fat`, `masse_grasse`, `calorie`, `kcal`, `energy_intake`. Le test `isolation.test.ts:148-155` scanne le SQL en minuscules, commentaires compris.
- Aucun `.eq('tenant_id', …)` ni `.eq('user_id', …)` dans `app/` ou `lib/` (`isolation.test.ts:166-172`).
- La chaîne `SERVICE_ROLE` ne doit apparaître dans aucun fichier de `app/` ou `lib/` (`isolation.test.ts:180-185`).
- Aucun `tenant_id` en paramètre Zod dans `lib/ai/tools.ts` (`isolation.test.ts:174-178`).
- Ne jamais créer de `tailwind.config.ts`.
- Nommage des tables sans guillemets. Un identifiant quoté (`public."constraints"`) casserait le regex de `isolation.test.ts:139-146` et ferait échouer le test. `constraints` (pluriel) est un mot-clé *non réservé* en Postgres : il passe sans guillemets.

---

### Task 0: Outillage de test — rendre le test exécutable et le voir échouer

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: la commande `npm run test:isolation`, et le chargement de `.env.local` dans l'environnement Vitest.

**Contexte :** `package.json:28` place `"test:isolation"` à l'intérieur de `devDependencies`, pas de `scripts`. En l'état, `npm run test:isolation` échoue avec « Missing script » et `npm install` tente d'installer un paquet nommé `test:isolation`. C'est un bug bloquant à corriger avant toute autre chose.

- [ ] **Step 1: Corriger l'emplacement du script et ajouter `@supabase/ssr`**

Remplacer intégralement `package.json` par :

```json
{
  "name": "cairn",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test:isolation": "vitest run tests/isolation.test.ts"
  },
  "dependencies": {
    "@supabase/ssr": "^0.7.0",
    "@supabase/supabase-js": "^2.110.8",
    "next": "16.2.11",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "eslint": "^9",
    "eslint-config-next": "16.2.11",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Créer la configuration Vitest**

`tests/isolation.test.ts:20-22` lit `process.env`. Vitest ne charge pas `.env.local` tout seul.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 3: Documenter les variables attendues**

```bash
# .env.example
# Copier vers .env.local et renseigner. .env.local n'est jamais commité.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Utilisée uniquement par tests/isolation.test.ts. Jamais importée depuis app/ ou lib/.
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Installer et lancer le test pour constater l'échec attendu**

```bash
npm install
```

```bash
npm run test:isolation
```

Attendu : ÉCHEC. Les erreurs attendues à ce stade sont `ENOENT` sur `lib` (le dossier n'existe pas, `isolation.test.ts:167` fait `walk(join(process.cwd(), 'lib'))`) et `ENOENT` sur `supabase/migrations` vide côté `readdirSync`. C'est le point de départ.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore(db): corriger le script test:isolation et configurer vitest"
```

---

### Task 1: Couche Supabase applicative et stub d'outils IA

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Create: `app/auth/callback/route.ts`
- Create: `lib/ai/tools.ts`

**Interfaces:**
- Produces: `createBrowserSupabaseClient()` depuis `lib/supabase/client.ts` ; `createServerSupabaseClient(): Promise<SupabaseClient>` depuis `lib/supabase/server.ts` ; `updateSession(request: NextRequest): Promise<NextResponse>` depuis `lib/supabase/middleware.ts` ; `coachTools` (tableau, vide en V1) depuis `lib/ai/tools.ts`.
- Consumes: rien.

**Contexte :** trois des quatre tests de `describe('Code applicatif — anti-patterns')` échouent tant que `lib/` et `lib/ai/tools.ts` n'existent pas. Cette tâche les fait passer et pose la couche d'authentification.

- [ ] **Step 1: Vérifier l'alias de chemin `@/`**

```bash
node -e "console.log(JSON.stringify(require('./tsconfig.json').compilerOptions.paths))"
```

Attendu : `{"@/*":["./*"]}`. Si absent, ajouter `"baseUrl": "."` et `"paths": {"@/*": ["./*"]}` dans `compilerOptions` de `tsconfig.json`.

- [ ] **Step 2: Client navigateur**

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: Client serveur — porteur de la session authentifiée**

Ce fichier est listé INTOUCHABLE dans `CLAUDE.md`. Il est créé ici, puis ne se modifie plus sans instruction explicite. Il n'utilise jamais la clé service_role : c'est la session utilisateur qui alimente `auth.uid()`, donc la RLS.

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 4: Rafraîchissement de session**

```ts
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  await supabase.auth.getUser()

  return response
}
```

```ts
// middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 5: Route de callback OAuth**

```ts
// app/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(origin)
  }

  return NextResponse.redirect(`${origin}/?auth=error`)
}
```

- [ ] **Step 6: Stub d'outils IA**

`isolation.test.ts:174-178` lit ce fichier et vérifie qu'aucun paramètre Zod ne s'appelle `tenantId`/`tenant_id`. Le coach IA est hors périmètre, mais le fichier doit exister.

```ts
// lib/ai/tools.ts
/**
 * Outils exposés au modèle. Le tenant vient TOUJOURS de la session serveur,
 * jamais d'un paramètre fourni par le modèle. Voir CLAUDE.md § Isolation IA.
 */
export const coachTools = [] as const
```

- [ ] **Step 7: Vérifier que les tests anti-patterns passent**

```bash
npm run test:isolation
```

Attendu : les quatre tests de `describe('Code applicatif — anti-patterns')` passent. Les tests d'isolation lecture/écriture échouent encore (tables absentes), le test « aucune table créée sans enable row level security » passe trivialement (`created` vide).

- [ ] **Step 8: Commit**

```bash
git add lib middleware.ts app/auth
git commit -m "feat(auth): clients Supabase serveur/navigateur, middleware de session, stub outils IA"
```

---

### Task 2: Migration 0001 — types énumérés et table `athletes`

**Files:**
- Create: `supabase/migrations/0001_athletes.sql`

**Interfaces:**
- Produces: les types `plan_phase`, `session_type`, `session_status`, `race_priority`, `race_status`, `constraint_kind`, `constraint_category`, `constraint_impact`, `fueling_intake`, `fueling_issue`, `debrief_kind`, `consent_scope`, `revision_trigger`, `revision_author` ; la table `public.athletes` avec la colonne `display_name` requise par `isolation.test.ts:79-80`.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0001_athletes.sql
-- Types énumérés partagés + racine de l'isolation.

create type plan_phase        as enum ('base', 'specifique', 'choc', 'affutage', 'course', 'recup');
create type session_type      as enum ('endurance', 'seuil', 'vma', 'cote', 'longue', 'recup', 'renfo', 'rando', 'course');
create type session_status    as enum ('prevue', 'realisee', 'modifiee', 'manquee', 'remplacee');
create type race_priority     as enum ('A', 'B', 'C');
create type race_status       as enum ('envisagee', 'inscrite', 'terminee', 'annulee', 'dns', 'dnf');
create type constraint_kind   as enum ('recurrente', 'ponctuelle');
create type constraint_category as enum ('garde', 'club', 'deplacement', 'vacances', 'meteo', 'blessure', 'travail', 'autre');
create type constraint_impact as enum ('bloque', 'allege', 'decale');
create type fueling_intake    as enum ('rien', 'un_peu', 'regulierement');
create type fueling_issue     as enum ('aucun', 'oubli', 'nausee', 'pas_acces', 'autre');
create type debrief_kind      as enum ('course', 'bloc');
create type consent_scope     as enum ('fc_stockage', 'fc_analyse_ia', 'stats_anonymes');
create type revision_trigger  as enum ('seance_ajoutee', 'seance_manquee', 'nouvelle_contrainte', 'nouvelle_course', 'seuil_charge', 'signal_fueling', 'demande_utilisateur');
create type revision_author   as enum ('user', 'ai');


-- 1. LA TABLE ---------------------------------------------------

create table public.athletes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null unique references auth.users(id) on delete cascade,

  display_name  text not null,
  timezone      text not null default 'Europe/Paris',

  -- Zones et allures calibrées, matériel, préférences d'affichage.
  -- Structures libres : elles se recalibrent depuis les courses réelles.
  hr_zones      jsonb,
  pace_zones    jsonb,
  gear          jsonb,
  preferences   jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index athletes_tenant_id_idx on public.athletes (tenant_id);


-- 2. ACTIVER LA RLS ---------------------------------------------

alter table public.athletes enable row level security;
alter table public.athletes force row level security;


-- 3. LES POLICIES -----------------------------------------------

create policy "athletes_select_own"
  on public.athletes for select
  using (tenant_id = (select auth.uid()));

create policy "athletes_insert_own"
  on public.athletes for insert
  with check (tenant_id = (select auth.uid()));

create policy "athletes_update_own"
  on public.athletes for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "athletes_delete_own"
  on public.athletes for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 2: Vérifier qu'aucun mot interdit n'a été introduit**

```bash
npm run test:isolation -- -t "aucun champ de poids"
```

Attendu : PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_athletes.sql
git commit -m "feat(db): types énumérés et table athletes avec RLS"
```

---

### Task 3: Migration 0002 — `activities`

**Files:**
- Create: `supabase/migrations/0002_activities.sql`

**Interfaces:**
- Consumes: `public.athletes` (Task 2).
- Produces: `public.activities`, référencée par `activity_health`, `planned_sessions` et `fueling_logs`.

**Note d'implémentation :** aucune colonne `raw jsonb` de payload Strava. Le payload brut contient la fréquence cardiaque, qui doit être filtrée à l'ingestion sans consentement (`CLAUDE.md` § Données de santé). Stocker le brut reviendrait à détenir la donnée. `relative_effort` est dérivé de la FC (PRD §6.3) : il vit dans `activity_health`, pas ici.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0002_activities.sql
-- Séances réalisées, importées de Strava. Aucune donnée de santé ici.

create table public.activities (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references auth.users(id) on delete cascade,

  strava_activity_id  bigint,
  source              text not null default 'strava',

  name                text,
  description         text,
  sport_type          text,

  started_at          timestamptz not null,
  distance_m          integer,
  elevation_gain_m    integer,
  moving_time_s       integer,
  elapsed_time_s      integer,
  avg_pace_s_per_km   numeric(6,2),
  avg_cadence         numeric(5,1),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint activities_strava_unique unique (tenant_id, strava_activity_id)
);

create index activities_tenant_id_idx  on public.activities (tenant_id);
create index activities_started_at_idx on public.activities (tenant_id, started_at desc);

alter table public.activities enable row level security;
alter table public.activities force row level security;

create policy "activities_select_own"
  on public.activities for select
  using (tenant_id = (select auth.uid()));

create policy "activities_insert_own"
  on public.activities for insert
  with check (tenant_id = (select auth.uid()));

create policy "activities_update_own"
  on public.activities for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "activities_delete_own"
  on public.activities for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_activities.sql
git commit -m "feat(db): table activities avec RLS"
```

---

### Task 4: Migration 0003 — `activity_health`

**Files:**
- Create: `supabase/migrations/0003_activity_health.sql`

**Interfaces:**
- Consumes: `public.activities` (Task 3).

**Note d'implémentation :** trois policies, pas quatre. Une mesure de santé ne se modifie pas : elle est créée à l'ingestion si le consentement est actif, ou supprimée à son retrait. C'est la seule exception au patron à quatre policies, et elle est explicitement prévue par `docs/rls-pattern.sql:103-104`.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0003_activity_health.sql
-- Table de santé isolée. Écrite UNIQUEMENT si le consentement fc_stockage
-- est actif. Le retrait du consentement supprime les lignes, il ne pose pas
-- un drapeau d'affichage. Jamais transmise au modèle en valeur brute :
-- dérivé seulement (tendance, drapeau booléen).

create table public.activity_health (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references auth.users(id) on delete cascade,
  activity_id      uuid not null unique references public.activities(id) on delete cascade,

  avg_hr           smallint,
  max_hr           smallint,
  hr_drift         numeric(5,2),
  relative_effort  smallint,

  created_at       timestamptz not null default now()
);

create index activity_health_tenant_id_idx on public.activity_health (tenant_id);

alter table public.activity_health enable row level security;
alter table public.activity_health force row level security;

create policy "activity_health_select_own"
  on public.activity_health for select
  using (tenant_id = (select auth.uid()));

create policy "activity_health_insert_own"
  on public.activity_health for insert
  with check (tenant_id = (select auth.uid()));

create policy "activity_health_delete_own"
  on public.activity_health for delete
  using (tenant_id = (select auth.uid()));

-- Pas de policy UPDATE : voir docs/rls-pattern.sql.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0003_activity_health.sql
git commit -m "feat(db): table activity_health isolée, trois policies"
```

---

### Task 5: Migration 0004 — `races` et `constraints`

**Files:**
- Create: `supabase/migrations/0004_races_constraints.sql`

**Interfaces:**
- Produces: `public.races` (référencée par `plan_weeks` et `debriefs`), `public.constraints`.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0004_races_constraints.sql
-- Objectifs et contraintes de vie. La priorité structure la périodisation ;
-- les contraintes sont le différenciateur produit.

create table public.races (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references auth.users(id) on delete cascade,

  name              text not null,
  race_date         date not null,
  location          text,
  distance_m        integer,
  elevation_gain_m  integer,
  priority          race_priority not null default 'C',
  status            race_status   not null default 'envisagee',

  goal_time_s       integer,
  result_time_s     integer,
  result_rank       integer,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index races_tenant_id_idx on public.races (tenant_id);
create index races_date_idx      on public.races (tenant_id, race_date);

alter table public.races enable row level security;
alter table public.races force row level security;

create policy "races_select_own"
  on public.races for select
  using (tenant_id = (select auth.uid()));

create policy "races_insert_own"
  on public.races for insert
  with check (tenant_id = (select auth.uid()));

create policy "races_update_own"
  on public.races for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "races_delete_own"
  on public.races for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.constraints (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references auth.users(id) on delete cascade,

  label            text not null,
  kind             constraint_kind     not null,
  category         constraint_category not null default 'autre',
  impact           constraint_impact   not null default 'bloque',

  -- Récurrente : règle RFC 5545 (ex. FREQ=WEEKLY;BYDAY=TU,TH pour le club).
  recurrence_rule  text,
  -- Ponctuelle : bornes de la période concernée.
  starts_on        date,
  ends_on          date,

  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint constraints_shape check (
    (kind = 'recurrente' and recurrence_rule is not null)
    or (kind = 'ponctuelle' and starts_on is not null)
  )
);

create index constraints_tenant_id_idx on public.constraints (tenant_id);
create index constraints_period_idx    on public.constraints (tenant_id, starts_on, ends_on);

alter table public.constraints enable row level security;
alter table public.constraints force row level security;

create policy "constraints_select_own"
  on public.constraints for select
  using (tenant_id = (select auth.uid()));

create policy "constraints_insert_own"
  on public.constraints for insert
  with check (tenant_id = (select auth.uid()));

create policy "constraints_update_own"
  on public.constraints for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "constraints_delete_own"
  on public.constraints for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_races_constraints.sql
git commit -m "feat(db): tables races et constraints avec RLS"
```

---

### Task 6: Migration 0005 — `session_templates`, `plan_weeks`, `planned_sessions`

**Files:**
- Create: `supabase/migrations/0005_plan.sql`

**Interfaces:**
- Consumes: `public.races` (Task 5), `public.activities` (Task 3).
- Produces: `public.plan_weeks` (référencée par `plan_revisions`), `public.planned_sessions`, `public.session_templates`.

**Note d'implémentation :** `planned_sessions.is_club` porte la règle « les séances club ne sont jamais doublées » : le coach adapte l'intention d'une séance marquée club, il n'en ajoute pas une concurrente le même jour.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0005_plan.sql
-- Banque de séances, semaines de plan (numérotation ISO), séances prévues.

create table public.session_templates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references auth.users(id) on delete cascade,

  name                  text not null,
  session_type          session_type not null,
  intent                text,
  structure             jsonb,
  default_duration_s    integer,
  default_distance_m    integer,
  default_elevation_m   integer,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index session_templates_tenant_id_idx on public.session_templates (tenant_id);

alter table public.session_templates enable row level security;
alter table public.session_templates force row level security;

create policy "session_templates_select_own"
  on public.session_templates for select
  using (tenant_id = (select auth.uid()));

create policy "session_templates_insert_own"
  on public.session_templates for insert
  with check (tenant_id = (select auth.uid()));

create policy "session_templates_update_own"
  on public.session_templates for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "session_templates_delete_own"
  on public.session_templates for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.plan_weeks (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  iso_year             smallint not null,
  iso_week             smallint not null check (iso_week between 1 and 53),
  phase                plan_phase not null default 'base',
  target_race_id       uuid references public.races(id) on delete set null,

  target_distance_m    integer,
  target_elevation_m   integer,
  target_sessions      smallint,
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint plan_weeks_unique unique (tenant_id, iso_year, iso_week)
);

create index plan_weeks_tenant_id_idx on public.plan_weeks (tenant_id);

alter table public.plan_weeks enable row level security;
alter table public.plan_weeks force row level security;

create policy "plan_weeks_select_own"
  on public.plan_weeks for select
  using (tenant_id = (select auth.uid()));

create policy "plan_weeks_insert_own"
  on public.plan_weeks for insert
  with check (tenant_id = (select auth.uid()));

create policy "plan_weeks_update_own"
  on public.plan_weeks for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "plan_weeks_delete_own"
  on public.plan_weeks for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.planned_sessions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  plan_week_id         uuid not null references public.plan_weeks(id) on delete cascade,
  template_id          uuid references public.session_templates(id) on delete set null,

  scheduled_on         date not null,
  session_type         session_type not null,
  intent               text,

  target_distance_m    integer,
  target_elevation_m   integer,
  target_duration_s    integer,

  status               session_status not null default 'prevue',
  matched_activity_id  uuid references public.activities(id) on delete set null,

  -- Séance imposée par le club : le coach en adapte l'intention,
  -- il n'ajoute jamais une séance concurrente le même jour.
  is_club              boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index planned_sessions_tenant_id_idx on public.planned_sessions (tenant_id);
create index planned_sessions_date_idx      on public.planned_sessions (tenant_id, scheduled_on);

alter table public.planned_sessions enable row level security;
alter table public.planned_sessions force row level security;

create policy "planned_sessions_select_own"
  on public.planned_sessions for select
  using (tenant_id = (select auth.uid()));

create policy "planned_sessions_insert_own"
  on public.planned_sessions for insert
  with check (tenant_id = (select auth.uid()));

create policy "planned_sessions_update_own"
  on public.planned_sessions for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "planned_sessions_delete_own"
  on public.planned_sessions for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0005_plan.sql
git commit -m "feat(plan): tables session_templates, plan_weeks, planned_sessions avec RLS"
```

---

### Task 7: Migration 0006 — `fueling_logs` et `debriefs`

**Files:**
- Create: `supabase/migrations/0006_fueling_debriefs.sql`

**Interfaces:**
- Consumes: `public.activities` (Task 3), `public.races` (Task 5).

**Note d'implémentation :** la seule métrique quantitative du module est le gramme de glucides. `products` stocke des produits et des grammes, rien d'autre. La colonne `issue` distingue « oubli » de « nausée » : deux causes qui appellent deux réponses différentes (PRD §5.2.2). Aucune colonne d'état 🟢🟡🔴 n'est stockée : l'état est **dérivé** au moment de l'affichage, jamais figé en base — et jamais sous forme de score chiffré.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0006_fueling_debriefs.sql
-- Module Fueling : produits et grammes de glucides, rien d'autre.
-- Voir PRD §5.2 et CLAUDE.md § Règles santé.

create table public.fueling_logs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references auth.users(id) on delete cascade,

  activity_id        uuid references public.activities(id) on delete cascade,
  race_id            uuid references public.races(id) on delete cascade,

  intake_pattern     fueling_intake not null,
  carbs_g            integer check (carbs_g >= 0),
  carbs_g_per_hour   numeric(5,1) check (carbs_g_per_hour >= 0),

  -- [{ "label": "gel citron", "carbs_g": 25, "qty": 3 }, …]
  products           jsonb,

  issue              fueling_issue not null default 'aucun',
  post_window_fed    boolean,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index fueling_logs_tenant_id_idx on public.fueling_logs (tenant_id);

alter table public.fueling_logs enable row level security;
alter table public.fueling_logs force row level security;

create policy "fueling_logs_select_own"
  on public.fueling_logs for select
  using (tenant_id = (select auth.uid()));

create policy "fueling_logs_insert_own"
  on public.fueling_logs for insert
  with check (tenant_id = (select auth.uid()));

create policy "fueling_logs_update_own"
  on public.fueling_logs for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "fueling_logs_delete_own"
  on public.fueling_logs for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.debriefs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references auth.users(id) on delete cascade,

  kind           debrief_kind not null default 'course',
  race_id        uuid references public.races(id) on delete cascade,
  period_start   date,
  period_end     date,

  narrative      text,
  what_worked    text,
  what_failed    text,
  -- Axes de travail du bloc suivant : ["descente technique", "fueling >60 g/h"]
  focus_areas    jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index debriefs_tenant_id_idx on public.debriefs (tenant_id);

alter table public.debriefs enable row level security;
alter table public.debriefs force row level security;

create policy "debriefs_select_own"
  on public.debriefs for select
  using (tenant_id = (select auth.uid()));

create policy "debriefs_insert_own"
  on public.debriefs for insert
  with check (tenant_id = (select auth.uid()));

create policy "debriefs_update_own"
  on public.debriefs for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "debriefs_delete_own"
  on public.debriefs for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 2: Vérifier l'absence de mot interdit**

```bash
npm run test:isolation -- -t "aucun champ de poids"
```

Attendu : PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_fueling_debriefs.sql
git commit -m "feat(fueling): tables fueling_logs et debriefs avec RLS"
```

---

### Task 8: Migration 0007 — `coach_threads`, `consent_records`, `plan_revisions`

**Files:**
- Create: `supabase/migrations/0007_coach_consent_revisions.sql`

**Interfaces:**
- Consumes: `public.plan_weeks` (Task 6).

**Note d'implémentation :** `coach_threads.messages` est un `jsonb` et non une table `coach_messages` séparée, parce que `TENANT_TABLES` ne prévoit pas de quatorzième table et que la liste fait foi. Les compteurs `tokens_in`/`tokens_out` répondent au chantier « coût IA par utilisateur » de `CLAUDE.md`.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/0007_coach_consent_revisions.sql
-- Conversation coach, journal de consentement, historique du plan.

create table public.coach_threads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references auth.users(id) on delete cascade,

  title            text,
  -- [{ "role": "user"|"assistant", "content": "...", "at": "..." }, …]
  messages         jsonb not null default '[]'::jsonb,
  last_message_at  timestamptz,

  -- Instrumentation du coût IA, dès le premier appel.
  tokens_in        integer not null default 0,
  tokens_out       integer not null default 0,

  archived         boolean not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index coach_threads_tenant_id_idx on public.coach_threads (tenant_id);

alter table public.coach_threads enable row level security;
alter table public.coach_threads force row level security;

create policy "coach_threads_select_own"
  on public.coach_threads for select
  using (tenant_id = (select auth.uid()));

create policy "coach_threads_insert_own"
  on public.coach_threads for insert
  with check (tenant_id = (select auth.uid()));

create policy "coach_threads_update_own"
  on public.coach_threads for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "coach_threads_delete_own"
  on public.coach_threads for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------
-- Journal de consentement. En cas de contrôle, la charge de la preuve
-- pèse sur le responsable de traitement : on conserve la version EXACTE
-- du texte affiché au moment de l'octroi ou du retrait.

create table public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references auth.users(id) on delete cascade,

  scope           consent_scope not null,
  granted         boolean not null,
  policy_version  text not null,
  policy_text     text not null,
  occurred_at     timestamptz not null default now(),

  created_at      timestamptz not null default now()
);

create index consent_records_tenant_id_idx on public.consent_records (tenant_id);
create index consent_records_scope_idx     on public.consent_records (tenant_id, scope, occurred_at desc);

alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;

create policy "consent_records_select_own"
  on public.consent_records for select
  using (tenant_id = (select auth.uid()));

create policy "consent_records_insert_own"
  on public.consent_records for insert
  with check (tenant_id = (select auth.uid()));

create policy "consent_records_update_own"
  on public.consent_records for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "consent_records_delete_own"
  on public.consent_records for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------
-- Toute écriture de l'IA sur le plan passe ici : déclencheur, diff,
-- auteur, annulable.

create table public.plan_revisions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  plan_week_id         uuid references public.plan_weeks(id) on delete cascade,
  trigger              revision_trigger not null,
  author               revision_author  not null,

  diff                 jsonb not null,
  summary              text,

  reverted_at          timestamptz,
  reverts_revision_id  uuid references public.plan_revisions(id) on delete set null,

  created_at           timestamptz not null default now()
);

create index plan_revisions_tenant_id_idx on public.plan_revisions (tenant_id);
create index plan_revisions_week_idx      on public.plan_revisions (tenant_id, plan_week_id, created_at desc);

alter table public.plan_revisions enable row level security;
alter table public.plan_revisions force row level security;

create policy "plan_revisions_select_own"
  on public.plan_revisions for select
  using (tenant_id = (select auth.uid()));

create policy "plan_revisions_insert_own"
  on public.plan_revisions for insert
  with check (tenant_id = (select auth.uid()));

create policy "plan_revisions_update_own"
  on public.plan_revisions for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "plan_revisions_delete_own"
  on public.plan_revisions for delete
  using (tenant_id = (select auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0007_coach_consent_revisions.sql
git commit -m "feat(db): tables coach_threads, consent_records, plan_revisions avec RLS"
```

---

### Task 9: Application des migrations et validation complète

**Files:**
- Modify: aucun fichier source. Cette tâche applique le schéma et vérifie l'ensemble.

**Interfaces:**
- Consumes: les sept migrations (Tasks 2–8), la couche Supabase (Task 1).

- [ ] **Step 1: Vérifier que les treize tables du test sont couvertes**

```bash
grep -oE 'create table public\.\w+' supabase/migrations/*.sql | sed 's/.*public\.//' | sort
```

Attendu, exactement treize lignes : `activities`, `activity_health`, `athletes`, `coach_threads`, `consent_records`, `constraints`, `debriefs`, `fueling_logs`, `plan_revisions`, `plan_weeks`, `planned_sessions`, `races`, `session_templates`.

- [ ] **Step 2: Appliquer les migrations sur l'instance Supabase**

Méthode à confirmer avant exécution (voir « Points d'interprétation », §3 du récapitulatif). En local :

```bash
npx supabase start
```

```bash
npx supabase db reset
```

- [ ] **Step 3: Lancer le test d'isolation complet**

```bash
npm run test:isolation
```

Attendu : PASS sur les quatre `describe`. En cas d'échec sur `Isolation — lecture`, vérifier que `force row level security` est bien présent sur la table fautive.

- [ ] **Step 4: Vérifier le build**

```bash
npm run build
```

Attendu : succès, aucune erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): socle multi-tenant complet, test:isolation au vert"
```

---

## Points ouverts à trancher avant exécution

Voir le récapitulatif remis en conversation. Aucun code n'est écrit tant que ces points ne sont pas validés.
