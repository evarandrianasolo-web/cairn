# Brief — Contraintes API Strava & recherche d'architecture alternative

> Document de contexte destiné à Claude Code.
> Rédigé le 26/07/2026. À revérifier contre le texte live avant toute décision d'architecture.

---

## 1. Contexte projet

Construction d'un SaaS destiné aux traileurs / coureurs, en français, avec trois fonctions cœur :

1. **Récupération automatique des activités** (montre GPS → app)
2. **Planification d'entraînement** adaptative (plan qui se recalibre selon la charge réelle)
3. **Analyse IA** des séances et de la progression

Modèle économique visé : abonnement.

**Le problème :** l'hypothèse initiale était de bâtir sur l'API Strava. L'analyse des conditions
d'utilisation montre que cette voie est structurellement bloquée. Ce document sert à cadrer la
recherche d'une architecture alternative.

---

## 2. Sources juridiques

Le lien souvent cité `developers.strava.com/policy` renvoie un **404**. Les textes qui font foi :

| Document | URL | Version |
|---|---|---|
| Strava API Agreement | `https://www.strava.com/legal/api` | effective 01/06/2026 |
| Strava API Policy | `https://www.strava.com/legal/api_policy` | effective 01/06/2026 |

⚠️ La numérotation des clauses ci-dessous provient d'une lecture du 26/07/2026.
**À revérifier** avant tout usage contractuel ou juridique.

---

## 3. Synthèse des contraintes — classées par criticité

### 🔴 ROUGE — bloquants structurels

| Clause | Contenu | Impact produit |
|---|---|---|
| **§5.3** | Interdiction d'utiliser les données Strava, directement ou indirectement, en lien avec le développement, l'entraînement, l'évaluation **ou le fonctionnement** de toute AI Application. Couvre explicitement : fine-tuning, grounding, embeddings, RAG, et « ingestion dans une fenêtre de contexte ou une mémoire de travail ». | **Tue la fonction analyse IA.** Ne concerne pas que l'entraînement de modèles : vise aussi l'inférence. Envoyer une activité Strava à un LLM = interdit. |
| **§5.4** | Interdiction de traiter les données Strava — même agrégées, dé-identifiées ou anonymisées — à des fins d'analytics, d'analyses, de génération d'insights ou d'amélioration produit. Interdiction de les combiner avec d'autres données client. | **Tue le calcul de charge** (ACWR, tendances, comparaisons période à période) s'il s'appuie sur des données Strava. |
| **§6.2** | Rétention en cache limitée à **7 jours**. | **Tue la planification adaptative.** Un moteur de plan a besoin de 6 à 12 mois d'historique. |
| **§5.5** | Interdiction d'accumuler les données via appels répétés dans un corpus, dataset, archive ou base. Interdiction de stocker dans tout « Persistent Index » (vector store, embedding store, index de recherche, knowledge graph). | Interdit toute base de données d'activités. |

**Conclusion : §5.3 + §5.4 + §6.2 rendent le produit visé incompatible avec l'API Strava.**
Ce ne sont pas des contraintes contournables par du design ; elles visent le cœur de la proposition de valeur.

### 🟠 ORANGE — contraintes fortes, contournables selon architecture

| Clause | Contenu | Note |
|---|---|---|
| **§5.8** | Interdiction de facturer l'accès aux API Materials. **Mais** : autorisation explicite de facturer des fonctionnalités que Strava ne fournit pas et qui ne dupliquent pas substantiellement ses propres fonctions. | La monétisation n'est **pas** interdite en soi. La clause « no monetization » souvent citée est une lecture inexacte. |
| **§5.2** | Interdiction de développer une app concurrente ou imitant Strava. | La planification d'entraînement se rapproche des fonctions natives Strava (et de Runna, racheté par Strava en avril 2025). Zone d'exposition. |
| **§5.10** | Interdiction de vendre / céder les données Strava à un tiers, y compris à des fournisseurs d'IA, **même avec consentement utilisateur**. | Bloque tout appel à une API LLM externe avec de la donnée Strava. |
| **§6.1** | Les données d'un utilisateur ne peuvent être affichées qu'à cet utilisateur. Carve-out ambigu pour les apps ≤ 9 999 athlètes. | Bloque toute fonction coach / club / partage entraîneur. |
| **§5.16** | Interdiction d'opérer un serveur MCP, une interface agent, un proxy ou un agrégateur ré-exposant l'API Strava à des tiers. Le Strava MCP officiel est réservé à l'usage personnel de l'abonné. | Interdit une couche d'abstraction commercialisée. |
| **§3.3** | Tiers d'accès : Standard ≤ 10 utilisateurs, ou ≤ 9 999. **Extended Access** au-delà de 10 000, au cas par cas sur approbation. Le tier Standard exige un abonnement Strava actif du développeur (~11,99 $/mois). | Le passage des 10 000 est le moment de vérité : revue produit et conformité. |

### 🟢 VERT — autorisé / voies de sortie

| Clause | Contenu | Exploitation possible |
|---|---|---|
| **§6.6** | Le droit de chaque utilisateur d'exporter gratuitement ses propres données via le Bulk Data Export Tool est explicitement préservé. | **Voie d'échappement principale.** Si l'utilisateur télécharge son archive et l'uploade dans l'app, le flux ne passe pas par les « API Materials » → l'API Policy ne s'applique pas. UX dégradée mais juridiquement propre. |
| **§7.1** | L'upload d'activités **vers** Strava est autorisé. | Permet de pousser les séances planifiées / réalisées vers Strava (valeur sociale conservée). |

### ⚠️ Risque opérationnel (hors clauses de conformité)

- **§2.1** — Strava peut révoquer l'API Token et couper l'accès **à tout moment, sans préavis ni compensation**.
- **§4.4 / §7.4** — En cas de résiliation ou de révocation : suppression complète des données Strava sous **30 jours**, certification écrite sur demande, information des utilisateurs. Strava peut auditer.
- **Droit applicable** : droit irlandais et juridiction irlandaise pour un développeur situé dans l'EEE.
- **Contexte** : Strava est en phase pré-IPO. Le durcissement de juin 2026 va dans le sens d'un contrôle accru de l'actif « donnée », pas l'inverse.

**Traduction produit :** pour un SaaS payant, une coupure d'API = arrêt de service immédiat,
remboursements, churn, et défaut potentiel sur le contrat client. Risque existentiel, pas incident.

---

## 4. Benchmark concurrent — Borner (bornerapp.com)

Acteur français, app de plan trail. Utile comme validation de marché **et** comme illustration du risque.

**Ce qui est observable publiquement :**
- Connexion OAuth Strava **obligatoire** → l'app est bien sur les API Materials, pleinement soumise à l'Agreement.
- Communication : « Coaching IA et analyse de séances inclus », « copilot IA », « synchro Strava native ».
- Modèle : **14 jours d'essai gratuit, puis payant.**
- Un article comparatif de mai 2026 les positionnait encore en « gratuit (beta) » → la monétisation
  est arrivée à peu près au moment de l'entrée en vigueur de la nouvelle Policy (01/06/2026).
  Leur architecture a donc été conçue **avant** ce texte.

**Lecture :** sur la base de ce qu'ils affichent, la combinaison IA + analyse + facturation + OAuth Strava
heurte §5.3, §5.4, §5.8 et §6.2. Trois hypothèses, non départageables de l'extérieur :
(a) Strava n'est qu'un connecteur d'onboarding, le socle analytique étant ailleurs ;
(b) accord négocié (Extended Access / allowlist) — improbable à ce stade ;
(c) non-conformité non encore challengée — **hypothèse la plus probable**, le texte n'ayant que 8 semaines.

**⚠️ Nuance importante à ne pas perdre :** lu littéralement, §5.3 + §5.4 rendent quasiment toute app
d'entraînement illégale, y compris celles que Strava dit tolérer. Leur communication de 2024 précisait
que le coaching et l'analyse de performance restaient permis et que moins de 0,1 % des apps étaient
touchées. Strava a par ailleurs racheté Runna (avril 2025), qui utilisait ses API et facturait 20 $/mois.
Il existe donc un **écart réel entre le texte maximaliste et l'intention affichée**. Tout l'écosystème
vit dans cet écart. Mais §5.3 est la seule clause *ajoutée et durcie* en juin 2026, juste avant l'IPO :
c'est celle qui sera probablement appliquée.

**Actions de vérification concurrentielle (à faire manuellement, 10 min) :**
1. Lancer le flow OAuth Borner → l'écran de consentement Strava liste les scopes exacts.
   Présence de `activity:read_all` + `profile:read_all` ⇒ aspiration de l'historique complet
   ⇒ stockage bien au-delà de 7 jours.
2. Lire leur politique de confidentialité (§7.3 les oblige à publier une politique RGPD décrivant
   collecte et rétention). Une durée de rétention des activités mentionnée = non-conformité auto-documentée.
3. `strava.com/settings/apps` pour inspecter puis révoquer les autorisations.

---

## 5. Objectif de la mission

Concevoir une architecture qui délivre **plan adaptatif + analyse IA + monétisation par abonnement**
sans dépendance structurante à l'API Strava.

### Principes directeurs

1. **Strava = connecteur d'onboarding optionnel, jamais socle de données.**
   Objectif : si l'accès Strava est coupé demain, le produit continue de fonctionner intégralement.
2. **Le socle de données doit autoriser rétention longue, analyse et IA.**
3. **Toute donnée alimentant un LLM doit provenir d'une source dont les CGU l'autorisent.**
   Tracer la provenance de chaque champ jusqu'à sa source, dans le modèle de données lui-même.
4. **Cloisonnement strict** : si une intégration Strava existe malgré tout, isoler ces données
   dans un espace séparé, avec TTL 7 jours, jamais mélangé au reste, jamais envoyé à un LLM.

### Sources de données à évaluer (par ordre de priorité présumée)

| Source | À vérifier |
|---|---|
| **Garmin Connect Developer Program** | Réputé nettement plus permissif sur stockage et analyse. Candidat socle n°1. Délai et conditions d'admission au programme ? |
| **COROS Developer / Open API** | Forte pénétration trail. Conditions ? |
| **Polar AccessLink** | Conditions de rétention et d'analyse ? |
| **Suunto / Wahoo** | Complément. |
| **Apple HealthKit / Android Health Connect** | Données on-device, cadre différent (App Store Review Guidelines). Contraintes IA ? |
| **Fichiers FIT / GPX / TCX uploadés par l'utilisateur** | Zéro dépendance plateforme. Fallback universel — devrait exister quoi qu'il arrive. |
| **Agrégateurs (Terra, Vital, Rook)** | Reportent le problème sur un tiers : vérifier leurs propres CGU amont, notamment vis-à-vis de Strava. |
| **Export Strava utilisateur (§6.6)** | Upload manuel de l'archive. Hors périmètre de l'API Policy. Vérifier néanmoins les ToS grand public Strava. |

### Livrables attendus

1. **Tableau comparatif des sources** sur : rétention autorisée, droit d'analyse, usage IA autorisé,
   monétisation autorisée, coût, délai d'admission, couverture matériel du public cible (trail FR).
2. **Recommandation de socle** + stratégie de fallback.
3. **Schéma d'architecture de données** avec traçabilité de provenance et cloisonnement par source.
4. **Impact UX de la perte du one-click Strava** à l'inscription, et parcours de compensation.
5. **Liste des points à faire trancher par un avocat tech** avant commercialisation.

---

## 6. Points ouverts / décisions à prendre

- [ ] Écrire à `developers@strava.com` en décrivant le cas d'usage — la Policy invite explicitement
      à les contacter pour les usages non couverts ou pour une allowlist. Une réponse écrite,
      même partielle, vaut mieux que l'interprétation d'un texte volontairement flou.
- [ ] Arbitrer : Strava en import optionnel malgré tout, ou exclusion totale ?
- [ ] Le moteur de plan peut-il fonctionner sur données déclaratives seules (objectif, volume,
      contraintes hebdo, RPE, ressenti) en dégradé, sans aucune synchro ? → détermine la robustesse.
- [ ] Vérifier les CGU des fournisseurs LLM sur les données de santé / sport (RGPD, données sensibles).
- [ ] Relecture par un avocat tech avant mise en marché (indemnisation, audit, résiliation).

---

## 7. Rappel

Analyse produite par un assistant IA, non juriste. Les clauses citées doivent être revérifiées
contre le texte en vigueur. L'exposition contractuelle (indemnisation, audit, résiliation)
justifie une relecture professionnelle avant toute commercialisation.
