# 05 — Séparation moteur déterministe / couche LLM

> Principe : ce qui doit être **reproductible, auditable, sûr** est déterministe. Ce qui doit être **pédagogique, empathique, conversationnel** est LLM. On ne mélange jamais les deux, et le contrat d'interface est **explicite et minimal**.

## 0. Pourquoi cette séparation stricte

Trois raisons cumulatives :

1. **Fiabilité clinique** — un plan d'entraînement pour une utilisatrice qui vise une ultra a des conséquences physiques (blessure, épuisement, désillusion). Il faut pouvoir dire pourquoi une séance a été programmée. Un LLM ne le peut pas de façon fiable.
2. **Coût et budget tokens** — un moteur pur code coûte 0 en tokens. Confier au LLM ce qu'un `if` peut faire est un gaspillage qui plafonne le pricing en freemium.
3. **Conformité (doc `06`)** — les données de santé ne doivent transiter au LLM que sous forme **dérivée**, jamais brute. La séparation force cette discipline dans l'architecture, pas dans les prompts (règle CLAUDE.md).

Le PRD Cairn v0.3 (mentionné en préambule) traite déjà cette séparation. Le présent document formalise le **contrat d'interface** entre A (moteur) et B (LLM).

---

## 1. Composant A — Moteur de planification déterministe

### 1.1 Périmètre

Le moteur produit et fait évoluer un **plan d'entraînement** structuré. Il ne parle pas à l'utilisateur, il produit des artefacts consommés par la couche B.

Fonctions :
- **Génération initiale** d'un plan sur N semaines depuis un profil déclaratif (palier 1) ou déclaratif + historique (paliers 2-3).
- **Réajustement** d'un plan existant en réponse à un événement (séance ajoutée, séance manquée, blessure signalée, changement d'objectif).
- **Calcul de charge** (CTL/ATL/ACWR-like adapté trail, `effort_index` interne pondéré par D+ et durée).
- **Détection d'anomalies** (charge en pic, semaine à zéro, écarts déclaratif vs observé).
- **Score de complétude** du plan (% séances faites, % D+ prévu vs réalisé).

### 1.2 Propriétés attendues

| Propriété | Garantie |
|---|---|
| Reproductibilité | Deux appels avec les mêmes inputs → mêmes outputs, bit pour bit. Pas de randomisation cachée. |
| Explicabilité | Chaque décision est traçable : quelle règle, quels seuils, quelles données ont pesé. |
| Testabilité | Couvert par tests unitaires + tests de non-régression sur cas cliniques (« utilisateur X en surcharge » → alerte déclenchée). |
| Isolation IA | Aucun appel LLM depuis A. A ne connaît pas `anthropic-sdk`. |

### 1.3 Fonctionnement en dégradé

Le moteur DOIT tourner à tous les paliers :
- **Palier 1** : entrées = profil déclaratif seul. Output = plan basé sur bibliothèque de patrons + règles de sécurité (progression max +10%/sem, jamais deux séances dures consécutives, …).
- **Palier 2** : entrées = profil + historique partiel. Output = idem palier 1 + ajustements par heuristiques simples.
- **Palier 3** : entrées = profil + historique complet. Output = idem palier 2 + calculs statistiques (ACWR, tendances).

Le passage d'un palier à l'autre n'est **pas** une refonte : ce sont des **modules d'analyse additifs** qui s'activent sur seuil d'historique. Le noyau (patrons + règles de sécurité) est commun.

### 1.4 Journalisation obligatoire

Toute génération ou modification de plan → écriture dans `plan_revisions` (existant, cité CLAUDE.md) :
- horodatage
- déclencheur (`user_action`, `ingestion_event`, `scheduled_review`)
- inputs consommés (par ID, jamais valeur)
- diff produit
- auteur (`user` | `engine`, **jamais** `ai` pour A)
- annulable

---

## 2. Composant B — Couche conversationnelle LLM

### 2.1 Périmètre

Le LLM (Anthropic API, cf. CLAUDE.md) fait ce qu'il fait bien :
- **Restitution** : traduire un plan produit par A en langage humain, adapter le registre.
- **Pédagogie** : expliquer pourquoi cette séance, contextualiser un ajustement.
- **Reformulation** : reformuler une demande utilisateur pour la passer à A via un outil (tool use).
- **Empathie** : lire un état émotionnel (« je suis crevée cette semaine ») et répondre humainement, sans prendre de décision médicale.

### 2.2 Ce que B ne fait pas

- **Ne modifie jamais le plan directement** — passe par un outil scoped `propose_plan_change(...)` qui appelle A, A décide, revient avec un diff, le LLM le restitue à l'utilisateur avec bouton « appliquer ».
- **Ne fait pas de calcul de charge**. Si l'utilisateur demande son ACWR, l'appel outil `get_load_metrics()` va chercher chez A.
- **Ne diagnostique jamais médicalement**. Signal de blessure → réponse cadrée + orientation professionnelle (règle CLAUDE.md §5).
- **N'invente pas de séance** hors patrons connus.

### 2.3 Contrat d'interface — ce qui traverse A → B

Le contexte coach, plafonné 2-4k tokens (règle CLAUDE.md), contient **exclusivement** :

```ts
type CoachContext = {
  // Profil résumé
  athlete_summary: {
    experience_level: 'debutant'|'intermediaire'|'confirme'|'elite';
    weekly_volume_h: number;         // arrondi
    typical_long_run_min: number;    // arrondi
    goal_race: { name?: string, date?: string, distance_km?: number, elevation_m?: number };
  };

  // Plan actuel (résumé, pas la version complète)
  plan_state: {
    current_week_index: number;
    plan_horizon_weeks: number;
    palier: 1 | 2 | 3;
    completeness_pct: number;
  };

  // Dernières séances — DÉRIVÉES UNIQUEMENT
  recent_activities: Array<{
    date: string;                    // YYYY-MM-DD, pas d'heure fine
    activity_type: 'run'|'trail'|'bike'|'hike'|'strength'|'other';
    duration_min: number;            // arrondi
    distance_km_bucket: '0-5'|'5-10'|'10-20'|'20-40'|'40+';
    elevation_gain_m_bucket: '0-100'|'100-500'|'500-1500'|'1500+';
    rpe: number | null;
    aerobic_flag: 'aerobic'|'mixed'|'anaerobic' | null;
    provenance: string;
  }>;

  // Signaux dérivés — jamais la FC brute
  health_signals: {
    load_trend_flag: 'stable'|'rising'|'falling';    // pas de valeur chiffrée
    fatigue_flag: 'ok'|'watch'|'alert';               // dérivé serveur
    fueling_state: 'ok'|'watch'|'alert';              // règle CLAUDE.md §6 : 3 états, pas de score
    // pas de hr_avg, pas de series
  };

  // Fenêtre à venir
  upcoming_sessions: Array<{
    date: string;
    intent: string;              // ex: "sortie longue trail"
    target_duration_min: number;
    target_notes: string;        // consigne pédagogique
  }>;
};
```

**Ce qui ne traverse jamais** :
- FC brute (`hr_avg`, `hr_max` numérique) — remplacé par `fatigue_flag` dérivé.
- Séries temporelles (splits, points GPS).
- `notes_user`, `perceived_notes` — informations personnelles arbitraires.
- Nom réel de l'utilisateur (`title_user` de l'activité, éventuellement).
- Tout token/secret/identifiant technique.

### 2.4 Outils exposés au LLM (`lib/ai/tools.ts` — fichier intouchable CLAUDE.md)

Rappel des règles :
- Chaque outil reçoit `tenant_id` **de la session serveur**, jamais d'un paramètre du modèle.
- Chaque outil scoped, en lecture ou en proposition (jamais écriture directe sans re-confirmation utilisateur).

Outils typiques (proposés — la liste exacte est dans `lib/ai/tools.ts`) :
- `get_recent_activities(limit)` — retourne les activités dans le format sanitizé §2.3.
- `get_upcoming_sessions(days)` — séances programmées.
- `get_plan_summary()` — snapshot plan.
- `propose_plan_change(intent, week_range, params)` — propose une modification, retourne un diff à faire confirmer.
- `flag_fatigue()` — l'utilisateur signale un état ; l'outil enregistre, A recalcule les signaux.
- `open_professional_orientation(topic)` — l'outil produit une orientation vers un professionnel (règle CLAUDE.md §4, §5).

---

## 3. Cas d'usage — comment ça s'articule concrètement

### Cas 1 — Question factuelle
> Utilisateur : « Combien j'ai couru la semaine dernière ? »

- LLM appelle `get_recent_activities({from: -7d})` → A retourne les activités.
- LLM agrège et répond en langage naturel.

### Cas 2 — Modification demandée
> Utilisateur : « Je peux pas courir mardi, on décale ? »

- LLM appelle `propose_plan_change({intent: "shift_session", session_date: "2026-08-04"})`.
- A produit un diff (séance mardi → mercredi, ajustement récupération).
- LLM restitue : « voici la modif proposée [diff], tu confirmes ? »
- L'utilisateur confirme via un contrôle UI **hors du texte LLM** → écriture réelle par A.
- **Le coach ne dit jamais « c'est fait » sans afficher le différentiel confirmable** (règle CLAUDE.md).

### Cas 3 — Ingestion → réajustement
> L'utilisatrice upload une séance `.fit`.

- Parsing (docs `01`/`02`) → écriture `activities` + `activity_health` si consentement.
- Trigger côté A : `on_activity_ingested` → moteur recalcule charge, éventuel `plan_revisions`.
- Notification au LLM : contexte suivant inclut la nouvelle séance et le diff (s'il y en a).
- Prochain message coach peut proactivement en parler.

### Cas 4 — Signal médical
> Utilisateur : « J'ai mal au tendon d'Achille depuis 3 jours ».

- LLM appelle `flag_fatigue({context: "physical_pain_reported"})` — pas de diagnostic.
- LLM appelle `open_professional_orientation({topic: "musculoskeletal"})`.
- Réponse : « je vois, on va temporiser. Je recommande de faire vérifier ça par un kiné du sport (voici pourquoi). En attendant, on remplace tes séances de course par vélo/renfo sur les X prochains jours — tu confirmes ? »
- A produit le plan modifié, l'utilisateur confirme.

---

## 4. Contraintes conformité qui structurent B (préview doc `06`)

- **AI Act art. 50** — mention permanente et visible « vous discutez avec une IA » dans chaque écran chat, dès la première interaction. Doit être implémenté avant tout accès externe (règle CLAUDE.md).
- **Sous-traitance LLM** — le fournisseur (Anthropic) doit avoir un DPA signé, données non utilisées pour entraînement, localisation UE si possible (voir doc `06`).
- **Journalisation tokens** — chaque appel LLM logge `tokens_in`, `tokens_out`, outils appelés, coût estimé (chantier CLAUDE.md « coût IA par utilisateur »).

---

## 5. Ce qui reste ouvert

- **Provider LLM** — Claude par CLAUDE.md, mais à formaliser dans le DPA. Alternative Mistral (localisation UE native) à documenter mais **non prioritaire à l'échelle actuelle**.
- **Format du diff plan** proposé à l'utilisateur — doit être **compréhensible**, pas un JSON. Design UX à faire.
- **Politique de re-génération complète du plan** vs ajustement incrémental — heuristique à trancher (voir `QUESTIONS-OUVERTES.md`).
