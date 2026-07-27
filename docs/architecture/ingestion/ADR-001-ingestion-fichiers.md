# ADR-001 (ingestion) — Ingestion exclusivement par fichier utilisateur

- **Statut** : Proposé — **spike doc `07` exécuté le 27/07/2026 (voir `07-spike-resultats.md`)**, résultats favorables sur les 15 points mesurés (whitelist confirmée, `@garmin/fitsdk` + `fast-xml-parser` validés, parsing < 5 min largement atteint). Conditionné à la validation par juriste (doc `06` § 11) et à la levée des questions N1–N6 de `QUESTIONS-OUVERTES.md` (CSV FR, headers dupliqués, stabilité inter-exports, fichiers `.gz` non typés).
- **Date** : 27/07/2026.
- **Auteurs** : Claude (assistant IA), sous supervision Eva.
- **Contexte** : `BRIEF-strava-architecture-alternative.md`, docs `01` à `08` du présent dossier.
- **Superseded** : reprise et prolongement de `docs/architecture/socle/ADR-001-choix-du-socle.md` — la présente ADR ne le remplace pas mais **change le socle primaire** : là où l'ADR socle retenait Garmin API comme primaire, la présente ADR retient le **fichier utilisateur** comme socle exclusif.

---

## Contexte

L'ADR précédente (`socle/ADR-001-choix-du-socle.md`) proposait Garmin Connect Developer Program comme socle primaire, avec fichier FIT/GPX/TCX en fallback universel. La décision produit ultérieure — actée en amont de la présente mission — retient une **posture plus stricte** :

> L'application n'utilisera aucune API Strava. L'ingestion se fera exclusivement par fichiers fournis par l'utilisateur lui-même (export d'archive Strava, fichier FIT/GPX/TCX isolé, saisie manuelle).

Cette posture est plus restrictive : elle exclut aussi Garmin, COROS, Polar et consorts en tant que **socle**. Ils peuvent revenir plus tard, mais uniquement comme option de confort.

**Trois raisons cumulatives** :
1. **Conformité contractuelle Strava** — la voie fichier passe par §6.6 Strava (Bulk Export utilisateur) + art. 20 RGPD (portabilité, non neutralisable par CGU). Pas d'API Materials = pas d'API Policy Strava. Analyse doc `06` § 1.
2. **Indépendance opérationnelle** — aucune API ne peut être coupée par un fournisseur. Le service tient si un fournisseur change son contrat.
3. **Universalité** — un fichier FIT/GPX/TCX vient de toutes les marques de montre, y compris marques mineures que Cairn ne veut/peut pas intégrer nativement.

**Deux coûts assumés** :
1. **Friction d'onboarding** — le one-click Strava disparaît, remplacé par un questionnaire + import ultérieur.
2. **Coût de support** — les problèmes de fichiers remontent au support, alors qu'ils étaient absorbés par les APIs.

---

## Décision

### 1. Socle exclusif d'ingestion = fichier fourni par l'utilisateur

Six chemins d'entrée (doc `01` § 1) :
- Archive ZIP Strava (Bulk Export)
- Fichier FIT / FIT.GZ isolé
- Fichier GPX isolé
- Fichier TCX isolé
- CSV template Cairn
- Saisie manuelle formulaire (**citoyen de première classe**, pas roue de secours)

### 2. Pipeline de parsing

- Bibliothèque FIT : **`@garmin/fitsdk`** (officielle Garmin, ESM, TypeScript, tolérance erreurs). Alternative `fit-file-parser` (MIT, communauté) en cas de blocage licence à vérifier au spike.
- Bibliothèque XML : **`fast-xml-parser`** en configuration sécurisée (`processEntities: false`, pas de résolution DTD).
- Bibliothèque ZIP : **`extract-zip`** (built on `yauzl`, path sanitization intégrée, streaming, `validateEntrySizes`).
- Bibliothèque CSV : famille **`csv-parse`** en mode strict RFC 4180.

### 3. Sécurité de l'ingestion — non négociable

Doc `02` en intégralité. Résumé :
- **Whitelist stricte** de l'archive Strava : `activities.csv` + `activities/*.{fit,fit.gz,gpx,tcx}` **seulement**. Tout le reste ignoré et non écrit sur disque (contacts, photos, kudos, posts, followers). Cette règle est aussi **une exigence RGPD** (absence de base légale pour les données de tiers).
- **Worker isolé** sans accès réseau sortant, timeout dur, limite mémoire.
- **Contrôles anti-zip-bomb, XXE, billion laughs, zip slip** obligatoires.

### 4. Modèle de données

Doc `03` en intégralité. Points structurants :
- **`provenance`** enum obligatoire sur chaque activité.
- **`activity_health`** en table séparée, RLS +stricte, purgeable au retrait de consentement (règle CLAUDE.md).
- **`content_hash`** pour idempotence, **`dedup_signature`** pour dédup sémantique.
- **Aucun stockage de série FC point à point** — dérivés seulement.
- **`imports` + `import_events`** pour traçabilité opérationnelle et rapport utilisateur.

### 5. Gradation à 3 paliers

Doc `04`. Le palier 1 (déclaratif seul) est le socle contractuel du service. Le moteur doit produire un plan crédible dès la première minute, sans historique. Cette exigence est **le vrai point critique** de la viabilité économique.

### 6. Séparation stricte moteur ↔ LLM

Doc `05`. Le moteur est déterministe, testable, sans LLM. Le LLM est conversationnel, restitue, propose, ne décide jamais. Le contexte transmis au LLM est **plafonné 2-4k tokens** (règle CLAUDE.md) et contient **uniquement des dérivés**, jamais de FC brute ni de série.

### 7. APIs constructeur = confort secondaire, pas socle

Doc `08` § 5. Garmin/Polar/COROS/Suunto/HealthKit/Health Connect sont des chemins d'auto-import à ajouter **après** stabilisation du parcours fichier, **jamais** en prérequis au lancement.

### 8. Aucune ingestion API Strava

- Le schéma Postgres ne comporte plus de table `strava_cache` (contrairement à l'ADR socle qui la prévoyait « au cas où »).
- Le connecteur Strava **n'est pas développé**.
- Si un jour un pont limité contractualisé s'ouvre (Extended Access négocié, changement de policy Strava), une nouvelle ADR sera écrite.

### 9. Conformité RGPD & AI Act

Doc `06`. Prérequis bloquants avant tout accès externe :
- AIPD complète et signée.
- Bannière AI Act art. 50 en UI chat.
- DPA Anthropic signé, zero-retention formalisé.
- Consentement santé séparé, révocable, effet immédiat.
- Portabilité fonctionnelle (export art. 20).

### 10. Communication produit

Doc `08` § 6. La friction est assumée et retournée en argument : indépendance, universalité, portabilité. Le tarif est positionné en cohérence (15-25 €/mois plausible), plus élevé que Runna, plus bas que TrainingPeaks Premium.

---

## Alternatives considérées et rejetées (par cette ADR)

### Alt A — Garmin API en socle primaire (position ADR socle précédente)

**Rejetée** au titre de la décision produit actée en amont. La dépendance API — même Garmin, même moins hostile — reste une dépendance opérationnelle qui peut être coupée. Le choix « pas d'API » élimine ce risque au prix de la friction. Décision cohérente pour un produit conçu pour durer.

### Alt B — Agrégateur (Terra / Vital / Rook)

**Rejetée** (déjà par l'ADR socle) : reporte le contrat amont sans l'absorber, ajoute une dépendance, ne résout pas les contraintes RGPD sur les données santé.

### Alt C — App mobile qui lit HealthKit / Health Connect en direct

**Reportée**. Techniquement intéressante (on-device), mais nécessite le développement d'apps natives iOS + Android, ce qui triple la surface de code. À reconsidérer post-MVP.

### Alt D — Renoncer à l'IA conversationnelle, garder Strava API

**Rejetée** : le coach IA est un pilier produit. Rejeter cet axe = redéfinir Cairn.

---

## Conséquences

### Positives
- Zéro dépendance à un fournisseur d'API pour livrer le service.
- Universalité matérielle réelle (toute montre qui exporte du FIT/GPX/TCX).
- Conformité contractuelle Strava atteinte (via §6.6 et art. 20 RGPD) sans négociation.
- Modèle de données propre, ancré sur la provenance.
- Le moteur peut être testé cliniquement sans LLM.
- Économie de tokens LLM (moins de contexte, plus de logique déterministe).

### Négatives et contraintes assumées
- **Onboarding ~3× plus long** qu'un OAuth Strava (~10-15 min vs 3-5 min).
- **Coût de support significatif** : ~25-70 tickets / 100 users / mois, en grande partie sur les fichiers. Investissement outillage support obligatoire.
- **Charge produit sur la qualité palier 1** — le questionnaire d'onboarding et le moteur déclaratif doivent être excellents, sinon la friction ne se justifie pas.
- **Pas de « auto-sync »** perçu par l'utilisateur au démarrage — chemin de discipline requis (saisie ou import régulier).
- **Import archive Strava = plusieurs jours de délai** entre la demande et la disponibilité effective, incontrôlable côté Cairn.

### Risques résiduels
- **Risque produit — moteur palier 1 sous-performant** → thèse « le plan tient dès jour 1 » infirmée → churn massif. **Non testé à date. À valider avant beta payante.**
- **Risque produit — friction perçue comme excessive** → mesure via cohortes T+30. Palier de décision : si retention T+30 palier 1 < 40 %, revoir le pitch commercial ou la cible.
- **Risque sécurité — parser FIT malformé** → OOM / crash worker. Traité par isolation worker + timeouts + spike doc `07`.
- **Risque conformité — ingestion accidentelle de données tiers** (contacts, kudos) → sanction RGPD. Traité par whitelist stricte, à démontrer en audit.
- **Risque conformité — DPA Anthropic non finalisé** → traitement sans base légale sur données santé. Traité par gate produit : ne pas ouvrir la conversation santé si DPA pas signé.

---

## Prérequis avant application

Non-blocants pour rédiger le code, blocants pour toute mise en production :

1. **Spike doc `07` exécuté** — sur au moins une archive Strava réelle.
2. **AIPD** rédigée et signée.
3. **DPA Anthropic** signé avec clause zero-retention.
4. **Bannière AI Act art. 50** implémentée et visible.
5. **Politique de confidentialité** complète, publiée.
6. **Test d'isolation ingestion** (`tests/isolation/ingestion.spec.ts`) écrit et passant.
7. **Relecture juridique** de l'ensemble (doc `06` § 11).

---

## Révision de cette ADR

Elle sera révisée :
- Si le spike doc `07` révèle un blocage technique majeur (parser FIT non fiable en licence compatible, temps de parsing hors budget, colonnes CSV Strava trop volatiles).
- Si la mesure de retention T+30 palier 1 infirme la thèse produit (voir doc `04` § 6).
- Si une API constructeur (Garmin, COROS) devient stratégiquement nécessaire au-delà du confort — par exemple si la cible marché exige une auto-sync perçue.
- Si le contrat Strava change (durcissement ou assouplissement §6.6).
- Si le juriste identifie un risque bloquant non anticipé.
