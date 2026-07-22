# Template : Session Starter

> À coller en début de conversation Claude.ai quand tu travailles hors du repo
> (ex : réflexion produit, aide sur une migration, revue d'approche).
> En session Claude Code dans le repo, le CLAUDE.md est déjà lu — inutile de coller ceci.

---

## Contexte projet

**Projet :** Cairn — coach trail/ultra piloté par IA. Un seul endroit pour les données
d'entraînement, les objectifs, les contraintes de vie et le plan.
**Stack :** Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres/RLS/Auth)
+ API Anthropic (tool use) — hébergement Vercel + Supabase régions UE.
**Phase :** V1 dogfood mono-utilisatrice, **architecture multi-tenant dès le départ**.

**Structure clé :**
```
app/                    routes App Router
  (app)/aujourdhui/     écran principal
  (app)/coach/          chat
  (app)/planning/
  api/strava/webhook/
lib/
  supabase/server.ts    client serveur (INTOUCHABLE)
  ai/context.ts         constructeur de contexte coach (INTOUCHABLE)
  ai/tools.ts           outils scopés tenant (INTOUCHABLE)
  fueling/rules.ts      garde-fous santé (INTOUCHABLE)
supabase/migrations/    schéma + policies RLS (INTOUCHABLE)
```

## Règles pour cette session

- Ne modifier que les fichiers explicitement mentionnés
- Ne pas supprimer de code existant sans ma confirmation
- Ne pas introduire de dépendance sans me le signaler
- Terminer par un résumé des fichiers modifiés
- Lancer `npm run build` et `npm run test:isolation` avant de terminer

**Règles non négociables :**
- Isolation par RLS Postgres uniquement, jamais de filtrage applicatif
- Le `tenant_id` des outils IA vient de la session serveur, jamais d'un paramètre du modèle
- Aucun champ poids / IMC / calorie dans le schéma, quelle que soit la justification
- Aucune valeur de couleur ou d'espacement en dur — tokens @theme de app/globals.css uniquement (Tailwind v4, pas de tailwind.config.ts)

## Ma demande

[ta demande ici]
