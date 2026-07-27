# 07 — Spike technique : validation empirique de l'ingestion

> **Statut** : SPÉCIFICATION du spike. Le spike n'a **pas encore été exécuté** — aucune archive Strava n'a été fournie à date. Ce document décrit ce qu'il faut vérifier factuellement, avec quels critères de réussite, dès qu'une ou plusieurs archives réelles seront disponibles.

## 0. Pourquoi un spike avant de coder l'ingestion

Tout le doc `01` s'appuie sur des sources indirectes (articles, projets communautaires, R packages tiers). Rien n'a été mesuré. Or les décisions produit — taille max autorisée, délai d'attente présenté à l'utilisateur, message d'erreur explicite, matrice de complétude — nécessitent des valeurs réelles.

**Un spike bien mené doit répondre à 15 questions précises avec des chiffres, pas des intuitions.**

---

## 1. Matériel nécessaire

Le spike consomme :

| # | Élément | Comment l'obtenir |
|---|---|---|
| 1 | **≥ 1 archive Strava réelle « longue »** (≥ 4 ans d'historique, ≥ 500 activités) | Générer depuis `strava.com/athlete/delete_your_account` → « Request your archive ». Compte Eva ou personne ayant consenti. Prend « quelques heures à 10 jours » — anticiper 15 jours. |
| 2 | **≥ 1 archive « courte »** (< 6 mois) | Créer un compte test si nécessaire, ou compte peu utilisé. |
| 3 | **≥ 5 fichiers FIT isolés** de sources différentes | Garmin Forerunner, COROS Apex/Vertix, Suunto Race, Polar Vantage, éventuellement Apple Watch export. Récolter via communauté / testeurs. |
| 4 | **≥ 3 fichiers GPX** de sources différentes | Strava export GPX unitaire, Komoot, application téléphone type Strava mobile en mode « juste GPS ». |
| 5 | **≥ 3 fichiers TCX** dont un exporté Strava | Pour vérifier le quirk « espaces en tête ». |
| 6 | **Fichiers volontairement malformés** | À fabriquer soi-même : FIT tronqué, ZIP avec zip-bomb-like ratio, XML avec entités récursives, CSV avec formule injection. |

**Sans le point 1**, le spike est impossible sur les branches ZIP/archive et CSV Strava.

---

## 2. Questions à répondre (15 items, tous mesurés)

### Contenu et taille

**Q1 — Structure exacte de l'archive Strava.**
- Attendu : liste effective des dossiers racines (`activities/`, `media/`, `routes/`, `posts/`, `comments/`, `starred/`, `clubs/`, `contacts_synced/`, …).
- Critère : produire un `tree -L 2` de l'archive dézippée.
- Décision engagée : la whitelist du doc `02` § 2.1.3 est-elle exhaustive ?

**Q2 — Taille compressée / décompressée / ratio maximum observé.**
- Attendu : trois nombres.
- Critère : ratio < 100:1 dans la vie réelle ? Sinon, ajuster la limite doc `02` § 2.1.1.

**Q3 — Nombre de fichiers dans l'archive.**
- Attendu : total, et ventilation par extension.
- Critère : la limite « 100 000 fichiers » du doc `02` est-elle atteinte ?

**Q4 — Distribution des formats dans `activities/`** (FIT / FIT.GZ / GPX / TCX).
- Attendu : compter chaque extension.
- Critère : quelle proportion des activités sera parsable par le pipeline FIT ? Quelle proportion tombera en GPX / TCX ?

### Encodage et format

**Q5 — Encodage effectif de `activities.csv`.**
- Attendu : présence/absence de BOM, encoding réel (UTF-8, Windows-1252, …).
- Méthode : `file -bi activities.csv`, `hexdump -C | head`.

**Q6 — Séparateur effectif de `activities.csv`.**
- Attendu : `,` ou `;`.

**Q7 — En-têtes exacts du CSV en langue actuelle du compte.**
- Attendu : liste ordonnée des colonnes.
- Vérifier avec compte configuré en français vs anglais.
- Décision engagée : est-il vraiment obligatoire de demander à l'utilisateur de basculer son compte Strava en anglais avant export (comme la lib R Athlytics le préconise) ? Documenter dans l'UI d'import.

**Q8 — Format des dates dans le CSV.**
- Attendu : ex. `Jul 27, 2026, 6:12:04 AM` ou `27/07/2026 06:12:04`.
- Critère : le parser doit accepter le format effectif.

**Q9 — Encoding des fichiers TCX exportés Strava.**
- Attendu : BOM ? Espaces en tête (bug documenté GPSBabel #371) ? Encodage UTF-8 ?
- Méthode : `hexdump -C activities/12345.tcx | head`.

### Sécurité

**Q10 — Un fichier FIT tronqué : que fait `@garmin/fitsdk` ?**
- Méthode : tronquer un `.fit` valide à 50 % puis appeler `checkIntegrity()` et `read()`.
- Attendu : liste d'erreurs collectées, pas de throw non capturé, pas de OOM.
- Décision engagée : politique du mode strict vs récupération (doc `02` § 2.3.1).

**Q11 — Un XML avec entité récursive (billion laughs) : `fast-xml-parser` avec `processEntities: false` tient-il ?**
- Méthode : fabriquer le XML classique du wikipedia billion laughs, forcer parsing.
- Attendu : parser ignore les entités, ne consomme pas des GB de mémoire.

**Q12 — Une archive ZIP avec ratio 1000:1 sur un fichier interne : `yauzl` en streaming avec `validateEntrySizes` la coupe-t-il tôt ?**
- Méthode : `dd if=/dev/zero bs=1M count=1024 | gzip -9 > bomb.gz` puis mise en ZIP.
- Attendu : erreur émise après quelques Mo streamés, kill du worker au seuil doc `02`.

**Q13 — Une archive avec `../../../etc/passwd` en nom d'entrée : rejetée ?**
- Méthode : fabriquer avec `python3 -m zipfile -c mal.zip malicious/`, éditer l'entrée avec un hex-éditeur.
- Attendu : `extract-zip` ignore l'entrée hors chemin, extraction continue proprement.

### Performance

**Q14 — Temps de parsing bout à bout d'une archive « longue ».**
- Méthode : `time` sur l'ingestion complète de l'archive Q1.
- Attendu : mesure. Objectif produit : < 5 min pour une archive de 500 activités sur un worker 1 core / 512 Mo. Sinon adapter la strategy (parallélisation, préview partiel).

**Q15 — Nombre d'activités dédupliquées correctement quand on réimporte la même archive deux fois.**
- Méthode : import 1, puis import 2 immédiat.
- Attendu : import 2 → `activities_created = 0`, `activities_ignored = N` (tout doublon exact).

---

## 3. Livrables du spike

Le spike doit produire :

1. **Un rapport `docs/architecture/ingestion/07-spike-resultats.md`** (à créer post-exécution) contenant :
   - Réponses chiffrées aux 15 questions.
   - Screenshots ou hexdumps pertinents.
   - Décisions confirmées / à revoir dans les autres docs.

2. **Un dataset de test versionné** (sous `data/sample/` — **actuellement absent**), sans donnée personnelle réelle :
   - `sample_activities.csv` (10 lignes, encoding UTF-8, colonnes canoniques).
   - `sample.fit`, `sample.gpx`, `sample.tcx` — activités anonymisées.
   - `malformed/` — les cas tordus des questions 10-13.
   - **Aucun fichier réel non-anonymisé n'est versionné**.

3. **Des tests unitaires** (`tests/ingestion/`) couvrant :
   - Parsing des 3 formats sur les samples.
   - Comportement d'erreur sur `malformed/`.
   - Test d'idempotence (double import → même `content_hash` → refus).
   - Test de whitelist ZIP (archive fictive avec fichiers hors périmètre → non ingérés).

4. **Un test d'isolation RLS ciblé** (`tests/isolation/ingestion.spec.ts`) qui :
   - Crée deux tenants.
   - Importe une archive avec chaque.
   - Vérifie qu'un tenant ne peut jamais lire l'`activities` de l'autre, même via l'accessor moteur.

---

## 4. Critères de go / no-go post-spike

Le spike doit permettre de **valider ou infirmer** l'architecture avant tout développement de production. Décisions à prendre à l'issue :

| Décision | Si go | Si no-go |
|---|---|---|
| Whitelist du doc `02` § 2.1.3 est complète | Passer à l'implémentation | Ajouter les fichiers découverts, revoir la politique d'ingestion. |
| `@garmin/fitsdk` tolère les fichiers tronqués proprement | L'adopter | Basculer `fit-file-parser` ou envisager un parser tiers. Voir `QUESTIONS-OUVERTES.md`. |
| `fast-xml-parser` en config sécurisée bloque billion laughs | Adopter | Envisager `sax` en streaming, plus lourd. |
| Temps parsing < 5 min sur archive 500 activités | Adopter le pipeline synchrone avec message d'attente | Passer en asynchrone avec notification par email (change l'UX). |
| Ratio de compression réel < 100:1 | Garder le seuil | Ajuster à la vraie donnée. |
| Colonnes CSV stables entre exports FR vs EN | UI plus simple | Forcer l'utilisateur à basculer son compte Strava en anglais (frottement UX à documenter). |

---

## 5. Coût estimé du spike

- Génération / attente archives : 1-15 jours (asynchrone, non bloquant pour d'autres tâches).
- Exécution des tests : **~2 jours** de travail effectif si tout est déjà là.
- Rédaction du rapport : ~0.5 jour.
- Correction éventuelle des docs `01`/`02`/`03` : ~0.5 à 1 jour selon les surprises.

**Total réaliste : 4-5 jours-effort, étalés sur 2-3 semaines calendaires.**

---

## 6. Ce que ce spike ne teste pas

- Coût cumulé de tokens LLM par utilisateur (voir chantier CLAUDE.md).
- Latence bout en bout de la génération de plan initiale.
- Charge cumulée d'imports simultanés en production.

Ces sujets sont hors périmètre ingestion et devront être leurs propres investigations.

---

## 7. Rien n'est simulé

Ce document ne présente **aucun résultat**. Toute affirmation quantitative dans le doc `01` marquée `[À VÉRIFIER]` doit rester `[À VÉRIFIER]` jusqu'à ce que ce spike ait produit son rapport.

Il est explicitement demandé de ne pas inventer les chiffres.

---

## 8. Script prêt à l'emploi

Le spike est déjà scripté dans `scripts/spike-strava-archive.mjs`. Une fois l'archive Strava reçue :

```bash
# Archive au format ZIP tel que Strava l'envoie
node scripts/spike-strava-archive.mjs /chemin/vers/export_XXXXX.zip

# Ou après extraction manuelle
node scripts/spike-strava-archive.mjs /chemin/vers/dossier-dezippe/
```

Le script produit `docs/architecture/ingestion/07-spike-resultats.md` avec les réponses aux 15 questions sous forme d'agrégats JSON. **Aucune donnée personnelle n'y est écrite** : uniquement compteurs, tailles, distributions, en-têtes CSV.

Dépendances déjà installées en devDependencies :
- `yauzl` (streaming ZIP)
- `@garmin/fitsdk` (parser FIT officiel)
- `fast-xml-parser` (parser XML sécurisé)

**Prérequis** : générer l'archive Strava depuis `https://www.strava.com/athlete/delete_your_account` → « Request your archive ». Attente : quelques heures à 10 jours.
