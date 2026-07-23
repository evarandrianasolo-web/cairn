# Webhook Strava — mise en place

L'endpoint `POST /api/strava/webhook` reçoit les événements activités
(create / update / delete) et met à jour la base en temps réel. Sans
webhook, Cairn dépend de refresh manuel depuis `/settings/strava`.

## 1. Variables d'environnement

Ajouter dans `.env.local` (dev) et dans Vercel (prod) :

```
STRAVA_WEBHOOK_VERIFY_TOKEN=un-token-alea-au-choix
```

Ce token sert uniquement à Strava pour valider notre endpoint au
moment de la souscription. Ne pas le confondre avec le CLIENT_SECRET.

## 2. Enregistrer la souscription (une fois)

Strava n'accepte **qu'une seule** souscription par app cliente. Il
faut la créer en `curl` :

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=$STRAVA_CLIENT_ID \
  -F client_secret=$STRAVA_CLIENT_SECRET \
  -F callback_url=https://<domain-cairn>/api/strava/webhook \
  -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
```

Strava fait immédiatement un `GET` sur `callback_url` avec
`hub.challenge` et `hub.verify_token`. Notre endpoint répond
`{ "hub.challenge": "..." }` et la souscription est active.

## 3. Vérifier

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=$STRAVA_CLIENT_ID \
  -d client_secret=$STRAVA_CLIENT_SECRET
```

## 4. Dev local

Vercel ne route pas les requêtes entrantes vers `localhost`. Pour
tester en local, utiliser un tunnel :

```bash
ngrok http 3100
# copier l'URL https générée
```

Puis créer la souscription avec ce `callback_url`, la supprimer après
test.

## 5. Supprimer la souscription

```bash
curl -X DELETE https://www.strava.com/api/v3/push_subscriptions/<id> \
  -F client_id=$STRAVA_CLIENT_ID \
  -F client_secret=$STRAVA_CLIENT_SECRET
```

## Comportement de l'endpoint

- **GET** : validation Strava. Répond `{ "hub.challenge": ... }` si
  `hub.verify_token` correspond à `STRAVA_WEBHOOK_VERIFY_TOKEN`.
- **POST** : ACK immédiat (200 « ok »), traitement en background.
  - `object_type != 'activity'` : ignoré (les événements athlete
    n'ont pas de traitement défini côté Cairn V1).
  - `aspect_type = 'delete'` : `DELETE FROM activities WHERE
    tenant_id = X AND strava_activity_id = Y`.
  - `aspect_type = 'create' | 'update'` : fetch le détail via
    `getActivityDetail` (endpoint qui renvoie `description`), upsert
    dans `activities`. Le trigger SQL `seed_user_notes_from_description`
    seed `user_notes` seulement à l'INSERT — un re-import préserve
    les notes éditées par l'utilisateur.
  - Si consentement `fc_stockage` = `true`, insère aussi la ligne
    `activity_health` (delete + insert plutôt qu'upsert car la table
    est immuable côté user).

## Isolation

Le webhook n'a pas de session utilisateur. Il utilise le
`SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) et scope explicitement par
`tenant_id` résolu depuis `owner_id` (Strava athlete_id) via
`strava_connections`. Aucune donnée inter-tenant possible : l'owner_id
provient de Strava, la lookup ramène une seule connexion.

## Points ouverts pour V1

- Le webhook n'est pas activé automatiquement à la connexion Strava
  d'un nouvel utilisateur : la souscription est côté app, pas
  utilisateur. Une seule souscription globale par app suffit.
- Retry Strava : si l'endpoint renvoie != 2xx, Strava re-notifie
  jusqu'à 4 fois. Le handleEvent en background n'échoue jamais côté
  HTTP — les erreurs sont logguées console, pas propagées.
