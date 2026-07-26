# Questions ouvertes — à trancher par un juriste ou à valider en amont

> Ce document collecte tout ce qui, dans les docs 01 à 05 et ADR-001, dépend d'un texte non vérifiable, d'une lecture ambiguë, ou d'une décision qui n'appartient pas à l'ingénieur.
> **Rien de ce qui figure ici n'est bloquant pour la conception. Tout est bloquant pour la commercialisation.**

Trois catégories :
- **A — Non vérifiable en l'état** : le document primaire existe mais n'a pas pu être lu en clair.
- **B — Ambiguïté juridique** : le texte est lu mais admet deux lectures.
- **C — Décision produit à prendre** : dépend d'un choix stratégique, pas d'un texte.

---

## A. Non vérifiable en l'état — à débloquer par un accès direct

### A.1 Garmin Developer Program Agreement — lecture verbatim
**Sujet** : les deux PDF officiels de l'Agreement (`developerportal.garmin.com/.../Garmin%20Connect%20Developer%20Program%20Agreement.pdf` et `www8.garmin.com/.../GARMINCONNECTDEVELOPERPROGRAMAGREEMENT_EN.pdf`) sont accessibles mais leur contenu texte est encodé (streams FlateDecode). Les clauses citées dans le doc 01 sont **reconstituées** à partir de restitutions moteur de recherche, pas lues directement.

**Impact** : le socle recommandé (Garmin) repose sur une lecture de seconde main.

**Action** : télécharger les PDF, extraire le texte en clair (Adobe, `pdftotext`, ou service en ligne), relire :
- La clause AI-transparence dans son texte exact (numéro de section, formulation précise, seuils).
- La clause de rétention.
- La clause analytics/agrégation (si elle existe).
- La clause de partage à des tiers coach/club.
- La clause de sous-processeurs LLM.

**Blocant** : go/no-go du socle Garmin.

### A.2 Garmin Health API — coût de production
**Sujet** : sources tierces (Spike API, TechDepot) évoquent un **frais unique de ~5 000 USD** pour la mise en production de la Health API. La page officielle Garmin dit seulement *« Access to some metrics may require a license fee payment or minimum device order quantity for commercial use »*, sans chiffre.

**Impact** : budget produit, à quantifier avant d'engager la Health API en plus de l'Activity API.

**Action** : demander à Garmin (`connect-support@developer.garmin.com`) le tarif applicable au use case Cairn (SaaS, ~milliers d'utilisateurs cible, données de santé consenties, base UE).

### A.3 COROS — texte contractuel
**Sujet** : le portail développeur `developers.coro.net/developer-portal/authentication/` renvoie 404. L'article support « Submit an API Application » renvoie 403. Le support COROS a documenté par ailleurs : *« COROS is unable to offer API access for all parties who apply »*. Aucun contrat public.

**Impact** : les athlètes COROS (part significative du trail longue distance) restent en fallback FIT — friction UX réelle.

**Action** : soumettre une application au programme partenaire COROS pour Cairn. Attendre la réponse. Selon retour : réintégrer COROS comme socle secondaire, ou acter le fallback FIT.

### A.4 Suunto Cloud API — contrat post-application
**Sujet** : l'API agreement Suunto est fourni **après acceptation dans le partner program**. Le texte n'est donc pas lisible avant engagement.

**Impact** : impossible d'évaluer les silences (retention, IA, analytics) avant d'être accepté.

**Action** : postuler au Suunto Partner Program pour Cairn. Lire le contrat à réception. Reporter la décision d'intégrer Suunto tant que le contrat n'est pas lu et validé juridiquement.

### A.5 Vital et Rook — terms complets
**Sujet** : les extraits publics de Vital et Rook sont maigres (Vital) ou tronqués (Rook). Aucune trace publique sur AI/retention/analytics.

**Impact** : ces agrégateurs sont écartés du socle (voir ADR-001) — l'impact est faible. Mais si l'on décide un jour de les évaluer comme option de rapidité d'ingénierie, il faudra le contrat client complet.

**Action** : classer en veille.

---

## B. Ambiguïtés juridiques — à trancher par un avocat tech

### B.1 Polar — silence total sur l'IA
**Sujet** : le Polar API License Agreement (lu intégralement) ne contient **aucune clause** sur l'usage d'IA (training ou inférence). En 2026, un silence sur ce sujet est ambigu :
- Lecture permissive : ce qui n'est pas interdit est permis (sauf usage général `2.1` détourné).
- Lecture prudente : sans autorisation explicite, un usage IA sur données Polar pourrait être qualifié d'usage « inconsistent with this Agreement » (§2.2) en cas de litige.

**Impact** : les activités des utilisateurs Polar pourraient ou non alimenter le contexte LLM Cairn.

**Action** : (1) demander à Polar par écrit une clarification sur l'usage IA (data Polar → LLM tiers pour restitution personnalisée). (2) En attendant réponse, considérer la donnée Polar comme **non-transmissible au LLM** — cette prudence a un coût produit (l'utilisateur Polar a une expérience coach IA dégradée). À évaluer dans le PRD.

### B.2 Suunto et Wahoo — mêmes silences
**Sujet** : identique à B.1. Le contrat Suunto n'a pas encore été lu (voir A.4) ; le contrat Wahoo n'a aucune mention IA.

**Action** : mêmes que B.1, appliquées à Suunto (après lecture) et Wahoo.

### B.3 Wahoo — « no charge for API access »
**Sujet** : extrait Wahoo : *« Vous ne pouvez pas facturer aux utilisateurs finaux de quelque manière que ce soit l'accès ou l'utilisation du Matériel de l'API »*.

**Deux lectures possibles** :
- **Lecture stricte** : cela interdit toute app payante utilisant l'API Wahoo, y compris un SaaS d'abonnement dont la valeur intègre l'API Wahoo.
- **Lecture littérale** : cela interdit de facturer **spécifiquement l'accès à l'API** (revendre l'API), pas de facturer un SaaS dont l'API est un input parmi d'autres.

L'interprétation littérale est cohérente avec la formulation Strava §5.8 (« pas de facturer les API Materials, mais oui pour features distinctes »).

**Action** : demander clarification écrite à Wahoo (`wahooapi@wahoofitness.com`). En attendant, considérer que les utilisateurs Wahoo sont supportés en lecture mais que la clause reste un risque juridique moyen, à assumer explicitement au launch.

### B.4 §5.3 Strava et un moteur rules-based
**Sujet** : voir doc 03, section 3. Un moteur rules-based (ACWR, périodisation) est-il une « AI Application » au sens §5.3 Strava ?

**Statut Cairn** : la question est neutralisée par le fait que les données `strava_api` sont de toute façon exclues du moteur (§5.4 + §6.2). Elle **redeviendrait critique** si l'on cherchait un jour à réintroduire Strava en lecture.

**Action** : documenter cette position dans l'ADR-001 (fait). Ne pas ré-arbitrer sans nouvelle consultation juridique.

### B.5 Import Bulk Data Export Strava (§6.6) — le fichier utilisateur reste-t-il « propre » ?
**Sujet** : l'utilisateur exerce son droit personnel §6.6 d'exporter ses données. Une fois le fichier entre ses mains, Cairn l'ingère comme un FIT. **Question** : les CGU utilisateur Strava (grand public, différentes de l'API Policy) contiennent-elles une restriction sur ce que l'utilisateur peut faire de ses propres données exportées ?

**Impact** : si oui, l'ingestion `strava_bulk_export` deviendrait risquée.

**Action** : lecture par un juriste des Terms of Service grand public Strava (`strava.com/legal/terms`) avec la question précise « un utilisateur peut-il transmettre son archive à un service tiers d'analyse pour usage personnel ? ».

### B.6 Flux inversé Option B — écrire dans la description Strava
**Sujet** : voir doc 04, §2. Si Cairn demande un scope OAuth Strava write-only (`activity:write`) pour ajouter « préparé avec Cairn » dans la description d'une activité, Cairn devient-il soumis à l'ensemble de l'API Policy, y compris §5.3/§5.4 même s'il ne lit aucune donnée ?

**Action** : ne pas ouvrir Option B tant qu'un avocat n'a pas confirmé qu'un scope write-only est cloisonné de la Policy en lecture. Défaut : Option A pure.

### B.7 Consentement RGPD granulaire par source et par usage
**Sujet** : chaque source de données a un régime propre. Le consentement utilisateur doit-il être granulaire :
- « J'autorise Cairn à lire mes activités Garmin » ?
- « J'autorise Cairn à utiliser mes activités Garmin pour construire un plan » ?
- « J'autorise Cairn à envoyer mes données dérivées à un LLM (Anthropic) pour restitution » ?

La clause AI Garmin exige un consentement explicite avant traitement IA. Un consentement bloc « j'autorise tout » ne suffit vraisemblablement pas.

**Action** : co-construction avec un juriste RGPD du parcours consentement — un livrable AIPD complet.

### B.8 Partage à un tiers coach — droit et pratique
**Sujet** : la matrice §3 du doc 02 marque « ⚠️ à clarifier » pour Garmin sur le partage à un tiers (coach humain qui aide un athlète). L'agrégat des sources indique globalement « consent utilisateur suffit » (Polar §3.1.1, Wahoo « base légale »), mais Garmin n'est pas explicite.

**Action** : à clarifier avant d'ajouter la feature « inviter mon coach à voir mon plan ». Pas prioritaire pour V1.

---

## C. Décisions produit — indépendantes du droit

### C.1 Prix et structure de trial
**Sujet** : le trial 7 jours est en place. Le prix mensuel n'est pas fixé.

**Action** : décision PM/co-founder à partir des benchmarks (Runna ~20 €, Borner similaire). Recommandation doc 05 : 10–15 €/mois, à valider par test A/B.

### C.2 Facturer l'usage IA (quotas coach) vs. abonnement simple
**Sujet** : donner au tier gratuit un quota limité de conversations coach IA vs. tout laisser au tier payant. Le premier baisse le coût variable, le second simplifie la promesse.

**Action** : à trancher à la définition de l'offre.

### C.3 Position sur COROS en attendant le programme partenaire
**Sujet** : accepter dès V1 que les utilisateurs COROS aient une friction UX (upload FIT obligatoire) et le communiquer honnêtement, ou différer le launch V1 tant que COROS ou un autre canal n'est pas disponible ?

**Action** : recommandation doc 05 — accepter la friction pour V1, mettre en visibilité le fait qu'un accord COROS est demandé.

### C.4 Palier B2B « coach humain »
**Sujet** : ouvrir un mode « coach humain qui pilote plusieurs athlètes via Cairn » — nécessite validation de B.8 et une architecture multi-tenant enrichie.

**Action** : hors scope V1. Rediscuter après V1 si demande utilisateur émerge.

### C.5 Positionnement communication autour de Strava
**Sujet** : dans la comm marketing Cairn, comment traiter Strava ?
- Option franche : *« Cairn ne se connecte pas à Strava en lecture. Voici pourquoi et comment on fait mieux. »* (transparent, différencie).
- Option neutre : ne pas mentionner Strava dans la comm principale.

**Action** : décision marketing. Recommandation : option franche — cohérent avec la posture « on ne cache pas ce qu'on fait » qui structure déjà les règles santé et l'AI Act.

---

## Récapitulatif priorité

| # | Titre | Cat. | Blocage | Prioritaire |
|---|---|:-:|:-:|:-:|
| A.1 | Lire Garmin Agreement en clair | A | ADR-001 | 🔴 |
| A.2 | Coût production Garmin Health API | A | Budget | 🔴 |
| B.4 | §5.3 Strava et moteur rules-based | B | (Neutralisé sauf pivot) | 🟢 |
| B.5 | Statut CGU utilisateur pour Bulk Export | B | Feature import Strava | 🟠 |
| A.4 | Contrat Suunto post-application | A | Intégration Suunto | 🟠 |
| B.3 | Wahoo « no charge for API access » | B | Intégration Wahoo | 🟠 |
| B.1 | Polar silence IA | B | Expérience utilisateur Polar | 🟠 |
| A.3 | COROS pas de contrat | A | Segment COROS | 🟠 |
| A.5 | Terms Vital/Rook | A | Non urgent | 🟢 |
| B.6 | Option B flux inversé (write) | B | Fonctionnalité future | 🟢 |
| B.7 | Granularité consentement RGPD | B | AIPD complet | 🔴 |
| B.8 | Partage à coach humain | B | V2 B2B | 🟢 |
| C.1 | Prix / trial | C | Launch | 🟠 |
| C.5 | Comm Strava | C | Launch | 🟢 |
| **Global** | **Relecture avocat tech de l'ensemble** | — | **Commercialisation** | 🔴 |

Légende : 🔴 bloquant lancement — 🟠 à trancher avant première commercialisation externe — 🟢 non bloquant V1
