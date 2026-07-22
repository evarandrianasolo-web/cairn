-- =============================================================
-- 0001 — Types partagés + athletes
-- =============================================================
-- athletes est la racine de l'isolation : une ligne par compte.
-- =============================================================


-- 1. TYPES ÉNUMÉRÉS ---------------------------------------------
-- Valeurs stables. Un ajout impose un ALTER TYPE, assumé ici.

create type plan_phase       as enum ('base', 'specifique', 'choc', 'affutage', 'course', 'recup');
create type session_status   as enum ('prevue', 'realisee', 'modifiee', 'manquee', 'remplacee');
create type race_priority    as enum ('A', 'B', 'C');
create type race_status      as enum ('envisagee', 'inscrite', 'terminee', 'annulee', 'dns', 'dnf');
create type constraint_kind  as enum ('recurrente', 'ponctuelle');
create type constraint_impact as enum ('bloque', 'allege', 'decale');
create type fueling_intake   as enum ('rien', 'un_peu', 'regulierement');
create type fueling_issue    as enum ('aucun', 'oubli', 'nausee', 'pas_acces', 'autre');
create type debrief_kind     as enum ('course', 'bloc');
create type coach_role       as enum ('user', 'assistant', 'system');
create type consent_scope    as enum ('fc_stockage', 'fc_analyse_ia', 'stats_anonymes');
create type revision_trigger as enum ('seance_ajoutee', 'seance_manquee', 'nouvelle_contrainte',
                                      'nouvelle_course', 'seuil_charge', 'signal_fueling',
                                      'demande_utilisateur');
create type revision_author  as enum ('user', 'ai');
create type health_access_action as enum ('lecture', 'ecriture', 'purge');
create type health_access_actor  as enum ('user', 'ai', 'system');


-- 2. DOMAINES text + check --------------------------------------
-- Ces deux listes bougeront souvent. Un domaine donne un check
-- unique, réutilisable, et modifiable sans ALTER TYPE :
--
--   alter domain session_type drop constraint session_type_check;
--   alter domain session_type add  constraint session_type_check
--     check (value in (... nouvelle liste ...));

create domain session_type as text
  constraint session_type_check check (
    value in ('endurance', 'seuil', 'vma', 'cote', 'longue',
              'recup', 'renfo', 'rando', 'course')
  );

create domain constraint_type as text
  constraint constraint_type_check check (
    value in ('garde', 'club', 'deplacement', 'vacances',
              'meteo', 'blessure', 'travail', 'autre')
  );


-- 3. LA TABLE ---------------------------------------------------
-- Pas de trigger de création automatique sur auth.users : il viendra
-- avec le vrai parcours d'inscription. Aujourd'hui la ligne athlete
-- est créée explicitement par l'application.

create table public.athletes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null unique references auth.users(id) on delete cascade,

  display_name  text not null,
  timezone      text not null default 'Europe/Paris',

  -- Zones, allures calibrées, matériel, préférences d'affichage.
  -- Se recalibrent depuis les courses réelles.
  hr_zones      jsonb,
  pace_zones    jsonb,
  gear          jsonb,
  preferences   jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index athletes_tenant_id_idx on public.athletes (tenant_id);


-- 4. RLS --------------------------------------------------------

alter table public.athletes enable row level security;
alter table public.athletes force row level security;

create policy "athletes_select_own"
  on public.athletes for select
  using (tenant_id = (select auth.uid()));

create policy "athletes_insert_own"
  on public.athletes for insert
  with check (tenant_id = (select auth.uid()));

create policy "athletes_update_own"
  on public.athletes for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "athletes_delete_own"
  on public.athletes for delete
  using (tenant_id = (select auth.uid()));
