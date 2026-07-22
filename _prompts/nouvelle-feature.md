# Template : Nouvelle feature

> Workflow plan → validation → implémentation.

---

## PHASE 1 — Plan (ne pas écrire de code)

Je veux implémenter : **[description de la feature]**

Avant de coder, explique :
1. Les fichiers créés ou modifiés, et pourquoi
2. L'approche technique choisie
3. Les risques de régression
4. **Si une table est créée : sa colonne `tenant_id` et sa policy RLS, dans la même migration**
5. **Si un outil IA est ajouté : comment le `tenant_id` est obtenu côté serveur**
6. **Si le contexte coach grossit : de combien de tokens, et pourquoi c'est justifié**

Fichiers interdits : voir CLAUDE.md § Fichiers INTOUCHABLES.

**Attends ma validation avant de commencer.**

---

## PHASE 2 — Implémentation

Implémente selon le plan validé, dans le périmètre défini.
Lance `npm run build` puis `npm run test:isolation` à la fin, corrige les erreurs.

---

## PHASE 3 — Récapitulatif

Format CLAUDE.md, avec la ligne `🔒 Isolation`.
