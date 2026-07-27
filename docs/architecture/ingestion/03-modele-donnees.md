# 03 — Modèle de données canonique

> **Principe** : le moteur de plan et la couche LLM ne doivent jamais avoir à deviner d'où vient une donnée ni ce qui manque. La provenance et la complétude sont **des champs de première classe**, aussi importants que les valeurs métier.

## 0. Rappel des règles CLAUDE.md qui contraignent ce schéma

- Toute table porte `tenant_id` **et** une policy RLS dans la même migration. Une table sans policy est un bug bloquant.
- Aucune colonne poids, IMC, masse grasse ou calorie n'est admise.
- Les données de santé (FC principalement) vont dans une table séparée `activity_health` avec RLS stricte et logs d'accès dédiés.
- Aucun paramètre `tenant_id` ne transite via les outils IA — c'est la session serveur qui l'injecte.
- Cette architecture doit rester cohérente avec le doc `06` (RGPD / AI Act).

Les DDL ci-dessous sont **des propositions** à formaliser en migrations. Le fichier de migration réel est à écrire dans `supabase/migrations/` (fichier intouchable, hors de portée de ce doc — voir `CLAUDE.md`).

---

## 1. Vue d'ensemble

```
tenants  ────────────────────────────────────────────────
   │
   ├── users (auth Supabase)
   │
   ├── activities  ← table cœur, une ligne = une séance
   │     │
   │     ├── activity_health   ← 1↔0..1, FC et dérivés, RLS +stricte
   │     ├── activity_geo      ← 1↔0..1, trace GPS résumée (pas les points bruts)
   │     └── activity_source_file ← 1↔1, traçabilité fichier source
   │
   ├── imports  ← une ligne = une opération d'upload
   │     └── import_events   ← journal détaillé (accepté / rejeté / doublon)
   │
   ├── plan_revisions (existant, référencé)
   └── consents  ← granularité par catégorie de donnée
```

---

## 2. Table `activities` — schéma proposé

```sql
create table activities (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,

  -- Identité de la séance
  started_at           timestamptz not null,
  timezone_local       text,           -- IANA, best-effort
  activity_type        text not null,  -- enum: run, trail, bike, hike, strength, other
  activity_subtype     text,           -- libre : "sortie longue", "fartlek"...
  title                text,           -- nom lisible, saisi ou déduit
  notes_user           text,           -- non transmis au LLM par défaut

  -- Charges principales (toujours en unités SI, jamais imperial)
  duration_seconds     integer not null,     -- durée mouvement, ou totale si non séparé
  duration_elapsed_s   integer,              -- durée écoulée y compris pauses
  distance_meters      integer,
  elevation_gain_m     integer,
  elevation_loss_m     integer,

  -- Ressenti (utilisable en dégradé — voir doc 04, palier 1)
  rpe                  smallint check (rpe between 1 and 10),
  perceived_notes      text,

  -- Provenance — enum strict
  provenance           text not null check (provenance in (
    'strava_archive',        -- extrait d'un ZIP bulk export
    'strava_single_file',    -- .fit / .gpx / .tcx isolé exporté depuis Strava
    'fit_upload',
    'gpx_upload',
    'tcx_upload',
    'csv_import',            -- ligne d'un CSV utilisateur
    'manual',                -- formulaire natif
    'garmin_api',            -- réservé pour palier 2 optionnel doc 08
    'coros_api'              -- idem
  )),
  provenance_notes     text,           -- ex: "fit_crc_invalid_recovered"

  -- Complétude — matrice binaire de ce qu'on a
  has_gps              boolean not null default false,
  has_heart_rate       boolean not null default false,
  has_cadence          boolean not null default false,
  has_power            boolean not null default false,
  has_laps             boolean not null default false,
  has_elevation        boolean not null default false,

  -- Idempotence & dédup
  content_hash         text not null,  -- SHA-256 du fichier source, ou hash canonique pour manuel
  dedup_signature      text not null,  -- voir §4

  -- Audit
  imported_at          timestamptz not null default now(),
  import_id            uuid references imports(id),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,     -- soft-delete pour purge RGPD

  unique (tenant_id, content_hash)
);

-- RLS
alter table activities enable row level security;

create policy "activities_isolated_by_tenant"
  on activities
  for all
  using (tenant_id = (select tenant_id from users where auth_id = auth.uid()))
  with check (tenant_id = (select tenant_id from users where auth_id = auth.uid()));
```

**Décisions structurantes** :
- `provenance` est un enum strict, **jamais nullable**. Une activité sans provenance n'existe pas.
- `has_*` sont dénormalisés depuis la présence effective des données — le moteur ACWR peut requêter en un `SELECT` sans jointure.
- `notes_user` et `perceived_notes` : **non transmis au LLM par défaut** ; ils peuvent contenir des informations personnelles arbitraires que l'utilisateur a écrites sur lui.
- Aucun champ « calorie » — cohérent règle CLAUDE.md §6.

---

## 3. Table `activity_health` — isolée

```sql
create table activity_health (
  activity_id          uuid primary key references activities(id) on delete cascade,
  tenant_id            uuid not null,

  hr_avg               smallint,       -- bpm, entier 30-230
  hr_max               smallint,
  hr_zones_time        jsonb,          -- {"z1": s, "z2": s, ...} — dérivé serveur, pas brut

  -- Dérivés uniquement — jamais la série brute FC point à point
  effort_index         smallint,       -- score interne 0-100 (TRIMP-like), calculé serveur
  aerobic_flag         text,           -- "aerobic" | "mixed" | "anaerobic" (dérivé zones)

  imported_at          timestamptz not null default now(),
  consent_snapshot_id  uuid not null references consents(id)
                                      -- consentement au moment de l'ingestion,
                                      -- pour audit rétroactif
);

alter table activity_health enable row level security;

create policy "activity_health_isolated_by_tenant"
  on activity_health for all
  using (tenant_id = (select tenant_id from users where auth_id = auth.uid()))
  with check (tenant_id = (select tenant_id from users where auth_id = auth.uid()));
```

**Décisions** :
- Table à part : suppression facile lors du retrait de consentement (`DELETE FROM activity_health WHERE tenant_id = ?`), sans toucher aux séances.
- **Aucune série FC point à point stockée**. La série brute est utilisée à la volée par le calcul de zones puis jetée. Cohérent CLAUDE.md « transmission au modèle : valeurs dérivées uniquement ».
- `consent_snapshot_id` référence l'état du consentement au moment de l'ingestion — permet un audit du type « quand j'ai importé cette activité, avais-je consenti aux données FC ? ».

---

## 4. Idempotence et déduplication

### 4.1 Idempotence par `content_hash`

- `content_hash = SHA-256(fichier source)`.
- Contrainte unique `(tenant_id, content_hash)` : réimporter le même fichier → conflit détecté → activité **non doublée**, l'import est marqué `outcome = 'duplicate_exact'`.
- Pour les activités manuelles, `content_hash = SHA-256(canonical_json)` où canonical_json est une sérialisation stable du formulaire — deux fois la même saisie → même hash → dédup.

### 4.2 Déduplication sémantique par `dedup_signature`

Le même entraînement peut être importé via :
- l'archive Strava (fichier `.fit` interne)
- puis, plus tard, en direct depuis la montre (`.fit` exporté à la main).

Le `content_hash` sera différent (métadonnées, ordre des messages FIT), mais **la séance est la même**. Il faut la même signature sémantique.

**Proposition** :

```
dedup_signature = SHA-256(
  tenant_id ||
  round(started_at_utc, 60s) ||           -- fenêtre 1 min
  round(duration_seconds, 10s) ||
  round(distance_meters, 100m)
)
```

Comportement en conflit :

| Cas | Existant | Nouvel import | Décision |
|---|---|---|---|
| A | manuel | fit_upload | **remplacer** contenu, garder `id`, `title` et `notes_user`. `provenance` devient `fit_upload`, ancienne trace dans `import_events`. |
| B | gpx_upload | fit_upload | **remplacer** (FIT est plus riche). |
| C | fit_upload | fit_upload différent | **conserver le premier** ; nouveau import marqué `duplicate_semantic`. |
| D | strava_archive | strava_single_file | **remplacer** (single_file est souvent plus récemment généré par Strava et peut inclure des corrections). |
| E | fit_upload | gpx_upload | **ignorer** l'entrant (GPX est plus pauvre). |
| F | csv_import (ligne d'un CSV) | fit_upload | **remplacer** — le FIT est le nouveau socle. `import_events` conserve la trace. |

**Règle générale** : le format le plus riche gagne. Rangement de richesse : `manual < csv_import < gpx_upload < tcx_upload < fit_upload/strava_archive/strava_single_file/garmin_api/coros_api`.

Cette matrice est expliquée à l'utilisateur dans le rapport d'import (« nous avons trouvé 3 doublons, dont 1 fichier plus riche que ce que vous aviez déjà — nous avons mis à jour »).

### 4.3 Comportement UX en cas de doublon détecté

Écran « rapport d'import » qui liste explicitement :
- N acceptées
- N remplacées (avec « avant / après » : format, présence FC, etc.)
- N ignorées comme doublons (raison)
- N rejetées (raison)

Bouton « annuler cet import » qui rollback l'insertion — 24h de fenêtre. Après, purge du fichier source dans le worker donc annulation impossible.

---

## 5. Table `imports` et `import_events` — traçabilité opérationnelle

```sql
create table imports (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null,
  source_kind          text not null,    -- 'zip', 'single_file', 'csv', 'manual'
  filename_original    text,
  size_bytes           bigint,
  content_hash         text,
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  outcome              text,             -- 'success', 'partial', 'failed', 'in_progress'
  error_summary        text,             -- non-technique, présentable à l'utilisateur
  activities_created   integer default 0,
  activities_replaced  integer default 0,
  activities_ignored   integer default 0,
  activities_rejected  integer default 0
);

create table import_events (
  id                   uuid primary key default gen_random_uuid(),
  import_id            uuid not null references imports(id) on delete cascade,
  file_path            text,             -- chemin interne dans l'archive
  event               text,              -- 'created', 'replaced', 'ignored_duplicate',
                                        -- 'rejected_format', 'rejected_signature',
                                        -- 'ignored_not_whitelisted' (fichiers hors périmètre)
  activity_id          uuid references activities(id),
  message              text
);
```

RLS strict sur les deux (`tenant_id` sur `imports`, chaîne via `imports.tenant_id` sur `import_events`).

---

## 6. Réversibilité — export sortant (art. 20 RGPD)

Obligation légale et argument commercial. Ce n'est pas optionnel.

**Format** : archive ZIP contenant :
- `activities.csv` : équivalent Strava, en colonnes stables et documentées, encoding UTF-8 avec BOM, séparateur `,`.
  - **Sanitisation formule injection** appliquée (voir doc `02` §2.4.1).
- `activities/*.{fit,gpx}` : le fichier source **si conservé** (voir §7), sinon rien.
- `activities_derived/*.json` : nos données dérivées (charge, RPE, notes user).
- `README.txt` : description du contenu, contact DPO, mode de réimport.
- `MANIFEST.json` : liste horodatée, hash, permet vérification d'intégrité.

Cet export doit être générable en libre-service depuis « Compte → Mes données » **et** livrable sur demande manuelle sous 30 jours (délai légal art. 12.3).

---

## 7. Conservation du fichier source

**Question ouverte à trancher** — deux options.

| Option | Conservation | Coût stockage | Impact utilisateur |
|---|---|---|---|
| **A — Purge après extraction** | Fichier source détruit ; on garde uniquement `content_hash` | Faible | Impossible de « ré-exporter » le fichier original — l'export art. 20 fournit un CSV + FIT régénéré éventuellement, pas l'original |
| **B — Conservation 90 j** | Stockage bucket froid, chiffré | Moyen (une archive de 500 Mo × N utilisateurs) | Peut ré-exporter l'original, peut relancer un parsing si bug corrigé |

**Recommandation** : **A par défaut, B en opt-in payant** dans un tier « Pro/Coach » ultérieur. Cohérent avec la minimisation RGPD (art. 5.1.c).

**Ce qu'on garde même en mode A** : hash + `provenance_notes`, pour :
- idempotence future ;
- audit en cas de contestation.

---

## 8. Contrat de sortie vers le moteur de plan

Le moteur (voir doc `05`) requête des données via une couche accessor `getActivities({from, to, options})`. Structure de sortie :

```ts
type PlanEngineActivity = {
  id: string;
  started_at: string;         // ISO 8601
  activity_type: 'run'|'trail'|'bike'|'hike'|'strength'|'other';
  duration_s: number;
  distance_m: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  effort_index: number | null;   // depuis activity_health, si consentement
  aerobic_flag: 'aerobic'|'mixed'|'anaerobic' | null;
  completeness: {
    has_gps: boolean;
    has_heart_rate: boolean;
    has_power: boolean;
    // ...
  };
  provenance: string;
  is_downgraded: boolean;        // true si l'activité vient d'une source pauvre
                                  // (manual, csv, gpx nu) — le moteur peut pondérer
};
```

**Note importante** : le moteur ne reçoit **jamais** `notes_user`, `perceived_notes`, `title`, ni les points GPS bruts. Ce contrat vaut d'autant plus pour le LLM (doc `05`).

---

## 9. Ce qui ne rentre PAS dans ce schéma

Volontairement absent :
- Poids, IMC, masse grasse, calories (règle CLAUDE.md).
- Points GPS bruts persistés (trop volumineux, faible ROI, exposition RGPD/localisation aggravée). Une trace peut être **résumée** dans `activity_geo` (polyline encodée + bbox), pas stockée point par point.
- Données de contacts, followers, kudos (rejetées à l'ingestion, doc `02` §2.1.3).
- Photos (idem — même si l'archive Strava en contient).
- Estimations Strava propriétaires (Suffer Score, Relative Effort Strava) — droit d'usage non clair hors API Strava, on recalcule notre propre `effort_index`.

---

## 10. Sources primaires

- Ce document dérive des règles internes `CLAUDE.md` et de la conformité RGPD (doc `06`).
- RFC 4180 (CSV) : `https://tools.ietf.org/html/rfc4180`
- Article 20 RGPD (portabilité) : `https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3#Article20`
