# 09 — Plan de bascule : exécution (Strava-API → ingestion fichier)

> Statut : **proposition d'exécution**, à valider par Eva avant tout démarrage.
> Date : 16/09/2026.
> Dépend de : `ADR-001-ingestion-fichiers.md` (décision déjà actée), `02-securite-ingestion.md`,
> `03-modele-donnees.md`, `07-spike-resultats.md`, `QUESTIONS-OUVERTES.md`.
>
> **Ce document ne change aucune décision produit ou juridique déjà tranchée.** Il traduit
> l'ADR ingestion en séquence d'exécution concrète : quelles migrations, quels fichiers, dans
> quel ordre. Les migrations SQL proposées ci-dessous sont des **propositions à formaliser** —
> `supabase/migrations/*` est un fichier intouchable (CLAUDE.md) : rien n'est appliqué sans
> instruction explicite et passage par le MCP Supabase (le CLI n'a pas les droits sur ce
> projet, cf. mémoire `supabase-acces-cairn`).

## Mise à jour 16/09/2026 — périmètre resserré + exécution démarrée

**Décision produit (Eva)** : pas d'API constructeur du tout, y compris Garmin (qui n'était de
toute façon que « confort secondaire » dans l'ADR, jamais un socle). Les deux seules sources
retenues sont : **import d'archive Strava** (bulk export, historique) et **saisie manuelle**
(construction au fil de l'eau). Le CSV template, l'upload de fichier isolé hors archive
(FIT/GPX/TCX seul) et l'auto-import constructeur ne sont **pas** construits à ce stade — ils
restent des options futures documentées ailleurs (doc `08`), pas un chantier en cours.

**Décision technique (dev, conformément à la délégation `QUESTIONS-OUVERTES.md` A5)** :
`@garmin/fitsdk` est écarté. Licence lue en clair (`LICENSE.txt` du dépôt officiel) :
propriétaire Garmin, usage limité aux « besoins commerciaux internes », interdiction de
« rendre disponible à des tiers ». Ambigu pour un SaaS qui traite des fichiers utilisateurs en
tant que service — exactement le blocage anticipé par A5. Remplacé par **`fit-file-parser`**
(MIT, github.com/jimmykane/fit-parser, v5.0.2), l'alternative déjà pré-identifiée par l'ADR
ingestion. Ceci lève le blocage A5 sans attendre un avis juridique externe.

**Ce qui a été fait** (voir aussi la checklist §6) :
- `package.json` : retrait de `@garmin/fitsdk`, ajout de `fit-file-parser`, `csv-parse`,
  `yauzl` (déplacé en dépendance de prod), `yazl` (dev, fixtures de test uniquement).
- `lib/ingestion/{types,whitelist,magic-bytes,zip-reader,dedup,csv-column-map}.ts` +
  `lib/ingestion/parsers/{activities-csv,gpx-tcx,fit}.ts` — pipeline de parsing complet pour
  une archive Strava (whitelist stricte, zip streaming sans écriture disque, XXE neutralisé,
  dédup content_hash/dedup_signature, mapping positionnel des 105 colonnes CSV).
- `tests/ingestion/*.test.ts` — 39 tests, `npx tsc --noEmit` et `npm run build` propres.

**Mise à jour 16/09/2026 (suite)** : projet Supabase restauré et migrations M1
(`activities_ingestion_provenance`) + M2 (`imports_and_import_events`) appliquées via le MCP,
sur confirmation explicite. État constaté après application :
- `activities` compte 1906 lignes réelles (dogfood), toutes backfillées en
  `provenance = 'strava_archive'`.
- Contrainte `provenance in ('strava_archive', 'manual')`, index unique partiel sur
  `(tenant_id, content_hash)`, colonnes `has_gps/has_heart_rate/has_cadence/has_laps` posées.
- Tables `imports` et `import_events` créées, RLS activée + forcée, policies conformes au
  pattern du projet (append-only à 2 policies pour `import_events`).
- `get_advisors(security)` : 4 warnings, tous pré-existants (aucun introduit par ces
  migrations) — fonction `seed_user_notes_from_description` sans `search_path` fixe,
  `create_trial_subscription` en `SECURITY DEFINER` exécutable par `anon`/`authenticated`,
  protection mots de passe compromis désactivée. Aucun n'est lié à l'ingestion ; à traiter
  séparément si besoin.
- `npm run build` et la suite de tests complète repassent au vert (48 tests, hors
  `tests/isolation.test.ts` qui échoue faute de `SUPABASE_URL`/clé de service dans
  `.env.local` de ce worktree — pré-existant, sans rapport avec ce chantier).

**Mise à jour 16/09/2026 (suite 2) — pipeline complet + route d'upload** :

- `lib/ingestion/{gunzip,csv-date,normalize,process-archive,apply-import}.ts` complètent le
  pipeline : décompression `.fit.gz` défensive (`maxOutputLength`), parsing date FR de secours
  pour les rares lignes CSV sans fichier associé, assemblage CSV+fichier avec priorité au
  fichier pour la physio/GPS (CSV = contexte seulement), orchestrateur pur
  (`processStravaArchive`) sans effet de bord DB, et couche d'écriture (`applyImport`) qui est
  désormais le **seul** point de contact avec `activities`/`activity_health`/`imports`/
  `import_events`. 56 tests passent (dont un test d'intégration bout-en-bout sur une archive
  ZIP synthétique construite avec `yazl`).
- **Bucket Storage `import-quarantine`** créé (privé, RLS par dossier `tenant_id/`, purge
  immédiate après traitement — option A du doc `03` §7, pas de conservation 90j pour
  l'instant).
- **Route `app/import/*`** : upload direct navigateur → Storage via URL signée
  (`createSignedUploadUrl` + `uploadToSignedUrl`, jamais par la Server Action elle-même — une
  archive de plusieurs Go ne doit pas transiter par une fonction serverless), puis traitement
  serveur (`processImport`) qui télécharge, fait tourner le pipeline, écrit en base, purge le
  fichier source, et redirige vers `/import/[id]` (rapport créées/remplacées/ignorées/
  rejetées).
- `imports` et `import_events` ajoutées à `tests/isolation.test.ts` (`TENANT_TABLES`),
  conformément à la consigne du fichier lui-même. Non exécuté dans cet environnement
  (`.env.local` de ce worktree n'a pas les credentials Supabase — préexistant, sans rapport
  avec ce chantier) : **à faire tourner avant toute mise en prod**, c'est un prérequis
  bloquant de l'ADR ingestion.
- Entrée « Importer » ajoutée à la nav (`components/app-nav.tsx`), sans retirer « Strava ».

**Limite connue, assumée et non résolue** : le flux d'upload utilise un PUT signé simple, pas
l'upload résumable (TUS) recommandé par Supabase au-delà de quelques Mo. Pour un fichier de la
taille réelle de l'archive d'Eva (2,44 Gio), c'est le point le plus susceptible d'échouer en
pratique (timeout, coupure réseau sans reprise). À traiter avant le test grandeur réelle de
l'étape 2 ci-dessous — voir tâche de suivi proposée séparément.

## Mise à jour 16/09/2026 (suite 3) — upload résumable TUS

**Ce qui a été fait** : `app/import/upload-form.tsx` utilise maintenant `tus-js-client` au lieu
d'un PUT signé simple (`uploadToSignedUrl`), avec barre de progression, chunks de 6 Mo (imposé
par Supabase), et reprise en cas d'échec — `retryDelays` pour les coupures brèves pendant qu'un
`tus.Upload` est en vie, plus un bouton « Reprendre l'envoi » qui rappelle `.start()` sur la
même instance (donc sur la même ressource TUS côté serveur, valide 24h) après épuisement des
retries automatiques. `app/import/actions.ts` (`createImportUpload`) est inchangé dans sa forme
: le token retourné par `createSignedUploadUrl` reste le bon token pour le flux résumable, pas
besoin d'un token différent.

**Découverte empirique, non documentée clairement par Supabase** : l'endpoint résumable exige
**deux** en-têtes d'autorisation simultanés, pas un seul —
- `x-signature` : le token de `createSignedUploadUrl`, scope l'écriture à ce chemin précis.
- `authorization: Bearer <access_token de session>` : sans lui, l'API renvoie `403 Invalid
  Compact JWS` avant même d'évaluer la RLS. Avec la clé anon seule à la place du vrai
  access_token, on passe cette étape mais la RLS rejette (`new row violates row-level security
  policy`) — il faut le vrai access_token de l'utilisateur connecté.

Conséquence côté client : `upload-form.tsx` lit `supabase.auth.getSession()` juste avant de
démarrer (et avant chaque reprise) pour fournir un `access_token` frais — celui-ci expire en 1h,
largement avant la fin d'un upload de plusieurs Go sur une connexion lente.

**🔴 Blocage découvert en testant, pas encore levé** : le projet Supabase a une limite globale
d'upload de **50 Mio**, distincte de `file_size_limit` du bucket (déjà à 3 Gio). Elle vit dans
Project Settings → Storage (pas interrogeable ni modifiable via l'API REST/JS, seulement le
dashboard ou l'API de management avec un token personnel). Confirmé empiriquement par recherche
dichotomique sur `Upload-Length` : 52428800 (50 Mio) passe, 53477376 échoue avec
`413 Maximum size exceeded`. **Ceci bloque tout upload de plus de 50 Mio, TUS ou PUT, tant
qu'Eva ne relève pas cette limite dans le dashboard Supabase** (Project Settings → Storage →
limite globale de taille de fichier, à aligner sur les 3 Gio du bucket / `MAX_ARCHIVE_BYTES`).

**Tests effectués** (worktree de dev, projet Supabase réel, `.env.local` copié du checkout
principal avec confirmation explicite) :
- Bout en bout via l'UI réelle (connexion par lien magique généré via l'API admin, fichier de
  30 Mio synthétique) : upload TUS réussi, `processImport` déclenché, redirection vers
  `/import/[id]`, échec propre et attendu (« End of central directory record signature not
  found ») puisque ce n'était pas une vraie archive Strava. Confirme le flux complet
  upload → traitement → rapport.
- Coupure réseau simulée en script (`tus-js-client` côté Node, fichier de 45 Mio réel) :
  upload interrompu volontairement après 2 chunks (12,58 Mo envoyés sur 47,19 Mo), puis une
  **nouvelle** instance `tus.Upload` reprise via `resumeFromPreviousUpload` sur la même URL —
  elle repart exactement à l'octet 12582912 (pas de ré-envoi depuis 0) et termine avec succès,
  objet final de la taille attendue dans le bucket. Confirme que la reprise fonctionne belle et
  bien au niveau protocole, pas seulement en théorie.
- Test à 700 Mio (taille demandée, proche de l'usage réel) bloqué par la limite de 50 Mio
  ci-dessus — pas encore vérifié à l'échelle « plusieurs centaines de Mo » demandée. À refaire
  dès que la limite globale est relevée.
- Toutes les ressources de test (lignes `imports`, objets de test dans `import-quarantine`) ont
  été nettoyées après coup.

**Prochaine étape** : Eva relève la limite globale d'upload dans le dashboard Supabase, puis
retest à 700 Mio+ pour valider le chunking réel à cette échelle (le test à 45 Mio valide le
mécanisme de reprise, pas le débit/la stabilité sur une vraie durée de plusieurs minutes).

**Prochaine étape** : le formulaire de saisie manuelle (n'existe pas du tout dans le code
actuel — à construire de zéro), puis le test grandeur réelle : ré-importer l'archive Strava
réelle d'Eva par ce pipeline et diffuser contre les données actuelles (§5, étape 2) avant tout
retrait du connecteur Strava.

---

## 0. Constat de départ — audit code du 16/09/2026

Le code de dogfood tourne **entièrement** sur l'ancienne architecture Strava-API pendant que
les deux ADR (`socle` puis `ingestion`) ont acté sa sortie. Aucune bascule n'a commencé :

| Surface | Fichiers | État |
|---|---|---|
| OAuth + webhook | `app/api/strava/{authorize,callback,webhook}/route.ts` | actifs |
| Client API + tokens | `lib/strava/{oauth,api,tokens,crypto,connections,ingest}.ts` | actifs |
| UI connexion | `app/settings/strava/{page.tsx,actions.ts}` | actif, dans `app-nav.tsx` |
| Schéma | `supabase/migrations/20260722102004_strava_connections.sql` | table vivante, RLS 4 policies |
| Contexte coach | `lib/ai/context.ts` | envoie 12 semaines agrégées + 10 séances détaillées au LLM, alimentées par Strava |
| Tests | `tests/strava-crypto.test.ts`, `tests/strava-ingest.test.ts` | actifs |
| Dépendances nouvelles déjà là | `@garmin/fitsdk`, `fast-xml-parser` dans `package.json` | installées, **jamais appelées** en dehors du script de spike |
| Dépendances manquantes | `extract-zip`, `csv-parse` | absentes de `package.json` |

Autres surfaces qui *mentionnent* Strava mais sans couplage API réel (juste du vocabulaire/
commentaire — bonne nouvelle, peu de reprise nécessaire) : `lib/ai/tools.ts`,
`lib/race-matching.ts`, `lib/analytics/classify-session.ts`. Surfaces UI à retoucher au moment
du cutover (section 4/5) : `app/activities/{page,[id]/page,actions}.tsx`, `app/aujourdhui/page.tsx`,
`app/planning/page.tsx`, `app/api/export/route.ts`, `app/settings/donnees-sante/*`,
`app/settings/donnees/page.tsx`, `components/app-nav.tsx`.

---

## 1. Réconciliation schéma proposé (doc `03`) vs schéma réel

Le doc `03` a été écrit **sans lire le schéma existant** : il propose des tables `tenants`/
`users` génériques et des noms de colonnes (`hr_avg`, `hr_zones_time`, `effort_index`,
`aerobic_flag`) qui ne correspondent pas à l'existant (`activity_health.avg_hr/max_hr/
hr_drift/relative_effort`, `tenant_id` référence directement `auth.users(id)`, pattern RLS à
3 ou 4 policies selon mutabilité — voir commentaires dans les migrations `activity_health` et
`consent_records`).

**Principe de ce plan : altérer l'existant, ne pas le remplacer.** Les tables `activities` et
`activity_health` restent, on leur ajoute les colonnes de provenance/traçabilité. On ne
renomme rien qui fonctionne déjà (`avg_hr` reste `avg_hr`).

---

## 2. Migrations proposées (additives d'abord, destructives en dernier)

### M1 — `activities` : colonnes de provenance et de traçabilité

```sql
alter table public.activities
  add column provenance         text,
  add column provenance_notes   text,
  add column content_hash       text,
  add column dedup_signature    text,
  add column has_gps            boolean not null default false,
  add column has_heart_rate     boolean not null default false,
  add column has_cadence        boolean not null default false,
  add column has_laps           boolean not null default false,
  add column import_id          uuid,
  add column deleted_at         timestamptz;

-- Backfill : toutes les activités actuelles viennent de l'API Strava.
update public.activities set provenance = 'strava_archive' where provenance is null;

alter table public.activities
  alter column provenance set not null,
  add constraint activities_provenance_check check (provenance in (
    'strava_archive', 'strava_single_file', 'fit_upload', 'gpx_upload',
    'tcx_upload', 'csv_import', 'manual'
  ));

-- Unicité par hash, mais seulement quand il existe (les lignes backfillées n'en ont pas).
create unique index activities_tenant_content_hash_uidx
  on public.activities (tenant_id, content_hash) where content_hash is not null;
```

Note : `garmin_api`/`coros_api` **ne sont pas** dans la contrainte — ce sont des chemins
« confort secondaire » non implémentés à date (doc `08` §5). Les ajouter à la contrainte le
jour où ils sont réellement codés, pas avant (règle CLAUDE.md : pas de code pour un besoin
hypothétique).

### M2 — `imports` et `import_events` (nouvelles tables)

```sql
create table public.imports (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  source_kind          text not null check (source_kind in ('zip', 'single_file', 'csv', 'manual')),
  filename_original    text,
  size_bytes           bigint,
  content_hash         text,

  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  outcome              text check (outcome in ('success', 'partial', 'failed', 'in_progress')),
  error_summary        text,

  activities_created   integer not null default 0,
  activities_replaced  integer not null default 0,
  activities_ignored   integer not null default 0,
  activities_rejected  integer not null default 0
);

create index imports_tenant_id_idx on public.imports (tenant_id);

alter table public.imports enable row level security;
alter table public.imports force row level security;

create policy "imports_select_own" on public.imports for select using (tenant_id = (select auth.uid()));
create policy "imports_insert_own" on public.imports for insert with check (tenant_id = (select auth.uid()));
create policy "imports_update_own" on public.imports for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));
-- Pas de delete : un import est un fait historique (comme plan_revisions), pas un objet
-- qu'on efface — sauf cascade suppression de compte.

create table public.import_events (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null references public.imports(id) on delete cascade,
  tenant_id     uuid not null references auth.users(id) on delete cascade, -- dénormalisé pour RLS directe
  file_path     text,
  event         text not null check (event in (
    'created', 'replaced', 'ignored_duplicate', 'rejected_format',
    'rejected_signature', 'ignored_not_whitelisted'
  )),
  activity_id   uuid references public.activities(id) on delete set null,
  message       text,
  created_at    timestamptz not null default now()
);

create index import_events_import_id_idx on public.import_events (import_id);

alter table public.import_events enable row level security;
alter table public.import_events force row level security;

create policy "import_events_select_own" on public.import_events for select using (tenant_id = (select auth.uid()));
create policy "import_events_insert_own" on public.import_events for insert with check (tenant_id = (select auth.uid()));
-- Append-only, comme health_access_logs : deux policies, pas quatre, volontairement.
```

### M3 — `activity_health` : rattachement au consentement (optionnel, itération 2)

```sql
alter table public.activity_health
  add column consent_snapshot_id uuid references public.consent_records(id);
```

Pas bloquant pour le MVP fichier — `health_access_logs` couvre déjà l'audit d'accès. À
trancher avec Eva si le lien consentement-au-moment-de-l'ingestion est jugé nécessaire
maintenant ou reporté.

### M4 — retrait de `strava_connections` (DERNIÈRE étape, action destructrice)

```sql
drop table if exists public.strava_connections;
```

**Ne s'exécute qu'après** validation du cutover (section 5) **et** confirmation explicite
d'Eva — c'est une suppression de données, couverte par la règle CLAUDE.md « ne jamais
supprimer de code/données existants sans confirmation explicite ».

---

## 3. Route et pipeline d'upload

Nouvelle arborescence proposée (aucun fichier créé par ce plan lui-même — à écrire lors de
l'exécution) :

- **`app/import/page.tsx`** — écran de dépôt (drag & drop), remplace `/settings/strava` comme
  point d'entrée principal.
- **`app/import/actions.ts`** — server action `uploadImportFile(formData)` :
  1. Session serveur → `tenant_id` **jamais** passé par le client (règle CLAUDE.md IA, valable
     aussi pour cette route non-IA par cohérence).
  2. Contrôles au dépôt : extension whitelist, taille max, rate limit (doc `02` §1.1).
  3. Écriture dans un bucket Supabase Storage « quarantaine », scopé tenant, TTL 24h.
  4. Création d'une ligne `imports` (`outcome = 'in_progress'`).
  5. Déclenche le parsing — synchrone pour un fichier isolé (< 50 Mo), asynchrone pour une
     archive ZIP volumineuse.
- **`lib/ingestion/`** (nouveau dossier) :
  - `whitelist.ts` — chemins autorisés dans l'archive (doc `02` §2.1.3, uniquement
    `activities.csv` + `activities/*.{fit,fit.gz,gpx,tcx}`).
  - `magic-bytes.ts` — détection du format réel, jamais l'extension seule.
  - `parsers/fit.ts`, `parsers/gpx-tcx.ts`, `parsers/csv.ts`, `parsers/zip.ts` — un fichier par
    format, autour de `@garmin/fitsdk` / `fast-xml-parser` (config `processEntities: false`) /
    `csv-parse` / `extract-zip`.
  - `dedup.ts` — matrice de déduplication doc `03` §4.2 (content_hash + dedup_signature).
  - `normalize.ts` — mappe chaque format vers `activities`/`activity_health`, pose
    `provenance` et les `has_*`.
- **Isolation d'exécution** (doc `02` §3) : pour le dogfood (Eva seule), un Route Handler
  Next.js avec timeout dur peut suffire. Le passage à un vrai worker isolé sans réseau sortant
  (Vercel Sandbox / Fly Machine) est **reporté à l'ouverture publique** — dette technique à
  documenter explicitement dans ce plan, pas à cacher.
- **`app/import/[id]/page.tsx`** — rapport d'import (créées / remplacées / ignorées /
  rejetées, doc `03` §4.3), avec bouton « annuler » dans la fenêtre de 24h.

Ce chantier touche à la sécurité de l'ingestion — à envisager avec Eva si `lib/ingestion/`
doit rejoindre la liste des fichiers intouchables de `CLAUDE.md` une fois écrit.

---

## 4. UI / parcours utilisateur

- `components/app-nav.tsx` : remplacer l'entrée « Strava » par « Importer ».
- Formulaire de saisie manuelle : traiter comme « citoyen de première classe » (doc `01`), pas
  comme roue de secours — vérifier l'existant dans `app/activities/actions.ts` avant de créer
  un nouveau flux.
- `app/settings/donnees-sante` : le déclencheur de consentement FC n'est plus « connexion
  Strava » mais « premier import contenant de la FC » — la page reste, son point d'entrée
  change.

---

## 5. Retrait du connecteur Strava — séquence (dernier, pas premier)

1. Construire et valider le pipeline fichier (sections 2 à 4) **en parallèle** du connecteur
   Strava existant — les deux coexistent, `provenance` les distingue.
2. Ré-importer l'archive Strava d'Eva (déjà spikée, `data/sample/export_47073325.zip`) via le
   **vrai** pipeline (pas `scripts/spike-strava-archive.mjs`, qui reste un script ponctuel).
3. **Diff** entre les activités existantes (import API) et le nouveau jeu (import fichier) sur
   distance, D+, durée, laps. Documenter tout écart avant de couper l'API — c'est le test
   d'intégration le plus proche du réel qu'on puisse faire sans second utilisateur.
4. Si le diff est acceptable : couper le refresh/cron Strava, retirer l'entrée nav, retirer
   `app/settings/strava/{page.tsx,actions.ts}`.
5. Retirer `app/api/strava/{authorize,callback,webhook}/route.ts`.
6. Retirer `lib/strava/*` — **sauf** si le pattern « flux inversé » (ADR socle, doc `04`
   option A : Cairn pousse vers la montre, jamais ne lit Strava) doit être conservé. Ce
   pattern n'a jamais été implémenté à date — à confirmer avec Eva avant suppression totale,
   pour ne pas fermer une porte pas encore ouverte sans décision explicite.
7. Retirer `tests/strava-crypto.test.ts` et `tests/strava-ingest.test.ts`, les remplacer par
   les tests d'ingestion fichier (section 6).
8. Appliquer M4 (`drop table strava_connections`) — uniquement sur confirmation explicite.
9. Mettre à jour les docs compliance : `AIPD_Cairn.md` (retirer Strava des sous-traitants
   §1.4, passer en v0.3), `ai-act-50-couverture.md`, clore le décision-log de
   `strava-compliance.md`.

---

## 6. Tests à écrire avant toute mise en production

- `tests/isolation/ingestion.spec.ts` — cité comme prérequis bloquant par l'ADR ingestion
  (§ Prérequis avant application, point 6). À écrire **avant**, pas après.
- Tests unitaires sur la checklist sécurité doc `02` §5 (20 contrôles) — prioriser les
  contrôles 6, 7, 8, 10, 13, 15 (zip bomb, path traversal, whitelist stricte, XXE, FIT CRC,
  CSV malformé) : ce sont des risques sécurité/conformité, pas seulement produit.
- Test de la matrice de déduplication doc `03` §4.2 (cas A à F).
- `npm run build` et `npm run test:isolation` avant de considérer la bascule terminée
  (checklist CLAUDE.md).

---

## 7. Prérequis bloquants — non levés à ce jour

Ce plan peut être écrit et revu maintenant. Son **exécution** attend :

- **A5** (`QUESTIONS-OUVERTES.md`) — licence exacte de `@garmin/fitsdk` non lue en clair.
  Bloquant avant tout appel réel du parser en production.
- `extract-zip` et `csv-parse` — à ajouter à `package.json`, non encore fait.
- Relecture juridique de l'ADR ingestion (§ Prérequis avant application, point 7) — non
  confirmée.
- AIPD v0.2 → v0.3 nécessaire dès l'application de M1/M2 (nouvelles tables et colonnes).
- Statut d'envoi du mail à `developers@strava.com` — à vérifier avant de considérer la
  posture juridique Strava comme documentée de bonne foi.
- **A11** — conservation du fichier source (purge 24h vs 90j opt-in payant) non tranchée,
  impacte directement le provisioning du bucket de quarantaine (section 3).

---

## 8. Ordre d'exécution recommandé

1. Lever A5 (lecture licence `@garmin/fitsdk`) — bloquant, ~30 min.
2. Ajouter `extract-zip` + `csv-parse` à `package.json`.
3. Écrire et appliquer M1 + M2 (additives, non destructives) via le MCP Supabase.
4. Écrire `lib/ingestion/*` puis `app/import/*`.
5. Écrire les tests sécurité ingestion + `tests/isolation/ingestion.spec.ts`.
6. Ré-importer l'archive réelle d'Eva par le nouveau pipeline, diff vs données API actuelles.
7. Basculer la navigation et l'UI (`app-nav.tsx`, `/import` remplace `/settings/strava`).
8. Retirer les routes API Strava, `lib/strava/*` (sous réserve point 6 de la section 5), les
   tests Strava.
9. Appliquer M4 (`drop table strava_connections`) — confirmation explicite requise.
10. Mettre à jour AIPD, couverture AI Act, décision-log `strava-compliance.md`.

Chaque étape 3 à 9 doit se terminer par la checklist de fin de tâche `CLAUDE.md` (fichiers
hors périmètre, `tenant_id` + RLS dans la même migration, pas de filtrage applicatif introduit,
`npm run build`, `npm run test:isolation`).
