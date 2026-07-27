# QUESTIONS OUVERTES — ingestion fichier

> Ce document liste ce qui **n'a pas pu être tranché** dans les docs `01` à `08` faute de source primaire vérifiable, faute d'archive sample, ou parce qu'une décision produit / juridique doit précéder la décision technique.
>
> Aucune de ces questions ne doit être répondue « par intuition ». Chaque item indique **qui doit trancher** et **comment on obtient la réponse**.

## MISE À JOUR APRÈS SPIKE — 27/07/2026

Le spike (`07-spike-resultats.md`) sur archive Strava réelle a produit des chiffres. Nouvelles questions à trancher :

### N1 — CSV Strava en français : mapping ou forçage anglais ?

- **Constat** : le CSV Strava exporté est **dans la langue du compte** (français ici, 105 colonnes). Les libs communautaires (`Athlytics` en R) recommandent de basculer le compte en anglais avant export.
- **Options** :
  - (a) **Forcer l'utilisateur à basculer en anglais** avant export → friction UX supplémentaire, documentée dans l'écran d'import.
  - (b) **Mapping FR → canonique** interne, avec table de correspondance maintenue.
  - (c) **Ignorer le CSV entièrement**, ne parser que les FIT/GPX/TCX → perte d'info (colonnes calculées comme puissance moyenne pondérée, effort ressenti, notes privées).
- **Qui tranche** : produit (Eva). Décision UX vs coût de maintenance.

### N2 — Headers CSV dupliqués : impact sur parseurs standard ?

- **Constat** : le CSV Strava a des en-têtes dupliqués (`Temps écoulé` × 2, `Distance` × 2, `Effort relatif` × 2, `Fréquence cardiaque max.` × 2, `Déplacement-transport` × 2). Non conforme au standard CSV.
- **Impact** : les parseurs Node classiques (`csv-parse`, `papaparse`) qui indexent par nom **perdent la deuxième occurrence** ou lèvent une erreur.
- **Décision technique** : parser en mode « index par position » (colonnes numérotées), pas par nom. Documenter la position exacte de chaque colonne utile dans un mapping interne. À revalider si Strava change l'ordre entre deux exports (question N3).
- **Qui tranche** : dev. Non bloquant si on garde une couche de mapping.

### N3 — Stabilité de la liste de colonnes entre deux exports ?

- **Constat** : impossible à trancher avec une seule archive. Il faudrait comparer 2 exports du même compte à 6 mois d'intervalle, ou 2 exports de comptes différents.
- **Risque** : si Strava ajoute une colonne au milieu, un mapping par position casse.
- **Qui tranche** : à revalider après un second export (dans plusieurs mois) ou en récoltant l'archive d'un testeur externe.

### N4 — Fichiers `.gz` sans double extension : sont-ils tous des FIT ?

- **Constat** : le spike a compté 1 434 `.fit.gz` + 449 `.gz` (sans `.fit` visible). Les 449 pourraient être des FIT dont l'export a « perdu » la seconde extension, ou d'autres formats. À élucider en tentant un `gunzip` + `checkIntegrity()` sur un échantillon.
- **Qui tranche** : dev, dans le premier prototype d'ingestion. Journal des extensions détectées à ingérer.

### N5 — Une seule activité au nom dupliqué dans l'archive : bug Strava ?

- **Constat** : 1 894 fichiers dans `activities/`, 1 893 noms uniques. Un doublon. Non identifié dans le rapport (aggregat seulement).
- **Impact** : notre clé de dédup basée sur le nom de fichier casse pour cette activité. Fallback : dédupliquer par contenu (hash) ou par timestamp exact.
- **Qui tranche** : dev. Ajouter un test unitaire dédié.

### N6 — La colonne `Nom du fichier` du CSV correspond-elle à `activities/<nom>` ?

- **Constat** : le CSV contient une colonne `Nom du fichier`. Non extraite par le spike (agrégats seulement).
- **Décision technique** : si oui, on peut réconcilier CSV ↔ fichier activité par cette clé, plus fiable qu'un match par timestamp.
- **Qui tranche** : dev, en lisant 5 lignes du CSV manuellement au prochain spike.

---

## Section A — Techniques (à trancher par le spike doc `07`)

### A1 — Colonnes exactes et stabilité de `activities.csv`
- **État** : liste de colonnes du doc `01` § 2.4 reconstruite depuis un package R tiers (`Athlytics`) et projets communautaires. Non vérifiée contre une archive Strava réelle. Non vérifiée sur exports en langue française.
- **Qui tranche** : le spike, sur ≥ 1 archive FR + 1 archive EN.
- **Impact si mauvaise réponse** : UI d'import affiche des mauvaises colonnes, tolérance parsing insuffisante.

### A2 — Encodage effectif de `activities.csv`
- **État** : UTF-8 présumé, non confirmé.
- **Qui tranche** : le spike (`file -bi activities.csv`).

### A3 — Format effectif des dates dans le CSV
- **État** : `MMM D, YYYY, H:MM:SS AM/PM` présumé pour un export en anglais. Format inconnu pour un export en français.
- **Qui tranche** : le spike.

### A4 — Comportement de `@garmin/fitsdk` sur fichier tronqué
- **État** : documentation indique que les erreurs sont collectées, pas thrown. Non testé.
- **Qui tranche** : le spike (Q10).

### A5 — Licence exacte de `@garmin/fitsdk`
- **État** : présence d'un `LICENSE.txt` dans le repo GitHub non extrait par WebFetch. Compatibilité avec un usage commercial SaaS Cairn **non confirmée par lecture directe**.
- **Qui tranche** : ouvrir le fichier `LICENSE.txt` dans le repo `garmin/fit-javascript-sdk`. **Bloquant** avant intégration.

### A6 — Ratio de compression réel maximum d'une archive Strava
- **État** : seuil `100:1` du doc `02` provient d'un standard OWASP générique, pas d'observation sur archives Strava réelles.
- **Qui tranche** : le spike (Q2).

### A7 — Taille max effective d'une archive Strava (longue)
- **État** : borne « 500 Mo » du doc `02` est un plafond arbitraire. Une archive de 8 ans avec beaucoup de photos peut dépasser plusieurs Go.
- **Qui tranche** : le spike (Q2), puis décision produit sur la borne.

### A8 — Temps de parsing bout à bout d'une archive « longue »
- **État** : cible produit « < 5 min pour 500 activités sur 1 core / 512 Mo ». Non mesuré.
- **Qui tranche** : le spike (Q14).
- **Impact si mauvaise réponse** : bascule en mode asynchrone (notification par email), UX change.

### A9 — Choix précis de l'AV
- **État** : ClamAV embarqué ou service managé (VirusTotal Enterprise, autre). Coût, latence, taux faux-positifs à comparer.
- **Qui tranche** : décision infra Eva, après devis.

### A10 — Runtime du worker de parsing
- **État** : Vercel Sandbox, Fly Machines, Modal, Cloudflare Workers, ou job dans le monolithe Vercel. Impact coût et latence non mesuré.
- **Qui tranche** : Eva après POC.

### A11 — Conservation du fichier source (24h vs 90j opt-in tier « Pro »)
- **État** : doc `03` § 7 propose « A par défaut, B opt-in payant ». Décision produit à confirmer.
- **Qui tranche** : Eva.

---

## Section B — Produit (à trancher par décision produit + mesure)

### B1 — Format et longueur du questionnaire d'onboarding
- **État** : proposition à 8 écrans, ~4-7 min (doc `08` § 1). Optimum réel non testé.
- **Qui tranche** : test A/B (long vs court) sur premières cohortes, mesure de la satisfaction du plan produit et de la retention T+7.
- **Blocage** : impossible avant beta ouverte.

### B2 — Seuils de bascule paliers 1 → 2 → 3
- **État** : proposition doc `04` § 2. Valeurs plausibles mais non mesurées sur cohortes réelles.
- **Qui tranche** : suivi analytique après ouverture beta, ajustement configuration.

### B3 — Politique de re-génération complète du plan vs ajustement incrémental
- **État** : doc `05` § 5. Deux stratégies possibles : (a) le moteur régénère un plan complet à chaque événement significatif (blessure, changement objectif, séance manquée × N) ; (b) il ajuste incrémentalement. Impact perception utilisateur.
- **Qui tranche** : Eva + architecture moteur.

### B4 — Retention T+30 palier 1
- **État** : hypothèse thèse « palier 1 tient » (doc `04` § 6). Non vérifiée.
- **Qui tranche** : cohortes réelles.
- **Blocage** : si retention T+30 palier 1 < seuil (à fixer, ex : 40 %), remettre en cause l'architecture entière — la friction ne se justifie plus.

### B5 — Positionnement tarifaire
- **État** : « 15-25 €/mois plausible » (doc `08` § 6). Non testé.
- **Qui tranche** : Eva + tests prix.

### B6 — Format visuel du diff de plan proposé par le coach
- **État** : doc `05` § 5. Le format doit être **compréhensible sans expertise**, pas un JSON. UX à concevoir.
- **Qui tranche** : design produit.

### B7 — Fonction « fusion manuelle de doublons »
- **État** : doc `08` § 4.1 la cite comme investissement pour réduire le support. Priorité MVP ou v2 ?
- **Qui tranche** : Eva après premiers utilisateurs.

### B8 — Cible marketing initiale
- **État** : doc `08` § 7 recommande « athlètes déjà frustrés » plutôt que « débutants trail via Strava ». Ce choix conditionne toute la communication, le SEO, l'onboarding.
- **Qui tranche** : Eva + partenaire marketing.

---

## Section C — Juridiques (à trancher par avocat)

### C1 — Base légale du réajustement automatique du plan (art. 22 RGPD)
- **État** : décision individuelle automatisée avec effet significatif. Deux ancres possibles : (a) art. 22.2.a « nécessaire à l'exécution du contrat » ; (b) consentement explicite art. 22.2.c.
- **Qui tranche** : avocat.

### C2 — Statut « traitement à grande échelle »
- **État** : seuils qualitatifs (données santé) + quantitatifs (nombre de personnes). À partir de quel seuil Cairn bascule et doit désigner un DPO externe ?
- **Qui tranche** : avocat.

### C3 — Interprétation §6.6 Strava — le Bulk Data Export est-il vraiment hors périmètre API Policy ?
- **État** : posture retenue « oui » (doc `06`), fondée sur la lecture littérale de §6.6 Strava + art. 20 RGPD. **Non challengée juridiquement**.
- **Qui tranche** : avocat + réponse écrite Strava si possible (chantier CLAUDE.md : écrire à `developers@strava.com`).

### C4 — Localisation Anthropic (US) et transfert international
- **État** : DPA à signer, mesures supplémentaires post-Schrems II à documenter (chiffrement, minimisation).
- **Qui tranche** : avocat + relecture DPA Anthropic.

### C5 — DPA Anthropic zero-retention et no-training
- **État** : politique marketing d'Anthropic évoque zero-retention sur Claude for Work / Enterprise. À valider ligne à ligne dans le contrat réel.
- **Qui tranche** : lecture du contrat Anthropic pour Cairn, par avocat.

### C6 — Mineurs
- **État** : Cairn ne cible pas les mineurs. À traduire en interdiction contractuelle CGU (vérification d'âge, refus explicite). Non fait.
- **Qui tranche** : Eva + avocat.

### C7 — Positionnement « non substitut à un professionnel de santé »
- **État** : doit être explicite dans CGU, dans l'UI (première conversation coach), au moment de tout signalement de blessure / fatigue anormale.
- **Qui tranche** : avocat + design.

### C8 — Interpretation « données de fitness » vs « données de santé » en droit français
- **État** : la FC seule n'est pas systématiquement considérée « donnée de santé » (art. 9). Combinée avec objectif de plan et signalements de fatigue, la qualification bascule. Zone de flou. Prudent = tout traiter comme donnée santé — c'est ce que retient le doc `06`.
- **Qui tranche** : avocat.

---

## Section D — Ce qu'on écrit à qui, quand

### D1 — Mail à `developers@strava.com`
- **État** : brouillon existant (`docs/strava-mail-clarification.md` cité par CLAUDE.md). À envoyer.
- **Qui envoie** : Eva.
- **Contenu attendu** : décrire l'usage Cairn (ingestion via Bulk Export §6.6 utilisateur, aucun appel API Materials) et demander une confirmation écrite que ce mode d'ingestion sort du périmètre de l'API Policy.
- **Réponse attendue** : quelques semaines à quelques mois. Silence probable — mais la démarche vaut par elle-même comme trace de bonne foi.

### D2 — Application au Garmin Connect Developer Program
- **État** : non initié. Prérequis pour activer l'auto-import optionnel Garmin (doc `08` § 5.1).
- **Qui envoie** : Eva, dès qu'un certain nombre d'utilisateurs Garmin le demandent.

### D3 — Application COROS
- **État** : non initié. Fenêtre d'accès très étroite (retour officiel « unable to offer API access to all parties who apply »). À faire quand même pour trace.
- **Qui envoie** : Eva.

### D4 — Choix DPO externe
- **État** : à évaluer après seuil doc `06` § 11. Prestataires : Data Legal Drive, Actecil, avocats spécialisés.
- **Qui décide** : Eva après devis.

---

## Section E — Ce qui a été laissé volontairement hors périmètre

- Anonymisation des logs pour amélioration produit — à cadrer dans une doc séparée avant toute mise en œuvre.
- Politique de sauvegarde chiffrée off-site — hors ingestion, relève de l'infra.
- Coûts cumulés tokens LLM par utilisateur — chantier CLAUDE.md dédié.
- Traduction i18n — si Cairn s'ouvre hors francophonie.
- Application mobile native — hors périmètre.
