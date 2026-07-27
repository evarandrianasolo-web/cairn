# 08 — UX d'import, parcours utilisateur, coût de support

> **Question de fond, sans complaisance** : la friction d'un modèle « fichiers seulement » est-elle soutenable pour un produit vendu en abonnement, dans un marché où le one-click Strava est le standard depuis 10 ans ?
>
> Réponse en fin de document (§7). Pour y arriver, il faut d'abord **quantifier** — pas qualifier — la friction à chaque étape.

## 0. Contraintes structurantes de l'onboarding

Deux règles absolues :

1. **L'inscription ne doit JAMAIS être bloquée par la génération d'archive Strava.** Cette génération prend « quelques heures à 10 jours » (le brief cite cette fourchette ; la doc Strava officielle dit « may take a few hours »). Attendre 10 jours pour accéder au produit qu'on vient de payer = churn 100 %.
2. **Un utilisateur palier 1 (voir doc `04`) doit avoir un plan utilisable dès la première minute.** Sans exception.

Le parcours d'onboarding est donc **découplé** de la démarche d'archive : on démarre en palier 1, l'archive est un « bonus » qui arrive plus tard.

---

## 1. Parcours d'onboarding — étape par étape avec compteur d'actions

### Étape A — Inscription et paiement (T + 0)

| # | Action | Actions utilisateur | Temps estimé |
|---|---|---|---|
| A1 | Landing page → CTA « essayer 7 jours » | 1 clic | 5 s |
| A2 | Saisie email + mot de passe + case CGU/AI Act | 3 champs | 45 s |
| A3 | Bannière AI Act art. 50 « vous discutez avec une IA » (règle CLAUDE.md) | 1 lecture, pas de clic (bannière persistante) | 5 s |
| A4 | Écran paiement (trial 7 j déjà en place) | 1 formulaire CB + confirmation | 90 s |

**Total étape A : ~2 min 30, 5 actions.** — c'est le funnel typique de n'importe quelle app SaaS payante.

### Étape B — Questionnaire d'onboarding (T + 2 min 30)

C'est **le socle** du palier 1. Si ce questionnaire est bâclé, le plan est mauvais et la mission produit est perdue (voir doc `04` § 3).

**Structure recommandée** — 8 écrans, chacun ≤ 3 champs :

| # | Écran | Contenu | Actions | Temps |
|---|---|---|---|---|
| B1 | Objectif principal | Type d'objectif (course cible / forme / retour au sport), date | 2 champs | 30 s |
| B2 | Course cible (si applicable) | Nom / distance / D+ / date | 4 champs | 60 s |
| B3 | Volume actuel | Heures/semaine, séances/semaine typiques | 2 champs | 30 s |
| B4 | Sortie longue habituelle | Durée + D+ | 2 champs | 20 s |
| B5 | Contraintes hebdo | Jours indisponibles + séances club fixes (mardi/jeudi cf. CLAUDE.md) | 2 checkboxes | 30 s |
| B6 | Références allures / FC | Optionnel : allure 10K, VMA, FC max/repos si connues | 3 champs optionnels | 45 s (skip 5 s) |
| B7 | Historique blessure & fatigue | Case « pause > 2 sem récentes ? » + « douleur actuelle ? » | 2 champs | 20 s |
| B8 | Consentement santé (doc `06` § 3) | 2 cases (analyse FC + transmission dérivée LLM), granulaires, décochées par défaut | 2 checkboxes | 30 s |

**Total étape B : ~4 min 30 pour une utilisatrice qui prend son temps, ~7 min si elle skip aucune option.**

### Étape C — Génération du plan et première conversation coach (T + 7 min)

| # | Action | Actions utilisateur | Temps |
|---|---|---|---|
| C1 | Écran « Cairn prépare votre plan » (skeleton loader, 3-6 s réelles) | 0 | 5 s |
| C2 | Présentation du plan sur 4 prochaines semaines | 0 (lecture) | 60 s |
| C3 | Premier message coach : « votre plan est prêt, voulez-vous m'en dire plus sur X ? » | 0 ou 1 message | 30 s à 3 min |
| C4 | Bandeau discret : « votre plan sera plus précis avec un historique — 3 options : (a) upload d'une séance récente 30 s, (b) demander votre archive Strava 15j de délai, (c) plus tard » | 0 | — |

**Total étape C : ~2 à 5 min selon curiosité.**

### 🎯 **Total onboarding = 9 à 15 min, ~15-25 actions utilisateur.**

**Comparaison** : Runna (avec OAuth Strava) claim un onboarding à 3-5 min. Cairn est **~3× plus long**. C'est le coût direct de la sortie API.

**Ce coût peut être amorti** si :
- Le plan produit est meilleur (personnalisation plus fine que « je récupère 6 semaines Strava et je lance un template »).
- Le questionnaire est perçu comme sérieux et rassurant, pas comme un formulaire administratif.

**Ce coût est fatal** si :
- Le questionnaire est perçu comme intrusif ou fastidieux.
- Le plan produit à J+9 min ressemble à un template générique.

---

## 2. Parcours d'archive Strava (asynchrone, opt-in)

Chemin secondaire, jamais bloquant.

| # | Action | Actions utilisateur | Temps réel |
|---|---|---|---|
| D1 | Depuis Cairn, bouton « Importer mon historique Strava » | 1 clic | 3 s |
| D2 | Écran « voici comment faire » — tuto avec captures d'écran étape par étape | Lecture | 45 s |
| D3 | L'utilisatrice bascule sur `strava.com/athlete/delete_your_account` → « Request your archive » | 3 clics sur strava.com | 60 s (dont saisie mot de passe possible) |
| D4 | Écran Cairn de confirmation « on vous a envoyé un rappel dans 24h — dès que vous recevez l'email Strava, revenez ici » | 1 clic « ok » | 5 s |
| D5 | 🕐 **Attente 4h à 10 jours** — l'utilisatrice reçoit un email Strava avec un lien de téléchargement | asynchrone | ~heures à jours |
| D6 | L'utilisatrice télécharge l'archive (fichier ZIP, potentiellement > 500 Mo) | 1 clic + download | 30 s à 5 min |
| D7 | L'utilisatrice ouvre Cairn (retour depuis email de rappel) → dépose l'archive dans une zone de dépôt | 1 drag&drop | 10 s |
| D8 | Écran « import en cours » (spike doc `07` : viser < 5 min pour 500 activités) | attente | 30 s à 5 min |
| D9 | Rapport d'import : « N ajoutées, M ignorées comme doublons, K rejetées » (doc `03` § 4.3) | Lecture | 30 s |

**Total étape D côté utilisateur : ~4 min d'attention active répartie sur 1-15 jours calendaires.**

**⚠️ Point critique** : entre D4 et D5, il y a une **fenêtre de plusieurs jours** pendant laquelle l'utilisatrice peut abandonner le processus. Sans email de rappel efficace (« votre archive Strava est prête, un dépôt en 30 s pour affiner votre plan »), le taux de complétion sera bas.

**Estimation taux d'abandon plausible entre D4 et D9** : **40 à 70 %**. Chiffre à mesurer, non à supposer.

---

## 3. Ajout d'une séance au quotidien — parcours cible

Une app de coaching a un rythme **hebdomadaire à quotidien**, pas temps réel. On peut viser :
- **Utilisateur discipliné** : 2-3 min/semaine.
- **Utilisateur oublieux** : le coach IA relance gentiment.

### 3.1 Trois chemins, du plus rapide au plus riche

| Chemin | Actions | Temps | Richesse |
|---|---|---|---|
| **Saisie manuelle rapide** | 3-4 champs (durée, type, RPE, notes) — bouton « aujourd'hui, en 20 s » depuis l'écran d'accueil | 5 clics | **20-30 s** | Pauvre (pas de GPS, pas de FC) — palier 1/2 |
| **Upload d'un `.fit` isolé** | 1 drag&drop + confirmation d'import | 2 clics | **30-60 s** | Riche |
| **Auto-import via API montre** (optionnel, voir §5) | 0 (background) | 0 s côté user | Riche |

### 3.2 Rappels et discipline

Le coach IA peut proactivement (via un scheduled task de type message push discret) :
- Dimanche soir : « comment s'est passée ta semaine ? tu veux qu'on saisisse tes séances ? » → ouvre un flux de saisie batch.
- Après une séance planifiée : « c'était le tempo aujourd'hui — dis-moi comment tu l'as ressenti » (RPE en 1 clic).

**Discipline visée** : 90 s/jour d'engagement moyen, cohérent avec ce que demande un carnet d'entraînement papier historique.

---

## 4. Estimation honnête du coût de support

**Postulat** : le canal support principal est un chat embarqué + email. Escalade rare (1er niveau : Eva).

### 4.1 Typologie des tickets attendus

| Sujet | Fréquence attendue (par 100 utilisateurs actifs / mois) | Complexité | Automatisation possible |
|---|---|---|---|
| « Mon archive Strava n'arrive pas » | 5-15 | Faible (« attendez le mail Strava, on ne peut pas accélérer ») | Chatbot FAQ, non touche pas au produit |
| « Mon fichier FIT n'a pas été importé » | 3-10 | Moyenne (regarder les logs de parsing) | Message d'erreur clair au moment de l'import + endpoint « diagnostic de fichier » |
| « Cairn n'a pas reconnu une activité comme doublon / a doublé une activité » | 2-5 | Moyenne (matrice de dédup, doc `03` § 4.2) | UI de fusion manuelle à prévoir |
| « Mon plan me semble trop dur / trop facile » | 5-15 | Élevée (juger de la sortie moteur) | Fonction « demander une révision » qui alimente le moteur |
| « Comment j'exporte mes données ? » | 1-3 | Faible | Bouton libre-service (doc `06` § 7) |
| « Je veux supprimer mon compte » | 1-3 | Faible → moyenne (RGPD) | Bouton libre-service + confirmation |
| « Ma FC n'est pas prise en compte » | 3-5 | Moyenne (consentement + parsing) | Rappel dans la timeline « pensez à activer le consentement santé » |
| « Le CSV Strava a été rejeté » | 2-8 | Moyenne (langue anglaise recommandée) | Message d'erreur qui explique le pourquoi + lien pour re-générer avec la bonne langue |
| Bugs plateforme divers | 1-3 | Élevée | Ticket individuel |

**Total : ~25-70 tickets / mois pour 100 utilisateurs actifs.** À rapprocher d'apps grand public bien conçues qui tournent à 5-10 tickets / 100 users / mois. **Cairn est significativement au-dessus**, principalement à cause des sujets « fichier ».

### 4.2 Investissements qui font baisser le coût de support

Investir tôt sur :
- **Preview d'import avant confirmation** (« vous êtes sur le point d'importer 342 activités entre 2019 et 2026, dont 15 seront ignorées comme doublons — continuer ? »).
- **Messages d'erreur actionnables**, jamais génériques (« votre TCX commence par des espaces (bug Strava connu), on a corrigé automatiquement » ≠ « erreur de parsing »).
- **Endpoint « diagnostiquer mon fichier »** que l'utilisateur peut appeler avant l'import — retourne un rapport de ce que Cairn a vu / ne peut pas lire, sans persister.
- **Guide vidéo court** pour la démarche archive Strava.

Sans ces investissements, le coût support devient prohibitif. **Budget à provisionner : ~1-2 semaines-dev tous les 2-3 mois pour maintenir l'outillage de support.**

---

## 5. APIs montre en option SECONDAIRE

Le brief est explicite : APIs = **confort**, pas socle. Réévaluation succincte des candidates crédibles.

### 5.1 Garmin Connect Developer Program

**[LU sur source officielle]** — la page produit et l'AI Transparency Statement confirment :
- **Business use only**, application + evaluation key + production review requis.
- Exigence : mention **AI transparency** dans la privacy policy si des données utilisateur alimentent une IA.
- Consentement explicite utilisateur requis avant tout traitement.
- **Délai d'admission** : non documenté publiquement.
- **Coût d'accès Health API** : réputé ~5000 USD (source tierce non-confirmée, voir socle ADR précédent). Non blocant pour Activity API.

**Décision** : Garmin **en option confort** pour athlètes Garmin qui souhaitent l'auto-import. À postuler dès que les 30 premiers utilisateurs Garmin payants le demandent.

### 5.2 COROS Open API

**[LU sur socle ADR précédent]** — portail développeur non ouvert publiquement, retour support COROS explicite : « we are unable to offer API access to all parties who apply ».

**Décision** : rester en **upload FIT** pour athlètes COROS. Réévaluer si COROS accepte notre application.

### 5.3 Polar AccessLink

- Ouvert, gratuit, mais fenêtre d'historique API courte (typiquement 28 jours à la connexion).
- Combiner avec import FIT initial si l'utilisateur veut son historique complet.

**Décision** : intégration Polar utile mais peu prioritaire (base installée trail Polar plus petite que Garmin/COROS/Suunto).

### 5.4 Suunto / Wahoo / Apple HealthKit / Health Connect

Voir socle ADR précédent (docs `architecture/socle/`). Priorités reportées à après stabilisation du parcours fichier.

### 5.5 Récapitulatif

| API | Priorité | Prérequis | Coût estimé |
|---|---|---|---|
| Garmin Activity | **Moyenne** | Postuler, DPA, mention AI dans privacy policy | Faible (dev only) |
| Garmin Health | Basse | +~5000 USD, plus de contraintes | Élevé |
| Polar AccessLink | Basse | Postuler, gratuit | Faible |
| COROS | Reporté | Attendre ouverture | Inconnu |
| Suunto | Reporté | Postuler | Faible |
| Wahoo | Reporté | Postuler, DPA | Faible |
| Apple HealthKit | Basse | App iOS + Apple Developer Program | Faible (99 $/an) |
| Android Health Connect | Basse | App Android + Play Console | Faible (25 $ one-shot) |

Aucune API n'est prérequis au lancement.

---

## 6. Communication produit — que dire, que ne pas dire

### Ce qu'on peut dire honnêtement
- « Cairn fonctionne à partir de vos fichiers de montre — Garmin, COROS, Suunto, Polar, Apple Watch, tous compatibles ».
- « Vos données restent vôtres, exportables à tout moment ».
- « Aucune dépendance à un service tiers qui peut couper demain ».
- « Sans historique, votre plan est prêt en 10 minutes ».

### Ce qu'on ne peut pas dire
- « Comme Runna, en mieux » — Runna a l'OAuth Strava, Cairn ne l'a pas.
- « One-click import » — c'est faux, il y a une démarche.
- « Auto-sync » sans qualifier — pas de vraie synchro automatique tant qu'API montre pas intégrée.

### Ce qu'il faut préparer côté FAQ / landing
- Question **la plus attendue** : « pourquoi je ne peux pas juste me connecter à Strava ? »
- Réponse préparée, courte, honnête : « Les conditions Strava de juin 2026 nous interdisent d'utiliser leurs données pour de l'IA et du coaching. Plutôt qu'un service fragile qui peut être coupé, on a choisi une méthode d'import universelle, un peu plus longue au démarrage, mais qui vous appartient. Voici comment ça marche ». Lien vers guide.

---

## 7. Réponse à la question centrale

**La friction d'import rend-elle le produit invendable en abonnement ?**

**Mon avis argumenté — non, mais à des conditions précises.**

**Ce qui rend le produit vendable malgré la friction** :
1. Le palier 1 doit être **vraiment bon dès la première minute**. Pas un plan template — un plan qui fait dire « ce truc a compris ma situation ». Cela réside dans la profondeur du questionnaire d'onboarding et la qualité du moteur, pas dans l'ingestion.
2. Le questionnaire doit être **perçu comme sérieux**, pas comme un formulaire administratif. Ton, longueur, feedback intermédiaire.
3. Le pitch commercial doit **assumer** la friction et la retourner en argument (indépendance, portabilité, universalité), pas la cacher.
4. La cible marketing initiale doit être **des athlètes qui ont déjà été frustrés** par un service coupé ou par un plan Strava/Runna trop générique. Pas les débutants « je découvre le trail via Strava ».
5. Le tarif doit refléter la profondeur, pas essayer d'aller sur le pas de porte de Runna (~10-15 €/mois). Positionnement 15-25 €/mois plausible.

**Ce qui rend le produit invendable** :
- Un moteur palier 1 faible qui produit des plans template. Alors le questionnaire long apparaît gratuit.
- Un import archive qui échoue silencieusement ou produit des messages cryptiques.
- Une comm qui joue l'égalité avec Runna sans le supporter techniquement.

**Verdict** : la friction est **soutenable** mais **pas gratuite**. Elle **transforme le produit** — du one-click SaaS vers un outil de coaching pris au sérieux. C'est un choix stratégique cohérent, dans lequel la valeur perçue doit être plus haute pour compenser.

Le vrai risque n'est pas la friction ingestion. Le vrai risque est **la qualité du moteur palier 1**. Si le moteur nécessite 6 semaines de données pour être bon, l'architecture est mal calibrée pour le modèle économique.

Ce point doit être testé **avant** d'ouvrir la beta payante. Un utilisateur test qui remplit l'onboarding et note le plan sur 10 : c'est la métrique décisive.

---

## 8. Sources primaires

- Strava support « Exporting Your Data and Bulk Export » : `https://support.strava.com/hc/en-us/articles/15401919-exporting-your-data-and-bulk-export`
- Garmin Connect Developer Program Agreement : `https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf`
- Garmin AI Transparency Statement : `https://www.garmin.com/en-US/legal/ai-transparency-statement/`
- Socle ADR-001 : `docs/architecture/socle/ADR-001-choix-du-socle.md`
- Brief primaire : `BRIEF-strava-architecture-alternative.md`
