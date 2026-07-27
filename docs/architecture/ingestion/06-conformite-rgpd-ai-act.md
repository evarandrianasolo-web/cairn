# 06 — Conformité RGPD + AI Act pour l'ingestion fichier

> **Ce document est produit par un assistant IA, non par un juriste.** Toute conclusion ci-dessous doit être **revue par un avocat spécialisé** (droit du numérique + données de santé) avant commercialisation. Voir §11.

## 0. Ce qui a changé par rapport au socle Strava

Sortir de l'API Strava supprime une contrainte contractuelle (l'API Policy Strava et son maquis §5.3-§6.2). Mais cela ne supprime **aucune** obligation RGPD ni AI Act. Ces obligations continuent de s'appliquer à toute donnée ingérée, quelle que soit sa source.

**Il faut résister à la fausse simplification** « on fait tout via fichier utilisateur, donc c'est le consentement de l'utilisateur qui couvre tout ». Ce n'est pas vrai :
- Le fichier peut contenir des données de tiers (contacts dans l'archive Strava, coéquipiers dans les commentaires).
- L'utilisateur ne peut pas consentir pour des tiers.
- Les données de santé (FC) restent des données sensibles art. 9 RGPD, avec un régime spécifique.

---

## 1. Cartographie des données traitées

| Catégorie | Nature | Volumétrie typique | Article RGPD |
|---|---|---|---|
| Identifiants (email, mot de passe) | Personnelle | 1 par utilisateur | art. 6.1.b (contrat) |
| Profil sportif (objectif, volume, allures) | Personnelle, sensible car indicateur de mode de vie | ~15 champs | art. 6.1.b |
| Données GPS (traces d'activité) | **Personnelle sensible** (géolocalisation, permet de déduire domicile / lieu de travail) | 500-5000 points/séance × N séances | art. 6.1.b **et** art. 9 si couplée FC pour analyse santé |
| Fréquence cardiaque (moy, max, dérivés) | **Données de santé** — art. 9.1 RGPD | 1 par séance | **art. 9.2.a** (consentement explicite) |
| RPE, ressenti | Personnelle, sensible car autoévaluation psychophysique | 1 par séance | art. 6.1.b + prudence |
| Notes utilisateur libre | Personnelle, peut contenir tout | variable | art. 6.1.b, à sanctuariser |
| Conversations coach IA | Personnelle | Croissant | art. 6.1.b + art. 22 (décision automatisée) |
| Métadonnées d'import | Techniques | Log | art. 6.1.f (intérêt légitime, sécurité) |
| **Contenu des fichiers « hors périmètre »** (contacts, followers, kudos) | **Données personnelles de tiers** | Potentiellement des milliers | **Pas de base légale — ne pas ingérer** |

**Conséquence architecturale majeure** : le filtrage whitelist du doc `02` §2.1.3 n'est pas une commodité, c'est une **exigence légale**. Ingérer les contacts synchronisés d'un utilisateur = traitement sans base légale sur les personnes listées dans son répertoire = infraction art. 6.

---

## 2. Base légale par traitement

| Traitement | Base légale | Justification |
|---|---|---|
| Création de compte & auth | art. 6.1.b — exécution du contrat | Sans compte, pas de service. |
| Stockage activités (hors FC) | art. 6.1.b — exécution du contrat | Le contrat est « coaching adaptatif », impossible sans historique. |
| Stockage FC & dérivés santé | art. 9.2.a — **consentement explicite** | Consentement séparé, granulaire, révocable. Ne peut être un pré-requis à la souscription. |
| Analyse par LLM externe (Anthropic) | art. 6.1.b + art. 9.2.a pour la partie santé, + art. 28 (sous-traitance) | DPA signé, données santé ne quittent que sous forme dérivée. |
| Journalisation d'accès et sécurité | art. 6.1.f — intérêt légitime | Documenter dans le registre des traitements. |
| Facturation / abonnement | art. 6.1.b + art. 6.1.c (obligations comptables) | Conservation 10 ans comptable. |
| Cookies analytics | art. 6.1.a — consentement | Bandeau, granularité, refus aussi facile que l'accepte. |

---

## 3. Consentement santé — le sujet critique

**Ce qui doit être vrai** :
1. **Consentement séparé** de l'inscription. Une case « j'accepte le traitement de mes données de fréquence cardiaque pour l'analyse d'effort » cochable **indépendamment**.
2. **Pas de couplage** : refus du consentement santé → le service reste utilisable (palier 1/2 sans données FC).
3. **Granularité** : consentement « analyse FC pour zones et effort » ≠ consentement « transmission à l'IA sous forme dérivée » — deux cases.
4. **Retrait aussi simple** : bouton « retirer » dans « Compte → Confidentialité », effet immédiat, purge réelle des `activity_health.hr_*` (règle CLAUDE.md « purge réelle, pas un flag d'affichage »).
5. **Consentement horodaté** et versionné (`consents` table, référencée par `activity_health.consent_snapshot_id`).

**Filtrage à l'ingestion** — si le consentement santé n'est pas actif au moment de l'ingestion, les champs FC du fichier **ne sont pas écrits en base** (règle CLAUDE.md « filtrée à l'ingestion Strava, jamais écrite en base »). Applicable ici pour FIT/TCX/GPX-ext contenant FC.

---

## 4. AIPD (Analyse d'Impact) — obligatoire ?

Selon CNIL et EDPB (WP248 rév.01), une AIPD est **obligatoire** quand au moins **2 des 9 critères** sont réunis. Évaluons :

| Critère CNIL | Cairn ? | Note |
|---|---|---|
| 1. Évaluation ou scoring (y compris profilage) | **Oui** | Le plan personnalisé + score de charge est du profilage. |
| 2. Décision automatisée avec effet légal ou significatif | Partiel | Le plan est une recommandation, l'utilisateur peut la refuser. Effet significatif sur mode de vie plausible. |
| 3. Surveillance systématique | **Oui** | Suivi continu de l'activité physique. |
| 4. Données sensibles ou hautement personnelles | **Oui** | FC = art. 9. Géolocalisation. |
| 5. Grande échelle | Dépend du succès | Pas au MVP ; oui à terme. |
| 6. Croisement de données | Partiel | On croise déclaratif + fichiers de sources multiples. |
| 7. Personnes vulnérables | Non spécifique | Sauf mineur, à exclure du service (à faire). |
| 8. Usage innovant / technologie nouvelle | Partiel | Coach IA en pédagogie individualisée. |
| 9. Exclusion d'un droit ou service | Non | Aucun. |

**Conclusion** : critères 1, 3 et 4 sont clairement remplis. **AIPD obligatoire, sans ambiguïté**. À produire **avant le premier utilisateur externe** (règle CLAUDE.md, chantier AIPD 🔴).

**Contenu attendu de l'AIPD** :
- Description du traitement.
- Nécessité et proportionnalité (justifier chaque champ collecté vs finalité).
- Analyse des risques (perte de confidentialité, altération, indisponibilité).
- Mesures de sécurité (chiffrement, RLS, séparation table santé, worker isolé, journalisation).
- Consultation DPO (à désigner, voir §11).

---

## 5. Minimisation (art. 5.1.c)

Justification du **parsing en liste blanche** (doc `02` §2.1.3) — trois éléments :

1. **Nécessité** : Cairn n'a pas besoin des contacts synchronisés, kudos, followers, photos, commentaires pour livrer un plan d'entraînement. Aucun cas d'usage produit ne le justifie.
2. **Proportionnalité** : ingérer ces données quand elles ne servent à rien = disproportionné.
3. **Sécurité** : ne pas ingérer réduit la surface d'attaque et le risque de fuite.

**Traduction technique** : la whitelist est appliquée au **niveau streaming** de l'extraction ZIP — les fichiers hors périmètre ne sont **jamais écrits sur disque**, même temporairement. Une simple règle firewall « ne pas lire » suffit et permet de démontrer conformité en audit.

---

## 6. Durées de conservation

À documenter dans la politique de confidentialité et le registre des traitements.

| Catégorie | Durée active | Archivage | Base |
|---|---|---|---|
| Compte utilisateur | Tant que compte actif | 1 an après clôture (contentieux) | art. 6.1.b + 6.1.f |
| Activités & plans | Tant que compte actif OU 3 ans d'inactivité | Purge automatique | art. 5.1.e (limitation stockage) |
| `activity_health.hr_*` | Tant que consentement actif | Purge immédiate au retrait | art. 9.2.a |
| Fichiers sources uploadés | 24h (temps de traitement) OU 90j en opt-in tier « Pro » | Purge automatique après | Minimisation |
| Logs de sécurité | 30 jours | — | art. 6.1.f + délibération CNIL logs |
| Logs d'accès aux données santé | **1 an** minimum | Conservation obligatoire | Recommandations CNIL santé |
| Factures | 10 ans | Conservation comptable | Code de commerce |
| Conversations IA | Tant que compte actif | Purge à clôture | art. 6.1.b |

**Purge = SQL DELETE réel + purge fichiers stockage**, pas un flag `deleted_at` seul. Test d'isolation à écrire (`npm run test:isolation` devrait le couvrir).

---

## 7. Portabilité (art. 20) — export sortant

**Obligatoire, sans exception**, dès le premier utilisateur externe.

Livrable :
- Bouton « Exporter mes données » dans compte utilisateur, disponible libre-service.
- Contenu détaillé au doc `03` §6 : archive ZIP avec `activities.csv`, `activities_derived/*.json`, fichiers source FIT/GPX si conservés, `README.txt`, `MANIFEST.json`.
- Format ouvert et interopérable (CSV, JSON, FIT — pas un format propriétaire Cairn).
- Génération en 24h maximum en libre-service, 30j maximum sur demande manuelle (délai légal art. 12.3).
- **Sanitisation CSV formula injection** obligatoire (préfixer par `'` toute cellule commençant par `=+-@\t\r`).

---

## 8. Droit à l'effacement (art. 17)

- Bouton « supprimer mon compte » → suppression réelle sous 30j (période de rétractation raisonnable, tickets support, contentieux).
- **Après 30j**, purge complète : DELETE cascade `tenants`, purge stockage objet, purge logs (sauf logs d'accès santé conservés obligatoirement, anonymisés).
- Certification de suppression fournie sur demande écrite.

---

## 9. Sous-traitance LLM (Anthropic — cf. CLAUDE.md)

Anthropic est **sous-traitant** au sens art. 28 RGPD.

**Ce qu'il faut avoir** :
- **DPA (Data Processing Agreement)** signé avec Anthropic.
- **Zero-retention** : Anthropic ne conserve pas les prompts pour entraînement (à formaliser).
- **Localisation traitement** : idéalement UE. Sinon, base juridique du transfert international (SCC + éventuelles mesures supplémentaires post-Schrems II).
- **Politique de confidentialité Cairn** mentionne Anthropic, sa juridiction, la finalité.
- **Purge à retrait de consentement** utilisateur : demande à Anthropic (à formaliser dans le DPA — si Anthropic ne peut pas purger ses caches côté leur infra, ne pas leur envoyer de données santé).

**Point d'attention** : la doc Anthropic 2026 clarifie zero-retention + no-training sur l'API Enterprise / Claude for Work — à valider ligne à ligne dans le contrat effectif de Cairn. **Ne pas se fier au marketing, exiger le contrat.**

---

## 10. AI Act — échéance article 50 (2 août 2026)

**5 jours avant la date d'aujourd'hui** (27/07/2026). C'est immédiat.

**Art. 50 AI Act** (transparence pour les systèmes qui interagissent avec des personnes physiques) impose :
- L'utilisateur doit **savoir qu'il interagit avec un système d'IA** dès la première interaction.
- **Mention permanente et visible dans l'UI du chat** (règle CLAUDE.md 🔴). Une mention en CGU ne suffit pas.
- Sauf si c'est « évident du contexte pour une personne raisonnablement informée » — pour un chat coach, ce n'est pas évident (une utilisatrice peut penser qu'il y a un coach humain derrière).

**À implémenter avant tout accès externe** (règle CLAUDE.md), y compris beta gratuite.

**Autres articles pertinents** :
- Art. 5 (pratiques interdites) : Cairn ne devrait pas être concerné (pas de scoring social, pas d'exploitation de vulnérabilités).
- Art. 6 & annexe III (systèmes à haut risque) : le coaching sportif n'est **pas** classé haut risque. Attention toutefois : si Cairn glissait vers un usage médical (« votre plan tient compte de votre diabète »), le régime change.
- Art. 52 (contenus générés par IA) : le plan et les messages du coach étant produits par IA (au moins pour la couche B), une mention dans les productions notables (email de récap hebdo IA-généré) est prudente.

---

## 11. Points à faire valider par un juriste — checklist

**Avant beta gratuite** :
1. Politique de confidentialité complète (fournisseur, finalités, base légale, durées, droits, DPO).
2. CGU / CGV incluant clauses de responsabilité, non-substitution à un professionnel de santé, coach humain, licence des données.
3. AIPD complète et signée par le RT (Eva).
4. Registre des traitements (art. 30) à jour.
5. DPA Anthropic signé et lu.
6. Bannière AI Act art. 50 en production.
7. Consentements santé opérationnels (interface, versioning, révocabilité testée).
8. Test de portabilité (export sortant) fonctionnel.

**Avant premier utilisateur payant** :
9. Vérifier statut « traitement à grande échelle » et **désigner un DPO** externe si les seuils sont atteints (règle CNIL — critères qualitatifs et quantitatifs, à trancher avec avocat).
10. Contrat AV/sous-traitants hébergement (Vercel, Supabase) — DPAs et localisation UE.
11. Souscription assurance RC pro incluant cyber + traitement données santé.

**En continu** :
12. Revue annuelle de l'AIPD.
13. Notification CNIL en cas de violation (72h — procédure interne écrite).
14. Journal des versions politique de confidentialité et consentements.

---

## 12. Ce qui reste ouvert

- **Statut RGPD de la période « dogfooding solo »** : quand il n'y a qu'une utilisatrice sur ses propres données (Eva), le RGPD ne s'applique pas (art. 2.2.c « activités strictement personnelles »). Au **premier compte tiers**, tout bascule d'un coup. Chantier CLAUDE.md 🔴 « Ne pas ouvrir d'accès externe sans validation explicite ».
- **Anonymisation** des logs et métriques agrégées à des fins d'amélioration produit — à cadrer avant de commencer à en faire.
- **Base légale du réajustement automatique** du plan (art. 22 — décision individuelle automatisée) : soit on l'ancre sur art. 22.2.a (nécessaire à l'exécution du contrat), soit on requiert un consentement explicite. À trancher avec juriste.

---

## 13. Sources primaires

- CNIL — guide AIPD 5 étapes (2026) : `https://www.leto.legal/guides/comment-realiser-son-aipd-en-5-etapes`
- CNIL — 9 critères déclenchant l'AIPD : `https://www.dpo-partage.fr/quand-faire-aipd-9-criteres-cnil/`
- Rapport annuel CNIL 2025 : `https://www.cnil.fr/sites/cnil/files/2026-05/rapport_annuel_2025.pdf`
- Garmin AI Transparency Statement : `https://www.garmin.com/en-US/legal/ai-transparency-statement/`
- Text officiel RGPD art. 20 : `https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3#Article20`
- Texte officiel AI Act (règlement UE 2024/1689), art. 50 : `https://eur-lex.europa.eu/eli/reg/2024/1689/oj`
- EDPB WP248 rév.01 (critères AIPD) : à consulter via cnil.fr
