# 01 — Comparatif des sources de données

> Phase 1 : vérification des sources primaires
> Phase 2 : arbitrage du socle
> Date d'analyse : 26/07/2026 — rédigé par Claude (assistant IA, non juriste)
> ⚠️ Tout ce qui figure ici a été vérifié contre les textes accessibles publiquement à cette date. Les textes évoluent. Une relecture avocat est requise avant commercialisation.

---

## 0. Distinction méthodologique employée partout

Pour chaque plateforme, deux échelles distinctes sont notées :

- **RC — Risque de conformité** : on enfreint un texte contractuel. Escalade : indemnisation, audit, résiliation, éventuelle action légale.
- **RO — Risque opérationnel** : on peut se faire couper l'accès unilatéralement, même en étant conforme.

Ces deux échelles ne s'additionnent pas. Un socle peut être RC=faible / RO=élevé (accès stable en pratique mais dépendance forte).

---

## 1. Cartographie des sources évaluées

| # | Source | Type | Statut de la vérification primaire |
|---|---|---|---|
| 1 | **Garmin Connect Developer Program** (Activity + Health API) | Constructeur | Agreement PDF récupéré, extraction limitée par compression. Clauses clés reconstituées via search + FAQ officielle + Overview. **Confiance : moyenne–haute** |
| 2 | **COROS Open API / Training Hub** | Constructeur | Portail développeur non accessible (403). Article support « Submit an API Application » inaccessible (403). **Aucun texte contractuel public.** Confiance : **très faible** |
| 3 | **Polar AccessLink API** | Constructeur | Agreement complet lu sur polar.com/en/legal/polar-api-agreement. **Confiance : haute** |
| 4 | **Suunto Cloud API** | Constructeur | FAQ + docs publiques. Agreement fourni uniquement après acceptation dans le partner program. **Confiance : moyenne** |
| 5 | **Wahoo Cloud API** | Constructeur | Agreement lu (version fr-eu). **Confiance : haute** |
| 6 | **Apple HealthKit** + App Store Review Guidelines §5.1.3 et §5.1.2 | Plateforme mobile | Guidelines publiques verbatim. **Confiance : haute** |
| 7 | **Android Health Connect** + Google Play policies | Plateforme mobile | Policies publiques lues. **Confiance : haute** |
| 8 | **Terra API** | Agrégateur | Site produit + article de blog Terra sur Strava. Pas d'accès au contrat client. **Confiance : moyenne** |
| 9 | **Vital / Junction API** | Agrégateur | Terms.io lus. Pas de dispositif AI/retention détaillé publiquement. **Confiance : moyenne–faible** |
| 10 | **Rook API** | Agrégateur | Docs publiques + terms non extraites en full. **Confiance : faible** |
| 11 | **FIT / GPX / TCX** (parsing local) | Formats de fichier | Aucune CGU plateforme. **Confiance : haute (par nature)** |
| 12 | **Strava** (rappel, exclu) | Constructeur | Contraintes déjà documentées dans le brief. Utilisé ici comme référence négative. |

---

## 2. Fiches par plateforme

### 2.1 Garmin Connect Developer Program

**Documents primaires :**
- Agreement PDF : https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf
  et https://www8.garmin.com/en-US/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT_EN.pdf
- FAQ programme : https://developer.garmin.com/gc-developer-program/program-faq/
- Overview : https://developer.garmin.com/gc-developer-program/
- Health API : https://developer.garmin.com/gc-developer-program/health-api/
- Activity API : https://developer.garmin.com/gc-developer-program/activity-api/

⚠️ Les deux PDF de l'Agreement sont accessibles mais leur contenu texte est encodé (streams FlateDecode). Les citations ci-dessous proviennent des restitutions moteur de recherche. À **revérifier ligne à ligne** avant signature — inscrit dans `QUESTIONS-OUVERTES.md`.

**1. Rétention** : pas de limite de type « 7 jours » identifiée. Obligation opérationnelle : suppression sur retrait de consentement ou résiliation. Extrait restitué : *« you or your Application may not retain any user data collected through the Application or from Garmin after a user has revoked consent or asked you to delete such data »*.
→ **Rétention longue autorisée tant que consentement actif.** ✅

**2. Analytics / agrégation** : aucune clause interdisant l'agrégation ou l'analytics identifiée. Pas d'équivalent du §5.4 Strava.
→ **Analytics autorisé.** ✅ (à confirmer sur PDF texte)

**3. Usage IA** : traité par une clause de **transparence + consentement explicite**, pas d'interdiction. Restitution : *« if End User Data will be used for training with or processing by artificial intelligence, licensees must include a conspicuous AI transparency statement in their privacy policy, clearly inform end users of the nature and purpose of any processing or training by artificial intelligence, and comply with legal or regulatory obligations including obtaining explicit consent from each end user before initiating any processing of End User Data, allowing end users to withdraw such consent easily at any time »*.
→ **IA autorisée sous conditions RGPD-friendly.** ✅

**4. Monétisation** : le programme est explicitement destiné à un usage business. FAQ : *« The Garmin Connect Developer Program is available for enterprise use »*, *« it is only for business use »*. Aucune clause anti-monétisation identifiée sur le produit de l'app.
→ **Monétisation autorisée.** ✅

**5. Affichage à un tiers (coach, club)** : non explicitement adressé dans les sources publiques. **Zone grise** — inscrit dans `QUESTIONS-OUVERTES.md`.

**6. Sous-traitance LLM tiers** : la clause AI transparence traite du principe. La liste des sous-traitants doit figurer dans la privacy policy conformément au RGPD. Aucune interdiction identifiée d'appeler une API LLM externe.
→ **Autorisé sous consentement + transparence.** ✅ (à confirmer)

**7. Révocation** : *« The Agreement will terminate immediately and automatically, without any notice by either Party, if Licensee violates any of the terms and conditions »* — comparable à la §2.1 Strava sur ce point.
→ **RO = élevé, comme partout.**

**8. Admission** : FAQ : *« After you request the Garmin Connect Developer Program, we will confirm the status of your application within two business days »*. Programme réservé à un usage entreprise. Pas de frais annuels : *« There are no licensing or maintenance fees for access to the Garmin Connect Developer Program »*. **Mais** *« Access to some metrics may require a license fee payment or minimum device order quantity for commercial use »*. Sources tierces (Spike API, TechDepot) évoquent un frais unique de ~5 000 USD pour la Health API en production. **Chiffre non confirmé sur source Garmin officielle** — inscrit dans `QUESTIONS-OUVERTES.md`.

**9. Couverture matérielle trail francophone** : Garmin est le leader historique du GPS sport, dominant sur le trail (gamme Fenix / Forerunner / Enduro / Tactix / Instinct). Aucune donnée de part de marché France publique et sourçable — estimation à traiter comme heuristique, pas comme donnée validée. Ordre de grandeur communément cité par la presse spécialisée : **majoritaire sur le trail longue distance**, COROS second, Suunto/Polar en outsiders.

**Synthèse Garmin — RC : faible / RO : élevé.** Candidat socle **crédible**, à condition de valider (a) le PDF Agreement en texte, (b) le coût de licence effectif Health API, (c) la clause de partage tiers pour la fonction coach.

---

### 2.2 COROS Open API / Training Hub

**Documents primaires tentés :**
- https://developers.coro.net/developer-portal/authentication/ → **404**
- https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application → **403**
- https://coros.com/traininghub → destiné aux coachs (utilisateurs), pas aux développeurs

**Verdict** : **document primaire non trouvé — requis pour trancher.** Sources tierces (site support COROS) : *« COROS is unable to offer API access for all parties who apply »*. Un article the5krunner (05/2026) documente le lancement d'un serveur MCP COROS en **lecture seule** avec 15 endpoints exposables à Claude/ChatGPT — signal que COROS a une posture réfléchie sur l'IA, mais ne dit rien du contrat développeur.

**Conclusion** : COROS n'est **pas exploitable comme socle** en l'état des sources publiques. À contacter directement — inscrit dans `QUESTIONS-OUVERTES.md`.

---

### 2.3 Polar AccessLink API

**Document primaire :** https://www.polar.com/en/legal/polar-api-agreement

| Dimension | Extrait / analyse |
|---|---|
| **Rétention** | Section 3.3 : *« delete related token(s) from Your database(s) and server(s) »* à la résiliation. **Pas de limite pendant la durée du contrat.** ✅ |
| **Analytics** | Non explicitement adressé. Section 2.1 permet l'usage *« solely for the purposes of proprietary application or services development »*. **Zone grise** ; interprétation prudente : autorisé si intégré au produit propre, pas comme service séparé. |
| **IA** | **Non adressé.** Aucune clause pro ni contre. Le silence sur un sujet spécifique en 2026 est un risque → à clarifier avec Polar avant lancement. Inscrit dans `QUESTIONS-OUVERTES.md`. |
| **Monétisation** | Section 2.2 interdit *« sublicense, rent, loan, lease...sell, market, commercialize, re-license, otherwise transfer... Licensed Materials »*. Cela vise le **matériel licencié** (API/SDK), pas le produit bâti dessus. Facturer un abonnement au SaaS n'est vraisemblablement pas visé — mais l'interprétation stricte reste possible. Inscrit dans `QUESTIONS-OUVERTES.md`. |
| **Partage tiers (coach)** | Section 3.1.1 : *« ensuring that no Data is distributed to external sources without the explicit Member permission »*. → **Coach/club autorisés avec consentement athlète.** ✅ |
| **Sous-traitants LLM** | Non mentionné. Silence = ambigu. |
| **Révocation** | Section 8.3 : *« Polar has the right...to suspend or terminate Your...access to Polar Ecosystem for any or no reason, with immediate effect »*. → **RO = élevé.** |
| **Admission** | Section 8.1 : effectif au clic d'acceptation. Pas de vetting lourd sur les sources publiques, mais programme partenaire présumé. |
| **Rétention côté API** | ⚠️ Note DC Rainmaker / Validic : l'AccessLink expose seulement les activités **récentes**. Historique long à obtenir via export FIT côté utilisateur. → **Contrainte fonctionnelle forte**. |

**Synthèse Polar — RC : faible-moyen (silences à clarifier) / RO : élevé.** Utilisable en **complément**, pas comme socle primaire à cause de la fenêtre d'historique limitée.

---

### 2.4 Suunto Cloud API

**Documents primaires :**
- Portail : https://apizone.suunto.com/
- FAQ : https://apizone.suunto.com/faq
- Comment démarrer : https://apizone.suunto.com/how-to-start

| Dimension | Extrait / analyse |
|---|---|
| **Rétention** | Non adressé dans les docs publiques. À la résiliation : *« all associated data will be deleted or anonymized »* (privacy). |
| **Analytics** | Non adressé publiquement. |
| **IA** | Non adressé publiquement. Silence 2026 = à clarifier. |
| **Monétisation** | *« We do not charge from the use of the API »* — Suunto n'impose pas de frais d'API. Aucune interdiction identifiée de facturer le SaaS bâti dessus. |
| **Partage tiers** | Non adressé publiquement. |
| **Révocation** | Standard : programme partenaire, révocable. |
| **Admission** | Business only : *« currently don't offer the API access for personal use »*. Réponse sous 2 semaines après application. Contrat fourni après acceptation → **texte non lisible avant engagement**. |
| **Rétention côté API** | Ancienneté maximale des activités API non documentée publiquement. |

**Synthèse Suunto — RC : à évaluer (contrat masqué) / RO : élevé.** Utilisable en **complément** pour la couverture des athlètes Suunto (marque forte trail nordique/Alpes, minoritaire en volume).

---

### 2.5 Wahoo Cloud API

**Document primaire :** https://fr-eu.wahoofitness.com/wahoo-api-agreement (redirect depuis wahoofitness.com)

| Dimension | Extrait / analyse |
|---|---|
| **Rétention** | Suppression **sous 48 h** sur demande. Suppression **immédiate** au retrait de consentement utilisateur. Pas de plafond fixe pendant le contrat. |
| **Analytics** | Non explicitement autorisé/interdit. Wahoo se réserve le droit d'analyser les données d'usage du développeur, mais pas l'inverse. |
| **IA** | **Non adressé.** |
| **Monétisation** | Extrait : *« Vous ne pouvez pas facturer aux utilisateurs finaux de quelque manière que ce soit l'accès ou l'utilisation du Matériel de l'API »*. Cible l'**accès à l'API** en tant que tel ; facturer le SaaS reste possible si la valeur facturée n'est pas la simple ré-exposition de l'API Wahoo. Point à clarifier — inscrit dans `QUESTIONS-OUVERTES.md`. |
| **Partage tiers** | Extrait : *« vous ne pouvez pas divulguer ces données à, ou les utiliser pour, un autre utilisateur ou tout autre tiers sans base légale »*. → Coach/club possible avec consentement. |
| **Sous-traitants LLM** | Non mentionné. |
| **Révocation** | *« annuler à tout moment »* côté Wahoo, sans responsabilité. Suppression sous 48 h côté dev. |
| **Admission** | Enregistrement discrétionnaire ; jeton API délivré après approbation. |

**Synthèse Wahoo — RC : moyen (clause « pas facturer l'API » à qualifier) / RO : élevé.** Utilisable en **complément** pour les utilisateurs de montres RIVAL / ELEMNT.

---

### 2.6 Apple HealthKit + App Store Review Guidelines

**Document primaire :** https://developer.apple.com/app-store/review/guidelines/

**§5.1.3 Health and Health Research — extrait verbatim :**

> *« (i) Apps may not use or disclose to third parties data gathered in the health, fitness, and medical research context—including from the Clinical Health Records API, HealthKit API, Motion and Fitness, MovementDisorder APIs, or health-related human subject research—for advertising, marketing, or other use-based data mining purposes other than improving health management, or for the purpose of health research, and then only with permission. Apps may, however, use a user's health or fitness data to provide a benefit directly to that user (such as a reduced insurance premium), provided that the app is submitted by the entity providing the benefit, and the data is not shared with a third party. You must disclose the specific health data that you are collecting from the device. »*

> *« (ii) Apps must not write false or inaccurate data into HealthKit or any other medical research or health management apps, and may not store personal health information in iCloud. »*

**§5.1.2(vi) — extrait :**
> *« Data gathered from the HomeKit API, HealthKit, Clinical Health Records API, MovementDisorder APIs, ClassKit or from depth and/or facial mapping tools (e.g. ARKit, Camera APIs, or Photo APIs) may not be used for marketing, advertising or use-based data mining, including by third parties. »*

**§5.1.2(i) — extrait :**
> *« You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so. »*

**Analyse Cairn :**
- **« Improving health management »** couvre explicitement notre cas d'usage (coaching sportif). ✅
- **AI tiers autorisée** avec disclosure + consentement explicite. ✅
- **iCloud interdit** pour PHI — jamais un problème (backend Supabase UE, pas iCloud).
- **Rétention** : non fixée par HealthKit ; suit le RGPD côté serveur.
- **Portée limitée** : HealthKit livre uniquement les données déjà stockées dans l'app Santé iOS. Pour un utilisateur avec une montre Garmin, HealthKit rebroadcast ce que Garmin Connect a écrit — **on récupère un dérivé, pas la source**. Utilité réelle = compenser les utilisateurs sans compte constructeur ou qui refusent l'OAuth.

**Synthèse HealthKit — RC : faible si disclosure propre / RO : moyen (revue App Store à passer).** ✅ pour cas d'usage Cairn.

---

### 2.7 Android Health Connect

**Documents primaires :**
- https://support.google.com/googleplay/android-developer/answer/16679511 (Health Content and Services)
- https://support.google.com/googleplay/android-developer/answer/12991134 (Android Health Permissions)
- https://developer.android.com/health-and-fitness/guides/health-connect/plan/user-privacy

**Cas d'usage éligibles** (verbatim de la Play Console) :
> *« Fitness & Wellness : track, monitor, analyze, manage, and improve their physical fitness »*

→ Le use case Cairn est **explicitement éligible**.

**Interdictions :**
> Vente ou transfert à *« advertising platforms, data brokers, or any information resellers »*.
> Usage *« for serving ads, including personalized or interest-based advertising »*.
> Partage avec *« applications, services or features that solely target children »*.
> *« use or failure of health data could reasonably be expected to lead to death, personal injury, harm »* — ne pas utiliser dans un contexte critique de santé.

**AI** : non explicitement interdit. La policy générale User Data (10144311) impose que les intégrations *third-party AI* soient conformes aux politiques Play — pas d'interdiction, juste conformité.

**Rétention** : non fixée. Suit le RGPD.

**Synthèse Health Connect — RC : faible pour un SaaS coaching / RO : moyen (revue Play à passer).** ✅

---

### 2.8 Terra API (agrégateur)

**Documents :** https://tryterra.co/ + article blog Terra sur Strava.

**Ce qui est documenté publiquement :**
- Agrège 500+ sources : Garmin, Polar, Coros, Suunto, Wahoo, Fitbit, Oura, Whoop, Apple, Samsung, **et Strava**.
- Pricing usage-based : 399 USD/mois plancher en engagement annuel.
- Terra a publié un article critique sur le durcissement Strava, recommandant *« diversify your data sources »*.

**Point critique** : Terra passe **transitivement les CGU du constructeur en amont**. Si Cairn consomme Garmin *via* Terra, on est soumis à l'Agreement Garmin. Si Cairn consomme Strava via Terra, on reste soumis à §5.3 / §5.4 Strava. Terra ne peut pas contractuellement absorber la contrainte amont — leur propre contrat le mentionne (à confirmer sur contrat client, non public).

**Bénéfice Terra** : mutualisation de l'ingestion, normalisation FIT/GPX, un seul webhook. **Ne résout pas la question juridique de fond.** Peut faire gagner du temps d'ingénierie ; ne fait pas gagner de droits.

**Verdict** : outil d'ingénierie, pas de conformité. À évaluer sur ROI temps-dev vs coût mensuel une fois le socle juridique tranché.

---

### 2.9 Vital / Junction API

**Document :** https://www.tryvital.com/terms

Terms verbaux publics minces : refunds 90 j, suspension unilatérale possible. Aucun élément sur rétention/IA/analytics/sous-traitants dans le texte public.

Pricing : 0,50 USD/utilisateur/mois (plancher 300 USD).

**Verdict identique à Terra** : outil d'ingestion, pas de bouclier juridique. Moins mature sur wearables sport que Terra selon documentation publique.

---

### 2.10 Rook API

**Document tenté :** https://www.tryrook.io/terms-rook-connect → contenu tronqué.

Docs : supporte Polar, Oura, Garmin, Withings, Whoop, Google Fit, Apple Health, **Strava**. Pas Coros ni Suunto explicitement listés.

Positionnement HIPAA/GDPR compliant. Verdict comme Terra/Vital : agrégateur, contraintes amont non absorbées.

---

### 2.11 FIT / GPX / TCX (upload utilisateur direct)

Aucune CGU plateforme — ce sont des **formats de fichier ouverts**.

- **FIT** : format binaire ANT+/Garmin, spécification publique. Contient laps, streams (FC, cadence, puissance, GPS 1 Hz), profil d'altitude, plans de séance structurés. Format le plus riche.
- **GPX** : XML, quasi universellement supporté. Pas de FC ni cadence natifs (souvent en extensions non-standard).
- **TCX** : XML, entre GPX et FIT en richesse.

**Chaque montre GPS sait exporter en FIT** (via câble USB ou app constructeur → bouton export).

**Cas d'usage produit** :
- Fallback universel : « je n'ai pas de compte constructeur, je dépose mon fichier »
- Import massif au premier login : « ma dernière année sur Garmin, je la charge une fois »
- Résilience totale : si tous les OAuth sont coupés, l'utilisateur peut continuer via export → upload

**Contrainte UX** : friction d'usage régulière si c'est le mode principal. Acceptable en fallback, pas en socle unique.

**Synthèse FIT — RC : nul / RO : nul.** Doit **exister quoi qu'il arrive** comme filet de sécurité universel.

---

## 3. Tableau de synthèse

| Source | Rétention longue | Analytics | IA | Monétisation SaaS | Coach/tiers | Admission | Fee | RC | RO |
|---|:-:|:-:|:-:|:-:|:-:|---|---|:-:|:-:|
| **Garmin Connect** | ✅ | ✅ | ✅ *(consent + transparence)* | ✅ | ⚠️ à clarifier | 2 j réponse, business only | 0 € (Activity) ; ~5 k$ ? (Health, à confirmer) | **faible** | élevé |
| **COROS** | ❓ | ❓ | ❓ | ❓ | ❓ | discrétionnaire | ❓ | **inconnu** | inconnu |
| **Polar AccessLink** | ✅ *(mais fenêtre API courte)* | ⚠️ silence | ⚠️ silence | ⚠️ « ne pas commercialiser Licensed Materials » | ✅ avec consent | acceptation click | 0 € | **moyen** | élevé |
| **Suunto Cloud** | ❓ | ❓ | ❓ | ✅ (pas de fee API) | ❓ | 2 sem., business only | 0 € | **à évaluer** | élevé |
| **Wahoo Cloud** | ✅ *(48 h delete)* | ⚠️ silence | ⚠️ silence | ⚠️ « no charge for API access » | ✅ avec base légale | discrétionnaire | 0 € | **moyen** | élevé |
| **Apple HealthKit** | ✅ *(côté serveur)* | ✅ | ✅ *(disclosure)* | ✅ | ✅ *(disclosure)* | App Store review | 99 $/an dev account | **faible** | moyen |
| **Health Connect** | ✅ | ✅ | ✅ | ✅ | ✅ | Health decl. + Play review | 25 $ dev account | **faible** | moyen |
| **Terra** | héritée amont | héritée amont | héritée amont | héritée amont | héritée amont | 399 $/mois plancher | **transitif** | élevé |
| **Vital** | ❓ | ❓ | ❓ | ✅ | ❓ | 0,50 $/user | **transitif** | élevé |
| **Rook** | ❓ | ❓ | ❓ | ❓ | ❓ | non public | **transitif** | élevé |
| **FIT/GPX/TCX** | ✅ | ✅ | ✅ | ✅ | ✅ | — | 0 € | **nul** | **nul** |
| **Strava (rappel)** | ❌ *(7 j)* | ❌ *(§5.4)* | ❌ *(§5.3)* | ⚠️ *(§5.8)* | ❌ *(§6.1)* | Standard puis Extended | 11,99 $/mois abonnement dev | **bloquant** | élevé |

---

## 4. Arbitrage — recommandation de socle

### 4.1 Le choix de fond

Aucune source constructeur n'offre à la fois un texte contractuel **public**, **explicitement permissif sur l'IA**, et **valable indépendamment de la marque de montre**. Le compromis se pose donc entre :

- **Option A — Garmin socle + FIT fallback** : couverture matérielle majoritaire chez le public trail francophone, texte le plus favorable identifié, fallback fichier pour tous les autres.
- **Option B — FIT socle unique** : indépendance totale, aucune plateforme ne peut couper le service, UX plus lourde.
- **Option C — Agrégateur (Terra) + fallback FIT** : rapidité d'ingénierie, mais transfère la question amont et coûte à échelle.

### 4.2 Recommandation

**Socle primaire : Garmin Connect Developer Program (Activity API en priorité, Health API si consentement santé activé).**

**Justification :**
1. Le texte Garmin traite explicitement de l'IA sous forme de **conditions à respecter** (transparence + consentement + retrait facile), pas d'interdiction. C'est le seul acteur constructeur pour lequel c'est vérifié sur source publique à cette date.
2. Aucune limite de rétention type Strava.
3. Aucune interdiction d'analytics/agrégation identifiée.
4. Programme réservé au business — cohérent avec un SaaS payant.
5. Couverture matérielle majoritaire sur le public cible.

**Socles secondaires (couverture complémentaire, activés au cas par cas) :**
- **Polar AccessLink** : pour les athlètes Polar, avec l'acceptation qu'on n'aura que l'historique court (à compléter par un import FIT initial pour rattraper l'antériorité).
- **Suunto Cloud API** : pour la couverture Suunto (Alpes, marché nordique).
- **Wahoo Cloud API** : couverture RIVAL / ELEMNT, marginal en trail pur mais réel en trail-longue-distance polyvalent.
- **Apple HealthKit** : pour les utilisateurs qui refusent l'OAuth constructeur mais ont une Apple Watch, ou en récupération dérivée (Apple Watch native, montre → HealthKit).
- **Android Health Connect** : symétrique côté Android.

**Fallback universel obligatoire :**
- **Upload manuel FIT / GPX / TCX** : quoi qu'il arrive, l'utilisateur doit pouvoir déposer un fichier. Zéro dépendance. Bloc de robustesse du produit.

**Explicitement écarté du socle :**
- **Strava** : maintenu **hors** du socle. Traitement cloisonné, TTL 7 j réel, jamais joint au reste (voir `02-modele-donnees.md`). Cas de figure : import Bulk Data Export §6.6 (fichier utilisateur, hors API) — traité identiquement à un FIT upload sur le plan produit, mais tracé comme source `strava_bulk_export` pour audit.
- **Agrégateurs (Terra/Vital/Rook)** : à réévaluer après lancement si la charge d'intégration Garmin+Polar+Suunto+Wahoo+HealthKit+Health Connect devient bloquante, et seulement si leur contrat client démontre que les contraintes amont sont respectées côté agrégateur. Aujourd'hui : aucun bénéfice de conformité, coût récurrent réel.

### 4.3 Stratégie si Garmin coupe demain

Le RO Garmin est élevé (comme partout). Trois lignes de défense :

1. **Court terme (jours)** : les utilisateurs Garmin basculent sur upload FIT manuel via l'app Garmin Connect. UX dégradée mais service continu.
2. **Moyen terme (semaines)** : bascule vers HealthKit / Health Connect pour les utilisateurs concernés — même si moins riche, ça compense.
3. **Long terme (mois)** : évaluation d'un agrégateur ou négociation Extended Access.

Le produit doit être **conçu comme si l'accès Garmin allait être coupé**. C'est la traduction du principe directeur du brief : « si l'accès X est coupé demain, le produit continue de fonctionner intégralement ».

### 4.4 Estimation de couverture (heuristique, non chiffrée)

Sur un public trail francophone en 2026, hypothèse de répartition :

| Ecosystème | Ordre de grandeur | Chemin de synchro Cairn |
|---|---|---|
| Garmin | majoritaire | OAuth Garmin |
| COROS | second, en croissance sur l'ultra | Upload FIT (COROS n'ayant pas de socle contractuel exploitable en l'état) |
| Suunto | minoritaire | OAuth Suunto ou FIT |
| Polar | minoritaire | OAuth Polar ou FIT |
| Apple Watch native | minoritaire (rare en trail long) | HealthKit ou FIT |
| Autres (Amazfit, Xiaomi, autres) | résiduel | FIT |

**Utilisateurs devant obligatoirement passer par upload manuel** dans la configuration recommandée : les utilisateurs COROS, sauf percée sur leur programme partenaire. C'est **la principale friction UX à anticiper produit** — la beta trail francophone a une part COROS non triviale.

### 4.5 Ce qui n'est **pas** tranché ici

- Coût Health API Garmin en production (5 k$ ? contrat négocié ? MOQ device ?)
- Texte contractuel Garmin ligne à ligne (PDF non extrait en clair)
- Terms COROS (aucun accès)
- Terms Suunto (fournis post-application)
- Interprétation de « no charge for API access » Wahoo pour un SaaS payant

Tous inscrits dans `QUESTIONS-OUVERTES.md`.

---

## Sources

- [Garmin Developer Program Overview](https://developer.garmin.com/gc-developer-program/)
- [Garmin Program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/)
- [Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/)
- [Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/)
- [Garmin Connect Developer Program Agreement PDF](https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf)
- [Polar API License Agreement](https://www.polar.com/en/legal/polar-api-agreement)
- [Suunto API zone](https://apizone.suunto.com/)
- [Wahoo API Agreement](https://fr-eu.wahoofitness.com/wahoo-api-agreement)
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511)
- [Android Health Permissions Guidance](https://support.google.com/googleplay/android-developer/answer/12991134)
- [Google Play User Data Policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Terra API](https://tryterra.co/)
- [Terra blog — Strava API changes](https://tryterra.co/blog/strava-discontinues-api)
- [Vital / Junction Terms](https://www.tryvital.com/terms)
- [ROOK Docs](https://docs.tryrook.io/)
- [Strava API Agreement](https://www.strava.com/legal/api)
- [Strava API Policy](https://www.strava.com/legal/api_policy)
