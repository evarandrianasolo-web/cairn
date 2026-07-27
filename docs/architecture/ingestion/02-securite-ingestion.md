# 02 — Sécurité de l'ingestion

> **Principe de fond** : tout fichier uploadé par un utilisateur est **hostile jusqu'à preuve du contraire**. Même quand l'utilisateur est de bonne foi, son fichier a pu être manipulé, tronqué par une batterie qui a lâché, ou fabriqué pour tester la robustesse de la plateforme. L'ingestion doit tenir face à tout ça sans jamais faire tomber le service.

Trois catégories de risque, à ne pas mélanger :
- **Risque de sécurité** : peut compromettre la plateforme (exécution, exfiltration, DoS).
- **Risque de conformité** : peut créer une violation RGPD (ingestion de données de tiers, traitement non couvert par la base légale).
- **Risque produit** : dégrade l'expérience mais n'engage ni la sécurité ni la loi (message d'erreur cryptique, fichier valide refusé).

Ce document couvre les deux premiers. Le troisième est traité doc `08`.

---

## 1. Menaces génériques upload

Applicables à tous les formats, avant même de parser.

### 1.1 Contrôles au dépôt

| Contrôle | Seuil | Comportement en échec |
|---|---|---|
| Extension autorisée | `.fit`, `.fit.gz`, `.gpx`, `.tcx`, `.zip`, `.csv` | Rejet immédiat, message clair. |
| Type MIME déclaré | cohérent avec l'extension | Warning, on continue (les MIME uploads sont peu fiables). |
| **Magic bytes réels** | vérifiés à l'ouverture (voir 1.4) | Rejet avec message : « ce fichier n'a pas la structure d'un `.fit` ». |
| Taille max archive | **500 Mo** (à ajuster après spike doc `07`) | Rejet ; suggérer de générer une archive plus courte via Strava (période limitée). |
| Taille max fichier isolé | **50 Mo** | Rejet ; un `.fit` d'une séance de 10h à 1 Hz fait < 3 Mo dans la vraie vie. |
| Rate limit par utilisateur | **10 uploads / minute**, **50 uploads / heure** | 429 avec `Retry-After`. |
| Rate limit global (protection worker pool) | **200 uploads simultanés** en cluster | File d'attente + message « import en attente ». |

**Point d'attention** : la limite « 500 Mo » n'est pas gratuite pour un athlète Strava historique de 8+ ans. Le spike doc `07` doit mesurer la taille réelle d'archives longues.

### 1.2 Anti-virus / scanner de contenu

Un fichier `.zip` uploadé peut contenir n'importe quoi (photos, PDF, exécutables déguisés en `.fit`).

**Décision** : passer chaque fichier extrait par un scanner AV (ClamAV en side-car, ou service managé). Non bloquant pour le MVP, **bloquant avant beta ouverte**.

### 1.3 Stockage transitoire

- Écriture dans un bucket « quarantaine » avec accès **uniquement au worker de parsing**, jamais servi publiquement.
- TTL 24h maximum sur ce bucket, purge automatique.
- Les fichiers originaux **ne sont pas conservés au-delà de l'extraction réussie**. On garde uniquement les données canoniques + un hash SHA-256 du fichier source pour idempotence (voir doc `03`).

### 1.4 Détection du vrai format (magic bytes)

| Format | Signature attendue | Position |
|---|---|---|
| ZIP | `50 4B 03 04` (`PK\x03\x04`) | offset 0 |
| GZIP | `1F 8B` | offset 0 |
| FIT | ASCII `.FIT` | offset 8 |
| XML (GPX/TCX) | `<?xml` ou `<`+whitespace (piège Strava TCX) | offset 0 après strip whitespace |
| CSV | pas de magic — sniff délimiteur/BOM | — |

**Règle** : jamais se fier à l'extension seule. Un `.fit` avec magic bytes ZIP → rejet motivé.

---

## 2. Menaces spécifiques par format

### 2.1 Archive ZIP — les 4 grandes classes d'attaque

#### 2.1.1 Zip bomb (DoS mémoire)

Un ZIP de 42 Ko peut se décompresser en 4,5 Po (« 42.zip » célèbre). Une archive Strava réelle est en Go, donc **on ne peut pas utiliser la seule taille compressée comme signal**.

**Contrôles** :
1. **Streaming decompression** avec `yauzl` (validateEntrySizes=true, CRC-32 vérifié) — **jamais** de `admZip.extractAllTo()` en un bloc.
2. **Ratio de compression max** : rejet si un fichier interne dépasse **100:1** (ratio (uncompressed / compressed)). Un FIT gzippé fait typiquement 3-5:1 ; un CSV fait 10-20:1 ; au-delà, suspect.
3. **Taille décompressée totale plafonnée** à 5 Go, coupée en dur si dépassée pendant le streaming.
4. **Nombre max de fichiers** dans l'archive : 100 000 (protection « quadrillion files »).

#### 2.1.2 Zip slip / path traversal

Un `.zip` peut contenir une entrée `../../../../../etc/passwd`. Extraction naïve → écrasement de fichiers hors du dossier cible.

**Contrôle** : avant chaque extraction, `path.resolve(target, entry.fileName)` **doit** rester sous `path.resolve(target)`. Sinon rejet du fichier interne (pas de l'archive entière).

**Bibliothèque** : préférer `extract-zip` (built on `yauzl`, path sanitization intégrée) plutôt que `adm-zip` (historique de CVE liées à zip slip).

#### 2.1.3 Fichiers hors périmètre — parsing en liste blanche

**C'est le contrôle le plus important pour la conformité, pas pour la sécurité.**

Une archive Bulk Export Strava contient **beaucoup plus que les activités**. Le spike du 27/07/2026 (voir `07-spike-resultats.md`) a inventorié **44 catégories de fichiers** sur une archive réelle de 4+ ans (2,44 GiB). Extrait :

```
activities/            ← WHITELIST
activities.csv         ← WHITELIST
applications.csv, bikes.csv, blocks.csv, clubs/, clubs.csv,
comments.csv, components.csv, connected_apps.csv,
contacts.csv, email_preferences.csv, events.csv, flags.csv,
followers.csv, following.csv, general_preferences.csv,
global_challenges.csv, goals.csv, group_challenges.csv,
intercom_tickets.csv, local_legend_segments.csv, logins.csv,
media/ (3 397 JPG + 95 MP4), media.csv, memberships.csv,
messaging.json, mobile_device_identifiers.csv,
monthly_recap_achievements.csv, orders.csv, partner_opt_outs.csv,
posts.csv, privacy_zones.csv, profile.csv, profile.jpg,
reactions.csv, routes/, routes.csv, segments.csv, shoes.csv,
social_settings.csv, starred_routes.csv, starred_segments.csv,
structured_details.csv, support_tickets.csv, visibility_settings.csv
```

**60 % des fichiers de l'archive sont des JPG** (photos de séance ou de profil). **95 MP4** (vidéos). Ces médias contiennent souvent d'autres personnes taggées ou visibles — Cairn n'a aucune base légale pour les traiter.

**Règle absolue** — Cairn n'extrait de l'archive Strava QUE :
- `activities.csv` (index)
- `activities/*.{fit,fit.gz,gpx,tcx}` (payload d'entraînement)

**Tous les autres fichiers sont ignorés et non écrits sur disque**. Ce filtrage se fait au niveau du streaming, avant décompression complète : `if entry.fileName not in whitelist → skip`.

Justification (voir doc `06`) : art. 5.1.c RGPD (minimisation), art. 6 (base légale — le consentement de l'utilisateur ne couvre pas les données de ses contacts, de ses followers, ni les personnes taggées dans ses photos).

**En complément, colonnes du CSV à bloquer à l'ingestion** (règle produit CLAUDE.md « aucun champ poids / IMC / calorie n'existe dans le schéma ») :
- `Poids de l'athlète`
- `Poids du vélo`
- `Calories`
- (les métriques propriétaires Strava `Charge d'entraînement`, `Intensité`, `Effort relatif` sont également ignorées pour éviter d'importer les analyses Strava — Cairn recalcule les siennes.)

**Piège CSV Strava** — le spike a détecté plusieurs en-têtes dupliqués dans la même ligne (`Temps écoulé`, `Distance`, `Effort relatif`, `Fréquence cardiaque max.`, `Déplacement-transport` apparaissent 2 fois). Le CSV n'est pas conforme au standard. Le parser doit **indexer par position** (num de colonne), pas par nom.

#### 2.1.4 Métadonnées ZIP falsifiées

Un attaquant peut mettre `uncompressedSize` faux dans le header pour tromper un checker naïf. C'est exactement le CVE traité récemment par LibreChat (PR #12320).

**Contrôle** : `yauzl` avec `validateEntrySizes: true` — vérifie que la taille décompressée **effective** correspond au header ; sinon erreur émise depuis le stream (après un certain nombre d'octets, ce qui suffit à cut avec un size cap streaming).

### 2.2 GPX et TCX — XML

#### 2.2.1 XXE (XML External Entity)

Attaque : `<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]> <trkpt>&xxe;</trkpt>`. Un parser qui résout les entités externes lit le fichier local et l'inclut.

**Contrôle** : configuration parser **stricte** — désactiver DTD, entités externes, entités paramètres. Les parsers Node concernés :
- ✅ `fast-xml-parser` avec `processEntities: false`.
- ✅ `libxmljs` avec `{ noent: false, nonet: true, doctype: false }`.
- ❌ `xml2json` en config défaut = vulnérable (utilise libxmljs sans hardening).
- ❌ `xml2js` : évaluer options `explicitArray`, `explicitCharkey` mais l'histoire CVE recommande de préférer `fast-xml-parser`.

**Décision** : `fast-xml-parser` en dépendance directe, un wrapper Cairn qui **impose** la config sécurisée à l'appel (`parseXml(buffer)` ne prend pas d'options — c'est l'API).

#### 2.2.2 Billion laughs / entity expansion

Attaque : `<!ENTITY lol "lol"> <!ENTITY lol2 "&lol;&lol;&lol;..."> …` — expansion exponentielle → OOM.

**Contrôle** : la désactivation des entités (`processEntities: false`) résout aussi ce problème. Redondance : timeout dur sur le worker (voir 4).

#### 2.2.3 Encodage

Un fichier XML annonce son encodage dans `<?xml version="1.0" encoding="…"?>`. Si l'annonce ment ou si le fichier est en UTF-16 LE avec BOM inhabituel, un parser peut mal interpréter.

**Contrôle** : détection BOM (UTF-8, UTF-16 LE/BE) en priorité sur la déclaration. Rejet des encodages exotiques (autre que UTF-8 après conversion douce).

#### 2.2.4 Taille de nœud / profondeur

Un fichier XML peut avoir un `<trkseg>` de 1 million de points → OOM lors du parsing DOM.

**Contrôle** : passer en mode streaming (`fast-xml-parser` sait faire, sinon `sax`) au-delà d'un seuil. Alternative simple : refus si le fichier XML dépasse 20 Mo (une séance normale fait < 5 Mo).

### 2.3 FIT binaire

#### 2.3.1 CRC invalide / fichier tronqué

Non malveillant en général (batterie coupée). Mais un CRC KO peut aussi signaler une falsification.

**Contrôle** : `@garmin/fitsdk` fournit `decoder.checkIntegrity()`. Si KO :
- **Mode strict** (défaut) : rejet motivé.
- **Mode récupération** (opt-in utilisateur, checkbox « importer quand même »): parsing best-effort, marquage `provenance_notes = "fit_crc_invalid_recovered"`, l'activité est ingérée mais taggée pour ne pas nourrir les tendances de charge (voir doc `03`).

#### 2.3.2 Tailles de champ aberrantes

Un `definition_message` peut annoncer un champ de 4 Go. Le SDK Garmin refuse — la lib communautaire peut allouer. **Contrôle** : limite dure côté wrapper Cairn (`max_field_size = 4096` octets, largement au-dessus des besoins réels).

#### 2.3.3 Boucles infinies (peu probable mais)

Un timeout de 60 s par fichier dans le worker suffit.

### 2.4 CSV — deux menaces différentes

#### 2.4.1 Formula injection (CSV injection)

Cette menace n'est **pas** au moment de l'ingestion (Cairn ne va pas exécuter le contenu). Elle apparaît **au ré-export** : si Cairn permet à l'utilisateur d'exporter ses données en CSV (art. 20 RGPD, doc `06`), et qu'un champ (nom d'activité par exemple) commence par `=`, `+`, `-`, `@`, tab ou CR — un tableur qui ouvre le CSV exécutera la formule.

**Contrôle au ré-export** : **préfixer par apostrophe** toute cellule commençant par un de ces caractères. Documentation OWASP formelle sur le sujet.

À l'ingestion, on **détecte** ces cas (log) mais on ne rejette pas (un utilisateur peut avoir nommé son activité `= new PR!`).

#### 2.4.2 Lignes malformées

Ligne avec un mauvais nombre de champs, guillemets non fermés, retour ligne dans une cellule.

**Contrôle** : parser CSV robuste (`csv-parse` de la famille node-csv, RFC 4180 strict par défaut), avec `on_record` qui rejette la ligne sans casser l'import. Rapport détaillé.

### 2.5 Encodages hostiles (transverse)

- **UTF-8 avec BOM** : `EF BB BF` en tête. À strip avant parsing.
- **UTF-16 LE avec BOM** : `FF FE`. Conversion en UTF-8, ou rejet motivé.
- **Windows-1252** : sans BOM, indétectable en absolu. Fallback si UTF-8 décode échoue.

---

## 3. Isolation d'exécution

Le parsing tourne dans un **worker isolé** :
- Process séparé (pas simplement `worker_threads` — préférer un container éphémère type job Docker ou une function serverless dédiée).
- **Sans accès réseau sortant** (pas de LLM ni de webhook depuis l'étape de parsing — les données ne quittent pas la sandbox à ce stade).
- Filesystem = tmpfs jetable, taille plafonnée.
- Limite mémoire (~512 Mo pour un worker donné).
- Limite CPU (1 core, `nice` élevé).
- **Timeout dur** : 60 s pour un fichier isolé, 5 min pour une archive complète. Au-delà, kill + log + message « votre fichier prend trop de temps à traiter, contactez le support ».

Si le worker meurt (OOM killer, timeout), pas de re-tentative automatique. L'utilisateur voit un échec explicite.

---

## 4. Journalisation

**Ce qu'on log** :
- Hash SHA-256 du fichier source, taille, extension, MIME.
- Format détecté après magic bytes.
- Nombre de fichiers extraits d'une archive, dont combien acceptés vs ignorés par la whitelist.
- Statut CRC pour FIT.
- Nombre de lignes acceptées/rejetées pour CSV.
- Erreurs de parsing (message, position dans le fichier).
- Décision finale (import réussi, partiel, rejeté).

**Ce qu'on NE log JAMAIS** :
- Contenu des activités (positions GPS, FC, aucun octet du fichier).
- Nom de l'utilisateur ou email.
- Contenu des fichiers ignorés (contacts, posts).

Logs conservés 30 j pour debug ; agrégats (compteurs par erreur) conservés au-delà.

---

## 5. Checklist finale — comportement attendu par contrôle

| # | Contrôle | Formats concernés | En échec → |
|---|---|---|---|
| 1 | Extension whitelist | tous | Rejet HTTP 415, message « extension non supportée ». |
| 2 | Taille max | tous | Rejet HTTP 413. |
| 3 | Rate limit user | tous | HTTP 429 + `Retry-After`. |
| 4 | Magic bytes cohérents | tous binaires | Rejet motivé. |
| 5 | Extraction ZIP en streaming + validateEntrySizes | ZIP | Erreur → arrêt propre du stream. |
| 6 | Ratio compression max 100:1 | ZIP | Rejet archive complète, log alerte. |
| 7 | Path traversal sanitizing | ZIP | Fichier interne ignoré, autres continuent. |
| 8 | Whitelist `activities/` + `activities.csv` | ZIP Strava | Autres fichiers **non lus**. |
| 9 | Nombre max fichiers 100 000 | ZIP | Rejet. |
| 10 | XML parser `processEntities: false`, pas de DTD | GPX, TCX | Impossible d'atteindre l'échec — le parser ne résout pas. |
| 11 | Encodage détecté par BOM | XML, CSV | UTF-16 → conversion ; encodage exotique → rejet. |
| 12 | Trim leading whitespace | TCX Strava | Silent — reprend spec RFC. |
| 13 | FIT CRC check | FIT | Rejet OU mode récupération opt-in. |
| 14 | Taille champ FIT max 4 Ko | FIT | Erreur wrapper, rejet fichier. |
| 15 | Ligne CSV malformée | CSV | Ligne ignorée, poursuite import. |
| 16 | Détection formula injection à l'ingestion | CSV | Log seulement, pas de rejet. |
| 17 | AV scan | tous | Détection = rejet + log incident sécurité. |
| 18 | Worker isolé sans réseau sortant | tous | — (préventif). |
| 19 | Timeouts durs (60 s / 5 min) | tous | Kill worker + notification utilisateur. |
| 20 | Fichier source purgé après extraction | tous | — (préventif RGPD). |

---

## 6. Ce qui reste ouvert

- **Choix précis de l'AV** (ClamAV embarqué ou SaaS type VirusTotal Enterprise) → voir `QUESTIONS-OUVERTES.md`.
- **Runtime du worker** : job container (ex : Vercel Sandbox, Fly Machines, Modal, workers Cloudflare) vs job classique dans le monolithe. Impact coût et latence à mesurer.
- **Seuil du ratio de compression** : 100:1 est un standard OWASP, mais un FIT gzippé bien tassé peut approcher 10:1 → il faut valider sur des archives réelles (spike `07`).

---

## 7. Sources primaires

- OWASP CSV Injection : `https://owasp.org/www-community/attacks/CSV_Injection`
- Wikipedia — Billion laughs attack : `https://en.wikipedia.org/wiki/Billion_laughs_attack`
- Wikipedia — Zip bomb : `https://en.wikipedia.org/wiki/Zip_bomb`
- `yauzl` — issue zip bomb prevention : `https://github.com/thejoshwolfe/yauzl/issues/13`
- LibreChat PR #12320 (falsified ZIP metadata) : `https://github.com/danny-avila/LibreChat/pull/12320`
- Sourcery — Node.js XXE via Expat / xml2json : `https://www.sourcery.ai/vulnerabilities/javascript-express-security-express-expat-xxe`
- Comparatif Node XML parsers : `https://npm-compare.com/fast-xml-parser,libxmljs,xml-js,xml2js,xml2json`
- Comparatif Node ZIP parsers : `https://npm-compare.com/adm-zip,extract-zip,node-unzip-2,node-zip,unzipper,yauzl`
