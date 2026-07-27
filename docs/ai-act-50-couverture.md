# AI Act art. 50 — couverture Cairn

> Règlement (UE) 2024/1689 « AI Act ». Article 50 : obligations de
> transparence pour les fournisseurs et déployeurs de systèmes IA
> destinés à interagir avec des personnes physiques.
>
> **Entrée en vigueur art. 50 : 2 août 2026.**

## Ce que l'article demande

1. **§1 — Interaction IA** : les systèmes qui interagissent avec des personnes physiques doivent être conçus pour que l'utilisateur soit informé, à moins que ce ne soit évident du contexte.
2. **§2 — Contenu synthétique** : les sorties textuelles / image / audio générées ou manipulées doivent être marquées comme telles, de manière lisible par machine.
3. **§3 — Textes IA publiés** : le contenu textuel destiné à informer le public doit être disclosé, sauf si le contenu a fait l'objet d'une revue humaine substantielle et qu'une personne physique porte la responsabilité éditoriale.
4. **§4 — Reconnaissance émotions/biométrique** : consentement explicite (hors périmètre Cairn).

## Où l'IA agit dans Cairn (audit au 27/07/2026)

| Emplacement | Type de sortie IA | Couverture actuelle |
|---|---|---|
| `/coach` — conversation avec le modèle | Texte conversationnel (Claude) | ✅ `AiDisclosure` bandeau haut de page |
| `/coach/[id]` — thread existant | Texte conversationnel | ✅ `AiDisclosure` bandeau haut de page |
| `/planning` — plan hebdomadaire | Structure JSON générée + `notes_week` | ✅ `AiDisclosure` bandeau compact haut de page |
| `/activities/[id]` — carte « Analyse » | Résumé texte (Claude) stocké dans `ai_summary` | ✅ `AiBadge` inline dans le titre de section |
| `/debriefs` — édition d'un débrief | Champs pré-remplis par l'IA depuis les notes d'Eva | ✅ `AiDisclosure` bandeau compact haut de page |
| `/coach/[id]` — propositions structurées (contrainte, course, débrief axis) | Bulles spéciales sourcées `coach_proposals.status='pending'` | ✅ Couvert par le bandeau `/coach` |
| Outils coach (`get_activity_detail`, `get_activity_laps`, `get_session_templates`, `propose_*`) | Appels tool internes, jamais rendus bruts à l'utilisateur | N/A — pas de sortie utilisateur directe |

## Composants et pattern

- **`AiDisclosure`** (`components/ai-disclosure.tsx`) — bandeau permanent en tête d'écran quand l'IA est un contributeur régulier de la page. Deux tailles : `default` (généreux) et `compact` (une ligne).
- **`AiBadge`** — marqueur inline « ✦ IA » à côté d'un titre de section quand la sortie est ponctuelle. Porte l'attribut `data-ai-generated="true"` (§2 « lisible par machine »).

## Ce que l'audit ne couvre PAS et qui nécessitera un travail dédié avant ouverture publique

1. **CGV et politique de confidentialité** — doivent nommer explicitement Claude / Anthropic comme sous-traitant et rappeler l'usage IA (art. 13 RGPD + art. 50 §1). Rédaction juridique à commander.
2. **Écran d'onboarding** — la première interaction doit être un consentement explicite à l'usage IA. À implémenter en même temps que Paddle checkout (voir `docs/paiement-paddle.md`).
3. **Marquage machine des exports** — les débriefs et plans exportés via `/api/export` (art. 20 RGPD) doivent inclure un flag `generated_by: 'ai'` dans le payload JSON. À revoir après la décision architecture ingestion.
4. **Log d'appel IA** — la table `ai_calls` existe (metering) mais ne trace pas encore le prompt ni la sortie renvoyée à l'utilisateur. Si un litige survient, il faut pouvoir reconstruire le contenu produit. À arbitrer avec les contraintes RGPD (données santé dans les logs).

## Prochaines actions avant le 2 août 2026

- [x] `AiDisclosure` sur `/coach` (fait avant)
- [x] `AiDisclosure` sur `/planning`
- [x] `AiDisclosure` sur `/debriefs`
- [x] `AiBadge` sur la carte « Analyse » d'une activité
- [ ] Bandeau d'onboarding au premier login (bloqué en attendant décision ouverture publique)
- [ ] Mention explicite dans les futures CGV
- [ ] Flag `generated_by: 'ai'` dans les exports RGPD

## Références

- Règlement (UE) 2024/1689, article 50 : https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- Commission européenne — AI Act summary : https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai
