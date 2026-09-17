// Partagee entre le client (decoupage du fichier) et le serveur (calcul du
// nombre de morceaux) — d'ou ce module a part, un fichier `'use server'` ne
// peut exporter que des fonctions async.
//
// Le projet Supabase est sur le plan Free : la limite globale d'upload y est
// plafonnee en dur a 50 Mio (52 428 800 octets), quel que soit le
// `file_size_limit` du bucket — non contournable par reglage, seul un
// upgrade de plan la leve (voir docs/architecture/ingestion/09-plan-bascule-execution.md).
// On decoupe donc chaque archive en morceaux nettement sous ce plafond,
// uploades et reassembles independamment.
export const IMPORT_PART_SIZE_BYTES = 45 * 1024 * 1024 // 45 Mio, marge sous les 50 Mio
