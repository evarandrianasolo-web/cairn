# Template : Audit sécurité ciblé

> À utiliser avant l'ouverture beta, après un refacto d'auth, après une migration,
> ou avant d'exposer une nouvelle surface publique.
> **Ne corrige rien — liste uniquement.** Je valide et priorise.

---

**Périmètre :** [ex: isolation multi-tenant / outils IA / webhook Strava / consentements]

**Contexte :** [ex: "avant premier testeur externe" / "nouvelle table ajoutée"]

## Catégories à couvrir

- [ ] **Isolation multi-tenant** — un tenant peut-il lire ou écrire les données d'un autre ?
- [ ] **Filtrage applicatif résiduel** — reste-t-il des `.eq('user_id', ...)` en place de RLS ?
- [ ] **Outils IA** — un `tenant_id` est-il passable en paramètre par le modèle ?
- [ ] **Données de santé** — FC écrite sans consentement ? valeur brute envoyée au modèle ?
- [ ] **Consentements** — le retrait purge-t-il réellement la base ?
- [ ] **Schéma** — un champ poids / IMC / calorie s'est-il glissé quelque part ?
- [ ] **Garde-fous fueling** — une sortie restrictive est-elle atteignable ?
- [ ] **Secrets** — tokens Strava exposés côté client ? loggés ?
- [ ] **Webhook Strava** — vérification de signature, idempotence, rejeu
- [ ] **Écritures IA** — toutes journalisées et annulables ?
- [ ] **Conformité** — mention AI Act présente dès la première interaction du chat ?
- [ ] **Erreurs** — stack traces exposées, messages trop verbeux

## Format attendu

```
🔴/🟡/🟢 [Sévérité] — [Titre court]
Fichier(s) : [chemin]
Vulnérabilité : [description technique]
Exploitation : [exemple concret]
Fix minimal : [correction recommandée]
```

🔴 Critique — exploitable directement · 🟡 Important — conditions spécifiques · 🟢 Mineur

## Après l'audit

Ne rien corriger. Terminer par : `X critique(s), Y important(s), Z mineur(s)`.

> Toute fuite inter-tenant sur données de santé est classée 🔴 d'office.
