# Template : Debug ciblé

> Correction chirurgicale — ne toucher qu'au bug décrit.

---

**Bug :** [comportement observé]

**Attendu :** [ce qui devrait se passer]

**Fichier(s) :** [chemin]

**Contraintes :**
- Corriger uniquement ce bug, rien d'autre
- Ne pas refactoriser le code environnant
- Ne pas modifier les types existants
- **Ne jamais désactiver une policy RLS pour isoler le problème** — si tu soupçonnes
  la RLS, explique ton hypothèse et attends ma validation
- **Ne pas contourner un garde-fou de `lib/fueling/rules.ts`** même s'il semble
  bloquer le comportement attendu — c'est probablement voulu
- Si tu identifies d'autres problèmes, liste-les sans les corriger

**Contexte :** [erreur, stack trace, étapes de reproduction]
