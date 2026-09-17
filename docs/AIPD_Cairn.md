# AIPD — Analyse d'Impact relative à la Protection des Données

> **Cairn** — Coach trail/ultra piloté par IA (Claude, Anthropic)
> Version : **0.2** — brouillon technique actualisé
> Date de rédaction : 2026-07-24 (v0.1) — mise à jour 2026-07-27 (v0.2)
> Statut : **à valider par un juriste avant tout accès externe**
> Base légale : RGPD art. 35 · CNIL, guide AIPD 2018-2023

## Changelog

- **v0.2 — 2026-07-27** — Refonte suite à trois décisions produit majeures :
  1. **Sortie de l'API Strava** (voir `docs/strava-compliance.md`, `docs/architecture/socle/`) : Strava n'est plus la source primaire, l'ingestion se fait par fichiers uploadés (voir `docs/architecture/ingestion/`).
  2. **Structure d'abonnement** posée avec provider Paddle prévu (voir `docs/paiement-paddle.md`).
  3. **Nouveaux traitements** : laps par activité (`activity_laps`), FC par lap (`activity_lap_health` — table santé séparée avec RLS 4 policies et purge conforme), classification de séance automatique (`lib/analytics/classify-session`).
  Progrès sur la todo v0.1 : routes `/api/export` et delete-account **faites**, purge FC réelle **faite**, consentement FC contextuel via `/settings/donnees-sante` **fait**, extension AI Act art. 50 (`/planning`, `/debriefs`, `/activities/[id]`) **faite**.

- **v0.1 — 2026-07-24** — Brouillon initial généré depuis l'état du code au commit `74073d8`. Contenu ci-dessous.

---

## Comment utiliser ce document

Ce document est un **squelette technique** rempli à partir de l'état réel du code et du schéma Supabase au 2026-07-24. Il n'engage pas juridiquement le responsable de traitement tant qu'il n'a pas été relu et validé par un professionnel du droit.

Les sections marquées **[À COMPLÉTER JURISTE]** sont celles où l'appréciation juridique dépasse la description technique.

---

## 1. Description du traitement

### 1.1 Nature, finalité, contexte

- **Nature du traitement** : plateforme SaaS multi-tenant. Chaque athlète dispose d'un espace personnel avec ses activités sportives, ses courses cibles, ses contraintes, son plan d'entraînement, ses débriefs et logs de fueling, et une conversation avec un coach IA (Claude Opus 4.8, Anthropic).
- **Finalité principale** : proposer un accompagnement d'entraînement trail/ultra adapté, réajusté en continu selon les données sportives réelles.
- **Finalité secondaire** : mesurer les coûts d'usage IA par utilisateur (table `ai_calls`).
- **Contexte d'usage** : mobile-first, France métropolitaine. Utilisatrices/utilisateurs adultes pratiquant la course à pied longue distance.

### 1.2 Périmètre des données traitées

> Actualisation v0.2 : ajouts `activity_laps`, `activity_lap_health`, `training_goals`, `coach_proposals`, `subscriptions`, `subscription_plans`. Colonnes `elevation_loss_m` (D-) ajoutées à `activity_laps`.

| Catégorie | Détail | Table(s) | Sensibilité |
|---|---|---|---|
| Identifiants | e-mail, UUID interne | `auth.users` (Supabase) | Standard |
| Profil athlète | nom d'affichage, timezone, refs 5k/10k/semi/marathon + dates | `athletes` | Standard |
| Données sportives | activités, distances, D+, D-, durées, allures, cadence, notes personnelles, terrain (course), classification inférée | `activities`, `races` (+ champ `terrain`) | Standard |
| Laps d'activité | split par lap : distance, durée, allure, D+, D-, manuel/auto | `activity_laps` | Standard |
| **Données de santé activité** | FC moyenne, FC max par activité | `activity_health` (table séparée) | **Sensible art. 9 RGPD** |
| **Données de santé lap** | FC min, moy, max par lap | `activity_lap_health` (table séparée, RLS 4 policies, immuable côté user) | **Sensible art. 9 RGPD** |
| Courses cibles | nom, date, distance, D+, terrain, priorité, objectif, résultat, notes | `races` | Standard |
| Contraintes | garde d'enfants, club, vacances, blessure, etc. | `constraints` | Peut révéler famille/santé — vigilance |
| Objectifs transversaux | libellé, domaine, date cible | `training_goals` | Standard |
| Plan | phases, séances prévues, révisions | `plan_weeks`, `planned_sessions`, `plan_revisions`, `session_templates` | Standard |
| Fueling | pattern de prise, grammes glucides, produits, incidents digestifs | `fueling_logs` | **Peut révéler état digestif — vigilance** |
| Débriefs | narratif de course, axes de travail | `debriefs` | Standard |
| Coach chat | messages, tokens consommés | `coach_threads`, `coach_messages` | Standard |
| Propositions coach | proposition d'ajout de contrainte / course / axe de débrief en attente d'acceptation Eva | `coach_proposals` | Standard |
| Consentement | scope, granted, texte de politique, horodatage | `consent_records` (append-only) | Standard |
| Journal accès santé | qui/quand/pourquoi sur `activity_health` et `activity_lap_health` | `health_access_logs` (append-only) | Journal de sécurité |
| Tokens Strava | access_token, refresh_token (**chiffrés AES-256-GCM**) — voir §7 sur l'évolution du rôle de Strava | `strava_connections` | Sensible — chiffrement en base |
| Metering IA | tenant + feature + tokens + coût estimé | `ai_calls` | Standard |
| Abonnement | plan actuel, statut trial/active/canceled, ID provider paiement | `subscriptions`, `subscription_plans` | Standard |

### 1.3 Personnes concernées

- Utilisatrices et utilisateurs adultes (pas de traitement de mineurs à ce stade).
- Aucun traitement de tiers (les contacts, coach club, entourage ne sont pas identifiés nominativement).

### 1.4 Destinataires internes / externes

- **Interne** : uniquement l'utilisateur lui-même. Isolation stricte multi-tenant via RLS PostgreSQL sur toutes les tables (voir §4).
- **Sous-traitants** :
  - **Supabase** (base de données + auth) — hébergement UE (Frankfurt, région `eu-west-3`).
  - **Anthropic** (API Claude Opus 4.8) — traitement des prompts. Données envoyées : contexte agrégé (12 semaines de charge, 10 dernières activités, prochaine course A, contraintes actives, dernier débrief, dernier fueling log). **Aucune donnée brute de FC**. **Aucun identifiant nominatif** dans les prompts (le nom d'affichage y figure uniquement si l'utilisateur l'a saisi dans son profil).
  - **Strava** (OAuth2 + import d'activités) — l'utilisateur consent explicitement au partage.
  - **Vercel** (hébergement Next.js) — région UE.
- **Externe (transfert hors UE)** : Anthropic dispose d'infrastructures aux États-Unis. **[À COMPLÉTER JURISTE : SCC + TIA + éventuelle utilisation région EU d'Anthropic quand disponible]**.

### 1.5 Durées de conservation

- **Compte actif** : tant que l'utilisateur maintient son compte.
- **Sur suppression du compte** : cascade DELETE via FK `on delete cascade` sur `auth.users.id`. Toutes les tables `tenant_id` sont purgées.
- **Journal santé (`health_access_logs`)** : conservé 3 ans après suppression du compte à des fins d'audit sécurité. **[À COMPLÉTER JURISTE : durée conforme]**.
- **Consentement (`consent_records`)** : conservé 3 ans après suppression du compte pour prouver la validité au moment du traitement.
- **Backups Supabase** : rotation standard (7 jours point-in-time recovery).

### 1.6 Base légale de chaque traitement

| Traitement | Base légale RGPD | Motif |
|---|---|---|
| Données sportives, courses, plan, débriefs, fueling, coach chat | Art. 6.1.b — exécution du contrat | Cœur du service demandé par l'utilisateur |
| Fréquence cardiaque et effort relatif | Art. 9.2.a — consentement explicite | Case à cocher opt-in au moment de la connexion Strava, révocable |
| Metering IA (tokens, coût) | Art. 6.1.f — intérêt légitime | Piloter les coûts d'un service payant ou freemium |
| Tokens Strava | Art. 6.1.b — exécution du contrat | Nécessaire pour importer les activités |

---

## 2. Nécessité et proportionnalité

### 2.1 Données strictement nécessaires

Chaque champ du schéma répond à une finalité identifiée. Points d'attention :

- **Notes personnelles d'activités** (`activities.user_notes`) : champ libre saisi par l'utilisateur, susceptible de contenir toute information. **Recommandation** : rappel dans l'UI que ce champ transite vers Anthropic quand utilisé pour générer un débrief ou un fueling à partir des notes. **[À FAIRE : ajouter un rappel discret sous le champ notes]**.
- **Contraintes** : peuvent révéler la composition du foyer, un handicap, un événement médical. Le champ `notes` d'une contrainte est libre. Aucune traitement automatique n'en tire de conclusion, mais le contenu transite vers Anthropic dans le contexte coach.

### 2.2 Minimisation

- Aucun champ de poids, IMC, masse grasse ou calorie n'existe dans le schéma (règle produit inscrite dans CLAUDE.md).
- FC filtrée à l'ingestion Strava si consentement OFF (voir `lib/strava/ingest.ts::extractHealth`).
- Anthropic ne reçoit **jamais** de valeur brute de FC — uniquement des données dérivées (`context.ts`).
- Le contexte coach est plafonné à ~4k tokens.

### 2.3 Exactitude

- L'utilisateur peut modifier ou supprimer tout enregistrement (activités, notes, débriefs, logs fueling, contraintes, courses, plan_weeks).
- La suppression est réelle en base (`delete` cascade), pas seulement un flag d'affichage.

### 2.4 Information et transparence

- **AI Act art. 50** : bandeau IA visible dès la première interaction sur `/coach` et `/coach/[id]` (composant `AiDisclosure`).
- **[À FAIRE]** : politique de confidentialité publique, CGU, mention légale.

### 2.5 Droits des personnes

| Droit | État actuel (v0.2) |
|---|---|
| Accès (art. 15) | ✅ Route `/api/export` : JSON complet des données du compte |
| Rectification (art. 16) | ✅ CRUD complet sur toutes les entités |
| Effacement (art. 17) | ✅ Écran `/settings/donnees` avec suppression du compte (cascade FK + purge Strava) |
| Portabilité (art. 20) | ✅ Idem art. 15, format JSON structuré |
| Opposition (art. 21) | ✅ Retrait du consentement FC via `/settings/donnees-sante` — purge réelle en base (`activity_health` + `activity_lap_health` supprimées, événement dans `health_access_logs`) |
| Consentement révocable (art. 7.3) | ✅ Table `consent_records` append-only, dernière ligne = état courant |

---

## 3. Analyse des risques

### 3.1 Illégitimité d'accès

- **Risque** : fuite inter-tenant permettant de lire les données de santé ou sportives d'un autre utilisateur.
- **Impact** : élevé — divulgation de données de santé, obligation de notifier CNIL sous 72 h (art. 33 RGPD).
- **Vraisemblance résiduelle** : faible — voir §4.

### 3.2 Modification non désirée

- **Risque** : altération d'un plan ou d'une activité par un tiers.
- **Impact** : moyen — perte de confiance, aucun impact santé direct.
- **Vraisemblance résiduelle** : faible — RLS bloque les writes cross-tenant.

### 3.3 Disparition des données

- **Risque** : suppression accidentelle, corruption base, incident hébergeur.
- **Impact** : moyen.
- **Vraisemblance résiduelle** : faible — backups Supabase avec PITR 7 jours.

### 3.4 Divulgation via l'IA

- **Risque spécifique** : le modèle Anthropic pourrait « leak » du contenu d'un utilisateur vers un autre via un mauvais scoping.
- **Mesures** : le `tenant_id` n'est **jamais** un paramètre exposé au modèle (règle CLAUDE.md, cf. `lib/ai/tools.ts`). Chaque tool reçoit le client Supabase authentifié et la RLS filtre.
- **Vraisemblance résiduelle** : faible.

### 3.5 Transfert hors UE

- **Risque** : les prompts vers Anthropic peuvent être traités sur infra US.
- **Mesures** : contexte agrégé, pas de nom réel obligatoire, pas de FC brute. **[À COMPLÉTER JURISTE : SCC + TIA + surveiller sortie région EU d'Anthropic]**.

---

## 4. Mesures existantes

### 4.1 Sécurité applicative

- **RLS forcée sur toutes les tables tenant** (voir `tests/isolation.test.ts` — 26 tests passent, dont le refus d'un tenant B de lire une ligne d'un tenant A sur les 16 tables sensibles).
- **Pas de filtrage applicatif** : la règle produit interdit `WHERE tenant_id = ...` en TypeScript. La RLS est la seule source de vérité.
- **Tokens Strava chiffrés en base** (AES-256-GCM, `lib/strava/crypto.ts`), clé dans variable d'environnement `STRAVA_TOKEN_KEY`.
- **Aucun log de donnée sensible** : pas de FC, token, e-mail ou secret dans les traces.
- **HTTPS forcé** (Vercel + Supabase).

### 4.2 Sécurité IA

- Le modèle n'a **aucun accès** au `tenant_id`. Chaque tool exposé (`lib/ai/tools.ts`) reçoit un client Supabase authentifié et laisse la RLS filtrer.
- Les prompts n'incluent **jamais** de valeur brute de FC.
- Boucle tool_use plafonnée à 5 itérations pour éviter les runaways.
- Modèle unique : `claude-opus-4-8` (versionné, pas de « latest » implicite).

### 4.3 Journalisation

- **`health_access_logs`** : append-only, chaque écriture dans `activity_health` est loguée avec `actor`, `action`, `context`.
- **`consent_records`** : append-only, chaque changement de consentement est versionné avec le texte affiché au clic.
- **`plan_revisions`** : append-only, chaque modification IA du plan est journalisée avec `diff` et `author`.
- **`ai_calls`** : append-only, chaque appel Anthropic est logué avec tokens et coût estimé.

### 4.4 Séparation des données de santé

- Table `activity_health` séparée de `activities`, avec sa propre policy RLS.
- Aucune colonne FC dans `activities`.

---

## 5. Mesures à implémenter avant beta externe

> Actualisation v0.2 : 5 items rayés (faits), 4 items nouveaux liés à la sortie Strava et à Paddle.

| Mesure | Priorité | État |
|---|---|---|
| ~~Route `/settings/export` (accès + portabilité)~~ | ~~Haute~~ | ✅ Faite v0.2 |
| ~~Route `/settings/delete-account` (effacement)~~ | ~~Haute~~ | ✅ Faite v0.2 |
| ~~Purge réelle FC à la révocation~~ | ~~Haute~~ | ✅ Faite v0.2 (inclut `activity_lap_health`) |
| ~~Consentement FC contextuel~~ | ~~Haute~~ | ✅ `/settings/donnees-sante` |
| ~~Extension AI Act art. 50 hors `/coach`~~ | ~~Haute~~ | ✅ `/planning`, `/debriefs`, `/activities/[id]` (voir `docs/ai-act-50-couverture.md`) |
| Politique de confidentialité + CGU + mention légale publiques | Haute | Rédaction juriste |
| DPA Anthropic (Zero Data Retention + no training) | **Bloquant** | À signer |
| DPA Paddle (Merchant of Record + hébergement paiement) | Haute | Avant activation abonnement |
| DPA Supabase + Vercel (SCC / DPF à vérifier) | Haute | À vérifier |
| Registre de traitements (art. 30) | Haute | À rédiger |
| Bandeau d'onboarding avec consentement granulaire (identification, activités, santé, IA) | Haute | Avant ouverture publique |
| **Décision architecture socle post-Strava** (voir `docs/architecture/socle/` et `docs/architecture/ingestion/`) | **Bloquant** | Documents prêts, décision produit en cours |
| Rappel sous le champ notes activité : « ces notes peuvent transiter vers Anthropic » | Moyenne | 1 h |
| Marquage `generated_by: 'ai'` dans les exports `/api/export` | Moyenne | 0.5 j |
| Bandeau cookies (analytique, préférences) | Moyenne | 2 j (si analytics ajouté) |
| Procédure interne notification de fuite 72h | Moyenne | Rédaction |
| Audit externe sécurité applicative | Basse | À planifier après beta |

---

## 6. Avis du responsable de traitement

**[À COMPLÉTER JURISTE ET DPO SI DÉSIGNÉ]**

Champs à remplir :

- Décision : traitement acceptable / acceptable sous réserves / à revoir
- Réserves : liste explicite
- Date de validation
- Date de prochaine revue (recommandé : annuelle + à chaque changement majeur)

---

## Annexes

### Références au code

- Isolation multi-tenant : `tests/isolation.test.ts`, `supabase/migrations/*`
- Chiffrement Strava : `lib/strava/crypto.ts`
- Consentement FC : `lib/consent/policy.ts`, `app/settings/strava/actions.ts`
- Bandeau AI Act : `components/ai-disclosure.tsx`
- Tools IA scopés : `lib/ai/tools.ts`
- Contexte coach (pas de FC brute) : `lib/ai/context.ts`
- Metering IA : `lib/ai/metering.ts`, `app/settings/ai-usage/`

### Historique de version

- **0.1 — 2026-07-24** — Brouillon technique généré depuis l'état du code au commit `74073d8`. Sections juridiques marquées à compléter.
- **0.2 — 2026-07-27** — Refonte : sortie API Strava actée, ingestion par fichiers documentée, DPA Anthropic bloquant, activity_laps + activity_lap_health ajoutées, structure abonnement Paddle posée, extension AI Act art. 50 réalisée.

---

## 7. Documents complémentaires (v0.2)

Une AIPD ne se lit pas seule. Un juriste tech qui la valide doit pouvoir croiser avec les documents suivants, tous versionnés dans le repo :

| Document | Sujet | Statut |
|---|---|---|
| `docs/strava-compliance.md` | Analyse détaillée des Terms Strava (01/06/2026), 4 clauses violées, 4 options architecturales, décision-log | En cours — mail clarification à envoyer |
| `docs/strava-mail-clarification.md` | Template du mail à `developers@strava.com` | Prêt à envoyer |
| `docs/architecture/socle/` | Comparaison des sources de données évaluées (Garmin, COROS, Polar, Suunto, Wahoo, HealthKit, Health Connect, Terra, Vital, Rook, FIT upload) | Livré 27/07 |
| `docs/architecture/ingestion/` | Architecture complète du pipeline d'ingestion par fichiers utilisateur (10 documents + ADR + questions ouvertes + résultats du spike sur archive réelle) | Livré 27/07, spike exécuté 27/07 |
| `docs/architecture/ingestion/csv-columns-mapping.md` | Table exhaustive des 105 colonnes CSV Strava avec classification GARDÉ / IGNORÉ / BLOCKED | Prêt |
| `docs/ai-act-50-couverture.md` | Audit de la couverture AI Act art. 50 par écran | Prêt |
| `docs/paiement-paddle.md` | Séquence d'activation du provider de paiement (Merchant of Record) | Prêt |
| `CLAUDE.md` | Règles produit codifiées : blocage poids/IMC/calories, tenant_id jamais en paramètre d'outil IA, isolation par RLS uniquement, aucune valeur brute de santé au modèle | À jour |
