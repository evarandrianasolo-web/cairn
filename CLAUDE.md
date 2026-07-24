# CLAUDE.md — Cairn

> Coach trail/ultra piloté par IA. Multi-tenant, données de santé, plan d'entraînement réajusté en continu.
> Dernière mise à jour : 22/07/2026 — référence : `PRD_Cairn.md` v0.3

---

## 🏗️ Stack technique

- **Framework** : Next.js (App Router) + TypeScript
- **UI** : Tailwind CSS **v4** (configuration CSS-first, pas de `tailwind.config.ts`) — tokens issus de `Cairn_Brief_Design.md`
- **Base de données** : Supabase (Postgres), **RLS active dès la première table**
- **Auth** : Supabase Auth + OAuth2 Strava
- **IA** : API Anthropic, *tool use* avec scoping serveur
- **Hébergement** : Vercel + Supabase, **régions UE obligatoires**
- **Intégrations** : Strava API (OAuth2 + webhooks)

---

## 🔒 Fichiers INTOUCHABLES

> Ne jamais modifier sans instruction explicite ET confirmation.

```
supabase/migrations/*          ← Schéma + policies RLS. Toute modif = nouvelle migration
lib/supabase/server.ts         ← Client serveur, porteur de la session authentifiée
lib/ai/tools.ts                ← Outils exposés au modèle — scoping tenant
lib/ai/context.ts             ← Constructeur de contexte coach (budget tokens)
lib/fueling/rules.ts           ← Garde-fous santé, codés en dur
app/globals.css               ← Design tokens (@theme, Tailwind v4)
.env.local / .env              ← Variables d'environnement
```

---

## 🔐 Règles de sécurité

### Isolation multi-tenant — la règle n°1

**L'isolation se fait par RLS Postgres, JAMAIS par filtrage applicatif.**

```ts
// ❌ INTERDIT — fonctionne, mais échoue en silence si on l'oublie une fois
const { data } = await supabase.from('activities').select().eq('user_id', userId)

// ✅ EXIGÉ — la RLS filtre, la requête échoue par défaut si la session est absente
const { data } = await supabase.from('activities').select()
```

Toute nouvelle table porte `tenant_id` et une policy RLS dans la même migration. Une table sans policy est un bug bloquant, pas une dette.

### Isolation jusqu'à la couche IA

Chaque outil appelé par le modèle reçoit le `tenant_id` **de la session serveur authentifiée**, jamais d'un paramètre fourni par le modèle.

```ts
// ❌ INTERDIT — le modèle peut passer n'importe quel id
tool('get_activities', { tenantId: z.string() }, async ({ tenantId }) => ...)

// ✅ EXIGÉ — l'id vient du contexte serveur, hors de portée du modèle
tool('get_activities', { limit: z.number() }, async ({ limit }, { session }) => ...)
```

Une fuite inter-tenant sur des données de santé est un incident à notifier à la CNIL. Ce n'est pas une régression ordinaire.

### Données de santé

| Règle | Application |
|---|---|
| FC sans consentement | **Filtrée à l'ingestion Strava**, jamais écrite en base |
| Tables santé | Séparées (`activity_health`), RLS stricte, logs d'accès dédiés |
| Transmission au modèle | **Valeurs dérivées uniquement** (tendance, drapeau) — jamais de série brute |
| Retrait de consentement | Purge réelle des valeurs en base, pas un flag d'affichage |
| Tokens Strava | Chiffrés, jamais exposés côté client |

### Vérifications systématiques

- Ne jamais logger de donnée sensible : token, FC, email, secret.
- Tout endpoint modifié conserve son guard d'authentification.
- Aucune stack trace en production.
- Toute écriture IA sur le plan est journalisée dans `plan_revisions`, versionnée et annulable.

> Audit ciblé avant beta ou après refacto auth : `_prompts/audit-securite.md`

---

## 🩺 Règles santé — non négociables

Ces règles sont **applicatives**, pas des consignes de prompt. Un prompt se contourne par la conversation.

1. **Aucun champ de poids, IMC, masse grasse ou valeur calorique n'existe dans le schéma.** Si une tâche semble en demander un, s'arrêter et me le signaler.
2. **Aucune sortie du module Fueling ne peut être une restriction.** Toute recommandation ajoute : manger plus tôt, monter à 70 g/h, ajouter une collation. Jamais retirer.
3. Le coach n'initie **jamais** un sujet touchant au corps ou à l'apparence.
4. Demande de conseil médical, plan alimentaire chiffré ou objectif de poids → refus explicite + orientation professionnelle.
5. État fueling 🔴 → allègement de charge **et** orientation vers un diététicien du sport. Les deux, pas l'un ou l'autre.
6. La bibliothèque fueling stocke des **produits et des grammes de glucides**. Jamais de calories.

---

## 📐 Règles d'architecture

### Contexte coach
- Pré-calculé et résumé, budget **2 à 4 k tokens**. Ne jamais injecter d'activités brutes.
- Le détail se récupère à la demande via outils scopés.
- Toute augmentation du contexte de base doit être signalée : c'est la ligne budgétaire principale du produit.

### Plan
- Toute modification passe par `plan_revisions` : déclencheur, diff, auteur (`user` | `ai`), annulable.
- Le coach ne dit jamais « c'est fait » sans afficher le différentiel confirmable.
- Les séances club (mardi/jeudi) ne sont **jamais doublées** par une séance concurrente — on adapte l'intention.

### Design
- **Aucune valeur de couleur, d'espacement ou de rayon en dur.** Tout vient du bloc `@theme` de `app/globals.css`.
- **Tailwind v4 — configuration CSS-first.** Il n'y a **pas** de `tailwind.config.ts` dans ce projet. Ne jamais en créer un : il serait silencieusement ignoré. Les tokens se déclarent dans `@theme`, et Tailwind génère les classes (`bg-brume`, `text-schiste`, `rounded-data`).
- `radius-data: 2px` sur les blocs de données, `radius-surface: 8px` sur les surfaces conversationnelles. La distinction est sémantique, la préserver.
- Les marques de balisage sont des SVG, jamais des pastilles colorées. Le rouge `balise` **n'est pas une couleur d'erreur** — deux barres rouge+blanc = « sur l'itinéraire », croix rouge seule = écart.
- Une marque de balisage n'est jamais le seul porteur d'information : toujours doublée d'un libellé texte.
- Une seule animation dans tout le produit : le tracé du profil au chargement du Planning. Respecter `prefers-reduced-motion`.

### Conventions
- TypeScript strict, pas de `any` non justifié.
- Server Components par défaut, `'use client'` seulement si nécessaire.
- Chiffres tabulaires sur toute donnée numérique alignée en colonne.

---

## ⚠️ Chantiers en cours

### 🔴 AI Act — article 50, échéance 2 août 2026
Mention permanente et visible dans l'UI du chat : l'utilisateur doit savoir qu'il parle à une IA **dès la première interaction**. Une mention en CGU ne suffit pas.
**À implémenter avant tout accès externe, même gratuit.**

### 🔴 AIPD — avant le premier utilisateur externe
Tant qu'il n'y a qu'une utilisatrice sur ses propres données, le RGPD ne s'applique pas (art. 2.2.c). Au premier compte tiers, tout s'applique d'un coup.
**Ne pas ouvrir d'accès externe sans validation explicite de ma part.**

### 🟡 Conditions commerciales API Strava
À relire avant tout modèle payant. Contraintes de stockage et d'affichage à vérifier.

### 🟡 Coût IA par utilisateur
Non mesuré. Instrumenter les tokens dès les premiers appels : `tokens_in`, `tokens_out`, outils appelés, coût estimé.

---

## ✅ Checklist avant de terminer une tâche

1. Aucun fichier hors périmètre modifié.
2. Aucune nouvelle table sans `tenant_id` **et** sans policy RLS dans la même migration.
3. Aucun filtrage d'isolation en couche applicative introduit.
4. Aucun `tenant_id` passable en paramètre d'un outil IA.
5. Aucun champ poids / IMC / calorie ajouté au schéma.
6. Aucune valeur de couleur ou d'espacement en dur — tokens `@theme` uniquement, aucun `tailwind.config.ts` créé.
7. `npm run build` — corriger toute erreur avant de terminer.
8. `npm run test:isolation` — doit passer.
9. Résumer les fichiers modifiés, une ligne d'explication par fichier.

---

## 🔁 Git

- Commit AVANT de commencer une nouvelle tâche.
- Format : `type(scope): description`
- Scopes : `db`, `auth`, `strava`, `coach`, `plan`, `fueling`, `ui`, `design`, `compliance`, `billing`
- Checkpoint demandé : `git add -A && git commit -m "..."`

---

## 🚫 Comportements interdits

- Ne jamais supprimer de code existant sans confirmation explicite.
- Ne jamais refactoriser ce qui n'a pas été demandé.
- Ne jamais introduire de dépendance sans le signaler.
- **Ne jamais remplacer une policy RLS par du filtrage applicatif**, même « temporairement pour débugger ».
- **Ne jamais ajouter de champ poids, IMC, masse grasse ou calorie**, quelle que soit la justification.
- **Ne jamais faire du `tenant_id` un paramètre d'outil IA.**
- Ne jamais envoyer de valeur de santé brute au modèle — dérivé uniquement.
- Ne jamais désactiver la RLS, même en développement local.
- Ne jamais créer de `tailwind.config.ts` — ce projet est en Tailwind v4, configuration CSS-first dans `@theme`.
- Ne jamais ajouter d'animation en dehors du profil du Planning.
- Ne jamais introduire de score chiffré sur le fueling — trois états, pas un score sur 100.

---

## 💬 Format de réponse attendu

```
✅ Tâche terminée
📁 Fichiers modifiés :
  - chemin/fichier.ts → [ce qui a changé]
⚠️ Points d'attention : [si applicable]
🔒 Isolation : RLS OK / test:isolation OK
🔨 Build : OK / ERREUR [détail]
```
