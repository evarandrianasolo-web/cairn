# 02 — Modèle de données, traçabilité de provenance, cloisonnement

> Phase 3 : schéma + provenance + cloisonnement + test automatisable
> Ce document décrit la structure logique, pas l'implémentation. Il définit ce que **doit** garantir le schéma et comment le **prouver** en continu. La migration SQL correspondante est un livrable séparé.

---

## 1. Principe fondamental

Chaque donnée d'activité porte, **au niveau du schéma**, sa **source d'origine**. La source détermine :

- Le régime de rétention applicable (technique et contractuel).
- Le droit de la joindre à d'autres données (contrat autorisé ou non).
- Le droit de la transmettre à un LLM (contrat autorisé ou non).
- Les obligations de suppression en cas de retrait de consentement ou de résiliation.

Aucune décision d'usage n'est prise en couche applicative sur inspection d'un champ optionnel. **La contrainte est portée par le type et par la structure.**

---

## 2. Enum `activity_source`

Type Postgres exhaustif — **fermé et versionné**. Toute nouvelle source impose une migration explicite. Aucune source `unknown` ou `null`.

```
activity_source ∈ {
  garmin,             -- Garmin Connect Developer Program (Activity + Health API)
  coros,              -- COROS Open API (activation conditionnelle)
  polar,              -- Polar AccessLink
  suunto,             -- Suunto Cloud API
  wahoo,              -- Wahoo Cloud API
  healthkit,          -- Apple HealthKit (dérivé side-loaded iOS)
  health_connect,     -- Android Health Connect (dérivé side-loaded Android)
  fit_upload,         -- Fichier FIT/GPX/TCX uploadé par l'utilisateur
  manual,             -- Saisie déclarative dans l'app (sans capteur)
  strava_bulk_export, -- Fichier issu du Bulk Data Export §6.6 utilisateur
  strava_api          -- Ingestion Strava API (si un jour réactivée) — CLOISONNÉE
}
```

Décisions notables :
- **Terra / Vital / Rook** ne figurent **pas** comme source. Si un jour ils sont introduits, la source stockée est **celle du constructeur amont** (`garmin`, `polar`, etc.), avec un champ séparé `ingested_via = terra` pour audit. La CGU applicable est celle du constructeur, pas celle de l'agrégateur.
- `strava_bulk_export` et `strava_api` sont **deux sources distinctes**, car leurs régimes contractuels sont différents (§6.6 vs API Materials).
- `manual` existe pour les activités saisies sans capteur (ex : « j'ai couru 45 min, RPE 6 »). Utile en dégradé.

---

## 3. Régime par source (matrice d'usage)

Cette matrice est **encodée dans le schéma** — pas laissée à la vigilance des développeurs. Voir §7 pour l'implémentation.

| Source | Rétention | Analytics moteur | Transmission LLM | Joignable avec autres sources | Purge sur consent retrait |
|---|---|:-:|:-:|:-:|:-:|
| `garmin` | tant que consentement actif | ✅ | ✅ | ✅ | obligatoire |
| `coros` | idem *(à confirmer)* | ✅ *(sous réserve)* | ⚠️ *(à confirmer)* | ✅ *(sous réserve)* | obligatoire |
| `polar` | tant que consentement | ✅ | ⚠️ *(silence contrat)* → prudent : oui avec consent | ✅ | obligatoire |
| `suunto` | tant que consentement | ✅ | ⚠️ *(à confirmer)* | ✅ | obligatoire |
| `wahoo` | tant que consentement, delete ≤ 48 h sur demande | ✅ | ⚠️ *(à confirmer)* | ✅ | obligatoire, ≤ 48 h |
| `healthkit` | serveur : tant que consentement | ✅ | ✅ *(avec disclosure)* | ✅ | obligatoire |
| `health_connect` | idem | ✅ | ✅ *(avec disclosure)* | ✅ | obligatoire |
| `fit_upload` | tant que compte actif | ✅ | ✅ | ✅ | obligatoire (compte) |
| `manual` | idem | ✅ | ✅ | ✅ | obligatoire (compte) |
| `strava_bulk_export` | tant que compte actif | ✅ | ✅ | ✅ (fichier utilisateur ≠ API Materials) | obligatoire |
| **`strava_api`** | **≤ 7 jours (TTL technique)** | **❌** | **❌** | **❌ ISOLÉ** | **immédiate** |

Les deux dernières lignes illustrent la **règle asymétrique** qui structure le schéma : `strava_api` n'est pas un peu plus contraint que les autres, il est **radicalement isolé**.

---

## 4. Cloisonnement Strava — au niveau du schéma

### 4.1 Schémas Postgres séparés

Deux schémas au sens Postgres (`CREATE SCHEMA`), pas seulement deux tables :

- `public` (ou `core`) : contient `activities`, `activity_health`, `activity_streams`, `laps`, `plan_revisions`, tout ce qui alimente le moteur et éventuellement le LLM.
- `strava_cache` : contient `strava_activities`, `strava_streams`, `strava_ingestion_log`. **Uniquement les enregistrements source=`strava_api`.**

Le cloisonnement schéma-niveau est plus fort qu'un simple filtre `WHERE source = 'strava_api'` : il rend les jointures accidentelles **structurellement impossibles** sans être explicites (préfixe `strava_cache.` obligatoire).

### 4.2 Politique RLS supplémentaire sur `strava_cache`

Toute table de `strava_cache` porte, en plus des policies RLS tenant standard :

- **Interdiction d'accès depuis les rôles qui alimentent le contexte coach IA.** Le rôle `ai_context_reader` (défini pour construire `lib/ai/context.ts`) n'a **aucun `GRANT SELECT`** sur `strava_cache.*`. Une jointure LLM-facing sur ce schéma renverrait une erreur permission au niveau Postgres.
- **Retention trigger** : chaque insert positionne `expires_at = now() + interval '7 days'`. Un cron pg (ou Supabase Cron) supprime toutes les lignes expirées, quotidiennement.

### 4.3 Interdiction de foreign key traversant les schémas

- Aucune FK depuis `public.*` vers `strava_cache.*`.
- Aucune FK depuis `strava_cache.*` vers `public.*` autre que `public.users(id)`.
- Aucune VIEW ne joint les deux schémas. Les seules VUES sont locales au schéma.

Cette règle est **auditable** (voir §7).

### 4.4 Import Bulk Data Export §6.6 — traité comme un FIT

Quand un utilisateur uploade son archive Strava (§6.6 : droit inaliénable de l'utilisateur d'exporter ses données), les fichiers extraits sont ingérés **exactement comme un FIT upload** :
- Source enregistrée : `strava_bulk_export` (pour audit, distinct de `strava_api`).
- Insertion dans `public.activities` (**pas** dans `strava_cache`).
- Aucune contrainte de rétention 7 j (le fichier n'est pas un « API Material »).
- Aucune interdiction analytics / LLM.

**Base juridique** : l'utilisateur exerce un droit personnel (portabilité RGPD + droit d'export préservé par §6.6). La donnée ne transite pas par l'API Strava. L'API Policy Strava ne s'applique pas au fichier une fois qu'il est entre les mains de l'utilisateur.

⚠️ **Lecture prudente à valider avec un juriste** : les CGU utilisateurs Strava (grand public, différentes de l'API Policy) pourraient contenir des restrictions résiduelles sur ce que l'utilisateur peut faire de ses propres données. Inscrit dans `QUESTIONS-OUVERTES.md`.

---

## 5. Traçabilité de provenance — au niveau ligne

### 5.1 Colonnes obligatoires sur `activities` et dérivées

Toute table stockant une donnée d'activité (ou d'un dérivé calculé) porte **au minimum** :

- `source activity_source NOT NULL` — enum ci-dessus.
- `source_external_id TEXT NULL` — id chez le constructeur (garmin_activity_id, etc.).
- `ingested_via TEXT NULL` — `direct_oauth`, `webhook_ping`, `webhook_pull`, `upload`, `terra`, `vital`, `manual`. Sert à distinguer les modes d'ingestion pour un même constructeur.
- `ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- `consent_snapshot_id UUID REFERENCES consent_snapshots(id) NOT NULL` — pointeur vers l'état de consentement au moment de l'insertion. Sert à justifier la présence de la donnée en cas d'audit CNIL.
- `retention_policy TEXT NOT NULL` — dérivé de la source, redondance intentionnelle pour audit : `standard`, `strava_7d`, `wahoo_48h_on_delete`.

### 5.2 Cas de la donnée dérivée (moteur → base)

Une valeur calculée par le moteur (ex : `weekly_load`, `acwr`, `fatigue_flag`) porte :
- `derived_from_sources activity_source[] NOT NULL` — le tableau des sources ayant contribué au calcul.
- Une valeur dérivée d'au moins une source `strava_api` **est interdite d'insertion** en `public` (contrainte CHECK). Elle ne peut vivre que dans `strava_cache`, à durée de vie limitée.

**Conséquence** : le moteur ne mélange **jamais** silencieusement des données Strava avec du Garmin. Toute tentative fait échouer l'insertion.

---

## 6. Priorisation double réception

Cas fréquent : un même utilisateur configure OAuth Garmin **et** upload Strava Bulk Export **et** a une Apple Watch qui rebroadcast la même sortie via HealthKit. Trois copies de la même activité.

### 6.1 Clé de déduplication

Une activité est déduppliquée par :
- `user_id`
- `started_at ± 5 min`
- `duration ± 60 s`
- `distance ± 3 %`

Match si les 4 conditions satisfaites.

### 6.2 Règle de priorité (source qui gagne)

Ordre de préférence explicite, **codé en table de règles**, pas en logique dispersée :

```
priority_rank (plus élevé = gagne) :
  garmin              = 100  -- source la plus riche (streams 1 Hz, laps structurés, TE)
  coros               = 100
  polar               = 90
  suunto              = 90
  wahoo               = 90
  fit_upload          = 80   -- riche mais uploadé, hors webhook temps réel
  strava_bulk_export  = 60   -- moins riche que FIT natif constructeur
  healthkit           = 50   -- dérivé, souvent tronqué
  health_connect      = 50
  manual              = 10
  strava_api          = —    -- exclu de la comparaison, isolé
```

La ligne « gagnante » est promue en `activities.primary_source`. Les autres sont stockées en `activities_secondary` (avec la même source d'origine) pour permettre un fallback si la primaire est purgée (ex : retrait consentement Garmin → on retombe sur le FIT upload).

### 6.3 Ne pas fusionner les valeurs

Pas de moyenne, pas de « meilleur des deux ». La primary source livre l'entièreté de la ligne. Fusion = perte de traçabilité.

---

## 7. Test automatisable — la contrainte doit être vérifiée en CI

L'isolation Strava est un **invariant produit**, pas une bonne pratique optionnelle. Elle doit être testée à chaque PR.

### 7.1 Tests SQL statiques (à faire tourner en CI)

```
-- T1 : aucune FK ne traverse les schémas
SELECT tc.table_schema, tc.table_name, kcu.column_name,
       ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_name)
  JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (
    (tc.table_schema = 'strava_cache' AND ccu.table_schema NOT IN ('strava_cache', 'auth'))
    OR
    (tc.table_schema = 'public'       AND ccu.table_schema = 'strava_cache')
  );
-- Attendu : 0 ligne. Toute ligne = échec CI.

-- T2 : aucune VIEW ne joint les deux schémas
SELECT n.nspname AS schema, c.relname AS view
FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_rewrite r ON r.ev_class = c.oid
  JOIN pg_depend d ON d.objid = r.oid
  JOIN pg_class ref ON ref.oid = d.refobjid
  JOIN pg_namespace refn ON refn.oid = ref.relnamespace
WHERE c.relkind = 'v'
  AND ((n.nspname = 'public' AND refn.nspname = 'strava_cache')
    OR (n.nspname = 'strava_cache' AND refn.nspname = 'public'));
-- Attendu : 0 ligne.

-- T3 : le rôle ai_context_reader n'a AUCUN grant sur strava_cache
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'ai_context_reader'
  AND table_schema = 'strava_cache';
-- Attendu : 0 ligne.

-- T4 : toute ligne de strava_cache a expires_at ≤ now() + 7 jours
SELECT table_name FROM strava_cache.pg_stat_user_tables ...
  -- pour chaque table : SELECT count(*) WHERE expires_at > now() + interval '7 days 1 hour'
-- Attendu : 0.

-- T5 : aucune ligne dérivée en public.* ne référence source strava_api
SELECT table_name FROM public.activities WHERE 'strava_api' = ANY(derived_from_sources);
SELECT table_name FROM public.weekly_load WHERE 'strava_api' = ANY(derived_from_sources);
-- (à répéter pour toute table dérivée)
-- Attendu : 0.
```

### 7.2 Test comportemental (à ajouter à `npm run test:isolation`)

Simuler l'insertion d'une activité `source='strava_api'` dans `public.activities` et vérifier que l'écriture **échoue** (contrainte CHECK ou trigger BEFORE INSERT).

Simuler une requête depuis le rôle `ai_context_reader` sur `strava_cache.*` et vérifier qu'elle **échoue** avec une erreur de permission.

Ces deux tests doivent tourner à chaque CI et bloquer le merge en cas d'échec.

### 7.3 Pas de contournement, même en dev

L'environnement `dev` porte les mêmes contraintes. Une donnée Strava en dev est une donnée Strava. La règle Cairn « Ne jamais désactiver la RLS, même en développement local » (CLAUDE.md) s'étend à ces invariants.

---

## 8. Modélisation retentions et purges

### 8.1 Table `retention_jobs`

Une table de suivi :
- Job de purge quotidien sur `strava_cache.*` (rows où `expires_at < now()`).
- Job de purge sur retrait consentement (event `consent_withdrawn` → suppression des lignes de l'utilisateur pour la source concernée).
- Toutes les purges sont journalisées : `retention_purge_log` (source, user_id, rows_deleted, executed_at). Sert à répondre en 30 jours à toute demande d'audit.

### 8.2 Traitement de la révocation constructeur

Si un utilisateur révoque son OAuth Garmin :
1. Détection via webhook (deauthorization) ou test périodique du token.
2. Bascule : `consent_snapshots` insert d'un nouveau snapshot avec `garmin_authorized=false`.
3. Purge des enregistrements sources = `garmin` dans les 30 jours (paramétrable par juridiction — la France exige moins).
4. Fallback : les lignes secondaires (autre source) prennent le relais si présentes ; sinon l'utilisateur est notifié et bascule sur upload manuel.

---

## 9. Ce que ce modèle **garantit** et ce qu'il **ne garantit pas**

**Garanti :**
- Aucune donnée Strava API ne peut se retrouver mélangée avec autre chose. Aucune inférence LLM ne peut les toucher. La contrainte est structurelle, pas déclarative.
- Toute donnée en base est justifiable : source, consentement, mode d'ingestion.
- Une révocation de consentement se traduit par une purge réelle, pas un flag d'affichage.

**Non garanti :**
- Que le contrat COROS/Suunto autorise les usages listés (dépend d'un texte non lu).
- Que la lecture « §6.6 = ok pour Bulk Export » tienne juridiquement (dépend d'un juriste).
- Que la lecture « no charge for API access » Wahoo s'applique à un SaaS payant (à clarifier).

Tout ce qui est « non garanti » se retrouve dans `QUESTIONS-OUVERTES.md`.

---

## 10. Rappel aux futures itérations

Toute nouvelle source d'ingestion **exige** :
1. Ajout à l'enum `activity_source` par migration.
2. Ajout de sa ligne dans la matrice §3 avec justification textuelle sourcée.
3. Ajout de ses règles de rétention/purge.
4. Ajout d'une entrée dans la table de priorité §6.
5. Tests d'isolation §7 étendus si la source impose un cloisonnement (comme `strava_api`).

Sinon, la migration est refusée en revue.
