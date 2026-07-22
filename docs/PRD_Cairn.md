# PRD — Cairn (nom de travail)

*Coach trail IA : un seul endroit pour tes données, tes objectifs, tes contraintes et ton plan.*

| Version | 0.3 — Draft |
|---|---|
| Date | 22/07/2026 |
| Statut | Draft — décisions §13 partiellement tranchées |
| Commanditaire | Eva N. |
| Source | 6 mois d'usage réel du triptyque Claude + Strava + Notion (avr.→juil. 2026) |

> **Changements v0.1 → v0.2**
> 1. **Multi-tenant natif** : le SaaS est l'objectif, l'architecture est isolée par tenant dès la première ligne de code.
> 2. **Le suivi de poids sort du périmètre**, remplacé par un module **Fueling & disponibilité énergétique** (§5.2).
> 3. **Consentement granulaire et contextuel** pour la FC — pas de case à l'inscription (§6).
> 4. Ajout de la **gouvernance RGPD** : AIPD, registre, rôles responsable/sous-traitant (§6.4).
>
> **Changements v0.2 → v0.3**
> 5. Nouvelle section **§14 — Conformité & jalons administratifs** : ce qui se déclenche à quel moment, du dogfood à l'ouverture payante.
> 6. Ajout de l'**AI Act (art. 50)** aux contraintes produit — échéance 2 août 2026, impacte directement l'UI du chat coach.

---

## 1. Contexte & Objectif

### 1.1 Contexte

Le produit ne part pas d'une idée : il part d'un **workflow qui fonctionne déjà**, mais qui est éclaté sur trois outils.

| Étape | Outil | Friction |
|---|---|---|
| Les séances remontent automatiquement | Strava | ✅ aucune |
| Objectifs, courses, contraintes, planning hebdo, journal, banque de séances | Notion | Saisie 100 % manuelle, tables qui se désynchronisent |
| Analyse, construction du plan, réajustement | Chat IA | Contexte à réexpliquer, re-fetch Strava puis Notion à chaque conversation, puis réécriture manuelle |
| Tableau de bord | HTML généré à la main | Figé dès qu'une donnée bouge |

Le coût réel n'est pas le temps de saisie : c'est que **le plan diverge du réel**. Une séance ajoutée à midi, un déplacement pro, une semaine avec les enfants, une course annulée pour canicule — et le planning ment jusqu'à la prochaine conversation.

### 1.2 Vision du produit

> Une application qui connaît ton historique d'entraînement, tes objectifs, tes contraintes de vie et ton état de forme — et avec laquelle tu **discutes** pour analyser, planifier et réajuster, sans jamais ouvrir un autre onglet.

Le cœur du produit n'est pas le plan (tout le monde en vend). C'est **la boucle d'adaptation** : réel → écart → réajustement → plan à jour, en continu, avec des contraintes que le marché ignore (garde alternée, séances club imposées, déplacements pro, chaleur, blocs rando).

### 1.3 Ce que ce produit N'EST PAS

- ❌ Un traqueur d'activité — Strava/Garmin restent la source de vérité brute.
- ❌ Un réseau social sportif.
- ❌ Un dispositif médical ni un outil de diagnostic.
- ❌ **Un outil de gestion du poids ou de suivi alimentaire.** Décision structurante, voir §5.2.
- ❌ Un remplaçant du coach humain ou du club.
- ❌ Un générateur de plan statique qu'on imprime et qu'on suit à la lettre.

### 1.4 Stratégie de version

**Décision tranchée : la cible est un SaaS.** L'architecture est donc multi-tenant dès le départ. En revanche, le *produit* multi-utilisateurs (facturation, support, onboarding public) ne se construit qu'après validation.

| Phase | Utilisateurs | Objectif de la phase |
|---|---|---|
| **V1 — Dogfood** | 1 (Eva) | Prouver que le plan tient sans humain dans la boucle. Architecture multi-tenant, produit mono-utilisateur. |
| **V1.5 — Beta fermée** | 10 – 20 invités | Valider que la valeur existe hors du cas d'origine. Auth + onboarding réels, pas de facturation. |
| **V2 — SaaS** | Public | Facturation, support, conformité complète. |

**Ce qui est multi-tenant dès la V1 :** `tenant_id` sur toutes les tables, RLS Postgres active, scoping serveur systématique — **y compris sur les outils appelés par l'IA**, jamais via un paramètre fourni par le modèle. Rétrofitter l'isolation après coup est une réécriture ; la poser dès le départ coûte quelques heures.

**Ce qui attend :** facturation, gestion d'équipes, rôles, back-office admin, i18n.

### 1.5 Périmètre V1

| ✅ Inclus V1 | ❌ Hors scope V1 |
|---|---|
| Sync Strava automatique (activités, zones, matériel) | Facturation, plans tarifaires |
| Objectifs & courses | Import Garmin / Suunto / Polar directs |
| Contraintes récurrentes + ponctuelles | Application mobile native (PWA suffit) |
| Planning hebdo généré + réajustable | Notifications push |
| Chat coach avec contexte injecté | Partage du plan avec un coach tiers |
| Dashboard (charge, allures, axes, compte à rebours) | Analyse de flux GPS détaillés |
| Module course (pacing, fueling, matériel) | Communauté, comparaison entre athlètes |
| **Module Fueling** (§5.2) | **Suivi de poids, IMC, calories** |
| Débrief post-course → axes de travail | Suivi du cycle menstruel (V2, opt-in isolé) |
| Import Notion à l'onboarding | |

---

## 2. Volumétrie & Contraintes techniques

### 2.1 Volumétrie

| Indicateur | V1 | Beta | Cible SaaS 12 mois |
|---|---|---|---|
| Tenants actifs | 1 | 10 – 20 | 200 – 2 000 |
| Activités importées / utilisateur / an | ~350 | idem | idem |
| Messages de chat / utilisateur / semaine | 10 – 40 | 5 – 20 | 5 – 20 |
| Coût IA / utilisateur / mois | — | à mesurer | **poste qui décide du pricing** |
| Fraîcheur de la donnée Strava | < 15 min | < 15 min | < 5 min (webhook) |

### 2.2 Stack technique *(proposition — arbitrage build en §13)*

| Couche | Techno proposée | Pourquoi |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind, PWA | Dashboard + chat dans la même app, installable |
| Backend | Routes API Next.js / Edge functions | Pas de service séparé avant la V2 |
| Base de données | Supabase (Postgres) + **RLS active dès la V1** | Auth + DB + storage, isolation multi-tenant native |
| Auth | Supabase Auth + OAuth Strava | Le login Strava est de toute façon requis |
| IA | API Anthropic (Claude), *tool use* scopé serveur | Le coach doit pouvoir lire ET écrire le plan |
| Hébergement | Vercel + Supabase, **régions UE** | Contrainte RGPD, pas un détail |
| Intégrations | Strava API (OAuth2 + webhooks) | Source unique de la donnée d'entraînement |

### 2.3 Contraintes techniques structurantes

1. **Quotas Strava.** API limitée, conditions d'usage restrictives sur le stockage et l'affichage. → sync incrémentale, cache local, jamais de re-fetch complet. **Relire les conditions commerciales avant toute ouverture payante.**
2. **Coût des tokens IA.** Injecter 6 mois d'activités par message est intenable. → contexte résumé pré-calculé (§3.4), détail chargé à la demande.
3. **Données de santé.** FC et signaux de fueling relèvent probablement de l'art. 9 RGPD. → chiffrement au repos, hébergement UE, consentement granulaire, export et effacement effectifs.
4. **Écriture par l'IA.** Toute modification du plan est journalisée, versionnée, réversible.
5. **Isolation jusqu'à la couche IA.** Chaque outil exposé au modèle reçoit le `tenant_id` **du contexte serveur authentifié**, jamais du modèle. Une fuite inter-tenant sur des données de santé est un incident à notifier.

---

## 3. Modèle métier & entités

### 3.1 Entités principales

| Entité | Définition | Particularités |
|---|---|---|
| **Tenant / Athlete** | Compte + profil : zones, allures calibrées, matériel, préférences, consentements | Racine de l'isolation. Les allures se recalibrent depuis les courses réelles |
| **Activity** | Séance réalisée, importée de Strava | Distance, D+, temps, cadence, effort relatif, titre + description (le texte libre porte l'info de ressenti) |
| **ActivityHealth** | **Table séparée** : FC moyenne/max, dérive | Isolée, RLS stricte, logs d'accès dédiés, écrite **seulement si consentement** |
| **Race** *(objectif)* | Date, distance, D+, priorité A/B/C, objectif temps, statut, résultat | La priorité structure toute la périodisation |
| **Constraint** | Récurrente (garde alternée, club mardi/jeudi) ou ponctuelle (déplacement, vacances, canicule, blessure) | Le différenciateur produit |
| **PlanWeek** | Semaine de plan (numérotation ISO) + phase | base / spécifique / choc / affûtage / récup |
| **PlannedSession** | Séance prévue : type, cible, intention | Se matche avec une Activity |
| **SessionTemplate** | Banque de séances types | Calibrée sur les zones de l'athlète |
| **FuelingLog** | Ce qui a été ingéré sur une séance longue ou une course | Voir §5.2 — **aucune donnée calorique, aucun poids** |
| **Debrief** | Analyse post-course structurée | Produit les axes de travail du bloc suivant |
| **CoachThread** | Conversation persistante avec le coach | Accès aux entités via outils scopés |
| **ConsentRecord** | Journal des consentements | Horodatage, portée, version du texte affiché, retrait |
| **PlanRevision** | Historique versionné des modifications du plan | Déclencheur, diff, auteur (user / IA), annulable |

### 3.2 Règles métier — matching & réajustement

**Matching plan ↔ réel**
- Rapprochement automatique : même jour ±1, type compatible, écart de volume < 40 %.
- Statuts : `prévue` → `réalisée` / `modifiée` / `manquée` / `remplacée`.
- Activity sans PlannedSession = **séance ajoutée** → proposition de réajustement.

**Déclencheurs de réajustement**

| Déclencheur | Réaction attendue |
|---|---|
| Séance ajoutée hors plan | Alléger ou supprimer une séance à venir de même filière |
| Séance manquée | Arbitrer selon la proximité de la course — ne jamais rattraper mécaniquement |
| Nouvelle contrainte | Redistribuer la semaine, pas seulement décaler |
| Nouvelle course ajoutée | Recalculer la périodisation en aval |
| Charge aiguë/chronique > seuil | Proposer une décharge |
| **Signaux de sous-carburant** | Alléger la charge **et** proposer une action de fueling (§5.2) |

**Périodisation**
- Rétroplanning depuis la course A. Phases : base → spécifique → choc → affûtage → course → récup.
- Semaines ISO paires (sans enfants) = sorties longues et week-ends chocs. Semaines impaires resserrées.
- Mardis/jeudis **pré-occupés** par le club : le coach adapte l'intention de la séance club, il n'en ajoute pas une concurrente.

### 3.3 Règles métier — santé *(codées dans la couche métier, pas dans le prompt)*

Un modèle se contourne par la conversation. Ces règles sont donc **applicatives** et non négociables :

1. Le système ne stocke, ne calcule et n'affiche **aucun poids, IMC, masse grasse, ni valeur calorique**.
2. Aucune sortie du module Fueling ne peut être une **restriction**. Toute recommandation est additive (§5.2).
3. Le coach n'initie jamais une conversation sur le corps ou l'apparence.
4. Toute demande de conseil médical, de plan alimentaire chiffré ou d'objectif de poids → refus explicite + orientation professionnelle.
5. Signalement de douleur ou de blessure → allègement + orientation, **jamais** de diagnostic.
6. Détection de signaux de faible disponibilité énergétique → passage en état « signaux détectés », allègement de charge, orientation vers un diététicien du sport.

### 3.4 Contexte coach (pré-calculé)

À chaque message, le coach reçoit un **résumé structuré** (~2–4 k tokens), jamais la donnée brute :

```
profil (zones, allures, matériel, consentements actifs)
+ 12 dernières semaines agrégées (km, D+, effort, répartition)
+ 10 dernières séances détaillées
+ courses à venir (date, D+, priorité, objectif) + J-X
+ contraintes actives sur 4 semaines
+ axes de travail du dernier débrief
+ plan semaine courante + suivante
+ état fueling DÉRIVÉ (3 états, jamais de valeurs brutes)
```

Le reste est accessible **à la demande** via des outils scopés au tenant.

> **Règle de minimisation :** ce qui n'est pas nécessaire au raisonnement du coach ne sort pas de la base. Les données de santé sont transmises sous forme dérivée (tendance, drapeau), jamais en série brute. Réduit la surface juridique **et** le coût en tokens.

---

## 4. Intégrations & APIs

### 4.1 Strava *(critique — V1)*
- **OAuth2** à l'onboarding, scopes lecture.
- **Webhook** sur création/mise à jour d'activité → import quasi temps réel. Fallback polling 15 min.
- Import : activités, zones, matériel (usure des chaussures), profil.
- Champs à ne pas négliger : `description` et `name` (ressenti en texte libre), `relative_effort`, `cadence`.
- **FC filtrée à l'ingestion** si le consentement n'est pas actif — jamais écrite en base (§6.2).
- Écriture optionnelle (V1.5) : pousser titre/description de la séance planifiée sur l'activité réalisée.

### 4.2 Notion *(transitoire)*
- **Import unique** à l'onboarding : objectifs, planning, journal, banque de séances.
- Puis coupure. Un miroir en lecture reste possible mais n'est pas un objectif produit.

### 4.3 Météo *(V1.5)*
Prévisions sur les créneaux d'entraînement et le jour de course. La chaleur a déjà annulé une course et empêché de s'alimenter en course : c'est une variable de plan, pas un gadget.

### 4.4 Anthropic API
- Chat coach, génération de plan, débriefs, analyse fueling.
- *Tool use* avec scoping serveur et journalisation de chaque écriture.
- **Statut : sous-traitant.** Transfert hors UE à encadrer contractuellement et à mentionner dans l'AIPD (§6.4).

---

## 5. Profils utilisateurs & besoins fonctionnels

### 5.1 Profil principal — l'athlète d'endurance autonome

Coureur·se trail/ultra, 6–10 h/semaine, plusieurs courses par an dont un objectif majeur, entraîné·e en club mais **pilote de son propre plan**, avec des contraintes de vie fortes et non négociables.

#### Pages minimum attendues

| Page | Contenu |
|---|---|
| **Aujourd'hui** | Séance du jour + intention + ce qui a changé depuis hier |
| **Chat coach** | Conversation persistante, contexte injecté, capable de modifier le plan |
| **Planning** | Semaine/mois : prévu vs réalisé, phases, contraintes en surcouche |
| **Dashboard** | Charge hebdo (km + D+), répartition, allures calibrées, axes, compte à rebours |
| **Courses** | Liste + fiche course (pacing, plan de fueling, matériel, météo) + débrief |
| **Contraintes** | Récurrentes + ponctuelles, éditables en une ligne |
| **Fueling** | État, historique g/h sur les longues, progression |
| **Confidentialité** | Consentements, export, suppression (§6.2) |

#### Parcours clés

1. **Le matin** — la séance du jour et *pourquoi* elle est là. Un bouton « je ne peux pas, je suis en déplacement » → la semaine se réorganise, je valide.
2. **Après une séance** — elle remonte de Strava, se matche seule ; hors plan, le coach dit ce qu'il ajuste.
3. **Avant une course** — pacing, plan de fueling horaire, checklist matériel, protocole nitrates, météo.
4. **Après une course** — je dicte mon ressenti, le coach croise avec les données et **met à jour les axes** du bloc suivant.
5. **Une fois par mois** — « où j'en suis ? » → forces/faiblesses, évolution de charge, réalisme de l'objectif.

---

### 5.2 Module Fueling & disponibilité énergétique

> **Décision produit :** le suivi de poids est retiré du produit. Il n'est ni le différenciateur, ni ce qui déclenche un abonnement, et il concentre l'essentiel du risque produit, juridique et réputationnel — les athlètes d'endurance, en particulier les femmes, sont une population à risque documenté de RED-S et de troubles du comportement alimentaire.
>
> Il est remplacé par la **disponibilité énergétique**, qui est le vrai levier de performance, qui va dans le sens de la science du sport actuelle, et qui **ajoute** au lieu de restreindre.

#### 5.2.1 Ce qu'on ne fait pas

On ne calcule **pas** la disponibilité énergétique au sens strict — (apports − dépense) / masse maigre — malgré des seuils de référence connus (~45 kcal/kg MM/j optimal, < 30 zone à risque). Trois raisons rédhibitoires :

- Elle exige un **log calorique quotidien** — exactement le comportement qu'on veut éviter, réintroduit par la porte de service.
- Elle exige une **masse maigre fiable** (DXA), pas une balance à impédance.
- La sous-déclaration des apports est massive et documentée.

**Un chiffre faux sur un sujet sensible est pire que pas de chiffre.** Le concept guide le produit ; la formule n'entre pas dedans.

#### 5.2.2 Couche 1 — Comportement (déclaratif, ultra-léger)

Déclenché **uniquement** après une sortie longue ou une course. Dix secondes :

| Question | Format | Sortie |
|---|---|---|
| As-tu mangé pendant ? | Rien / un peu / régulièrement | — |
| Quoi, combien ? | Sélection rapide dans la bibliothèque perso (gel, compote, barre, boisson) | **g de glucides / heure** |
| As-tu pu manger, ou pas réussi ? | Deux causes distinctes | « oublié » ≠ « nausée » → réponses différentes |
| Mangé dans les 60–90 min après ? | Binaire | Fenêtre de récupération |

La bibliothèque stocke des **produits et des grammes de glucides**, jamais des calories. Repère de performance affiché : 60–90 g/h sur effort long, à construire progressivement — la tolérance digestive s'entraîne comme une filière.

#### 5.2.3 Couche 2 — Performance (mesurée, zéro saisie)

Signaux qui trahissent un sous-carburant **sans jamais parler de nourriture** :

| Signal | Source |
|---|---|
| Dérive allure/FC sur la seconde moitié des sorties longues | Calculé *(FC : si consentie)* |
| Km d'effondrement de l'allure — recule-t-il bloc après bloc ? | Calculé |
| Crampes récurrentes en fin d'effort | Déclaratif + texte libre Strava |
| FC de repos en hausse sur charge stable | Strava *(si consentie)* |
| Séances de qualité tronquées de façon répétée | Matching plan/réel |

#### 5.2.4 Couche 3 — Signaux d'alerte *(opt-in strict, V2)*

Fatigue persistante, sommeil dégradé, infections répétées, blessures osseuses de fatigue, irrégularité du cycle menstruel.

Le cycle est **l'indicateur le plus sensible** de faible disponibilité énergétique chez la femme — et la donnée la plus intime du produit. Donc : consentement séparé, table isolée, jamais affiché en tableau de bord, **jamais transmis au modèle autrement que sous forme de drapeau booléen dérivé**. Reporté en V2, à instruire avec un professionnel de santé.

#### 5.2.5 Restitution : trois états, pas de score

| État | Sens | Action |
|---|---|---|
| 🟢 **Bien carburé** | Apports cohérents avec la charge | Continuer |
| 🟡 **À surveiller** | Un ou plusieurs signaux | Recommandation additive ciblée |
| 🔴 **Signaux de sous-carburant** | Faisceau convergent | Allègement de charge + **orientation vers un diététicien du sport** |

**Pas de score sur 100.** Un score se gamifie, et un score de fueling qu'on chercherait à optimiser vers le bas est le scénario catastrophe du produit.

#### 5.2.6 Intégration dans les quatre moments

| Moment | Comportement |
|---|---|
| **Avant une sortie longue** | « 3 h prévues : vise ~60 g/h. Voilà ce qui a marché la dernière fois. » |
| **Après** | Les 3 questions, croisées avec la dérive observée |
| **Avant une course** | Plan de fueling horaire construit sur ce qui a été **réellement toléré à l'entraînement**, pas sur un modèle théorique |
| **Débrief de bloc** | « 42 g/h en moyenne sur les longues, dérive en hausse : le carburant est ton facteur limitant, pas l'entraînement. » |

#### 5.2.7 Règle d'or — additif, jamais soustractif

Toute recommandation **ajoute** : manger plus tôt, augmenter à 70 g/h, ajouter une collation post-séance, tester une boisson plus concentrée. Aucune sortie du système ne peut être une restriction. **Contrainte de la couche métier**, pas une consigne au modèle.

#### 5.2.8 Pourquoi c'est aussi le meilleur argument commercial

TrainingPeaks compte des TSS. Runna vend des plans. Les apps de nutrition comptent des calories dans une logique de perte de poids. **Personne ne traite le fueling de l'effort long** — alors que c'est le facteur limitant n°1 en ultra, que c'est mesurable, entraînable, et que les coureurs en parlent en permanence sans qu'aucun outil ne les aide. Différenciateur plus solide que le suivi de poids, sans le risque.

---

### 5.3 Profil V2 — le coach / club *(hors V1)*
Accès en lecture au plan et à la charge de ses athlètes, capacité à commenter ou verrouiller des séances. Ouvre un modèle B2B2C (clubs) probablement plus solide que le B2C pur. **Aucun accès aux données de santé** sans consentement spécifique de l'athlète.

---

## 6. Sécurité, santé & conformité

Section critique : le produit traite des données de santé et délivre des recommandations d'entraînement.

### 6.1 Principes

| Sujet | Règle |
|---|---|
| Minimisation | Ce qui n'est pas nécessaire au raisonnement du coach n'est pas collecté |
| Isolation | RLS Postgres dès la V1, `tenant_id` sur toutes les tables, scoping serveur **y compris pour les outils IA** |
| Données de santé | Tables séparées, chiffrement au repos, logs d'accès dédiés, hébergement UE |
| Tokens Strava | Chiffrés, jamais exposés côté client, révocation utilisateur |
| Écritures IA | Journalisées, versionnées, annulables |
| Périmètre du conseil | Entraînement uniquement. Aucun conseil médical, aucun plan alimentaire chiffré, aucun diagnostic |
| Mentions | CGU + disclaimer : outil d'aide à la décision, ne remplace ni médecin, ni diététicien, ni coach |

### 6.2 Consentement FC — contextuel, pas à l'inscription

**Décision : pas de case à l'inscription.** Trois raisons :

1. **Mauvais moment.** L'utilisateur ne sait pas encore ce que la FC lui apporte : il coche par défaut ou refuse par réflexe. Le consentement n'est alors ni éclairé, ni spécifique — les deux critères exigés pour les données de l'art. 9.
2. **Insuffisant techniquement.** L'OAuth Strava fait descendre la FC avec chaque activité. « Ne pas collecter » ≠ « masquer dans l'UI » : il faut **filtrer à l'ingestion**. Sinon la donnée est détenue, donc sous responsabilité.
3. **Consentement groupé.** Stocker, transmettre à un modèle hors UE, agréger : trois traitements distincts. Les regrouper sous une case n'est pas conforme.

**À la place — demande contextuelle, à la première activité importée avec cardio :**

> « Cette séance contient ta fréquence cardiaque. Si tu l'actives, je peux calibrer tes zones, détecter la dérive cardiaque sur tes sorties longues et t'alerter quand tu pars trop vite. Sinon je travaille sur l'allure et le dénivelé — un peu moins fin, mais ça fonctionne. »
>
> `Activer` · `Non merci` · `Plus tard`

**Trois consentements séparés, tous décochés par défaut** *(une case pré-cochée est illicite)* :

| Consentement | Défaut | Effet du refus |
|---|---|---|
| Stocker la FC | Non | Filtrée à l'ingestion, jamais écrite en base |
| L'utiliser dans l'analyse du coach IA | Non | Le coach reçoit allure / D+ / durée uniquement |
| Contribuer à des statistiques anonymisées | Non | Aucun impact utilisateur |

**Retrait effectif** : un bouton qui **purge réellement** les valeurs en base, pas un drapeau d'affichage.
**Journal de consentement** : horodatage, portée, version exacte du texte affiché. En cas de contrôle, la charge de la preuve du consentement pèse sur le responsable de traitement.

### 6.3 Mode dégradé — assumé et honnête

| Sans FC, on perd | Sans FC, on garde |
|---|---|
| Zones cardiaques | Allure, D+, durée, cadence |
| Dérive cardiaque | Charge en volume, matching plan/réel |
| Effort Relatif Strava (dérivé de la FC) | Périodisation, contraintes, fueling, coach |

Argument d'onboarding : **« l'app marche sans ton cardio, elle marche mieux avec »** — plus engageant qu'un mur de consentement.

### 6.4 Gouvernance RGPD

| Élément | Statut |
|---|---|
| Responsable de traitement | L'éditeur de Cairn |
| Sous-traitants | Hébergeur, Supabase, fournisseur IA (transfert hors UE à encadrer) |
| Base légale (données de santé) | Consentement explicite, art. 9.2.a |
| Registre des traitements | Obligatoire dès la beta ouverte |
| **AIPD** | **Probablement obligatoire** — cumul données sensibles + profilage automatisé + grande échelle. À conduire **avant** l'ouverture beta |
| Droits des personnes | Accès, rectification, effacement, portabilité — implémentés en self-service |
| Durée de conservation | À définir par catégorie de donnée |
| DPO | À évaluer (pas systématiquement obligatoire) |

> ⚠️ Ces éléments sont des repères, pas un avis juridique. **À faire valider par un juriste RGPD avant toute ouverture commerciale.**

---

## 7. Logs & traçabilité

| Catégorie | Événements | Données |
|---|---|---|
| Auth | Connexion, OAuth Strava, révocation | tenant_id, ts, IP |
| Sync | Import activité, échec, quota | activity_id, source, ts |
| Plan | Création, modification, réajustement auto | version, diff, déclencheur, auteur (user / IA) |
| IA | Requête, tokens, outils appelés, coût | thread_id, model, tokens_in/out, tenant_id |
| Consentement | Octroi, retrait, changement de portée | ts, version du texte, portée |
| Santé | Accès aux tables sensibles | **logs d'accès séparés**, valeurs jamais journalisées |

---

## 8. Reporting & exports

- Dashboard interactif (une V0 HTML existe et sert de maquette de référence).
- Export du plan : ICS, PDF, CSV.
- **Export RGPD** : archive complète des données du tenant, en un clic.
- Rapport de fin de cycle : charge réalisée vs prévue, progression des axes, bilan de course, progression fueling.

---

## 9. User stories — synthèse

| # | En tant que… | Je veux… | Priorité |
|---|---|---|---|
| 1 | athlète | que mes séances Strava arrivent seules | 🔴 V1 |
| 2 | athlète | voir la séance du jour et comprendre son intention | 🔴 V1 |
| 3 | athlète | dire « je ne peux pas mardi » et voir la semaine se réorganiser | 🔴 V1 |
| 4 | athlète | que mes contraintes récurrentes soient prises en compte sans les répéter | 🔴 V1 |
| 5 | athlète | discuter avec un coach qui connaît déjà mon historique | 🔴 V1 |
| 6 | athlète | un plan calé sur ma course A, régénéré quand le contexte change | 🔴 V1 |
| 7 | athlète | choisir si je partage ma FC, et changer d'avis | 🔴 V1 |
| 8 | athlète | visualiser ma charge (km + D+) sur 12 semaines | 🟡 V1 |
| 9 | athlète | une fiche course : pacing, fueling, matériel, météo | 🟡 V1 |
| 10 | athlète | savoir si je m'alimente assez pour encaisser mon bloc | 🟡 V1 |
| 11 | athlète | un plan de fueling basé sur ce que j'ai réellement toléré | 🟡 V1 |
| 12 | athlète | débriefer une course et voir mes axes se mettre à jour | 🟡 V1 |
| 13 | athlète | importer mon Notion existant | 🟢 V1 |
| 14 | athlète | exporter ou supprimer toutes mes données | 🟢 V1 |
| 15 | athlète | exporter mon plan dans mon calendrier | 🟢 V1.5 |
| 16 | coach | consulter le plan et la charge de mes athlètes | ⚪ V2 |

---

## 10. Critères d'acceptance

### 10.1 Isolation multi-tenant
- ✅ Toute requête sans `tenant_id` valide retourne zéro ligne (RLS, pas filtrage applicatif).
- ✅ Un outil appelé par l'IA ne peut jamais accéder à un autre tenant, **même si le modèle fournit un autre identifiant**.
- ✅ Test automatisé d'isolation exécuté à chaque déploiement.

### 10.2 Synchronisation
- ✅ Une activité uploadée apparaît en moins de 15 min sans action.
- ✅ Elle est rapprochée automatiquement de la séance prévue quand elle correspond.
- ✅ Une activité hors plan est signalée et déclenche une proposition.
- ✅ **Sans consentement FC, aucune valeur de FC n'est présente en base** — vérifiable par requête directe.

### 10.3 Plan & réajustement
- ✅ Le plan couvre la période jusqu'à la course A, avec phases nommées.
- ✅ Ajouter une contrainte réorganise les semaines concernées en < 30 s sans casser la périodisation.
- ✅ Chaque modification est tracée avec son déclencheur et annulable.
- ✅ Les séances club ne sont jamais doublées par une séance concurrente.

### 10.4 Coach IA
- ✅ Zéro re-saisie de contexte : le coach cite spontanément les 3 dernières séances et la prochaine course.
- ✅ Il modifie le plan depuis la conversation, avec confirmation.
- ✅ Il refuse tout conseil médical ou plan alimentaire chiffré, et oriente.

### 10.5 Santé & fueling
- ✅ Aucune sortie du module Fueling n'est une restriction — **testé par jeu de prompts adverses**.
- ✅ Aucun poids, IMC ou valeur calorique n'existe dans le schéma de base de données.
- ✅ Le coach ne mentionne jamais le corps ou l'apparence de sa propre initiative.
- ✅ L'état 🔴 déclenche un allègement de charge **et** une orientation professionnelle.
- ✅ Le retrait d'un consentement purge effectivement les données concernées.

---

## 11. État actuel & roadmap

### 11.1 Déjà validé par 6 mois d'usage réel
- **Le modèle de données** : objectifs/courses, contraintes, planning hebdo, journal, banque de séances. La structure Notion actuelle est un schéma qui a fait ses preuves.
- **La logique de coaching** : périodisation par course A, réajustement sur contrainte, débrief → axes.
- **Le dashboard** : maquette HTML fonctionnelle.
- **La valeur** : workflow utilisé chaque semaine. Ce n'est pas une hypothèse.

### 11.2 Chantiers ouverts

| # | Priorité | Description |
|---|---|---|
| 1 | 🔴 Bloqueur | Arbitrage build : from scratch vs Lovable (§13) |
| 2 | 🔴 Bloqueur | Conditions commerciales de l'API Strava — à relire avant tout modèle payant |
| 3 | 🔴 Bloqueur | Modèle de coût IA → détermine la viabilité et le prix |
| 4 | 🔴 Bloqueur | **AIPD** à conduire avant l'ouverture beta (§14) |
| 4 bis | 🔴 Bloqueur | **AI Act art. 50** — mention IA dans l'UI du chat, échéance 2 août 2026 (§14.4) |
| 5 | 🟡 Important | Qualité du plan généré sans humain dans la boucle : test en aveugle avant ouverture |
| 6 | 🟡 Important | Validation du module Fueling par un·e diététicien·ne du sport |
| 7 | 🟡 Important | Positionnement vs Runna / TrainingPeaks / Garmin Coach / plans club |
| 8 | 🟢 Confort | Nom, identité visuelle, domaine |

### 11.3 Roadmap

| Phase | Contenu | Sortie |
|---|---|---|
| **P0 — Socle** | Schéma multi-tenant + RLS + OAuth Strava + import + import Notion | Mes données sont dans l'app, isolées |
| **P1 — Lecture** | Dashboard + planning + fiche course | Je n'ouvre plus Notion pour consulter |
| **P2 — Coach** | Chat avec contexte + génération de plan + réajustement | Je n'ouvre plus Claude séparément |
| **P3 — Boucle** | Matching auto, déclencheurs, débriefs, **module Fueling** | Le plan reste vrai sans que j'y pense |
| **P4 — Terrain** | PWA mobile, export ICS, météo | Utilisable au bord du sentier |
| **P5 — Beta** | Auth publique, onboarding, consentements, AIPD, export RGPD | 10 – 20 testeurs hors cercle |
| **P6 — SaaS** | Facturation, support, CGU, conformité complète | Ouverture publique |

### 11.4 Hors scope V1
Réseau social, marketplace de plans, capteurs tiers hors Strava, coaching humain intégré, app native, suivi du cycle menstruel, **toute forme de suivi de poids**.

---

## 12. Le pari SaaS — à instruire

**Ce qui joue pour :**
- Workflow validé par un usage réel prolongé, pas par une intuition.
- Les plans du marché sont statiques : ils ne modélisent ni la garde alternée, ni les séances club imposées, ni les déplacements pro. Angle mort réel.
- Le fueling de l'effort long est un besoin non servi, mesurable et central en ultra.
- Trail/ultra : segment engagé, qui dépense, sous-servi par rapport à la route.

**Ce qui joue contre :**
- Coût marginal IA réel et récurrent — contrairement à un SaaS classique. Le pricing doit l'absorber.
- Dépendance forte à une API tierce dont les conditions peuvent changer.
- Concurrence financée : Runna (racheté par Strava), TrainingPeaks, Garmin.
- Données de santé = charge de conformité non triviale pour un petit éditeur.

**La question qui tranche :** la valeur perçue vient-elle du *plan* (commodité déjà disponible) ou de *l'adaptation continue aux contraintes de vie* + *du fueling* (rares) ? Si c'est la seconde, le produit tient.

**Test à faire avant d'écrire une ligne de code SaaS :** faire tourner le workflow actuel pour 3 à 5 autres coureurs pendant 6 semaines, manuellement. Si le besoin est là, il se verra tout de suite.

---

## 13. Décisions

### 13.1 Tranchées

| # | Question | Décision |
|---|---|---|
| 1 | Ambition | **SaaS.** Architecture multi-tenant dès la V1, produit multi-utilisateurs après validation |
| 2 | Suivi de poids | **Retiré du produit.** Remplacé par le module Fueling |
| 3 | FC | **Opt-in contextuel granulaire**, pas de case à l'inscription, mode dégradé assumé |
| 4 | Notion | **Coupure** après import initial |

### 13.2 Ouvertes

| # | Question | Options |
|---|---|---|
| 5 | Build | From scratch (Next.js + Supabase) · vs · Lovable pour un prototype en jours |
| 6 | Le coach écrit-il seul ? | Toute modification confirmée · vs · réajustements mineurs automatiques |
| 7 | Scope sportif | Trail/ultra uniquement (positionnement fort) · vs · endurance en général |
| 8 | Modèle éco | Abonnement mensuel · vs · par cycle de préparation · vs · freemium |

---

## 14. Conformité & jalons administratifs

Aucune de ces obligations ne se « dépose » ni ne s'autorise : il n'y a ni agrément à obtenir, ni dossier à instruire, ni délai d'attente. C'est de la **documentation à constituer** et des **mentions à afficher**. La seule vraie charge intellectuelle est l'AIPD.

### 14.1 La bascule : usage personnel → responsable de traitement

Le RGPD ne s'applique pas au traitement effectué dans le cadre d'une **activité strictement personnelle ou domestique** (art. 2.2.c). Tant que Cairn tourne avec une seule utilisatrice, sur ses propres données, pour son propre usage : aucune obligation.

La bascule est **binaire et immédiate** : au premier compte créé par un tiers — même gratuit, même un proche, même « juste pour tester » — l'ensemble des obligations s'applique d'un coup.

Conséquence directe sur le calendrier : l'AIPD doit être conduite **avant** que le traitement démarre. Elle sert à décider *si* et *comment* on ouvre, pas à justifier après coup.

### 14.2 Ordonnancement

| Jalon | À mettre en place |
|---|---|
| **Dogfood solo** | *Rien.* Aucune obligation applicable. |
| **Avant le 1ᵉʳ testeur externe** | AIPD · registre des traitements · politique de confidentialité · CGU · **mention IA (art. 50)** · contrats de sous-traitance (art. 28) · encadrement du transfert hors UE · bandeau cookies |
| **Avant le 1ᵉʳ euro facturé** | Structure juridique adaptée · CGV · renonciation à rétractation · résiliation en 3 clics · médiateur de la consommation · RC professionnelle · régime TVA (+ OSS si UE) |
| **En continu** | Révision de l'AIPD à chaque changement notable · veille seuils TVA · facturation électronique 2026-2027 |

### 14.3 RGPD — le paquet complet

| Élément | Détail |
|---|---|
| Registre des traitements | Obligatoire, tenu en interne, **aucune déclaration** |
| AIPD | Avant le premier utilisateur externe ; révisée à chaque évolution |
| Contrats de sous-traitance (art. 28) | Hébergeur, base de données, fournisseur IA — à récupérer et archiver |
| Transfert hors UE | Clauses contractuelles types + analyse d'impact du transfert (API IA) |
| Politique de confidentialité | Publique, lisible, versionnée |
| Droits des personnes | Procédure de réponse sous un mois, self-service dans l'app |
| Cookies / traceurs | Bandeau conforme CNIL dès mesure d'audience non exemptée |
| DPO | À évaluer — le cumul données de santé + suivi régulier rend la question sérieuse |

**Déclencheurs de révision de l'AIPD :** ajout du suivi du cycle menstruel · changement de fournisseur IA · ouverture d'un accès coach (nouveau destinataire) · nouvelle finalité. En pratique, une à deux révisions par an.

### 14.4 AI Act — article 50 *(échéance 2 août 2026)*

Obligation de transparence applicable **sans seuil de taille ni classification de risque**, dès lors qu'un chatbot est exposé à des utilisateurs.

**Exigence concrète :** l'utilisateur doit être informé qu'il interagit avec une IA, **de façon claire, dès la première interaction**. Une mention noyée dans les CGU a été explicitement écartée par la Commission.

**Impact produit :** une mention persistante dans l'UI du chat coach. Coût de mise en conformité négligeable, coût de l'oubli disproportionné. → à traiter dans P2.

*Les obligations « haut risque » ont été repoussées à décembre 2027 par le paquet omnibus numérique. À faire qualifier par un juriste : un coach IA traitant des données de santé bascule-t-il un jour dans cette catégorie ?*

### 14.5 Structure juridique & fiscale

**Le point qui tranche entre micro-entreprise et société :** en micro, aucune charge n'est déductible. Or le coût IA est **récurrent et proportionnel au chiffre d'affaires**. Si l'abonnement est à 15 € et que l'IA en coûte 4, l'abattement forfaitaire ignore cette réalité et l'imposition porte sur un revenu qui n'existe pas. → bascule SASU / EURL au premier abonné payant. L'argument est la déductibilité, pas le statut.

| Sujet | Repère |
|---|---|
| Formalités | Guichet unique INPI — vérifier que l'activité déclarée couvre l'édition de logiciel |
| Franchise TVA 2026 | 37 500 € services / 85 000 € biens ; seuils majorés 41 250 / 93 500 € |
| Piège classique | Les seuils de franchise TVA ≠ les plafonds du régime micro |
| Ventes UE aux particuliers | Régime **OSS** — la TVA est due dans le pays du client |
| Facturation électronique | Déploiement obligatoire 2026-2027, à anticiper |

### 14.6 Droit de la consommation & e-commerce *(B2C)*

- **Mentions légales** (LCEN) : identité, contact, hébergeur.
- **CGU + CGV distinctes** — les CGV encadrent abonnement, résiliation, remboursement.
- **Rétractation 14 jours** : pour un service numérique accessible immédiatement, recueillir une **renonciation expresse** à la souscription, sinon le droit reste ouvert.
- **Résiliation en trois clics** : obligatoire pour tout abonnement souscrit en ligne par un consommateur.
- **Médiateur de la consommation** : adhésion obligatoire en B2C, à mentionner dans les CGV.
- **Reconduction tacite** : information annuelle sur la faculté de résilier.

### 14.7 Frontière santé & assurance

**Ne jamais basculer dans le dispositif médical.** La frontière est la **revendication**, pas la fonctionnalité :

| Formulation | Statut |
|---|---|
| « Bien-être et performance sportive », observe des signaux et **oriente** | Hors périmètre ✅ |
| *Dépiste*, *diagnostique* ou *prévient* le RED-S | Règlement dispositifs médicaux — marquage CE, organisme notifié ❌ |

C'est la raison d'être de la formulation retenue en §5.2.5 : l'app affiche un état et oriente vers un professionnel, **elle ne conclut rien**.

**RC professionnelle** : recommandée dès lors que des recommandations d'entraînement sont délivrées à des tiers.

> ⚠️ Repères, pas un avis juridique ni comptable. Le volet structure/TVA mérite une heure avec un expert-comptable au moment de la bascule ; le volet RGPD / AI Act un juriste avant l'ouverture.

---

## 15. Glossaire

| Terme | Définition |
|---|---|
| **AI Act** | Règlement (UE) 2024/1689 sur l'intelligence artificielle. Art. 50 = obligations de transparence, applicables au 2 août 2026 |
| **AIPD** | Analyse d'Impact relative à la Protection des Données (art. 35 RGPD) — étude documentée des risques d'un traitement, à conduire avant sa mise en œuvre |
| **Affûtage (taper)** | Réduction progressive du volume avant une course |
| **Bloc choc** | Sorties longues rapprochées (souvent un week-end) pour développer la durabilité musculaire |
| **Charge aiguë / chronique** | Rapport charge récente / charge de fond — indicateur de risque de surcharge |
| **Course A / B / C** | Objectif principal / intermédiaire / de préparation |
| **D+** | Dénivelé positif cumulé (m) |
| **DE — Disponibilité énergétique** | Énergie restant disponible pour les fonctions physiologiques après l'entraînement |
| **Dérive cardiaque** | Augmentation de la FC à allure constante sur un effort long — indicateur de fatigue ou de sous-carburant |
| **Effort relatif** | Score de charge d'une séance calculé par Strava depuis la FC |
| **Filière** | Système énergétique sollicité (endurance, seuil, VMA) |
| **Franchise en base** | Régime dispensant de facturer la TVA sous certains seuils de chiffre d'affaires |
| **OSS** | *One Stop Shop* — guichet unique de déclaration de TVA pour les ventes aux particuliers dans l'UE |
| **Responsable de traitement / sous-traitant** | Qui décide des finalités (l'éditeur) / qui traite pour son compte (hébergeur, fournisseur IA) |
| **g/h** | Grammes de glucides ingérés par heure d'effort — métrique centrale du fueling |
| **RED-S** | *Relative Energy Deficiency in Sport* — syndrome lié à une disponibilité énergétique insuffisante |
| **RLS** | *Row Level Security* — isolation des données au niveau de la base, par ligne |
| **Semaine ISO** | Numérotation calendaire des semaines, base du planning actuel |
| **Seuil** | Allure/FC à la frontière de l'accumulation de lactate |
| **UTMJ** | Ultra Trail des Montagnes du Jura — course A, 105 km / 4 000 m D+, 03/10/2026 |
