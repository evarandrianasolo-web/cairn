# 07 — Spike Strava archive : résultats

> Exécuté le 2026-07-27T18:32:00.505Z sur `C:\Users\evala\Documents\cursor_projects\cairn\data\sample\export_47073325.zip` (2.44 GiB).
> Généré par `scripts/spike-strava-archive.mjs`. Aucune donnée personnelle n'est incluse — uniquement des agrégats.

## Q1 — Structure de l'archive

```json
{
  "root_folders": [
    "activities",
    "activities.csv",
    "applications.csv",
    "bikes.csv",
    "blocks.csv",
    "clubs",
    "clubs.csv",
    "comments.csv",
    "components.csv",
    "connected_apps.csv",
    "contacts.csv",
    "email_preferences.csv",
    "events.csv",
    "flags.csv",
    "followers.csv",
    "following.csv",
    "general_preferences.csv",
    "global_challenges.csv",
    "goals.csv",
    "group_challenges.csv",
    "intercom_tickets.csv",
    "local_legend_segments.csv",
    "logins.csv",
    "media",
    "media.csv",
    "memberships.csv",
    "messaging.json",
    "mobile_device_identifiers.csv",
    "monthly_recap_achievements.csv",
    "orders.csv",
    "partner_opt_outs.csv",
    "posts.csv",
    "privacy_zones.csv",
    "profile.csv",
    "profile.jpg",
    "reactions.csv",
    "routes",
    "routes.csv",
    "segments.csv",
    "shoes.csv",
    "social_settings.csv",
    "starred_routes.csv",
    "starred_segments.csv",
    "structured_details.csv",
    "support_tickets.csv",
    "visibility_settings.csv"
  ]
}
```

## Q2 — Compression

```json
{
  "compressed": "2.44 GiB",
  "uncompressed": "2.46 GiB",
  "max_ratio": "26.4:1"
}
```

## Q3 — Nombre de fichiers

```json
{
  "total": 5527,
  "by_extension": {
    ".jpg": 3397,
    ".gz": 1883,
    ".gpx": 103,
    ".mp4": 95,
    ".csv": 40,
    "": 4,
    ".tcx": 3,
    ".fit": 1,
    ".json": 1
  }
}
```

## Q4 — Formats dans activities/

```json
{
  ".fit.gz": 1434,
  ".gz": 449,
  ".gpx": 6,
  ".tcx": 3,
  ".fit": 1
}
```

## Q5 — Encodage activities.csv

```json
"UTF-8 (sans BOM probable)"
```

## Q6 — Séparateur activities.csv

```json
","
```

## Q7 — En-têtes CSV

```json
[
  "ID de l'activité",
  "Date de l'activité",
  "Nom de l'activité",
  "Type d'activité",
  "Description de l'activité",
  "Temps écoulé",
  "Distance",
  "Fréquence cardiaque max.",
  "Effort relatif",
  "Déplacement-transport",
  "Note privée sur les activités",
  "Matériel utilisé pour l'activité",
  "Nom du fichier",
  "Poids de l'athlète",
  "Poids du vélo",
  "Temps écoulé",
  "Durée de déplacement",
  "Distance",
  "Vitesse max.",
  "Vitesse moyenne",
  "Dénivelé positif",
  "Dénivelé négatif",
  "Altitude min.",
  "Altitude max.",
  "Pente max.",
  "Pente moyenne",
  "Pente positive moyenne",
  "Pente négative moyenne",
  "Cadence max.",
  "Cadence moyenne",
  "Fréquence cardiaque max.",
  "Fréquence cardiaque moyenne",
  "Puissance max.",
  "Puissance moyenne",
  "Calories",
  "Température max.",
  "Température moyenne",
  "Effort relatif",
  "Effort total",
  "Nombre de sorties course à pied",
  "Temps de montée",
  "Temps de descente",
  "Autres temps",
  "Effort ressenti",
  "Type",
  "Heure de début",
  "Puissance moyenne pondérée",
  "Nombre d'échantillons de puissance",
  "Utiliser l'Effort ressenti",
  "Effort relatif ressenti",
  "Déplacement-transport",
  "Poids total soulevé",
  "À partir du téléchargement",
  "Distance ajustée selon la pente",
  "Heure d'observation de la météo",
  "Conditions météo",
  "Température selon les prévisions météo",
  "Température ressentie",
  "Point de rosée",
  "Humidité",
  "Pression atmosphérique",
  "Vitesse du vent",
  "Rafale de vent",
  "Direction du vent",
  "Intensité des précipitations",
  "Heure de lever du soleil",
  "Heure de coucher du soleil",
  "Phase de la lune",
  "Vélo",
  "Matériel",
  "Probabilité de précipitations",
  "Type de précipitations",
  "Couverture nuageuse",
  "Visibilité selon les prévisions météo",
  "Indice UV",
  "Ozone selon les prévisions météo",
  "Nombre de sauts",
  "Grit total",
  "Flow moyen",
  "Signalé",
  "Vitesse moyenne (temps écoulé)",
  "Distance sur chemin",
  "Distance récemment découverte",
  "Distance sur chemin récemment découverte",
  "Nombre d'activités",
  "Nombre total de pas",
  "CO2 économisé",
  "Longueur de piscine",
  "Charge d’entraînement",
  "Intensité",
  "Vitesse moyenne ajustée selon la pente",
  "Temps enregistré par le chronomètre",
  "Nombre total de cycles",
  "Récupération",
  "Avec mon animal de compagnie",
  "Compétition",
  "Sortie longue",
  "Pour la bonne cause",
  "Avec enfant",
  "Distance en descente",
  "Nombre total de séries",
  "Nombre total de répétitions",
  "Support"
]
```

## Q8 — Format date (1ère ligne)

```json
"27 juil. 2026"
```

## Q9 — TCX BOM / espace de tête

```json
{
  "file": "activities/8308767243.tcx",
  "hasBOM": false,
  "leadingWhitespace": false,
  "first20Hex": "3c3f786d6c2076657273696f6e3d27312e302720"
}
```

## Q10 — FIT tronqué (@garmin/fitsdk)

```json
{
  "threw": false,
  "errorMessage": null,
  "detected": "invalide (attendu)"
}
```

## Q11 — Billion laughs (fast-xml-parser)

```json
{
  "threw": false,
  "expanded": false,
  "output": {
    "elapsed_ms": 4,
    "size_json": 27
  }
}
```

## Q12 — ZIP bomb

```json
{
  "tested": false,
  "note": "Test differe : la fabrication d'un ZIP synthetique avec ratio 100:1 depuis Node depasse le scope du spike. La logique streaming yauzl + verification uncompressed/compressed en amont est deja en place dans scanZip() ; toute entree > MAX_UNCOMPRESSED_MB coupe le scan. A verifier sur archive Strava reelle (Q2).",
  "compressed_kib_prepared": 10,
  "uncompressed_mib_source": 10
}
```

## Q13 — Zip slip / path traversal

```json
{
  "detected_in_archive": false,
  "note": "scanZip() detecte automatiquement `..`, `/` initial ou `C:\\` dans les noms d'entree. Aucune extraction disque ne se produit. Note : l'archive Strava reelle ne devrait jamais contenir ces motifs -- si presence detectee, archive suspecte."
}
```

## Q14 — Temps de parsing bout à bout

```json
{
  "elapsed_sec": 1.5,
  "activities_read": 1894,
  "read_errors": 0
}
```

## Q15 — Indice de déduplication interne

```json
{
  "unique_activity_names": 1893,
  "duplicated_names_within_archive": 0,
  "note": "Une meme archive ne devrait pas avoir deux fichiers de meme nom base. Sinon = doublon Strava = a investiguer."
}
```

---

## Décisions à prendre à partir de ces chiffres

Voir `docs/architecture/ingestion/07-spike-archive.md` § 4 « Critères de go / no-go post-spike ».
