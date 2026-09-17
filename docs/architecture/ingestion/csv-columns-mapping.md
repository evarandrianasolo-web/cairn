# Mapping colonnes CSV Strava — français → canonique

> Décision de référence pour le parsing de `activities.csv` issu d'un
> export Bulk Data Strava. Résout la question **N1** de
> `QUESTIONS-OUVERTES.md` : mapping interne côté Cairn, sans exiger
> que l'utilisateur bascule son compte Strava en anglais.

## Contexte

Le spike du 27/07/2026 sur une archive Strava réelle (`export_47073325.zip`, compte français, 1 893 activités) a révélé :

- CSV **en français**, **105 colonnes**, séparateur `,`, encodage UTF-8 sans BOM
- **Headers dupliqués** (`Temps écoulé`, `Distance`, `Effort relatif`, `Fréquence cardiaque max.`, `Déplacement-transport` apparaissent 2 fois)
- Format date compact `27 juil. 2026` (pas d'heure au format sortable)
- Colonnes propriétaires Strava (`Charge d'entraînement`, `Intensité`, `Effort relatif`) qui traduisent leur analyse, pas de la donnée brute

## Décision

- **Parser par position (index de colonne 0-104)**, pas par nom — les headers dupliqués et l'instabilité potentielle des libellés entre versions Strava rendent le lookup par nom fragile.
- **Mapping interne** de chaque position vers un nom canonique Cairn (ou `IGNORED`, ou `BLOCKED`).
- **Aucune bascule linguistique** demandée à l'utilisateur.
- Le mapping est **versionné** dans ce document + dans le code d'ingestion (constante `STRAVA_CSV_COLUMN_MAP`), avec date de dernière validation.
- Un test unitaire de non-régression validera à chaque évolution qu'un nouvel export Strava garde la même structure.

## Classification en 3 catégories

| Catégorie | Traitement |
|---|---|
| **GARDÉ** | Colonne alimentera un champ canonique Cairn (activités, laps, contexte). |
| **IGNORÉ** | Colonne non utilisée par Cairn : métrique propriétaire Strava (`Charge d'entraînement`), donnée redondante (les FIT sont plus riches), ou hors périmètre produit (météo). N'est pas écrite en base. |
| **BLOCKED** | Colonne interdite par règle produit CLAUDE.md — jamais lue ni transmise. Purge silencieuse. |

## Table de mapping (positions 0 à 104)

Position exacte observée dans l'archive Eva (compte fr, exportée le 27/07/2026). À revalider sur un second export.

| # | Libellé FR observé | Catégorie | Nom canonique / motif |
|---:|---|---|---|
| 0 | ID de l'activité | GARDÉ | `strava_activity_id` |
| 1 | Date de l'activité | GARDÉ | `started_at` (format `27 juil. 2026`) |
| 2 | Nom de l'activité | GARDÉ | `name` |
| 3 | Type d'activité | GARDÉ | `sport_type` |
| 4 | Description de l'activité | GARDÉ | `description` (notes publiques Strava) |
| 5 | Temps écoulé | IGNORÉ | doublon — position 15 utilisée |
| 6 | Distance | IGNORÉ | doublon — position 17 utilisée |
| 7 | Fréquence cardiaque max. | IGNORÉ | doublon — position 30 utilisée (activity_health) |
| 8 | Effort relatif | IGNORÉ | métrique propriétaire Strava (suffer score) |
| 9 | Déplacement-transport | IGNORÉ | doublon — position 50 utilisée |
| 10 | Note privée sur les activités | GARDÉ | `user_notes` |
| 11 | Matériel utilisé pour l'activité | GARDÉ | `gear_id` |
| 12 | Nom du fichier | GARDÉ | `strava_source_filename` (clé de réconciliation avec `activities/`) |
| 13 | **Poids de l'athlète** | **BLOCKED** | règle CLAUDE.md — aucun poids en base |
| 14 | **Poids du vélo** | **BLOCKED** | règle CLAUDE.md — aucun poids en base |
| 15 | Temps écoulé | GARDÉ | `elapsed_time_s` |
| 16 | Durée de déplacement | GARDÉ | `moving_time_s` |
| 17 | Distance | GARDÉ | `distance_m` |
| 18 | Vitesse max. | IGNORÉ | recalculable depuis FIT |
| 19 | Vitesse moyenne | GARDÉ | `avg_speed_m_s` (dérive `avg_pace_s_per_km`) |
| 20 | Dénivelé positif | GARDÉ | `elevation_gain_m` |
| 21 | Dénivelé négatif | GARDÉ | `elevation_loss_m` |
| 22 | Altitude min. | IGNORÉ | recalculable |
| 23 | Altitude max. | IGNORÉ | recalculable |
| 24 | Pente max. | IGNORÉ | recalculable |
| 25 | Pente moyenne | IGNORÉ | recalculable |
| 26 | Pente positive moyenne | IGNORÉ | recalculable |
| 27 | Pente négative moyenne | IGNORÉ | recalculable |
| 28 | Cadence max. | IGNORÉ | présente dans FIT (plus précis) |
| 29 | Cadence moyenne | GARDÉ | `avg_cadence` (fallback si FIT absent) |
| 30 | Fréquence cardiaque max. | GARDÉ (sante) | `activity_health.max_hr` (conditionnel consentement) |
| 31 | Fréquence cardiaque moyenne | GARDÉ (sante) | `activity_health.avg_hr` (conditionnel consentement) |
| 32 | Puissance max. | IGNORÉ | présente dans FIT |
| 33 | Puissance moyenne | GARDÉ | `avg_power_w` (utile cyclisme) |
| 34 | **Calories** | **BLOCKED** | règle CLAUDE.md — aucune calorie en base |
| 35 | Température max. | IGNORÉ | contexte météo, hors périmètre |
| 36 | Température moyenne | IGNORÉ | contexte météo, hors périmètre |
| 37 | Effort relatif | IGNORÉ | doublon — Suffer Score propriétaire |
| 38 | Effort total | IGNORÉ | propriétaire Strava |
| 39 | Nombre de sorties course à pied | IGNORÉ | recalculable |
| 40 | Temps de montée | IGNORÉ | recalculable depuis FIT streams |
| 41 | Temps de descente | IGNORÉ | recalculable depuis FIT streams |
| 42 | Autres temps | IGNORÉ | agrégat propriétaire |
| 43 | Effort ressenti | GARDÉ | `rpe` (RPE 1-10) |
| 44 | Type | IGNORÉ | doublon de position 3 |
| 45 | Heure de début | GARDÉ | `started_at_time` — combine avec position 1 pour datetime précis |
| 46 | Puissance moyenne pondérée | IGNORÉ | propriétaire (Normalized Power équivalent) |
| 47 | Nombre d'échantillons de puissance | IGNORÉ | méta parsing |
| 48 | Utiliser l'Effort ressenti | IGNORÉ | flag UI Strava |
| 49 | Effort relatif ressenti | IGNORÉ | doublon Suffer Score |
| 50 | Déplacement-transport | IGNORÉ | méta Strava |
| 51 | **Poids total soulevé** | **BLOCKED** | règle CLAUDE.md — dérive poids/charge |
| 52 | À partir du téléchargement | IGNORÉ | flag origine Strava |
| 53 | Distance ajustée selon la pente | IGNORÉ | propriétaire Grade Adjusted Distance |
| 54 | Heure d'observation de la météo | IGNORÉ | météo |
| 55 | Conditions météo | IGNORÉ | météo |
| 56 | Température selon les prévisions météo | IGNORÉ | météo |
| 57 | Température ressentie | IGNORÉ | météo |
| 58 | Point de rosée | IGNORÉ | météo |
| 59 | Humidité | IGNORÉ | météo |
| 60 | Pression atmosphérique | IGNORÉ | météo |
| 61 | Vitesse du vent | IGNORÉ | météo |
| 62 | Rafale de vent | IGNORÉ | météo |
| 63 | Direction du vent | IGNORÉ | météo |
| 64 | Intensité des précipitations | IGNORÉ | météo |
| 65 | Heure de lever du soleil | IGNORÉ | météo |
| 66 | Heure de coucher du soleil | IGNORÉ | météo |
| 67 | Phase de la lune | IGNORÉ | météo |
| 68 | Vélo | GARDÉ | `gear_bike_id` (spécifique cyclisme) |
| 69 | Matériel | GARDÉ | `gear_shoe_id` (chaussures course) |
| 70 | Probabilité de précipitations | IGNORÉ | météo |
| 71 | Type de précipitations | IGNORÉ | météo |
| 72 | Couverture nuageuse | IGNORÉ | météo |
| 73 | Visibilité selon les prévisions météo | IGNORÉ | météo |
| 74 | Indice UV | IGNORÉ | météo |
| 75 | Ozone selon les prévisions météo | IGNORÉ | météo |
| 76 | Nombre de sauts | IGNORÉ | ski/parkour |
| 77 | Grit total | IGNORÉ | propriétaire ski |
| 78 | Flow moyen | IGNORÉ | propriétaire ski |
| 79 | Signalé | IGNORÉ | flag modération Strava |
| 80 | Vitesse moyenne (temps écoulé) | IGNORÉ | doublon |
| 81 | Distance sur chemin | IGNORÉ | propriétaire |
| 82 | Distance récemment découverte | IGNORÉ | propriétaire Strava exploration |
| 83 | Distance sur chemin récemment découverte | IGNORÉ | propriétaire |
| 84 | Nombre d'activités | IGNORÉ | méta agrégat |
| 85 | Nombre total de pas | IGNORÉ | présent dans FIT |
| 86 | CO2 économisé | IGNORÉ | propriétaire, contexte transport |
| 87 | Longueur de piscine | GARDÉ | `pool_length_m` (natation) |
| 88 | Charge d'entraînement | IGNORÉ | propriétaire Strava (TSS-like) — Cairn recalcule (ACWR) |
| 89 | Intensité | IGNORÉ | propriétaire Strava (IF-like) — Cairn recalcule |
| 90 | Vitesse moyenne ajustée selon la pente | IGNORÉ | propriétaire GAP |
| 91 | Temps enregistré par le chronomètre | GARDÉ | `stopwatch_time_s` (fallback si moving_time absent) |
| 92 | Nombre total de cycles | IGNORÉ | présent dans FIT (natation) |
| 93 | Récupération | IGNORÉ | flag Strava |
| 94 | Avec mon animal de compagnie | IGNORÉ | flag UI Strava |
| 95 | Compétition | GARDÉ | `is_race` (booléen, utile pour marquer les courses) |
| 96 | Sortie longue | IGNORÉ | flag Strava — Cairn recalcule via seuil durée |
| 97 | Pour la bonne cause | IGNORÉ | flag UI |
| 98 | Avec enfant | IGNORÉ | flag UI |
| 99 | Distance en descente | IGNORÉ | recalculable |
| 100 | Nombre total de séries | IGNORÉ | musculation, présent dans FIT |
| 101 | Nombre total de répétitions | IGNORÉ | musculation, présent dans FIT |
| 102 | Support | IGNORÉ | flag Strava (surface, road/trail/…) — non uniformisé |
| 103 | (fantôme observé dans le rapport spike, non typé) | IGNORÉ | à revalider sur second export |
| 104 | (fantôme observé dans le rapport spike, non typé) | IGNORÉ | à revalider sur second export |

## Politique de survie aux évolutions Strava

- Chaque parse du CSV compare la ligne d'en-tête au **hash** attendu de la version courante du mapping. Si le hash diffère, un warning journal est émis et l'ingestion continue avec la meilleure correspondance par nom (fallback), sans jeter la ligne.
- Un test unitaire compare la liste d'en-têtes vs l'attendu, à faire évoluer explicitement quand Strava ajoute ou renomme une colonne.
- Chaque nouvelle version du mapping est documentée dans une entrée de journal en tête de ce fichier.

## Bilan des positions

- **GARDÉ** : 20 positions (les champs qui alimentent Cairn)
- **IGNORÉ** : 82 positions (redondant, propriétaire, météo, flags UI)
- **BLOCKED** : 3 positions (poids athlète, poids vélo, poids soulevé, calories)

**Traduction produit** : le CSV Strava apporte principalement le contexte (RPE, notes, sport, matériel, nom du fichier pour réconcilier) — la donnée physiologique et GPS provient des FIT.

## Prochaines actions

1. Dev — implémenter `parseStravaCsv(rows, mapping)` en indexant par position, avec test unitaire sur les 105 colonnes.
2. Dev — implémenter `assertNoBlockedField(row)` qui lance si une colonne BLOCKED contient une valeur non vide (défense en profondeur).
3. Second spike (Q N3) dans 6 mois pour valider la stabilité du mapping sur un nouvel export.
