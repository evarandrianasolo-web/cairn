# ADR-001 — Choix du socle de données Cairn

- **Statut** : Proposé — à valider par relecture juridique et test COROS/Suunto
- **Date** : 26/07/2026
- **Auteurs** : Claude (assistant IA) sous supervision Eva
- **Contexte** : `BRIEF-strava-architecture-alternative.md`, docs `01` à `05`

---

## Contexte

Le socle initial envisagé — Strava API — s'est révélé incompatible avec la proposition de valeur Cairn (plan adaptatif + analyse IA + monétisation) à cause des clauses §5.3 (IA), §5.4 (analytics), §6.2 (rétention 7 j), §5.5 (base de données) et §6.1 (partage tiers) des Terms Strava effectifs au 01/06/2026. Ces clauses sont **structurelles**, non contournables par le design.

Cairn a besoin d'un socle qui autorise **au minimum** : rétention longue (12 mois +), analytics et calcul de charge, transmission dérivée à un LLM tiers, monétisation d'un SaaS payant. Sans ces droits, il n'y a pas de produit.

---

## Décision

**Retenir Garmin Connect Developer Program comme socle primaire, avec plusieurs constructeurs en complément et upload FIT/GPX/TCX comme fallback universel.**

Concrètement :

1. **Socle primaire** : **Garmin Connect Developer Program** (Activity API, et Health API si consentement santé actif). Rationale texte contractuel : Garmin traite l'usage IA par une clause de **transparence + consentement explicite** (extrait restitué : *« if End User Data will be used for training with or processing by artificial intelligence, licensees must include a conspicuous AI transparency statement in their privacy policy... »*), n'impose pas de rétention plafonnée à N jours, ne prohibe pas l'analytics, et est explicitement destiné à un **usage business**.

2. **Socles secondaires** :
   - **Polar AccessLink** — pour les athlètes Polar. À combiner avec un import FIT initial car la fenêtre d'historique API Polar est courte.
   - **Suunto Cloud API** — après signature de l'API agreement fourni par Suunto post-application.
   - **Wahoo Cloud API** — après clarification de la clause « no charge for API access » (voir `QUESTIONS-OUVERTES.md`).
   - **Apple HealthKit** — pour utilisateurs Apple Watch, dans le cadre des Guidelines §5.1.3 (usage « health management » explicitement autorisé).
   - **Android Health Connect** — symétrique côté Android, use case « Fitness & Wellness » explicitement éligible.

3. **Fallback universel** : **Upload FIT / GPX / TCX** par l'utilisateur. Zéro dépendance plateforme. Ce chemin doit exister à chaque étape du produit.

4. **COROS** : **désactivé à date** en tant que socle contractuel — aucun texte primaire lu, portail développeur inaccessible publiquement, retour de support COROS explicite « we are unable to offer API access to all parties who apply ». Les athlètes COROS passent par upload FIT. À réévaluer si COROS ouvre son portail ou accepte notre application.

5. **Agrégateurs (Terra, Vital, Rook)** : **écartés** comme solution de conformité. Ils reportent la question sur le contrat amont sans absorber les contraintes. Réévaluation possible plus tard sur pur ROI temps-dev, sans changement du régime juridique de chaque source.

6. **Strava** : **exclu du socle**. Voies de coexistence acceptables :
   - **Pattern flux inversé (doc 04, Option A)** : Cairn pousse les workouts vers la montre ; la montre → Strava est configurée nativement par l'utilisateur. Cairn n'utilise **pas** l'API Strava.
   - **Import Bulk Data Export §6.6** : utilisateur télécharge son archive Strava, la dépose dans Cairn → traité comme un FIT upload, tracé `strava_bulk_export`.
   - **API Strava en lecture** : *interdite* dans l'architecture Cairn. Le schéma `strava_cache` reste **prévu** dans le modèle pour l'hypothèse future d'un pont limité contractualisé (Extended Access négocié, ou changement de policy), mais **n'est pas peuplé** en production.

---

## Alternatives considérées et rejetées

### Alt 1 — Strava socle, moteur cloisonné
Rejetée : incompatible avec §6.2 (7 j de rétention) — un moteur ACWR nécessite 4 à 12 semaines d'historique. Non contournable.

### Alt 2 — FIT upload uniquement, aucun OAuth constructeur
Faisable et robuste, mais UX trop lourde pour un produit qui vise l'utilisateur mainstream trail. Assumée comme fallback, pas comme socle.

### Alt 3 — Agrégateur (Terra) comme socle
Rejetée : Terra transmet les contraintes contractuelles amont sans les absorber. On paye 399 €/mois pour la même exposition juridique, avec en plus la dépendance à un intermédiaire supplémentaire (RO Terra + RO Garmin).

### Alt 4 — COROS socle primaire
Non retenue : impossible d'évaluer un contrat qu'on ne peut pas lire. Serait décidable si COROS répond positivement à notre application.

### Alt 5 — Renoncer à l'IA conversationnelle et bâtir sur Strava
Sortie de scope produit : le coach IA est un pilier de la proposition de valeur Cairn. Rejeter cet axe = redéfinir le produit.

---

## Conséquences

### Positives
- Le produit peut délivrer plan adaptatif + IA + monétisation sur un socle dont **le texte primaire lu autorise ces usages** (Garmin), et sans dépendance structurelle Strava.
- Le flux inversé permet de conserver la valeur sociale Strava pour l'utilisateur sans exposer Cairn à l'API Policy.
- Si Garmin coupe demain, la bascule HealthKit/Health Connect + FIT upload maintient le service.
- Le cloisonnement schéma-niveau permet d'introduire Strava plus tard (Bulk Export, ou pont limité) sans casser l'architecture.

### Négatives et contraintes assumées
- **Perte du one-click Strava à l'onboarding.** Compensée par un onboarding en trois chemins (voir `05-ux-et-monetisation.md`). Impact funnel à instrumenter.
- **Utilisateurs COROS** doivent passer par upload FIT jusqu'à changement du programme partenaire — friction UX réelle sur un segment trail non négligeable.
- **Coût production Health API Garmin** rapporté à 5 k$ (source tierce non confirmée) — à budgétiser.
- **Charge d'intégration multi-constructeur** (5 OAuth : Garmin, Polar, Suunto, Wahoo, +HealthKit/Health Connect) vs. un seul OAuth Strava. Coût dev réel.
- **Silences contractuels** chez Polar, Suunto, Wahoo (rien de spécifique sur IA) : à interpréter prudemment, à clarifier par écrit avant d'ingérer massivement.

### Risques résiduels
- **RC Garmin faible** — sous réserve de validation du texte PDF en clair.
- **RC Polar/Suunto/Wahoo moyen** — les silences sur l'IA en 2026 peuvent être interprétés à charge en cas d'audit.
- **RO élevé partout** — comme sur toute API tierce. Traité par architecture push-only vers ces sources (pas d'OAuth destructeur) et par le fallback FIT.
- **Interprétation §6.6 Strava (Bulk Export)** non tranchée juridiquement.

---

## Ce qui doit être fait avant d'appliquer cette décision

Voir `QUESTIONS-OUVERTES.md`. Prérequis bloquants pour le go/no-go :

1. **Extraire et relire ligne à ligne** le Garmin Developer Program Agreement PDF en clair — la lecture actuelle est reconstituée depuis les moteurs de recherche.
2. **Postuler et lire** les contrats Suunto, Wahoo, Polar dans leur intégralité (Polar déjà lu, Suunto & Wahoo → oui pour Wahoo dans FR-EU, mais lecture prudente à faire ligne à ligne).
3. **Postuler à COROS** et voir si le contrat existe pour Cairn.
4. **Faire relire l'ensemble par un avocat tech** (droit du numérique + RGPD) avant commercialisation.
5. **Écrire à developers@strava.com** comme documenté dans le brief — pour disposer d'une réponse écrite Strava sur le cas d'usage Cairn, même partielle.

---

## Révision

Cette ADR sera **révisée** :
- À la première réponse écrite d'un constructeur clarifiant un silence (IA chez Polar/Suunto/Wahoo).
- À toute nouvelle version publiée du Garmin Agreement ou de la Strava API Policy.
- Si COROS ouvre son programme partenaire à Cairn.
- Si le PRD ou une décision produit change la posture Strava (ex : revenir sur le regret UX « voir mes activités Strava » deviendrait une décision produit à re-arbitrer sous cet ADR).
