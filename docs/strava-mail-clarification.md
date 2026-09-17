# Mail de clarification à developers@strava.com

> À envoyer depuis l'adresse enregistrée sur l'app Strava développeur
> (celle qui apparaît dans Settings > My API Application).
> Objet court et factuel, éviter le ton polémique.

---

**To** : `developers@strava.com`
**Subject** : Clarification request — API Policy §5.3, §5.4 and §6.2 for an individual AI coaching app

---

Hi Strava team,

I'm reaching out to request clarification on a few clauses of the API
Policy effective June 1st, 2026, before finalising the architecture of
my product.

**Product context** :

- App name / registered application ID : **[À COMPLÉTER — nom de l'app Strava enregistrée + ID]**
- Purpose : an individual AI coaching app for trail runners. Each user
  connects their own Strava account to receive a personalised training
  plan, adaptive session-by-session, and short natural-language debriefs
  after each activity. No coach-to-athlete sharing, no team features,
  no third-party access to another user's data.
- Data flow : strictly per-user. The user's own activities feed only
  their own plan and debriefs, visible only to them.
- Monetisation model under consideration : monthly subscription
  (~€8/month) for the individual user, no reselling or aggregation.

**Questions** :

1. **§5.3** (AI Applications) — Does the prohibition on "ingestion into
   a context window or working memory" cover the case where an
   individual user's own activities are summarised and sent to an LLM
   API strictly to generate a personalised training plan and a debrief
   for that same user, with no cross-user aggregation and no model
   fine-tuning?

2. **§5.4** (Analytics) — Does computing derived metrics (weekly load,
   pace zones, vertical speed) from a user's own activities, and
   displaying them only to that same user, fall under the "analytics
   or insights" prohibition, or is this considered part of the
   "display activity data" carve-out in §6.1?

3. **§6.2** (Cache retention) — For a training plan feature, the
   algorithm needs at least 12 months of historical activities to
   calibrate periodisation. Is there any provision for extended
   retention with explicit user consent, or is the 7-day cap absolute?

4. **§5.8** (Fees) — A training-plan and coaching feature is not
   provided natively by Strava (Runna, since April 2025, aside).
   Would you consider a subscription that charges for the AI coach
   itself — not for API access — as compliant with §5.8?

If any of these use cases would require an Extended Access approval or
a specific allowlist, please let me know the process.

Thank you in advance for your guidance — I would rather clarify before
launch than after.

Best regards,

**[À COMPLÉTER — nom + email + éventuellement SIRET si tu veux montrer que c'est structuré]**

---

## Notes de préparation

- **Avant d'envoyer** : vérifier le nom exact et l'ID de l'app enregistrée
  dans Strava Settings > My API Application. Le mettre dans le § "Product
  context".
- **Ton** : neutre et factuel. Ne pas mentionner la concurrence (Borner,
  Runna), ne pas argumenter sur ce que "les autres apps font", rester
  strictement sur le cas Cairn.
- **Attentes** : réponse type peut être un template renvoyant à la Policy,
  ou un accusé de réception + escalation. Toute réponse écrite crée un
  chemin. Compter 2 à 6 semaines de délai.
- **Copier la réponse reçue** dans `docs/strava-compliance.md § Décision-log`
  avec date.
- **Si non-réponse à J+30** : relancer une fois. Si toujours rien à J+60,
  considérer que l'absence de réponse écrite = pas d'exception, et
  décider sur cette base.
