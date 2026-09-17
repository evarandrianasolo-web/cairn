# 05 — UX et monétisation, sans one-click Strava

> Phase 6 : coût UX de la perte du bouton « connexion Strava » à l'inscription + analyse du benchmark concurrent sur la monétisation
> Ce document répond à deux questions produit : quel parcours de compensation à l'onboarding, et faut-il facturer l'analyse (positionnement historique) ou l'export (positionnement observé chez les concurrents post-2026) ?

---

## 1. Le coût UX de la perte du one-click Strava

### 1.1 Ce qu'on perd

Le bouton « Se connecter avec Strava » à l'inscription apporte trois choses :

1. **Skip de la saisie profil** — email + prénom + photo remplis d'un clic.
2. **Import instantané de l'historique** — un utilisateur qui a 3 ans de Strava a un onboarding « riche » : le produit lui parle de ses courses passées dès la première session.
3. **Reconnaissance mentale** — Strava est un mot familier, cliquer dessus est un geste connu.

Dans une architecture qui exclut Strava en lecture (position retenue au doc 04, Option A), on perd les trois.

### 1.2 Ce qu'on ne perd pas

- L'utilisateur peut toujours **partager socialement** sur Strava, via la synchro constructeur → Strava (doc 04). La photo Strava reste sur Strava. Cairn ne remplace pas Strava, il coexiste.
- L'utilisateur qui a une montre Garmin/Polar/Suunto/Wahoo/COROS peut faire du one-click **constructeur**, qui est presque aussi fluide côté Garmin (OAuth 2 clics).

### 1.3 Le parcours de compensation

**Onboarding en 3 chemins mutuellement exclusifs, choisis par l'utilisateur :**

#### Chemin A — J'ai une montre GPS (95 % des trailers cibles)
1. « Quelle est votre montre ? » → sélecteur : Garmin, COROS, Polar, Suunto, Wahoo, autre.
2. OAuth constructeur (Garmin en priorité — couverture majoritaire).
3. Import de l'historique via l'API (fenêtre variable selon constructeur — voir doc 01).
4. Optionnel : *« pour rattraper votre historique complet, uploadez vos anciens fichiers FIT »* — proposé mais non bloquant.
5. Si COROS → uniquement upload FIT (pas de socle contractuel actif).

#### Chemin B — J'ai une Apple Watch / Android
1. HealthKit ou Health Connect autorisation.
2. Import des activités disponibles côté OS santé.
3. Prévenir de la moindre richesse (pas toujours de laps structurés, pas de streams complets).

#### Chemin C — Je n'ai rien à connecter
1. Saisie du profil : objectif, VMA / seuil (avec test guidé si non connus), disponibilités.
2. Le moteur produit un plan à partir de la déclaration.
3. Les séances effectuées se saisissent en `manual` (durée + RPE) ou par upload FIT ponctuel.

#### Fallback universel toujours proposé
- **Upload FIT / GPX / TCX** : présent à chaque étape, hors OAuth. Robuste. Utilisé par les curieux, les paranoïaques, et les gens qui n'ont pas envie d'autoriser encore une app.

#### Bonus — pour un utilisateur Strava qui insiste
- Bouton « importer votre archive Strava » : lien vers le Bulk Data Export §6.6 côté Strava, avec instructions ; drag-and-drop du ZIP dans Cairn. Ingestion : `strava_bulk_export`. Une fois, propre juridiquement, UX plus lourde.
- Communiquer honnêtement : *« Cairn ne se connecte pas directement à Strava. Voici comment récupérer votre historique en 2 minutes. »* La franchise se signale — beaucoup d'utilisateurs seront d'accord avec le raisonnement s'il est expliqué.

### 1.4 Effet sur le funnel

Hypothèses (à instrumenter) :
- Chemin A (Garmin OAuth) : conversion proche du one-click Strava, léger surcoût cognitif.
- Chemin B : conversion moyenne, moins connu.
- Chemin C : conversion faible sur activation immédiate mais utilisateurs plus engagés (choix conscient).
- Bulk Export Strava : réservé à une minorité motivée. Non compté dans le funnel principal.

**Il faut instrumenter** ces conversions dès le lancement pour ajuster. Mesure clé : `time_to_first_plan`.

---

## 2. Monétisation — le benchmark concurrent en question

### 2.1 Ce que le brief laisse entendre

Le brief note un mouvement : les concurrents monétisent l'**export** (envoi vers montre, suivi live, calendrier) plutôt que l'**analyse**. Cette évolution est cohérente avec le contexte juridique — analyser des données Strava étant devenu tacitement risqué depuis juin 2026, monétiser la valeur *sortante* (workouts poussés) est un pivot naturel.

### 2.2 Ce que ce benchmark **ne prouve pas**

Le benchmark **décrit** des pratiques observées ; il ne les **justifie** pas juridiquement.

- Que Runna soit dans le portefeuille Strava depuis avril 2025 rend son cas non transposable (accès privilégié possible).
- Que Borner communique « coaching IA inclus » alors que sa Policy Strava dit l'inverse (§5.3) reflète soit une non-conformité assumée, soit une architecture séparée non lisible de l'extérieur — mais pas une norme reproductible.

**Ne pas déduire** : « X le fait, donc c'est autorisé ». Cette dérive est explicitement écartée par le brief (« Le benchmark concurrent décrit des pratiques observées, pas des pratiques conformes »).

### 2.3 La question sous-jacente : quoi facturer pour un produit trail avec IA ?

Trois axes de valeur, chacun avec sa propre logique de facturation :

| Axe de valeur | Nature | Risque juridique | Concurrence | Adéquation Cairn |
|---|---|---|---|---|
| **Analyse rétrospective** (charge, tendance, ACWR, insights) | Compréhension | Élevé sur données API Strava (§5.4) — nul sur données constructeur | Historiquement le cœur des « coach apps » | ✅ (sources autorisées uniquement) |
| **Export vers exécution** (push workouts, calendrier, live tracking) | Action | Faible (les APIs de write sont autorisées) | Émerge comme axe safe post-2026 | ✅ |
| **Restitution conversationnelle** (coach IA qui parle, explique, adapte) | Pédagogie / accompagnement | Nul sur sources autorisées (Garmin exige transparence + consent) | Différenciation encore rare, en croissance | ✅ *(différenciateur Cairn)* |

Pour Cairn, les trois axes sont **compatibles** avec le socle proposé (Garmin + fallback), car le socle autorise **et** l'analytics **et** l'IA **et** le push vers device. Le pivot vers « export uniquement » que fait la concurrence sous contrainte Strava n'est pas requis pour Cairn.

### 2.4 Positionnement recommandé

**Cairn facture l'accompagnement complet : plan qui s'adapte + coach qui parle + intelligence rétrospective + push vers la montre.** Un seul abonnement. La différenciation n'est pas *« nous, on fait plus »* mais *« nous, tout ça est structurellement cohérent avec la donnée que nous avons le droit d'utiliser »*.

L'argument produit :
- Vous êtes chez nous parce que vous avez une montre GPS moderne (Garmin, etc.). C'est votre donnée, nous la lisons chez le constructeur.
- Votre plan s'adapte réellement — moteur qui recalibre chaque semaine.
- Le coach IA explique, répond, ne juge pas — et surtout **ne vous parle jamais de poids ni de calories** (règle santé, cœur de posture Cairn).
- Vos séances arrivent sur votre montre en 1 clic.
- Vous continuez à partager sur Strava si vous le voulez (via votre montre, comme aujourd'hui).

### 2.5 Prix, essai, trial

Le trial 7 jours existe déjà côté produit (commit récent). C'est la norme du marché fitness (Runna 14 j, Borner 14 j). 7 j suffit à vivre un cycle de plan hebdomadaire.

Le prix n'est **pas** un livrable de ce dossier. À caler avec le PRD sur les benchmarks : Runna 19,99 €/mois environ, Borner en gamme similaire. Le positionnement Cairn (français, trail, spécifique, IA proprement dosée) autorise probablement un prix aligné (10–15 €/mois) plutôt que premium — à valider par test.

### 2.6 Ce qui reste ouvert côté monétisation

- Facturer à l'usage IA (limiter les conversations coach par tier gratuit) vs. abonnement simple : trade-off engagement vs. prévisibilité de coût. Inscrit dans `QUESTIONS-OUVERTES.md`.
- Palier « coach humain » (fonction B2B optionnel, avec partage explicite d'athlète à coach) : nécessite validation du §5 « Partage tiers » côté Garmin (à clarifier). Pas prioritaire.

---

## 3. Une phrase pour l'équipe

**Ne pas monétiser l'export parce que la concurrence le fait ; monétiser ce que Cairn est légalement libre de faire, et ce qui distingue le produit — la cohérence entre le moteur, le coach IA et la posture santé.**
