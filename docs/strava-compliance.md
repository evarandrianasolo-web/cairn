# Compliance Strava API — Cairn

> Statut : **🔴 blocker P0**. Aucune ouverture publique tant que non résolu.
> Dernière mise à jour : 26/07/2026.

## Constat

L'analyse des Terms Strava en vigueur depuis le 01/06/2026 montre que
l'architecture actuelle de Cairn (SaaS coach IA payant assis sur l'API
Strava) est **structurellement incompatible** avec quatre clauses :

| Clause | Contenu | Violation Cairn |
|---|---|---|
| **§5.3** | Interdiction d'utiliser les données Strava en lien avec le fonctionnement d'une AI Application (fine-tuning, grounding, embeddings, RAG, fenêtre de contexte, mémoire de travail). | `lib/ai/context.ts` envoie systématiquement les 12 dernières semaines d'activités + les 10 dernières séances détaillées à Anthropic à chaque appel coach. Le tool `get_activity_detail` renvoie l'activité brute au modèle. |
| **§5.4** | Interdiction d'analyser ou d'agréger les données Strava (analytics, insights, amélioration produit). Interdiction de combiner avec d'autres données. | `/dashboard` calcule charge hebdo 13 semaines, vitesse verticale, allures dérivées. `lib/paces.ts` extrait des références d'allures depuis l'historique. `lib/analytics/classify-session.ts` classe chaque séance. Toute la valeur produit repose là-dessus. |
| **§6.2** | Rétention en cache limitée à **7 jours**. | Les tables `activities`, `activity_laps`, `activity_health` stockent depuis la première synchro (24+ mois sur le compte Eva). Aucun TTL. |
| **§5.5** | Interdiction d'accumuler dans un dataset, une base, un vector store, un index. | Toute notre base est un dataset Strava. |

## Zones d'exposition additionnelles

- **§5.8** — la monétisation SaaS coach IA se situe dans la zone grise
  "fonctionnalité que Strava ne fournit pas" vs "duplication substantielle".
  Le rachat de Runna par Strava (avril 2025) pousse vers la lecture "duplication".
- **§5.10** — envoi de données Strava à Anthropic pour analyse IA, même avec
  consentement utilisateur, est explicitement interdit.
- **§6.1** — carve-out ambigu pour les apps ≤ 9 999 athlètes ; au-delà,
  seul l'utilisateur peut voir ses données.
- **§2.1** — Strava peut révoquer l'API Token **à tout moment sans préavis
  ni compensation**. Pour un SaaS payant : coupure d'API = arrêt de service
  immédiat, remboursements, churn, défaut contractuel.

## Options architecturales

### Option A — Pivot socle vers Garmin Health API + Coros (recommandé)

- Garmin domine le trail français (fenix, forerunner, epix).
- Coros deuxième force du segment trail.
- Conditions Garmin Health API : rétention étendue autorisée, analyse
  et IA généralement permises (à confirmer par lecture officielle).
- **Coût** : ~3 mois de refonte data layer, perte du one-click Strava au
  signup (compensée par le flux natif montre → app).
- **Bénéfice** : plateforme viable long-terme, monétisation propre.

### Option B — Multi-source, Strava en connecteur d'onboarding uniquement

- Strava = importer optionnel au signup, TTL 7 jours strictement respecté
  côté DB (colonne `deleted_at` + cron de purge).
- Socle réel = Garmin/Coros/fichiers FIT uploadés.
- Toute analyse et LLM = uniquement sur données non-Strava.
- **Complexité** : deux data paths à maintenir, gating strict sur la
  provenance de chaque champ.

### Option C — Archive utilisateur (§6.6)

- L'utilisateur télécharge son export Strava ZIP (Bulk Data Export Tool)
  et l'upload dans Cairn.
- Hors périmètre API Policy — juridiquement propre.
- **UX pénible** : chaque nouvel utilisateur doit exporter manuellement.
  Bon fallback, mauvais canal principal d'acquisition.

### Option D — Statu quo, prendre le risque

- Comme Borner (autre acteur français trail, même architecture).
- Texte de juin 2026, pas de jurisprudence.
- **Risque existentiel** : révocation API = arrêt de service. À exclure
  pour un SaaS payant naissant.

## Actions immédiates

- [ ] **Envoyer le mail à `developers@strava.com`** — voir
      `docs/strava-mail-clarification.md`. Une réponse écrite, même
      partielle, vaut mieux que l'interprétation d'un texte flou.
- [ ] **Ne PAS activer Paddle / l'abonnement** tant que l'architecture
      n'est pas décidée. Écran `/settings/abonnement` déjà bloqué.
- [ ] **Audit Garmin Health API** : postuler au programme développeur,
      lire les Terms complets (rétention, analyse, IA, monétisation),
      couverture des données (D+/D-/HR par lap ?).
- [ ] **Audit Coros Open API** : idem, priorité couverture trail.
- [ ] **Prototype `SportProvider` interface** dans `lib/providers/` —
      décorréler la logique produit de la source data, sans casser
      le dogfood actuel.

## Décision-log

_(à compléter au fil des décisions et clarifications reçues)_

| Date | Décision / info | Auteur | Source |
|---|---|---|---|
| 26/07/2026 | Constat de non-conformité §5.3/§5.4/§6.2/§5.5. Blocker P0. Aucune ouverture publique. | Eva + Claude | Analyse Terms 01/06/2026 |
