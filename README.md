# Cairn

Coach trail et ultra piloté par IA. Un seul endroit pour les données d'entraînement,
les objectifs, les contraintes de vie et le plan — avec lequel on **discute**.

> Phase actuelle : **V1 dogfood**, une seule utilisatrice.
> L'architecture est multi-tenant dès le départ ; le produit multi-utilisateurs viendra après validation.

## Documentation

| Document | Contenu |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Règles d'architecture et garde-fous — **à lire avant toute contribution** |
| [`docs/PRD_Cairn.md`](./docs/PRD_Cairn.md) | Product Requirements — vision, modèle de données, conformité |
| [`docs/Cairn_Brief_Design.md`](./docs/Cairn_Brief_Design.md) | Direction visuelle et système de tokens |
| [`docs/rls-pattern.sql`](./docs/rls-pattern.sql) | Le patron obligatoire pour toute nouvelle table |
| [`_prompts/`](./_prompts) | Templates de sessions Claude Code |

## Les trois règles

1. **Isolation par RLS Postgres uniquement.** Jamais de filtrage applicatif.
2. **Le `tenant_id` des outils IA vient de la session serveur.** Jamais d'un paramètre du modèle.
3. **Aucun champ poids, IMC ou calorie dans le schéma.** Quelle que soit la justification.

Le détail et le raisonnement sont dans `CLAUDE.md`.

## Développement

```bash
npm install
npm run dev
npm run build
npm run test:isolation   # doit passer avant tout commit
```

## Conformité

Tant qu'il n'y a qu'une utilisatrice sur ses propres données, le RGPD ne s'applique pas
(art. 2.2.c). **Au premier compte tiers, tout s'applique d'un coup** : AIPD, registre,
mention AI Act art. 50 dans le chat, politique de confidentialité.

Voir `docs/PRD_Cairn.md` §14.
