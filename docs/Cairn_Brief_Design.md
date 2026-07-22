# Brief de direction visuelle — Cairn

*Document destiné à être utilisé comme prompt dans Claude Design. Sortie attendue : une direction visuelle + 4 écrans + un système de tokens extractible.*

| Version | 1.0 |
|---|---|
| Date | 22/07/2026 |
| Référence | PRD_Cairn v0.3 |

---

## 1. Le sujet, en une phrase

**Cairn** est un coach de trail et d'ultra piloté par IA. Il connaît l'historique d'entraînement, les objectifs, les contraintes de vie et l'état de forme de la coureuse — et il **se parle**. Son travail n'est pas d'afficher des données : c'est de garder le plan vrai quand la vie le déforme.

**Utilisatrice type :** coureuse trail/ultra, 6 à 10 h par semaine, plusieurs courses par an dont un objectif majeur. Entraînée en club mais pilote de son propre plan. Contraintes fortes et non négociables : garde alternée, séances club imposées, déplacements professionnels.

**Le job de l'interface :** qu'elle ouvre l'app le matin, comprenne en trois secondes ce qu'elle fait aujourd'hui et pourquoi — et qu'elle puisse dire « je ne peux pas mardi » sans chercher où cliquer.

---

## 2. Le présupposé à casser

Tous les concurrents partagent la même conviction : **le tableau de bord est le produit**.

| Produit | Signature visuelle | Ce qu'il présuppose |
|---|---|---|
| Strava | Fil social, orange saturé | La motivation vient des autres |
| TrainingPeaks | Tableur dense, bleu/gris | L'athlète est son propre analyste |
| Garmin Connect | Cockpit bleu nuit, jauges | Plus de métriques = plus de valeur |
| Runna | Consumer vif, gamifié | Il faut récompenser l'assiduité |

Pour Cairn c'est faux. **La surface principale est une conversation.** Le graphique n'est pas le produit, c'est une pièce jointe au raisonnement. Personne ne dessine une app d'entraînement autour de ça — c'est là que la différenciation est disponible.

### Interdits explicites

Ces directions sont écartées d'avance, ce sont des réflexes et non des choix :

- ❌ Fond crème (~#F4F1EA) + serif de caractère + accent terre cuite (~#D97757).
- ❌ Fond noir profond + un accent vert acide ou vermillon.
- ❌ Mise en page « journal » : filets d'un pixel, angles à zéro, colonnes denses.
- ❌ Cockpit sombre à jauges circulaires, anneaux de progression, badges.
- ❌ Toute gamification : séries, trophées, confettis, félicitations automatiques.
- ❌ Dégradés décoratifs, glassmorphism, ombres portées molles.

---

## 3. Le pari : clair, froid, lisible dehors

**Direction retenue : mode clair par défaut**, dans une catégorie dominée par les cockpits sombres.

Justification fonctionnelle, pas esthétique : l'app est consultée dehors, avant une séance, en plein jour, souvent avec des lunettes de soleil. Un fond sombre y est illisible. Et un mode clair traité avec froideur et précision se distingue immédiatement d'un secteur qui associe sombre à technique.

Le mode sombre viendra, en second, et ne pilotera pas les décisions.

---

## 4. Système de tokens

### 4.1 Palette

Les matériaux du sujet : granit, schiste, lichen, brume d'avant-jour, balisage. Base froide, minérale, désaturée — sur laquelle **une seule couleur de signalisation porte tout le poids**.

| Nom | Hex | Rôle |
|---|---|---|
| `brume` | `#E8EAE6` | Fond principal. Blanc cassé froid à dominante verte — la brume sur une crête, jamais un crème chaud |
| `craie` | `#FBFBF9` | Surfaces, cartes, champs. La barre blanche du balisage |
| `schiste` | `#2A3138` | Texte principal, surfaces sombres. Ardoise profonde et froide — **pas un noir** |
| `granit` | `#767E7B` | Texte secondaire, libellés, métadonnées. Gris à cast vert |
| `balise` | `#D6423B` | **Couleur de signalisation.** Le rouge du balisage GR. Usage strictement réservé à la signalétique d'état |

**Couleurs d'état, dérivées et discrètes :**

| Nom | Hex | Usage |
|---|---|---|
| `lichen` | `#9BA88D` | État sain : conforme au plan, bien carburé |
| `ocre` | `#C68A3E` | Vigilance : écart, signal à surveiller |

### 4.2 Note importante sur le rouge

`balise` **n'est pas une couleur d'erreur.** Dans le balisage GR, les deux barres rouge et blanche signifient *« tu es sur l'itinéraire, continue »*. C'est la couleur de la route, pas du danger.

Conséquence : le rouge est **présent en permanence et sans dramatisation** dans l'interface. C'est la croix rouge seule — sans le blanc — qui signale l'erreur de direction. Cette distinction doit être respectée partout, elle est le cœur du langage visuel.

### 4.3 Typographie

Trois rôles, trois voix. Aucune fonte serif — un serif de caractère sur une app de trail est exactement la réponse générique.

| Rôle | Fonte | Traitement |
|---|---|---|
| **Display** | `Archivo` en graisse et chasse **étendues** | Titres d'écran et chiffres-clés. La chasse large évoque le lettrage cartographique et la signalétique. Usage rare, jamais plus d'un élément par écran |
| **Texte** | `Instrument Sans` | Conversation, descriptions, libellés. Neutre, humaniste, lisible en petit corps |
| **Données** | `Martian Mono` | Allures, distances, D+, g/h, chronos. **Chiffres tabulaires obligatoires** — les colonnes de nombres doivent s'aligner. Corps réduit, interlettrage négatif |

Échelle typographique resserrée — six pas maximum. Un écran qui utilise quatre tailles différentes a un problème de hiérarchie, pas de typographie.

### 4.4 Géométrie et rythme

- **Rayons :** 2 px sur les éléments de données, 8 px sur les surfaces conversationnelles. La distinction est sémantique — les données sont anguleuses, la conversation est douce.
- **Espacement :** base 4 px, échelle 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- **Bordures :** 1 px `granit` à 20 % d'opacité. Aucune ombre portée. La profondeur vient du contraste, pas du flou.
- **Densité :** généreuse sur Aujourd'hui et le Chat, dense sur Planning et Fiche course. La densité encode l'usage — on lit l'un debout, l'autre assis.

---

## 5. Élément signature : le balisage

**Une seule idée forte, tout le reste discipliné autour.**

Le balisage de randonnée français est un système de signes complet, immédiatement lisible par ce public, et que personne n'a exploité en produit numérique. Il se transpose exactement sur les états du plan :

| Signe | Forme | Sens dans Cairn |
|---|---|---|
| **Deux barres** rouge sur blanc | Deux rectangles superposés | Séance conforme au plan — tu es sur l'itinéraire |
| **Chevron** | Angle rouge orienté | Réajustement — le plan bifurque, voici pourquoi |
| **Croix** rouge | X franc | Écart : séance manquée ou hors plan |

Ces marques apparaissent **partout** : à côté de chaque séance du planning, en tête de chaque message du coach qui modifie le plan, dans l'historique. Elles remplacent les pastilles colorées, les icônes de check et les badges de statut. Petites — 12 à 16 px — dessinées avec précision, jamais expliquées par une légende : elles s'apprennent en trois écrans.

C'est la seule audace du produit. Tout le reste reste sobre.

---

## 6. Concept de mise en page : le profil comme colonne vertébrale

Un bloc d'entraînement **est** un profil : montée en base, pics de choc, descente d'affûtage, sommet le jour de la course.

Plutôt qu'un graphique enfermé dans une carte, le profil devient la **structure de navigation** du Planning : le temps se lit de gauche à droite comme un roadbook, la position actuelle est un point sur le tracé, et les contraintes de vie sont des zones ombrées sur le parcours.

La structure encode alors une information vraie — elle ne décore pas.

---

## 7. Les quatre écrans

Ne pas en produire davantage. Ces quatre-là portent tous les motifs du produit ; le reste en dérive.

### 7.1 Aujourd'hui

Un écran calme, une seule chose. **Ce n'est pas un tableau de bord.**

```
┌──────────────────────────────────────────┐
│  mer. 22 juillet            J-73  UTMJ   │  ← Données, discret
│                                          │
│  ▬                                       │  ← Balise : conforme
│  SORTIE LONGUE                           │  ← Display, chasse étendue
│  2 h 15 · 850 D+ · EF 6:15-6:45          │  ← Données, tabulaire
│                                          │
│  Deuxième semaine du bloc spécifique.    │  ← Texte : l'intention
│  L'objectif est la durabilité, pas       │     en une phrase, écrite
│  l'allure : tu dois finir en pouvant     │     par le coach
│  repartir.                               │
│                                          │
│  ~60 g/h — ce qui a marché la dernière   │  ← Rappel fueling
│  fois : compote + boisson à 40 g/l       │
│                                          │
│  ┌────────────────┐  ┌────────────────┐  │
│  │ Je ne peux pas │  │  En parler     │  │  ← Deux actions. Pas trois
│  └────────────────┘  └────────────────┘  │
│                                          │
│  ─────────────────────────────────────   │
│  ▬ Ce qui a changé depuis hier           │  ← Repliable, vide le plus
│    Rien.                                 │     souvent
└──────────────────────────────────────────┘
```

Le vide est intentionnel. Un jour de repos, cet écran dit « repos » en grand et rien d'autre.

### 7.2 Chat coach

Conversation en pleine largeur. Pas d'avatar, pas de bulles opposées de couleurs différentes, pas d'animation de frappe.

```
┌──────────────────────────────────────────┐
│  Coach                    Contexte à jour │
│  Assistant IA — vérifie ce qui compte     │  ← Mention AI Act, permanente
│  ─────────────────────────────────────────│
│                                          │
│                    je suis en déplacement │  ← Utilisatrice : alignée à
│                    mardi et mercredi      │     droite, sans fond
│                                          │
│  ▶ J'ai revu la semaine.                 │  ← Coach : aligné à gauche,
│                                          │     chevron = réajustement
│    Le fractionné de mardi passe au        │
│    vendredi. Jeudi devient une sortie     │
│    courte, tu pourras la faire depuis     │
│    l'hôtel.                               │
│                                          │
│    ┌──────────────────────────────────┐  │
│    │  ▬ mar. — annulée                │  │  ← Le diff du plan, en ligne
│    │  ▶ ven. — 6×1000 seuil           │  │     dans la conversation
│    │  ▶ jeu. — 45 min EF              │  │
│    └──────────────────────────────────┘  │
│    ┌───────────┐  ┌───────────┐          │
│    │ Appliquer │  │  Annuler  │          │  ← Confirmation explicite
│    └───────────┘  └───────────┘          │
│                                          │
│  ─────────────────────────────────────────│
│  Écrire…                                  │
└──────────────────────────────────────────┘
```

La modification du plan se **voit** dans la conversation, sous forme de différentiel confirmable. Le coach ne dit jamais « c'est fait » sans montrer quoi.

### 7.3 Planning

Le profil est la navigation.

```
┌──────────────────────────────────────────┐
│  Bloc spécifique          S30 · 8/14      │
│                                          │
│         ╭─╮      ╭──╮                    │  ← Le profil = charge hebdo.
│      ╭──╯ ╰─╮╭───╯  ╰──╮        ╱▔▔╲     │     Position actuelle = point.
│   ╭──╯      ╰╯         ╰───╮  ╱      ╲   │     Zones ombrées = contraintes
│ ══╯            ●            ╰─╯        ╲ │     Sommet à droite = la course
│   base      aujourd'hui   affût.   UTMJ  │
│                                          │
│  ─────────────────────────────────────────│
│  Semaine 30            62 km · 2 100 D+   │
│                                          │
│  ▬  lun.  Repos                           │
│  ▬  mar.  Club — seuil       1 h 15       │  ← Marques de balisage en
│  ▶  mer.  Sortie longue      2 h 15       │     tête de ligne. Données
│  ✕  jeu.  Club — manquée              —   │     en mono, alignées.
│  ▬  ven.  EF                    45 min    │
│  ▬  sam.  Rando               3 h 00      │
│  ▬  dim.  Repos                           │
│                                          │
│  ░░░ Semaine avec les enfants — volume    │  ← Contrainte, en fond ombré
│      resserré, sortie longue le mercredi  │
└──────────────────────────────────────────┘
```

**Le seul moment animé du produit :** au chargement, le profil se trace de gauche à droite et s'arrête sur aujourd'hui. Une fois, 600 ms, respecté par `prefers-reduced-motion`. Aucune autre animation ailleurs.

### 7.4 Fiche course

Esthétique roadbook. Dense, imprimable, consultable la veille au soir.

```
┌──────────────────────────────────────────┐
│  UTMJ                                     │
│  105 km · 4 000 D+ · 3 oct.        J-73   │  ← Display + données
│                                          │
│  ── PACING ───────────────────────────────│
│  km 0-25    ravito Chapelle    3 h 10     │
│  km 25-48   ravito Les Rousses 6 h 45     │  ← Mono, tabulaire, aligné
│  km 48-72   ravito Lamoura    11 h 20     │
│  km 72-105  arrivée           16 h 30     │
│                                          │
│  ── FUELING ──────────────────────────────│
│  Cible 65 g/h · testé sur 4 sorties       │
│  h 0-3   compote ×3 · boisson 40 g/l      │  ← Construit sur ce qui a été
│  h 3-8   gel ×2 · salé au ravito          │     réellement toléré, pas
│  h 8+    soupe · boisson allégée          │     sur un modèle théorique
│                                          │
│  ── MATÉRIEL ─────────────────────────────│
│  ☐ Frontale + piles          ☐ Coupe-vent │
│  ☐ Bâtons                    ☐ Couverture │
└──────────────────────────────────────────┘
```

---

## 8. La voix de l'interface

Les mots sont du matériau de design, pas de la décoration.

| Règle | Application |
|---|---|
| **Tutoiement** | L'utilisatrice se tutoie avec son coach |
| **Verbes actifs, sens littéral** | « Appliquer les changements », jamais « Valider » ou « Soumettre » |
| **Un mot, un sens, partout** | Le bouton « Appliquer » produit le message « Appliqué ». Le vocabulaire est le balisage de l'interface |
| **Jamais de félicitation automatique** | Pas de « Bravo ! », pas d'exclamations. Le coach constate, contextualise, ajuste |
| **Les erreurs ne s'excusent pas** | Elles disent ce qui s'est passé et quoi faire. « Strava n'a pas répondu. Réessaie dans quelques minutes. » |
| **Les écrans vides invitent** | « Aucune course enregistrée. Ajoute ton objectif pour que je construise le plan. » |
| **Jamais de vocabulaire système** | On gère des séances et des contraintes, pas des enregistrements et des synchronisations |
| **Jamais de vocabulaire corporel** | Aucune mention du poids, de la silhouette ou de l'apparence, nulle part. Voir PRD §5.2 |

---

## 9. Plancher de qualité

À tenir sans le mentionner dans l'interface :

- Responsive jusqu'au mobile — l'écran Aujourd'hui doit être parfait sur un téléphone tenu d'une main.
- Focus clavier visible sur chaque élément interactif.
- `prefers-reduced-motion` respecté.
- Contraste AA minimum, y compris sur `granit` et sur les marques de balisage.
- Les marques de balisage ne doivent **jamais** être le seul porteur d'information — toujours doublées d'un libellé texte.

---

## 10. Ce que je veux récupérer

En sortie de Claude Design, dans cet ordre de priorité :

1. **Le système de tokens**, sous une forme directement transposable dans le bloc `@theme` de `app/globals.css` (Tailwind v4, configuration CSS-first) : couleurs nommées, échelle typographique, échelle d'espacement, rayons, bordures.
2. **Les marques de balisage** en SVG, aux trois états.
3. **Les quatre écrans**, en mobile et en desktop.
4. **Les primitives** dérivées : bouton, champ, carte, ligne de séance, bulle de conversation, différentiel de plan.

Ce sont les tokens qui comptent le plus. Ce sont eux qui deviendront contraignants dans le `CLAUDE.md`, pour que l'implémentation construise dedans au lieu d'improviser un style à chaque composant.

---

## 11. Le test

> Si on retire le logo et le nom, est-ce qu'on peut confondre cet écran avec Strava, TrainingPeaks, Garmin ou Runna ?

Si la réponse est oui, la direction n'est pas allée assez loin.
