# 04 — Gradation du service selon l'historique disponible

> **Prémisse à laquelle ce document répond honnêtement** : un produit payant qui livre un plan « moche mais fonctionnel » pendant les 3 premières semaines n'est pas un produit dégradé, c'est un produit cassé. La gradation doit être **conçue comme un chemin**, pas comme une punition.

Trois paliers. Ce qui débloque quoi, avec quel seuil, avec quelle honnêteté vis-à-vis de l'utilisateur.

---

## 1. Les trois paliers

### Palier 1 — Déclaratif seul (jour 0, tous les utilisateurs)

**Ce que l'utilisateur a fait pour arriver là** :
- Créé un compte.
- Rempli un formulaire d'onboarding : objectif (course cible, distance, D+, date), volume hebdo moyen actuel (heures), sortie longue habituelle (durée), D+ mensuel typique, allures ou zones FC de référence si connues, séances hebdo disponibles, contraintes récurrentes (mardi/jeudi club, par exemple).

**Ce que Cairn a en base** : 0 activité, un profil déclaratif.

**Ce qui est actif** :
- Plan d'entraînement complet, généré depuis les déclaratifs par le moteur (voir doc `05`).
- Coach conversationnel : peut expliquer le plan, répondre sur la méthode, aider à saisir la première séance faite.
- Saisie manuelle d'une séance en < 30 s (option principale mise en avant).
- Upload d'un `.fit` isolé (option « votre montre est là ? uploadez la séance du jour »).
- Bandeau discret « Vous voulez que votre plan tienne compte de votre historique ? Cairn peut importer votre archive Strava (10 min de démarche) ou vos fichiers de montre » — jamais bloquant.

**Ce qui est indisponible** :
- Calcul ACWR (charge aigüe/chronique) — nécessite ≥ 4 semaines de données réelles.
- Détection de sur-entraînement — nécessite ~6 semaines.
- Comparaisons période à période (« ce mois vs le mois dernier »).
- Recommandations de réajustement fines (« vous êtes 15 % au-dessus de votre charge habituelle »).
- Suggestions personnalisées d'allure sur les intervalles (le moteur utilise les allures déclaratives, non des allures observées).

**Comment on le communique** :
Un badge de niveau de personnalisation dans le tableau de bord (**Palier 1/3 — Fondations**), avec une bulle explicative « votre plan est basé sur ce que vous nous avez dit ; il s'affinera à mesure que vous ajouterez des séances ». **Pas de vocabulaire « limité », « bloqué », « manquant »**. Le mot est « fondations » puis « affiné » puis « optimisé ».

**Est-ce utilisable comme produit payant ?** — oui, mais **avec un engagement fort du moteur** : le plan doit être solide dès la première génération. C'est le vrai enjeu. Le moteur doit être un **coach expert qui a rencontré un athlète pour la première fois** et lui donne un plan de départ crédible, pas un moteur qui attend d'avoir 40 séances pour être bon. Ceci est **une exigence produit forte** — si le moteur ne sait pas faire ça, la gradation ne suffit pas à sauver le paye-mur.

### Palier 2 — Historique partiel (2 à 6 semaines de données réelles)

**Comment y arriver** :
- L'utilisateur ajoute des séances au fil de l'eau (fit isolé, saisie manuelle, CSV template).
- **OU** il importe une portion d'archive (par exemple, ses derniers mois via export Strava, ou téléchargement de N `.fit` depuis Garmin Connect à la main).

**Ce qui se débloque** :
- Ajustement du plan à mi-course (« vous avez couru moins que prévu ces 2 semaines, on recale »).
- Alerte de charge naïve (« votre volume a doublé sur 7 j, prudence ») basée sur une heuristique simple (variation de charge hebdo × 1.5).
- Coach IA a maintenant des données pour parler concrètement (« votre sortie longue de dimanche, à 6:20/km avec 900 m D+, on va s'en servir pour caler mercredi »).

**Ce qui reste indisponible** :
- ACWR fiable (voir seuil §2).
- Tendances mensuelles.

**Communication** :
Badge devient **Palier 2/3 — Affiné**. Un jauge « historique : 3 semaines / 4 pour débloquer la charge » indique explicitement le seuil.

### Palier 3 — Historique complet (≥ N semaines, seuil §2)

**Comment y arriver** :
- Import archive Strava complète (chemin le plus rapide pour athlète historique Strava).
- OU accumulation naturelle après 2-3 mois d'usage.
- OU compilation de plusieurs sources (CSV historique + fichiers montre).

**Ce qui se débloque** :
- ACWR calculé, seuils personnalisés, alertes proactives.
- Détection de plateau, de pattern de blessure (irrégularité de charge, augmentation soudaine).
- Zones FC personnelles calculées si palier 2 + consentement santé actif.
- Comparaisons « vous à même période l'an dernier ».
- Prédiction d'allure sur course cible avec intervalle de confiance non ridicule.

**Communication** :
Badge **Palier 3/3 — Optimisé**. On peut à ce stade se permettre d'être élogieux : « votre coach IA a 8 mois de recul sur vous ».

---

## 2. Seuils précis de bascule

Sourcing : littérature ACWR sur population running/trail (Gabbett et coll., 2016 sur le concept, applications running dans Vaquera 2020 et suivants ; les seuils exacts pour trail n'ont pas de méta-analyse publiée à ma connaissance — c'est un **calibrage produit**, à documenter et à justifier plutôt qu'à affirmer scientifique).

| Fonctionnalité | Seuil retenu | Justification |
|---|---|---|
| Bascule palier 1 → 2 | ≥ **10 séances** OU ≥ **3 semaines calendaires** avec au moins 1 séance | Seuil « ce n'est plus zéro, on a un signal ». |
| Alerte charge naïve | ≥ 2 semaines complètes | Comparaison semaine N vs semaine N-1. Fragile mais explicable. |
| Bascule palier 2 → 3 | ≥ **4 semaines complètes** ET ≥ **20 séances** ET couverture ≥ 80% des jours prévus | Seuil ACWR classique (rolling 28j / rolling 7j). En dessous, le ratio est trompeur (division par petit nombre). |
| Zones FC calculées serveur | palier 2 + ≥ **8 séances avec FC** ET consentement santé actif | Suffisant pour une estimation LTHR grossière. |
| Prédiction d'allure course cible | palier 3 + ≥ **1 séance longue** à intensité course dans les 4 dernières semaines | Sinon la prédiction est un vœu pieux. |

**Chaque seuil est stocké en configuration, pas en dur** — pour que le calibrage puisse être ajusté à partir d'observations réelles sans redéploiement.

---

## 3. Le piège central — le palier 1 doit tenir seul

**C'est ici que se joue la viabilité économique du produit.**

Le brief demande une évaluation honnête. Voici la mienne :

### 3.1 Un plan palier 1 est-il crédible face à Runna, Vert, TrainingPeaks ?

**Oui** si :
- Le moteur possède une **bibliothèque solide de patrons de plan trail** paramétrable par objectif, volume, durée. Ce n'est pas de l'IA, c'est du savoir-faire coach codifié.
- La personnalisation initiale est **substantielle** (le formulaire ne fait pas 4 champs mais 15-25, en 8-10 min, structuré comme une consultation avec un coach humain).
- La progression sur 4 semaines paraît sensée et adaptable dès qu'une seule séance est ajoutée.

**Non** si :
- Le moteur attend l'ACWR pour être utile → alors on vend une promesse qui met 4 semaines à se réaliser, l'utilisateur churn avant.
- Le formulaire d'onboarding fait 3 questions génériques → le plan aura l'air d'un template.

**Conséquence** : le budget de développement doit prioritairement financer la **profondeur du questionnaire d'onboarding + qualité du moteur déclaratif**, pas le fine-tuning de l'ACWR. C'est contre-intuitif si on vient d'une culture data.

### 3.2 Concurrence directe

- **TrainingPeaks / TrainerRoad** : historiquement bâtis sur import et éditent depuis 15 ans des plans « from scratch ». Le questionnaire d'onboarding TrainerRoad Adaptive Training est extensif — c'est un standard atteignable.
- **Runna** (racheté Strava 04/2025) : questionnaire court, mais bâtit sur intégration Strava directe. Cairn n'a pas cette béquille, donc **doit compenser par le questionnaire**.
- **Vert**, **Zone5**, apps trail : plupart en mode « bibliothèque de plans + ajustement manuel ». Cairn peut faire mieux **si** la personnalisation initiale est vraie.

### 3.3 Ce qui peut cesser d'être un problème

Une utilisatrice qui saisit sa séance manuelle chaque soir en 30 s (« 55 min course, RPE 6, 400 m D+ »)  atteint palier 2 en trois semaines. **Beaucoup plus vite que si elle attend son archive Strava** (délai de génération). Autrement dit : **la saisie manuelle disciplinée + coach IA qui rappelle discrètement de saisir** peut être plus efficace qu'un import massif retardé.

C'est un pattern à assumer : « votre historique se construit avec vous, pas contre vous ». Anti-thèse du « je clique sur Strava et j'ai tout ».

---

## 4. Matrice fonction × palier

| Fonction | Palier 1 | Palier 2 | Palier 3 |
|---|---|---|---|
| Plan complet dès J0 | ✅ | ✅ | ✅ |
| Ajustement à mi-course | ✅ (basé formulaire) | ✅ (basé données) | ✅ |
| Ajout séance en < 30 s | ✅ | ✅ | ✅ |
| Coach IA conversationnel | ✅ (parle du plan) | ✅ (parle des séances récentes) | ✅ (parle de tendances) |
| Alerte charge naïve | ❌ | ✅ | ✅ |
| ACWR + alerte scientifique | ❌ | ❌ | ✅ |
| Zones FC personnelles | ❌ | ⚠️ (si consentement + FC dispo) | ✅ |
| Prédiction chrono course | ⚠️ (basée VMA/CAT déclaré) | ⚠️ (idem, un peu recalibré) | ✅ (recalibré + intervalle de confiance) |
| Comparaison longue période | ❌ | ❌ | ✅ |
| Rapport hebdo / mensuel | Basique | Riche | Détaillé |

---

## 5. Ce qu'on peut promettre commercialement

**Ce qu'on peut affirmer sans mentir** :
- « Plan d'entraînement personnalisé dès l'inscription, sans dépendance à un service tiers ».
- « S'affine à chaque séance ».
- « Vos données restent vôtres, exportables à tout moment ».

**Ce qu'on ne peut PAS affirmer** :
- « Analyse de charge dès la première semaine ».
- « ACWR temps réel » (au sens statistique du terme) avant plusieurs semaines.
- « Coach qui apprend de vous » — trop puissant, à réserver au palier 3.

Cet arbitrage a un coût commercial : les concurrents qui **prétendent** faire de l'ACWR dès jour 1 (statistiquement peu fondé) auront un pitch plus vendeur. C'est un choix d'honnêteté qui doit être assumé.

---

## 6. Ce qui reste ouvert

- **Test A/B onboarding** : questionnaire court vs long, mesure de la friction et de la satisfaction du plan produit. Impossible à trancher a priori — voir `QUESTIONS-OUVERTES.md`.
- **Retention T+30** en palier 1 : hypothèse à valider avec les premiers utilisateurs. **C'est la seule métrique qui dira si l'analyse ci-dessus tient.** Si retention T+30 palier 1 < retention T+30 après import complet, la thèse « le plan tient dès le déclaratif » est fausse et le produit doit reconsidérer sa cible (athlète qui a déjà un historique Strava seulement, marché plus étroit).
