# Template : Refactoring sécurisé

> Améliorer le code sans changer le comportement observable.

---

**Objectif :** [ex: extraire en hook, réduire la duplication]

**Fichier(s) :** [chemin]

**Contraintes absolues :**
- Comportement visible identique (UI, données retournées, effets)
- Signatures publiques compatibles
- Pas de nouvelle dépendance
- **Le périmètre des policies RLS ne change pas**
- **Le budget tokens du contexte coach ne change pas** — si le refacto le modifie,
  signale-le et attends validation
- Les tokens de design restent la seule source de valeurs visuelles

**Avant de coder :** explique l'approche et les risques, attends ma validation.
