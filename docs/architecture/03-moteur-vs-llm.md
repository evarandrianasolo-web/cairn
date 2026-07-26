# 03 — Séparation moteur déterministe / couche LLM

> Phase 4 : conception de la séparation, contrat d'interface, lecture du §5.3 Strava sur un moteur rules-based
> Cette séparation est **le cœur de la défense** en cas d'audit ou de contrôle : c'est elle qui permet de dire, preuve à l'appui, quelles données vont où.

---

## 1. Deux composants, deux régimes

### A — Moteur de planification déterministe

**Nature** : code, règles, tables. Aucun modèle statistique appris. Sorties reproductibles à input identique. Testable par cas d'école.

**Domaine :**
- Périodisation (base → build → peak → taper → race).
- Progression du volume et de l'intensité (règle des 10 %, semaine de décharge tous les 3–4 blocs, etc.).
- **ACWR** (Acute:Chronic Workload Ratio) et calcul de charge.
- Progression du D+ hebdomadaire, spécifique trail.
- Adaptation aux séances club fixes (mardi/jeudi jamais doublées).
- Ajustement à la fatigue (via `fatigue_flag` calculé, pas via consultation LLM).
- Sélection de séances dans une bibliothèque pré-écrite (allure, durée, D+ cible, format lap).

**Sorties** : un plan structuré (JSON), un différentiel confirmable, des séances typées.

**Inputs autorisés** : `activities` (public schema), toute source **sauf** `strava_api`. Données déclaratives : objectif de course, VMA, seuil, contraintes hebdo.

**Fonctionnement dégradé** : si aucune synchro n'est active, le moteur tourne sur données déclaratives seules. Il perd la finesse (pas d'ACWR sans historique) mais **produit toujours un plan**. C'est la ligne de fond du produit : le moteur ne dépend d'aucune API tierce pour fonctionner.

### B — Couche conversationnelle LLM

**Nature** : appel à API Anthropic. Sorties non déterministes. Tool use.

**Domaine :**
- Restitution des sorties moteur en langage naturel adapté à l'athlète.
- Réponse aux questions ouvertes (« pourquoi cette séance ? », « je suis fatigué, on adapte comment ? »).
- Pédagogie sur les principes d'entraînement.
- Reformulation, empathie, cadrage.

**Non-domaine** :
- Le LLM ne calcule **pas** la charge.
- Le LLM ne décide **pas** de la progression.
- Le LLM ne modifie **pas** un plan sans passer par un outil qui appelle le moteur.
- Le LLM ne produit **pas** de conseil chiffré nutritionnel, de poids, ni de restriction (garde-fous CLAUDE.md).

**Inputs autorisés** : contexte pré-calculé et budgeté (2–4 k tokens) issu de sources **explicitement autorisant l'usage IA sous leurs conditions** — actuellement : `garmin`, `polar`, `suunto`, `wahoo`, `healthkit`, `health_connect`, `fit_upload`, `manual`, `strava_bulk_export`. **Jamais** `strava_api`, garanti par l'isolation schéma (voir `02-modele-donnees.md`, §4 et §7).

**Sub-processor** : Anthropic est déclaré comme sous-traitant dans la privacy policy Cairn. Consentement explicite obtenu au premier usage IA (bandeau AI Act). Retrait facile (paramètres).

---

## 2. Contrat d'interface A ↔ B

L'interface est **explicite, typée, et blocante**. Aucun composant B ne peut lire directement une table ; toute lecture passe par un outil scopé côté serveur (Anthropic tool use).

### 2.1 Ce qui traverse (A → contexte LLM)

Champs autorisés dans le contexte coach (pré-calculé, budgété) :

| Catégorie | Champ | Type / dérivation | Autorisé ? |
|---|---|---|:-:|
| Identité athlète | prénom, VMA déclarée, seuil déclaré, objectif | Déclaratif | ✅ |
| Charge | `weekly_load`, `acwr`, tendance 4 semaines | Dérivé moteur | ✅ |
| Fatigue | `fatigue_flag` (vert/orange/rouge) | Dérivé, jamais numérique brut | ✅ |
| Dernières séances | 3 à 5 dernières activités : type, durée, D+, RPE, statut plan | Depuis `public.activities`, source ≠ `strava_api` | ✅ |
| Plan | prochaines séances (7 j), différentiels récents | Depuis `plan` | ✅ |
| Fueling | état vert/orange/rouge, jamais grammage brut du modèle vers l'utilisateur (le grammage vient des recommandations rules-based) | Dérivé rules-based | ✅ (état seulement) |

### 2.2 Ce qui est bloqué (A ne fournit jamais à B)

| Interdit | Raison |
|---|---|
| Toute ligne `strava_api` | Isolation schéma + role permission (§7 du 02-modele-donnees) |
| Séries brutes de FC (streams 1 Hz) | Règle CLAUDE.md — « valeurs dérivées uniquement — jamais de série brute » |
| Poids, IMC, calories | N'existent pas au schéma (règle santé §1) |
| Tokens OAuth, secrets | Jamais transmis au modèle |
| Emails, identifiants brut d'utilisateurs autres | Silo tenant, isolation RLS |

### 2.3 Garantie technique du blocage

Trois lignes de défense :
1. **Schéma** : le rôle `ai_context_reader` (utilisé par `lib/ai/context.ts`) n'a `SELECT` que sur les colonnes/tables autorisées. Une tentative de lire `activity_streams.hr_series` renvoie `permission denied`.
2. **Fonction de contexte** : `buildCoachContext(userId)` retourne un DTO typé. Aucun champ hors DTO ne peut passer.
3. **Outils IA** : les tools exposés au modèle sont pré-scopés serveur (règle CLAUDE.md — `tenant_id` jamais paramètre modèle). Chaque tool ne peut retourner qu'un DTO explicite. Tenter d'accéder à `strava_cache.*` renvoie erreur permission.

Le blocage n'est pas une politique de code review — c'est un invariant testable (voir §7 du 02-modele-donnees).

---

## 3. Question critique : un moteur rules-based est-il une « AI Application » au sens §5.3 Strava ?

### 3.1 Le texte

Formulation restituée dans le brief (à revérifier contre le texte primaire live avant tout engagement) :

> §5.3 : interdiction d'utiliser les données Strava, directement ou indirectement, en lien avec le développement, l'entraînement, l'évaluation **ou le fonctionnement** de toute AI Application. Couvre explicitement : fine-tuning, grounding, embeddings, RAG, et « ingestion dans une fenêtre de contexte ou une mémoire de travail ».

### 3.2 Lecture 1 — Lecture stricte (défavorable)

Une « AI Application » inclurait tout système d'aide à la décision automatisé, y compris rules-based, dès lors qu'il est présenté comme « intelligent » ou « adaptatif ». La note du brief précise que Strava a « prohibé » l'usage IA de manière plus explicite ; le durcissement viserait toute forme d'automatisation informant l'utilisateur.

Dans cette lecture : un moteur d'ACWR **est** une AI Application au sens §5.3 dès lors que ses sorties nourrissent une expérience marketée comme IA.

**Confiance dans cette lecture** : moyenne. C'est l'interprétation la plus prudente — donc celle qu'un legal counsel adverse porterait.

### 3.3 Lecture 2 — Lecture littérale (favorable)

Le texte §5.3 énumère explicitement des techniques : *fine-tuning, grounding, embeddings, RAG, ingestion dans une fenêtre de contexte ou une mémoire de travail*. Aucune de ces techniques ne s'applique à un moteur rules-based. Un `if x > threshold then flag = orange` n'a ni fenêtre de contexte, ni embedding, ni fine-tuning. La liste est fermée par usage (aucune formulation « incluant sans s'y limiter »… à vérifier sur texte primaire).

Dans cette lecture : le moteur déterministe n'est pas visé, seule la couche LLM l'est.

**Confiance dans cette lecture** : faible-moyenne. Elle repose sur l'énumération exhaustive du texte, ce qui doit être vérifié mot à mot.

### 3.4 Position retenue pour Cairn

**On ne demande pas au moteur de nous sauver.** L'isolation Strava est de toute façon obligatoire pour survivre à §5.4 (analytics) et §6.2 (rétention 7 j). Même en lecture 2 favorable, la donnée Strava API ne peut pas alimenter le moteur car elle ne peut pas être conservée > 7 jours ni agrégée. Le débat sur §5.3 sur le moteur est **théorique** :

- La donnée Strava API n'entre jamais dans le moteur (rejetée par §5.4 et §6.2).
- La donnée Strava API n'entre jamais dans le LLM (§5.3, sans ambiguïté).
- Le moteur peut fonctionner sur toutes les autres sources sans risque §5.3.

**Conclusion pratique** : la question « le moteur est-il une AI App » **ne se pose plus** dans notre architecture, parce que Strava est déjà exclu pour d'autres raisons. Elle **redeviendrait** cruciale si demain on envisageait de réintroduire Strava. Ce serait alors le facteur bloquant. C'est un point à réévaluer à chaque changement de posture Strava.

**Degré d'incertitude assumé** : cette conclusion est robuste **à condition que** le PRD renonce définitivement à faire remonter des activités Strava dans l'expérience principale. Si un jour on veut « faire apparaître les activités Strava dans le feed principal », on rentre dans le débat.

---

## 4. Ce que le moteur reçoit du monde extérieur — schéma

```
       [ Sources autorisées : garmin, polar, suunto, wahoo, healthkit,
         health_connect, fit_upload, manual, strava_bulk_export ]
                              │
                              ▼
                    ┌──────────────────────┐
                    │  public.activities   │
                    │  public.activity_*   │  ← RLS tenant + source-based check
                    └──────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │  MOTEUR DÉTERMINISTE │
                    │  - ACWR              │
                    │  - Périodisation     │
                    │  - Adaptation plan   │
                    │  Sorties JSON        │
                    └──────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
        [ public.plan ]      [ public.derived_metrics ]
        Écritures moteur     weekly_load, acwr, fatigue_flag
                    │                   │
                    └─────────┬─────────┘
                              ▼
                    ┌──────────────────────┐
                    │ buildCoachContext()  │
                    │  DTO typé, 2-4k tok  │
                    └──────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │ COUCHE LLM (Anthropic)│
                    │  restitution, réponse │
                    │  tools: get_recent_activities, get_plan_diff, propose_plan_change
                    └──────────────────────┘

[ strava_cache.*  ]  ─── AUCUN flèche ni vers moteur, ni vers contexte LLM
                       expires_at ≤ 7j, purge quotidienne
                       affiché en UI cloisonné ("intégration Strava",
                       lecture seule, hors coaching)
```

---

## 5. Cas particulier : la donnée déclarative reste reine

Le moteur doit pouvoir fonctionner **sans aucune synchro active**. C'est un exercice de validation, pas juste un fallback :

- Une personne s'inscrit, déclare son objectif (ex : 50 km / 2500 D+ dans 12 semaines), sa VMA estimée, ses contraintes (mardi/jeudi club). Le moteur produit un plan complet.
- Elle finit sa première séance, la saisit en `manual` (durée, RPE, ressenti). Le moteur ajuste.
- Elle finit par uploader un FIT ou brancher Garmin — le moteur bascule sur des dérivés plus fins (charge réelle, ACWR).

Ce chemin doit rester praticable de bout en bout, à toute étape. C'est **le vrai test de robustesse** : si le moteur ne tourne qu'avec Garmin, ce n'est pas un moteur, c'est un frontend.

---

## 6. Journalisation IA (obligation contrat + observabilité produit)

Toute session LLM produit une trace :
- `session_id`, `user_id`, `timestamp`.
- Contexte transmis (hashé, pas stocké verbatim en clair côté logs).
- Tools appelés et arguments.
- Tokens in/out (compteur produit, cf. Chantiers en cours — coût IA).
- Réponse.
- Sources ayant contribué au contexte (`derived_from_sources`) — permet de prouver a posteriori qu'aucune session n'a été alimentée par `strava_api`.

Toute écriture LLM sur le plan passe par `plan_revisions` (`author = 'ai'`, `session_id`, diff). Règle CLAUDE.md déjà en place.
