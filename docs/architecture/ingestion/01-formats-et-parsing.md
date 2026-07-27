# 01 — Formats d'entrée et parsing

> Statut : proposition d'architecture — sources primaires listées en fin de document.
> Date : 27/07/2026.

## 0. Cadre et méthode

L'ingestion Cairn est **exclusivement par fichier fourni par l'utilisateur**. Les APIs constructeur sont, au mieux, une commodité secondaire (voir doc `08`).

Pour chaque format, on distingue :
- **[LU]** : information vérifiée sur source primaire (spec officielle, code d'une lib, article de support constructeur).
- **[DÉDUIT]** : conclusion tirée de la lecture, non vérifiée par test.
- **[À VÉRIFIER]** : hypothèse qu'il faudra tester (voir doc `07`).

Aucun échantillon d'archive Strava ni fichier FIT réel n'a été fourni pour ce document. Rien n'a été « testé » au sens strict.

> **⚠ MISE À JOUR APRÈS SPIKE — 27/07/2026**
>
> Le spike a été exécuté sur une archive Strava réelle de 2,44 GiB (`export_47073325.zip`, compte 4+ ans). Rapport complet dans `07-spike-resultats.md`. Points qui **contredisent** ou **précisent** ce document :
>
> - **Distribution formats activités confirmée** : 1 434 `.fit.gz` + 449 `.gz` (sans extension `.fit` visible mais probablement `.fit.gz` avec le second `.` absent) + 6 `.gpx` + 3 `.tcx` + 1 `.fit` = **1 893 activités**. **FIT (compressé ou non) domine à 99 %.** GPX et TCX sont marginaux et probablement liés à des activités manuelles ou d'apps tierces.
> - **Compression compte : 26,4 : 1 maximum**, très en-dessous du seuil produit de 100 : 1 (validation Q2).
> - **CSV en français, 105 colonnes** (pas 30-40 comme la doc anglaise Athlytics le suggérait). Format date compact `27 juil. 2026` (sans heure). Recommandation Athlytics « basculer en anglais avant export » CONFIRMÉE nécessaire OU faire un mapping FR → canonique interne. Voir `QUESTIONS-OUVERTES.md`.
> - **Bug parsing CSV Strava** : plusieurs headers dupliqués dans la même ligne (`Temps écoulé`, `Distance`, `Effort relatif`, `Fréquence cardiaque max.`, `Déplacement-transport` apparaissent 2×). CSV non conforme au standard. **Le parser doit indexer par position, pas par nom.**
> - **Colonnes sensibles CLAUDE.md à bloquer à l'ingestion** : `Poids de l'athlète`, `Poids du vélo`, `Calories`. Cohérence règle produit « aucun champ poids/IMC/calorie n'existe dans le schéma ».
> - **`@garmin/fitsdk` détecte proprement un FIT tronqué** — `checkIntegrity()` retourne `false`, pas de throw non capturé. Lib validée (Q10).
> - **`fast-xml-parser` avec `processEntities:false`** neutralise correctement une bombe billion laughs (27 bytes JSON, 4 ms). Lib validée (Q11).
> - **Temps de parsing bout en bout** : 1,5 s en streaming pour 1 894 activités sur ZIP 2,4 GiB, aucune erreur de lecture. Le worker peut rester synchrone.
>
> Les valeurs `[À VÉRIFIER]` de ce doc restent tant qu'elles ne portent pas sur l'archive Strava (ex : licence `@garmin/fitsdk` reste à confirmer sur le LICENSE.txt du repo).

---

## 1. Périmètre — les 6 sources d'entrée

| Source | Origine typique | Format(s) | Position dans le funnel |
|---|---|---|---|
| **Archive Strava (Bulk Export §6.6)** | Utilisateur télécharge son archive sur `strava.com/athlete/delete_your_account` puis « Download Request » | ZIP contenant `activities.csv` + `activities/*.{fit,fit.gz,gpx,tcx}` + autres CSV | Onboarding pour utilisateurs Strava historiques |
| **Fichier FIT isolé** | Export unitaire d'une séance depuis Garmin Connect / COROS / Suunto / autre montre | `.fit` ou `.fit.gz` | Ajout d'une séance au quotidien |
| **Fichier GPX isolé** | Export unitaire depuis app tierce, montre grand public, téléphone | `.gpx` | Ajout de séance / itinéraire |
| **Fichier TCX isolé** | Export unitaire, plus rare, hérité Garmin Training Center | `.tcx` | Ajout de séance |
| **CSV « template Cairn »** | Fichier gabarit fourni par Cairn pour saisie tableur | `.csv` | Migration depuis un carnet d'entraînement structuré (Excel / Numbers / Google Sheets) |
| **Saisie manuelle formulaire** | UI Cairn native | POST direct base | Séance non trackée (renforcement, tapis, séance sans montre) |

**Non-objectifs de ce document** : FIT push depuis appareil, protocoles ANT+/BLE en direct, format Suunto SML brut. Hors périmètre.

---

## 2. Format par format

### 2.1 FIT (Flexible and Interoperable Data Transfer) — Garmin

**[LU]** Format binaire propriétaire Garmin, décrit dans le **FIT SDK** (Garmin Developers). Structure canonique :
1. **File Header** (12 ou 14 octets) : taille de l'en-tête, version protocole, taille des données, `.FIT` en signature ASCII, CRC-16 optionnel.
2. **Data Records** : suite de « definition messages » (schéma) et « data messages » (valeurs). Types de message pertinents pour Cairn : `file_id`, `activity`, `session`, `lap`, `record` (point-échantillon), `event`, `device_info`.
3. **File CRC** (2 octets) — CRC-16 sur l'ensemble.

**Champs typiques d'un `record`** (fréquence typique 1 Hz) : `timestamp`, `position_lat`, `position_long` (encodés en semicircles), `altitude`, `distance`, `speed`, `heart_rate`, `cadence`, `power`, `temperature`, `vertical_speed`. Un `session` porte les totaux (durée mouvement, distance, D+, FC moy/max, calories dérivées, allure moyenne).

**Variantes constructeur** : COROS, Suunto et Polar émettent des messages FIT valides mais utilisent des sous-champs constructeur (developer fields) que **les libs génériques ignorent silencieusement**. Ce n'est pas un blocage pour Cairn (on n'a pas besoin de la charge d'entraînement propriétaire COROS EvoLab), mais il faut le documenter comme perte assumée.

**Compression `.fit.gz`** : couramment produite dans l'archive Strava pour économiser la place. Gunzip standard.

**Pièges connus (à faire remonter en QA)** :
- Fichier tronqué en fin d'enregistrement (batterie coupée) : le CRC ne matchera pas mais les records lus jusque-là peuvent être valides.
- Absence de `session` message (rare, indique une écriture avortée) : reconstruction depuis les `record` requise, ou refus poli.
- Position 0/0 sur les premiers records avant fix GPS : à filtrer.
- Semicircle → degré : `deg = value * (180 / 2^31)`. **Faute classique** : oublier la conversion → l'activité apparaît au large des côtes africaines.

**Bibliothèques Node/TS candidates** :

| Lib | Version | Dernière release | Licence | Remarques |
|---|---|---|---|---|
| `@garmin/fitsdk` | officielle Garmin | **[À VÉRIFIER]** — page GitHub visible, pas de date extraite | Garmin (non-OSS type MIT — [À VÉRIFIER LICENSE.txt]) | Officiel, ESM only, TypeScript, Node ≥ 14, méthode `checkIntegrity()`, `read()` collecte les erreurs plutôt que de throw |
| `fit-file-parser` | 1.21.0 | **[À VÉRIFIER]** — page npm montre 1.21.0 comme dernière | MIT | Communauté, encode + decode, TS support |
| `easy-fit`, `fit-decoder`, `node-fit`, `jimmykane/fit-parser` | divers | **[À VÉRIFIER]** — activité de maintenance à contrôler | divers | Non prioritaires, cités pour référence |

**Recommandation** : **partir sur `@garmin/fitsdk`** (source officielle, tolérance aux erreurs intégrée). Wrapper Cairn autour, pour uniformiser en type interne `RawActivity`. Ne pas ré-implémenter le protocole FIT.

**Cas limite dur** : aucune lib maintenue si Garmin fermait sa SDK → coût de reprise interne d'un parser FIT = **~2 à 4 semaines-dev senior** (spec publique, non triviale). À budgétiser comme risque, pas comme plan.

---

### 2.2 GPX 1.1 — XML — Topografix

**[LU]** Schéma officiel `topografix.com/GPX/1/1/gpx.xsd`. Hiérarchie utile pour Cairn :

```xml
<gpx version="1.1" creator="…">
  <metadata>…</metadata>
  <trk>
    <name>…</name>
    <trkseg>
      <trkpt lat="45.9236" lon="6.8694">
        <ele>1035.0</ele>
        <time>2026-07-27T06:12:04Z</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>142</gpxtpx:hr>
            <gpxtpx:cad>82</gpxtpx:cad>
            <gpxtpx:atemp>18</gpxtpx:atemp>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

**Ce que GPX porte NATIVEMENT** : lat/lon, altitude, timestamp UTC.
**Ce qu'il ne porte QUE via extensions** : FC, cadence, température, puissance. L'extension `TrackPointExtension` (namespace Garmin) est le standard de facto ; on rencontre aussi `power` de Garmin, et des extensions Strava (`gpxtpx`, `gpxx`).

**Piège n°1** : un GPX de téléphone (Strava mobile en mode balade, apps GPS générique) n'aura **jamais** de FC. Cairn doit accepter des activités sans FC, et le marquer dans `completeness` (voir doc `03`).

**Piège n°2** : encodage. GPX est XML → doit être UTF-8 par défaut mais on voit du Windows-1252 dans la nature (fichiers manipulés sous Notepad Windows). Détection encodage requise, ou refus explicite si `<?xml encoding=…?>` déclare autre chose que UTF-8 sans BOM.

**Piège n°3** : `<time>` **doit** être en UTC (ISO 8601 avec `Z`), mais certaines apps écrivent en heure locale sans offset. Comportement à définir : rejet, ou avertissement + interprétation comme UTC.

**Bibliothèques Node/TS** :
- `fast-xml-parser` (MIT, très maintenu) — recommandé, **doit être configuré avec `processEntities: false`** et pas de résolution DTD (voir doc `02`).
- Alternatives : `sax` (streaming, plus bas niveau, plus lourd à câbler mais permet d'abandonner tôt sur fichier suspect).
- **À proscrire par défaut** : `xml2json`, `xml2js` avec config par défaut (résolution DTD/entités activée → XXE et billion laughs, voir OWASP).

---

### 2.3 TCX (Training Center XML) — Garmin

**[LU]** Format XML historique Garmin, précurseur de FIT. Porte de base FC, cadence, watts, laps structurés — c'est son avantage sur GPX.

**Piège documenté (bug GPSBabel #371 sur GitHub)** : **les TCX exportés depuis Strava contiennent des espaces en tête de fichier**, ce qui viole la spec XML (« XML declaration not at start of document »). Un parser strict échoue. Cairn doit `trimStart()` sur les octets avant parsing XML, systématiquement.

**Non testé** : présence éventuelle d'un BOM UTF-8. À couvrir en spike (doc `07`).

Le reste des risques est identique à GPX (XML → XXE, billion laughs, encodage).

TCX est peu produit aujourd'hui hors export Strava et vieux logiciels d'entraînement. Support « best effort » : accepter, mais ne pas y investir. En cas d'échec de parsing, message d'erreur qui propose de re-uploader en GPX ou FIT.

---

### 2.4 `activities.csv` de l'archive Strava

**[LU sur sources tierces, non sur doc Strava officielle]** L'archive Bulk Export Strava contient un fichier `activities.csv` qui sert d'**index** de toutes les activités du compte, avec pointeur `filename` vers le fichier détaillé correspondant dans `activities/`.

**Colonnes observées dans les projets communautaires** (liste non-officielle, ordre approximatif, à re-vérifier sur archive réelle — spike doc `07`) :
`Activity ID, Activity Date, Activity Name, Activity Type, Activity Description, Elapsed Time, Distance, Max Heart Rate, Relative Effort, Commute, Activity Private Note, Activity Gear, Filename, Athlete Weight, Bike Weight, Elapsed Time (seconds), Moving Time (seconds), Distance (km), Max Speed, Average Speed, Elevation Gain, Elevation Loss, Elevation Low, Elevation High, Max Grade, Average Grade, Average Positive Grade, Average Negative Grade, Max Cadence, Average Cadence, Max Heart Rate, Average Heart Rate, Max Watts, Average Watts, Calories, Max Temperature, Average Temperature, Relative Effort.1, Total Work, Number of Runs, Uphill Time, Downhill Time, Other Time, Perceived Exertion, Type, Start Time, Weighted Average Power, Power Count, Prefer Perceived Exertion, Perceived Relative Effort, Commute.1, Total Weight Lifted, From Upload, Grade Adjusted Distance, Weather Observation Time, Weather Condition, Weather Temperature, Apparent Temperature, Dewpoint, Humidity, Weather Pressure, Wind Speed, Wind Gust, Wind Bearing, Precipitation Intensity, Sunrise Time, Sunset Time, Moon Phase, Bike, Gear, Precipitation Probability, Precipitation Type, Cloud Cover, Weather Visibility, UV Index, Weather Ozone, Jump Count, Total Grit, Average Flow, Flagged, Average Elapsed Speed, Dirt Distance, Newly Explored Distance, Newly Explored Dirt Distance, Activity Count, Total Steps, Carbon Saved`.

**Stabilité** : la lib R `Athlytics` documente qu'il **faut mettre l'export Strava en anglais** pour que le CSV soit parsable — les en-têtes sont localisées et changent avec la langue du compte. C'est une source majeure d'erreurs pour un public francophone.

**Encodage / séparateur** : présumé UTF-8 + virgule, **non vérifié sur doc Strava officielle**. À sniffer, pas à supposer.

**Format des dates** : présumé `MMM D, YYYY, H:MM:SS AM/PM` (anglais) → parsing tolérant obligatoire, ne pas régler sur `new Date(str)` seul (comportement navigateur/plateforme instable).

**Stratégie de parsing tolérante** :
1. Détection encodage (BOM UTF-8, chardet ou fallback UTF-8).
2. Détection séparateur (`,` vs `;` — Excel FR ré-enregistre parfois en `;`).
3. Matching des colonnes par **synonymes anglais/français**, pas par position.
4. Toute colonne inconnue = ignorée (jamais fatale).
5. Toute activité sans `Filename` = ignorée (index orphelin, aucune donnée exploitable).

---

### 2.5 Template CSV « Cairn »

Objectif : permettre à un utilisateur de **charger un historique tableur** (Excel, Numbers, Google Sheets) sans passer par la génération d'archive Strava (délai + démarche).

**Colonnes minimales viables** pour qu'une activité soit exploitable par le moteur de plan :

| Colonne | Type | Obligatoire | Notes |
|---|---|---|---|
| `date` | ISO 8601 (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:MM:SSZ`) | oui | Si heure absente, on met 12:00 UTC (le moteur n'utilise pas l'heure fine). |
| `type` | enum : `run`, `trail`, `bike`, `hike`, `strength`, `other` | oui | Cohérent avec taxonomie interne. |
| `duration_seconds` | entier | oui | La donnée fondatrice de la charge. |
| `distance_meters` | entier | non | Absent pour renforcement / tapis / rameur. |
| `elevation_gain_meters` | entier | non | Central pour trail. |
| `average_heart_rate` | entier bpm | non | Nécessite consentement santé actif (voir doc `06`). |
| `rpe` | entier 1-10 | non | Ressenti effort — utile en dégradé, voir palier 1. |
| `notes` | texte libre | non | Non transmis au LLM par défaut. |

**Comportement d'erreur** : chaque ligne est validée indépendamment. Rapport d'import affiche `N acceptées / M rejetées`, chaque ligne rejetée avec numéro et raison. Pas de « tout ou rien ».

**Sécurité CSV injection** : dès l'ingestion, toute cellule commençant par `= + - @ Tab CR` est logguée comme suspecte. Pas d'ordinateur sain n'exécute le CSV, mais Cairn peut ré-exporter (portabilité art. 20 RGPD, doc `06`) : il faudra à ce moment-là préfixer par apostrophe.

---

### 2.6 Saisie manuelle formulaire

Le socle. Ne dépend d'aucun format externe.

Champs minimaux (identiques à la ligne CSV) + UI :
- Suggestion `date = aujourd'hui`.
- Templates rapides : « J'ai couru X km en Y minutes avec Z m D+ ».
- RPE **par défaut**, FC **optionnelle** (case à cocher explicite si l'utilisateur a activé le consentement santé).
- Une séance renforcement = uniquement durée + intensité perçue.

C'est le chemin qui garantit qu'**une utilisatrice palier 1** (voir doc `04`) peut alimenter son plan sans matériel de tracking. Non négociable.

---

## 3. Tableau de synthèse — richesse relative des formats

| Format | GPS | FC | Cadence | Puissance | Temp. | Laps structurés | D+ précis | Fiabilité parsing |
|---|---|---|---|---|---|---|---|---|
| FIT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (baromètre monté) | **haute** (spec stable, SDK officiel) |
| TCX | ✅ | ✅ | ✅ | ✅ | rare | ✅ | ⚠️ (souvent recalculé) | moyenne (XML, quirks Strava) |
| GPX + ext | ✅ | ✅ si ext | ✅ si ext | rare | rare | ❌ | ⚠️ (dérivé altitude GPS bruitée) | moyenne (XML, extensions non standardisées) |
| GPX nu | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | haute |
| CSV Strava | ❌ (résumé seulement) | moy/max | moy/max | moy/max | moy/max | ❌ | ✅ (Strava a fait le calcul) | fragile (localisation, colonnes mouvantes) |
| CSV template Cairn | ❌ | moy si saisi | ❌ | ❌ | ❌ | ❌ | ✅ si saisi | haute (schéma qu'on maîtrise) |
| Manuel | ❌ | RPE ou moy | ❌ | ❌ | ❌ | ❌ | ✅ si saisi | 100 % |

**Lecture** : pour la planification adaptative, **la donnée FIT est très supérieure**. Pour un plan qui « ne casse pas », le manuel + le CSV Cairn suffisent. C'est le fondement de la gradation en 3 paliers (doc `04`).

---

## 4. Décisions structurantes de ce doc

1. **Priorité au FIT** dans les recommandations UX d'upload (« votre montre exporte du .fit ? uploadez ça, c'est le plus riche »).
2. **`@garmin/fitsdk` en dépendance directe**, ne pas ré-implémenter le protocole FIT.
3. **XML systématiquement parsé avec `fast-xml-parser` en mode sécurisé** (`processEntities: false`, pas de résolution DTD, taille max explicite).
4. **CSV Strava traité comme index tolérant** : matching par synonymes + langue anglaise recommandée dans l'UI.
5. **Le manuel est un citoyen de première classe**, pas une roue de secours.
6. **Toute anomalie de parsing renvoie un message actionnable** (« votre TCX commence par des espaces, on corrige — ou uploadez le FIT si vous l'avez »).

---

## 5. Sources primaires consultées

- Topografix — GPX 1.1 schema : `https://www.topografix.com/GPX/1/1/`
- Garmin Developers — FIT SDK entrée : `https://developer.garmin.com/fit/protocol/` (page navigation seule extraite ; contenu technique à ouvrir avec un lecteur graphique)
- Garmin Developers — Activity file : `https://developer.garmin.com/fit/file-types/activity/`
- `@garmin/fitsdk` sur npm : `https://www.npmjs.com/package/@garmin/fitsdk`
- `fit-file-parser` sur npm : `https://www.npmjs.com/package/fit-file-parser`
- GPSBabel issue #371 (quirk espaces en tête TCX Strava) : `https://github.com/gpsbabel/gpsbabel/issues/371`
- Athlytics R package — colonnes CSV Strava : `https://docs.ropensci.org/Athlytics/reference/load_local_activities.html`
- Strava support « Uploading Poorly Formatted GPS Files » : `https://support.strava.com/hc/en-us/articles/216917967-Uploading-Poorly-Formatted-GPS-Files`
- Strava support « Exporting Your Data and Bulk Export » : `https://support.strava.com/hc/en-us/articles/15401919-exporting-your-data-and-bulk-export`
- Guide tiers « Digital Takeout » — structure archive Strava : `https://takeoutday.org/guides/how-to-export-strava-data`

**Non consulté / non accessible** :
- Contenu détaillé du FIT SDK PDF (page dynamique, contenu non-restitué par WebFetch — à charger dans un lecteur graphique ou à extraire du repo `garmin/fit-javascript-sdk`).
- Aucune archive Strava réelle n'a été inspectée. Toute affirmation sur les colonnes exactes du CSV, les dossiers présents, l'encodage effectif → à confirmer par le spike (doc `07`).
