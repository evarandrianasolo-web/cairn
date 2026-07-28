# Déploiement Cairn sur Vercel

> Guide pas-à-pas pour mettre Cairn en ligne. Deux étapes distinctes :
> **Étape 1 (dogfood perso, gratuit)** puis **Étape 2 (ouverture publique, payant + compliance)**.

## Pourquoi Vercel

- Créé par les auteurs de Next.js — support natif App Router / Server Actions / Streaming / Turbopack, zéro plugin
- Régions UE disponibles (`cdg1` Paris, `fra1` Francfort) — cohérent avec Supabase `eu-west-3` (règle CLAUDE.md)
- Deploy en 15 min via `git push`, SSL automatique
- Migration vers un plan payant sans re-plumber le jour où tu ouvres

Alternatives évaluées (voir `docs/deploiement-vercel.md` § « Migration hors Vercel plus tard »).

---

## Étape 1 — Mise en ligne dogfood (perso)

**Objectif** : Cairn tourne en prod sur ton domaine perso, accessible uniquement par toi. Aucun paiement, aucun accès externe. Vercel Hobby (gratuit).

### 1.1 Push du repo sur GitHub

Créer un repo GitHub **privé** `cairn`, puis :

```bash
git remote add origin git@github.com:<toi>/cairn.git
git push -u origin main
```

Vérifier que `.env.local` est bien dans `.gitignore` (déjà le cas).

### 1.2 Compte Vercel

- https://vercel.com/signup — connexion via GitHub
- Autoriser Vercel sur le repo `cairn`

### 1.3 Import du projet

- Vercel Dashboard → **Add New Project** → sélectionner `cairn`
- Framework detected : **Next.js** (auto)
- Root directory : `.` (défaut)
- Build command / output : laisser détecter automatiquement
- **Ne pas cliquer Deploy encore** — configurer d'abord les env vars.

### 1.4 Variables d'environnement

Settings → Environment Variables → ajouter les 8 variables suivantes (copier depuis ton `.env.local`) :

| Variable | Où la trouver | Secret ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Project Settings > API | Non (préfixe `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem | Non (clé publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | idem, section « service_role » | **Oui** |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com > API Keys | **Oui** |
| `STRAVA_CLIENT_ID` | https://www.strava.com/settings/api | Non |
| `STRAVA_CLIENT_SECRET` | idem | **Oui** |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Génère une chaîne aléatoire (ex. `openssl rand -hex 24`) — même valeur qu'en local si tu veux réutiliser le webhook | **Oui** |
| `STRAVA_TOKEN_KEY` | Copier la valeur exacte de ton `.env.local` — c'est la clé AES-GCM qui chiffre les tokens Strava en base. **Une clé différente = tous les tokens Strava déjà en base deviennent illisibles.** | **Oui** |

Pour chacune, sélectionner **Production + Preview + Development**. Marquer secret ceux qui doivent l'être.

### 1.5 Région de déploiement

Settings → Functions → **Region** → sélectionner **Paris (`cdg1`)** ou **Francfort (`fra1`)**.

Ne pas laisser Washington (défaut) : Supabase est en `eu-west-3`, chaque requête ferait un aller-retour transatlantique inutile + non conforme règle CLAUDE.md.

### 1.6 Premier deploy

Cliquer **Deploy** en haut à droite. Attendre 2-4 minutes.

URL générée par défaut : `cairn-<hash>.vercel.app`. Tu peux la renommer dans Settings → Domains vers `cairn-eva.vercel.app` ou similaire.

### 1.7 Reconfigurer Strava OAuth

Le callback OAuth Strava est aujourd'hui probablement pointé sur `localhost:3100`. Il faut ajouter le domaine de prod :

- https://www.strava.com/settings/api → app Cairn
- **Authorization Callback Domain** : ajouter `cairn-eva.vercel.app` (sans `https://`, sans path)
- **Website URL** : `https://cairn-eva.vercel.app`

### 1.8 Reconfigurer le webhook Strava (si utilisé)

Le webhook Strava doit être re-créé pour pointer vers Vercel. Depuis un terminal (avec `STRAVA_CLIENT_ID` et `STRAVA_CLIENT_SECRET` en env) :

```bash
# Supprimer l'ancien webhook si existe
curl -X DELETE "https://www.strava.com/api/v3/push_subscriptions/<ID>?client_id=$STRAVA_CLIENT_ID&client_secret=$STRAVA_CLIENT_SECRET"

# Créer le nouveau
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F "client_id=$STRAVA_CLIENT_ID" \
  -F "client_secret=$STRAVA_CLIENT_SECRET" \
  -F "callback_url=https://cairn-eva.vercel.app/api/strava/webhook" \
  -F "verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN"
```

Strava valide le webhook en appelant l'URL avec un défi — la route `/api/strava/webhook` de Cairn doit répondre correctement (déjà implémentée).

### 1.9 Checklist post-deploy dogfood

- [ ] Ouverture de `https://cairn-eva.vercel.app` → redirige vers `/login`
- [ ] Login magic link fonctionne (email envoyé par Supabase)
- [ ] Dashboard s'affiche avec tes données
- [ ] `/settings/strava` → connexion Strava marche (OAuth callback)
- [ ] « Rafraîchir depuis Strava » importe une activité récente
- [ ] Coach IA répond à un message
- [ ] `/api/export` télécharge un JSON complet
- [ ] `npm run test:isolation` local passe encore (les migrations Supabase sont partagées entre dev et prod)

### 1.10 Coût

**0 €**. Vercel Hobby, Supabase Free, Anthropic pay-as-you-go (~1-2 $/mois pour un usage perso solo).

---

## Étape 2 — Ouverture publique (payant + compliance)

**À ne faire que lorsque TOUS les blockers de conformité sont levés** (voir `docs/AIPD_Cairn.md` § 5).

### 2.1 Upgrade Vercel Pro

Le plan Hobby de Vercel **interdit l'usage commercial**. Dès le premier abonnement payant Cairn, il faut passer sur **Vercel Pro (20 $/mois)**.

- Vercel Dashboard → Settings → Billing → Upgrade to Pro
- Aucune migration, tout continue de marcher pareil
- Débloqué : usage commercial, timeout functions 60→300 s, password protection previews, domaines illimités

### 2.2 Domaine perso

- Vercel Dashboard → Settings → Domains → **Add**
- Suivre les instructions DNS (ajouter un CNAME chez ton registrar : OVH, Namecheap, Gandi…)
- SSL automatique via Let's Encrypt
- Ré-appliquer les étapes 1.7 et 1.8 avec le nouveau domaine

### 2.3 Blockers de conformité à lever AVANT ouverture publique

Recopier depuis `docs/AIPD_Cairn.md` § 5 :

- [ ] DPA Anthropic Zero Data Retention + no-training signé
- [ ] DPA Supabase, Vercel, Paddle signés
- [ ] Registre des activités de traitement (art. 30 RGPD)
- [ ] Politique de confidentialité + CGV rédigées par juriste, publiées sur `/legal`
- [ ] Écran d'onboarding avec consentement granulaire
- [ ] AIPD relue et signée par juriste
- [ ] Décision architecture socle post-Strava (voir `docs/architecture/ingestion/ADR-001-ingestion-fichiers.md`)
- [ ] Paddle configuré (voir `docs/paiement-paddle.md`)

### 2.4 Migration hors Vercel plus tard

Si le coût Vercel Pro devient significatif (> 5 % de ton CA), alternatives :

| Alternative | Coût | Prix à payer |
|---|---|---|
| **Netlify Pro** | ~19 $/mois | Support Next.js 1-2 versions derrière (risqué en cas de nouvelle feature App Router) |
| **Cloudflare Pages** | Gratuit même commercial | Support Next.js encore incomplet, limites runtime Node |
| **Railway / Render / Fly.io** | 5-20 $/mois | Hébergement Node classique, moins d'auto-optimisation |
| **VPS + Coolify / Dokku** | 5-15 €/mois VPS + temps | Contrôle total, temps à investir |

Recommandation : **ne pas re-plumber tant que le business n'est pas prouvé**. Vercel Pro absorbe tout le stress technique pendant les 6 premiers mois payants.

---

## Support et incidents

### En cas d'erreur au deploy

- Logs de build : Vercel Dashboard > Deployments > cliquer sur le deploy > Build Logs
- Logs runtime : Vercel Dashboard > Deployments > Runtime Logs (fenêtre glissante 1 h en Hobby, 24 h en Pro)

### Rollback rapide

- Vercel Dashboard > Deployments > sélectionner un ancien deploy vert → **Promote to Production**
- Instantané, pas de rebuild nécessaire

### Contact d'urgence

- Vercel : Community (Hobby) ou Support (Pro)
- Supabase : Support Dashboard (temps de réponse selon plan)
- Anthropic : `support@anthropic.com` (rare, seulement pour incidents API)

---

## Références

- Vercel Next.js hosting : https://vercel.com/docs/frameworks/nextjs
- Vercel Regions : https://vercel.com/docs/edge-network/regions
- Vercel Pricing : https://vercel.com/pricing
- Règles produit CLAUDE.md → « hébergement Vercel + Supabase, régions UE obligatoires »
