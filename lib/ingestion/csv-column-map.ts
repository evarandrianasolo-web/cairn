// =============================================================
// Mapping positionnel de activities.csv (export Bulk Strava, FR).
// =============================================================
// Source de verite : docs/architecture/ingestion/csv-columns-mapping.md
// Valide sur l'archive reelle du 27/07/2026 (compte FR, 105 colonnes,
// 1893 activites). A revalider sur un second export (question N3).
//
// Parse par POSITION, jamais par nom : le CSV a des en-tetes
// dupliques (doublons N2) et le libelle peut varier entre versions
// Strava. Le nom de champ canonique est la seule chose qui compte.
// =============================================================

export type CsvColumnCategory = 'kept' | 'ignored' | 'blocked'

export type CsvColumnSpec = {
  label: string
  category: CsvColumnCategory
  field?: string
}

// Index = position exacte dans la ligne (0 a 104).
export const STRAVA_CSV_COLUMN_MAP: readonly CsvColumnSpec[] = [
  { label: "ID de l'activité", category: 'kept', field: 'strava_activity_id' },
  { label: "Date de l'activité", category: 'kept', field: 'started_at_date' },
  { label: "Nom de l'activité", category: 'kept', field: 'name' },
  { label: "Type d'activité", category: 'kept', field: 'sport_type' },
  { label: "Description de l'activité", category: 'kept', field: 'description' },
  { label: 'Temps écoulé', category: 'ignored' }, // doublon — position 15
  { label: 'Distance', category: 'ignored' }, // doublon — position 17
  { label: 'Fréquence cardiaque max.', category: 'ignored' }, // doublon — position 30
  { label: 'Effort relatif', category: 'ignored' }, // propriétaire Strava
  { label: 'Déplacement-transport', category: 'ignored' }, // doublon — position 50
  { label: 'Note privée sur les activités', category: 'kept', field: 'user_notes' },
  { label: "Matériel utilisé pour l'activité", category: 'kept', field: 'gear_id' },
  { label: 'Nom du fichier', category: 'kept', field: 'strava_source_filename' },
  { label: "Poids de l'athlète", category: 'blocked' },
  { label: 'Poids du vélo', category: 'blocked' },
  { label: 'Temps écoulé', category: 'kept', field: 'elapsed_time_s' },
  { label: 'Durée de déplacement', category: 'kept', field: 'moving_time_s' },
  { label: 'Distance', category: 'kept', field: 'distance_m' },
  { label: 'Vitesse max.', category: 'ignored' },
  { label: 'Vitesse moyenne', category: 'kept', field: 'avg_speed_m_s' },
  { label: 'Dénivelé positif', category: 'kept', field: 'elevation_gain_m' },
  { label: 'Dénivelé négatif', category: 'kept', field: 'elevation_loss_m' },
  { label: 'Altitude min.', category: 'ignored' },
  { label: 'Altitude max.', category: 'ignored' },
  { label: 'Pente max.', category: 'ignored' },
  { label: 'Pente moyenne', category: 'ignored' },
  { label: 'Pente positive moyenne', category: 'ignored' },
  { label: 'Pente négative moyenne', category: 'ignored' },
  { label: 'Cadence max.', category: 'ignored' },
  { label: 'Cadence moyenne', category: 'kept', field: 'avg_cadence' },
  { label: 'Fréquence cardiaque max.', category: 'kept', field: 'max_hr' },
  { label: 'Fréquence cardiaque moyenne', category: 'kept', field: 'avg_hr' },
  { label: 'Puissance max.', category: 'ignored' },
  { label: 'Puissance moyenne', category: 'kept', field: 'avg_power_w' },
  { label: 'Calories', category: 'blocked' },
  { label: 'Température max.', category: 'ignored' },
  { label: 'Température moyenne', category: 'ignored' },
  { label: 'Effort relatif', category: 'ignored' },
  { label: 'Effort total', category: 'ignored' },
  { label: 'Nombre de sorties course à pied', category: 'ignored' },
  { label: 'Temps de montée', category: 'ignored' },
  { label: 'Temps de descente', category: 'ignored' },
  { label: 'Autres temps', category: 'ignored' },
  { label: 'Effort ressenti', category: 'kept', field: 'rpe' },
  { label: 'Type', category: 'ignored' }, // doublon de la position 3
  { label: 'Heure de début', category: 'kept', field: 'started_at_time' },
  { label: 'Puissance moyenne pondérée', category: 'ignored' },
  { label: "Nombre d'échantillons de puissance", category: 'ignored' },
  { label: "Utiliser l'Effort ressenti", category: 'ignored' },
  { label: 'Effort relatif ressenti', category: 'ignored' },
  { label: 'Déplacement-transport', category: 'ignored' },
  { label: 'Poids total soulevé', category: 'blocked' },
  { label: 'À partir du téléchargement', category: 'ignored' },
  { label: 'Distance ajustée selon la pente', category: 'ignored' },
  { label: 'Heure d’observation de la météo', category: 'ignored' },
  { label: 'Conditions météo', category: 'ignored' },
  { label: 'Température selon les prévisions météo', category: 'ignored' },
  { label: 'Température ressentie', category: 'ignored' },
  { label: 'Point de rosée', category: 'ignored' },
  { label: 'Humidité', category: 'ignored' },
  { label: 'Pression atmosphérique', category: 'ignored' },
  { label: 'Vitesse du vent', category: 'ignored' },
  { label: 'Rafale de vent', category: 'ignored' },
  { label: 'Direction du vent', category: 'ignored' },
  { label: 'Intensité des précipitations', category: 'ignored' },
  { label: 'Heure de lever du soleil', category: 'ignored' },
  { label: 'Heure de coucher du soleil', category: 'ignored' },
  { label: 'Phase de la lune', category: 'ignored' },
  { label: 'Vélo', category: 'kept', field: 'gear_bike_id' },
  { label: 'Matériel', category: 'kept', field: 'gear_shoe_id' },
  { label: 'Probabilité de précipitations', category: 'ignored' },
  { label: 'Type de précipitations', category: 'ignored' },
  { label: 'Couverture nuageuse', category: 'ignored' },
  { label: 'Visibilité selon les prévisions météo', category: 'ignored' },
  { label: 'Indice UV', category: 'ignored' },
  { label: 'Ozone selon les prévisions météo', category: 'ignored' },
  { label: 'Nombre de sauts', category: 'ignored' },
  { label: 'Grit total', category: 'ignored' },
  { label: 'Flow moyen', category: 'ignored' },
  { label: 'Signalé', category: 'ignored' },
  { label: 'Vitesse moyenne (temps écoulé)', category: 'ignored' },
  { label: 'Distance sur chemin', category: 'ignored' },
  { label: 'Distance récemment découverte', category: 'ignored' },
  { label: 'Distance sur chemin récemment découverte', category: 'ignored' },
  { label: "Nombre d'activités", category: 'ignored' },
  { label: 'Nombre total de pas', category: 'ignored' },
  { label: 'CO2 économisé', category: 'ignored' },
  { label: 'Longueur de piscine', category: 'kept', field: 'pool_length_m' },
  { label: "Charge d'entraînement", category: 'ignored' },
  { label: 'Intensité', category: 'ignored' },
  { label: 'Vitesse moyenne ajustée selon la pente', category: 'ignored' },
  { label: 'Temps enregistré par le chronomètre', category: 'kept', field: 'stopwatch_time_s' },
  { label: 'Nombre total de cycles', category: 'ignored' },
  { label: 'Récupération', category: 'ignored' },
  { label: 'Avec mon animal de compagnie', category: 'ignored' },
  { label: 'Compétition', category: 'kept', field: 'is_race' },
  { label: 'Sortie longue', category: 'ignored' },
  { label: 'Pour la bonne cause', category: 'ignored' },
  { label: 'Avec enfant', category: 'ignored' },
  { label: 'Distance en descente', category: 'ignored' },
  { label: 'Nombre total de séries', category: 'ignored' },
  { label: 'Nombre total de répétitions', category: 'ignored' },
  { label: 'Support', category: 'ignored' },
  { label: '(position 103 — non typée, à revalider)', category: 'ignored' },
  { label: '(position 104 — non typée, à revalider)', category: 'ignored' },
] as const

export const STRAVA_CSV_EXPECTED_COLUMN_COUNT = STRAVA_CSV_COLUMN_MAP.length

export const STRAVA_CSV_BLOCKED_POSITIONS: readonly number[] = STRAVA_CSV_COLUMN_MAP.reduce<number[]>(
  (acc, spec, index) => {
    if (spec.category === 'blocked') acc.push(index)
    return acc
  },
  [],
)
