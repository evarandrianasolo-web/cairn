# 04 — Flux inversé vers Strava (pattern « Runna »)

> Phase 5 : évaluation du pattern « pousser vers, ne jamais lire depuis »
> Runna (racheté par Strava en avril 2025) illustrait cette approche : l'app générait les séances, les poussait vers la montre / vers Strava en écriture, mais n'aspirait pas l'historique Strava.

---

## 1. Description technique du flux envisagé

### 1.1 Le pattern « push-only »

1. Le moteur Cairn produit une séance planifiée (allure cible, durée, laps, D+ objectif) → format structuré (interne).
2. Cette séance est **poussée** vers la montre de l'utilisateur, via l'API du constructeur (Garmin `Workouts / Courses`, Polar `Training targets`, Wahoo, Suunto, COROS).
3. L'utilisateur court avec sa montre. La montre exécute la séance et **enregistre l'activité localement**.
4. La montre, connectée nativement au compte Strava de l'utilisateur (paramétrage du constructeur ↔ Strava, hors périmètre Cairn), pousse automatiquement l'activité effectuée vers Strava.
5. Cairn n'a **jamais** lu quoi que ce soit depuis l'API Strava. Cairn n'a **jamais** stocké de donnée Strava. Cairn n'a **jamais** été soumis à l'API Policy Strava.
6. La valeur sociale (« mon activité apparaît dans mon flux Strava ») est préservée sans que Cairn n'apparaisse dans la chaîne Strava.

### 1.2 Distinction clé

- **Ce que Cairn fait** : pousser des workouts vers Garmin/Polar/Suunto/Wahoo/COROS. Autorisé par leurs Agreements (§7.1 équivalent chez Garmin, capacité `Training targets` chez Polar, etc.).
- **Ce que la montre fait** : synchroniser vers Strava. C'est un paramétrage utilisateur, activé par l'athlète chez le constructeur.
- **Ce que Cairn ne fait pas** : lire l'activité effectuée depuis Strava. On la lit **depuis le constructeur**, via l'OAuth Garmin/Polar/Suunto/etc., qui est notre socle.

### 1.3 Pas besoin d'OAuth Strava côté app

Ce pattern permet de se passer **totalement** de l'OAuth Strava dans l'application.

- Pas de scope Strava demandé.
- Pas de compte développeur Strava (les frais d'abonnement 11,99 $/mois évoqués §3.3 disparaissent).
- Pas d'exposition à l'API Policy.
- Pas de risque de coupure d'API pour l'utilisateur : la synchro Strava est **entre la montre et Strava**, elle survit à toute coupure Cairn↔Strava.

---

## 2. Bénéfice — la valeur sociale conservée

Le vrai enjeu de « Strava dans le produit » n'est **pas** analytique (§5.4 rend l'analytique impossible de toute façon). L'enjeu est **social** : « mes potes me voient courir ». C'est un booster d'engagement et un canal d'acquisition (le kudos sur le trail avec mention « préparé avec Cairn » dans la description).

Avec le flux inversé :
- L'activité arrive sur Strava (via la montre).
- Cairn peut, au moment où l'utilisateur valide sa séance dans l'app, proposer d'écrire dans la description de la séance sur Strava. **Attention** : cette écriture nécessite un OAuth Strava scope `activity:write`. Si l'on veut cette fonctionnalité, on rentre à nouveau dans l'API Policy Strava — mais pour un usage **write-only, minimal**, sans lecture d'aucune sorte.

**Option A — Pur push, zéro Strava dans Cairn** : Cairn ne touche jamais l'API Strava. L'utilisateur n'a rien à autoriser côté Strava dans Cairn. La séance apparaît sur Strava telle que la montre l'a poussée, sans mention Cairn.

**Option B — Push + write description** : Cairn demande un scope Strava réduit (`activity:write` uniquement). Cairn peut ajouter une phrase « préparé avec Cairn — objectif : sortie longue Z2 » dans la description de l'activité fraîchement importée. Aucune lecture jamais. Ce write minimal reste couvert par le fait que Cairn n'est pas dans le régime d'ingestion §5–§6.

**⚠️ Option B à valider juridiquement** : le simple fait d'avoir un scope OAuth Strava, même write-only, oblige-t-il à respecter l'entièreté de l'API Policy ? Interprétation prudente : oui, dès qu'on utilise les API Materials, on est soumis. Écrire dans une description n'est pas contraint par §5.3/§5.4 (aucune lecture, aucune AI Application), mais on hérite quand même du RO (§2.1 — coupure possible sans préavis). Inscrit dans `QUESTIONS-OUVERTES.md`.

**Recommandation** : partir sur Option A, réévaluer Option B seulement si un signal utilisateur fort le demande.

---

## 3. Coût — la dépendance à la configuration utilisateur

Le flux repose sur un enchaînement dont **Cairn ne maîtrise qu'un maillon** :

1. Cairn pousse vers la montre ✅ (maîtrisé, contrat constructeur)
2. Utilisateur porte la montre et exécute la séance ✅ (comportement utilisateur normal)
3. Montre est configurée pour synchroniser vers Strava ⚠️ (à faire par l'utilisateur chez le constructeur, une fois pour toutes)
4. Constructeur ↔ Strava fonctionne ⚠️ (dépendance de tiers)

Points de friction concrets :

- **Onboarding** : Cairn ne peut pas configurer la synchro Garmin↔Strava à la place de l'utilisateur. Il faut expliquer le chemin (Garmin Connect → Paramètres → Applications tierces → Strava) une fois. Une check-list guidée dans l'onboarding.
- **Debug** : si la séance n'apparaît pas dans Strava, ce n'est pas un bug Cairn. Support à outiller : « votre séance est arrivée dans Cairn ✅ ; côté Strava, vérifiez Paramètres > Applications > Garmin ». Article support à écrire.
- **Feature « voir ses activités Strava dans Cairn » : indisponible.** Cairn ne peut pas afficher les activités Strava d'un utilisateur qui aurait couru sans montre connectée Cairn. C'est un **regret UX** à assumer.

---

## 4. Ce que ça permet et ce que ça ne permet pas

**Permet :**
- Cairn est totalement indépendant de l'API Strava en lecture.
- Le §5.3 (IA), §5.4 (analytics), §6.2 (rétention 7 j), §5.5 (base de données), §6.1 (partage) ne s'appliquent plus.
- L'utilisateur garde sa présence sociale Strava — meilleur des deux mondes.
- Si Strava coupe demain, Cairn ne coupe pas.

**Ne permet pas :**
- Cairn ne connaît pas les activités que l'utilisateur fait **sans avoir programmé la séance dans Cairn**. Ex : sortie improvisée non planifiée. Réponse : le webhook constructeur pousse quand même l'activité (Garmin pousse toutes les activités, pas seulement celles qui suivent un workout envoyé). **Donc en pratique, ce n'est pas un problème**, à condition que le socle constructeur soit actif.
- L'utilisateur qui n'a **aucun compte constructeur configuré** (Apple Watch native uniquement, ou montre non intégrée) doit passer par upload FIT ou HealthKit.

---

## 5. Effet sur l'architecture

Le flux inversé **valide** l'architecture proposée aux docs 02 et 03 :

- Aucun schéma `strava_api` actif requis. Le module `strava_cache` reste **prévu** dans le modèle pour l'hypothèse future où l'on rouvrirait un pont limité, mais **n'est pas peuplé** en Option A.
- Les tables `plan.workouts_pushed` (nouvelle table) tracent chaque push vers un constructeur : `workout_id, user_id, device_vendor, external_workout_id, pushed_at, status`. Sert à l'audit et au debug UX.
- Le webhook constructeur ingère l'activité réalisée en `public.activities` avec `source = 'garmin' | ...` — le circuit classique.

---

## 6. Prochaine décision

Ce chapitre confirme qu'il est **techniquement et contractuellement viable de sortir totalement de l'API Strava en lecture**, à condition de :
- assumer le regret UX « voir ses activités Strava dans Cairn » : impossible en pur Option A,
- outiller l'onboarding pour guider la config Garmin↔Strava chez l'utilisateur,
- ne pas ouvrir Option B (write description) tant qu'un juriste n'a pas confirmé qu'un scope write-only ne fait pas basculer Cairn dans l'entièreté de l'API Policy.

Décision à prendre côté produit (`ADR-001`) : Option A par défaut.
