# Template : Checkpoint Git

> Sauvegarder un état stable avec build vérifié.

---

Fais un checkpoint git de l'état actuel :

1. Lance `npm run build`
2. Lance `npm run test:isolation`
3. Si les deux passent : `git add -A && git commit -m "type(scope): description"`
   - Scopes : `db`, `auth`, `strava`, `coach`, `plan`, `fueling`, `ui`, `design`, `compliance`
4. Confirme le hash du commit et les fichiers inclus

**Ne jamais committer si `test:isolation` échoue**, même si le build passe.
Si l'un des deux est KO : liste les erreurs et corrige avant de committer.
