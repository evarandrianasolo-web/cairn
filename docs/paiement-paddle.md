# Intégration Paddle — Cairn

> État V1 : structure DB posée, aucun paiement actif. Ce document décrit
> la séquence d'activation quand Cairn ouvrira au public.

Provider retenu : **Paddle Billing** (Merchant of Record).

## Pourquoi Paddle plutôt que Stripe

- Merchant of Record : Paddle facture les clients finaux et te reverse
  net. Aucune TVA OSS à déclarer, aucune facture à générer, aucune
  gestion des chargebacks.
- Adapté à un projet solo sans comptable dédié.
- Trade-off : frais ~5% + 0,50 € par transaction (vs ~1,5% + 0,25 €
  Stripe). Sur 100 abonnés à 7,90 €, écart mensuel ~30 €. Couvre
  largement l'admin économisée.

## Sequence d'activation

### 1. Compte Paddle

- https://paddle.com/signup — inscription en tant que vendeur
- Fournir SIRET (auto-entrepreneur suffit), RIB, pièce d'identité,
  quelques infos produit
- KYC : 1 à 5 jours ouvrés

### 2. Configuration des produits/prix

Dashboard Paddle > Catalog > Products.

Créer un produit **"Cairn Coach"** avec 2 prix :

| Interval | Prix | Notes |
|---|---|---|
| Monthly | 7,90 € | recurring |
| Yearly | 69,00 € | recurring, ~2 mois offerts |

Récupérer les `pri_XXXXXXXXX` (2 IDs).

### 3. Sandbox et clés API

- Activer le mode **Sandbox** pour tester sans facturation réelle
- Récupérer :
  - `PADDLE_API_KEY` (secret, backend)
  - `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (public, frontend pour Paddle.js)
  - `PADDLE_WEBHOOK_SECRET` (validation des webhooks)

### 4. Webhooks

Dashboard > Developer Tools > Notifications.

- URL : `https://cairn.app/api/paddle/webhook`
- Events à activer :
  - `subscription.created`
  - `subscription.updated`
  - `subscription.canceled`
  - `subscription.paused`
  - `subscription.resumed`
  - `transaction.completed`
  - `transaction.payment_failed`

### 5. Renseigner les price IDs dans la DB

```sql
update subscription_plans set paddle_price_id = 'pri_XXX' where code = 'coach_mensuel';
update subscription_plans set paddle_price_id = 'pri_YYY' where code = 'coach_annuel';
```

### 6. Variables d'environnement (.env.local)

```
PADDLE_API_KEY=sandbox_...
PADDLE_WEBHOOK_SECRET=...
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_...
NEXT_PUBLIC_PADDLE_ENV=sandbox   # 'production' en prod
```

### 7. Code produit à ajouter

Routes à créer côté Cairn :

- `POST /api/paddle/checkout` — génère une URL Paddle Checkout, redirige
- `POST /api/paddle/webhook` — reçoit et valide les events Paddle, met à
  jour `subscriptions` (delete puis insert, jamais update — cohérent avec
  activity_health)
- `GET /api/paddle/portal` — génère le lien vers le Customer Portal Paddle

Middleware à activer :

- Refuser l'accès aux pages produit si `subscription.status` ∉ {trialing,
  active, past_due}. Rediriger vers `/settings/abonnement`.
- Exception : les pages `/settings/*`, `/login`, `/api/export`, la
  suppression de compte restent toujours accessibles (RGPD art. 15/17).

### 8. Compliance côté Eva

- **CGV Cairn** : à rédiger (obligation vente en ligne France).
  Modèle générique SaaS + spécificités trail (données de santé,
  dépendance API Strava tierce).
- **Politique de rétractation** : les 14 jours de rétractation légale
  peuvent être écartés sur les services numériques avec activation
  immédiate SI le client accepte explicitement à la souscription.
  À insérer dans le tunnel Paddle Checkout.
- **Mentions légales** : nom entreprise, SIRET, adresse, hébergeur
  (Vercel + Supabase EU).
- **Bandeau AI Act art. 50** : déjà en place. Rappeler la présence de
  l'IA dans les CGV.

### 9. Tests avant ouverture

- Cycle complet sandbox : signup → trial 7j → paiement → active →
  cancel → expired
- Vérifier que la RLS bloque bien l'accès quand status = expired
- Vérifier que `/api/export` continue de marcher même après expiration
  (obligation RGPD art. 20)
- Vérifier que la suppression de compte purge aussi l'historique
  `subscriptions` (cascade déjà en place via FK on delete cascade)

### 10. Bascule production

- Passer `NEXT_PUBLIC_PADDLE_ENV=production`
- Remplacer les clés sandbox par les clés live
- Retirer le message "Ouverture publique — en attente" de
  `/settings/abonnement`
- Activer le bouton "S'abonner"
- Communiquer la mise en production

## Références

- Docs Paddle Billing : https://developer.paddle.com
- SDK Node : `@paddle/paddle-node-sdk`
- SDK JS : `@paddle/paddle-js`
- Templates webhook : https://developer.paddle.com/webhooks/overview
