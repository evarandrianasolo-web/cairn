-- =============================================================
-- PATRON OBLIGATOIRE — toute nouvelle table de Cairn
-- =============================================================
-- Fichier de référence. Ne pas exécuter tel quel.
-- Copier ce patron dans chaque migration créant une table.
--
-- Règle : une table sans policy RLS dans la MÊME migration est
-- un bug bloquant, pas une dette technique.
-- =============================================================


-- 1. LA TABLE ---------------------------------------------------
-- `tenant_id` est obligatoire, non nul, et référence auth.users.

create table public.exemple (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references auth.users(id) on delete cascade,

  -- colonnes métier
  label       text not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index sur tenant_id : la RLS filtre dessus à chaque requête.
create index exemple_tenant_id_idx on public.exemple (tenant_id);


-- 2. ACTIVER LA RLS ---------------------------------------------
-- Sans cette ligne, les policies ci-dessous ne s'appliquent pas.
-- `force` empêche même le propriétaire de la table de contourner.

alter table public.exemple enable row level security;
alter table public.exemple force row level security;


-- 3. LES POLICIES -----------------------------------------------
-- Une policy par opération. Pas de policy « for all » :
-- on veut pouvoir retirer l'écriture sans retirer la lecture.

create policy "exemple_select_own"
  on public.exemple for select
  using (tenant_id = (select auth.uid()));

create policy "exemple_insert_own"
  on public.exemple for insert
  with check (tenant_id = (select auth.uid()));

create policy "exemple_update_own"
  on public.exemple for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "exemple_delete_own"
  on public.exemple for delete
  using (tenant_id = (select auth.uid()));


-- =============================================================
-- CAS PARTICULIER — DONNÉES DE SANTÉ
-- =============================================================
-- FC, signaux de fueling : table séparée, jamais mélangée aux
-- données d'entraînement ordinaires.
--
--   - Écrite UNIQUEMENT si le consentement correspondant est actif
--   - Le retrait de consentement PURGE les lignes, il ne pose pas
--     un simple drapeau d'affichage
--   - Jamais transmise au modèle en valeur brute : dérivé seulement
--     (tendance, drapeau booléen)
--   - Accès journalisés dans une table de logs distincte
-- =============================================================

create table public.activity_health (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references auth.users(id) on delete cascade,
  activity_id  uuid not null references public.activities(id) on delete cascade,

  avg_hr       smallint,
  max_hr       smallint,
  hr_drift     numeric(5,2),

  created_at   timestamptz not null default now()
);

create index activity_health_tenant_id_idx on public.activity_health (tenant_id);

alter table public.activity_health enable row level security;
alter table public.activity_health force row level security;

create policy "activity_health_select_own"
  on public.activity_health for select
  using (tenant_id = (select auth.uid()));

create policy "activity_health_insert_own"
  on public.activity_health for insert
  with check (tenant_id = (select auth.uid()));

create policy "activity_health_delete_own"
  on public.activity_health for delete
  using (tenant_id = (select auth.uid()));

-- Pas de policy UPDATE : une mesure de santé ne se modifie pas.
-- Elle est créée à l'ingestion, ou supprimée au retrait du consentement.


-- =============================================================
-- INTERDICTIONS DE SCHÉMA
-- =============================================================
-- Ne JAMAIS créer, quelle que soit la justification :
--
--   weight, poids, body_mass, bmi, imc, body_fat, masse_grasse,
--   calories, kcal, target_weight, poids_cible, energy_intake
--
-- Le module Fueling stocke des PRODUITS et des GRAMMES DE GLUCIDES.
-- Voir PRD §5.2 et CLAUDE.md § Règles santé.
-- =============================================================
