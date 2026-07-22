-- =============================================================
-- Connexion OAuth2 Strava d'un athlete.
-- =============================================================
-- Un compte Strava par tenant, d'où le UNIQUE sur tenant_id.
--
-- Les tokens sont chiffrés côté application (AES-256-GCM, voir
-- lib/strava/crypto.ts) AVANT insertion. Le champ text stocke la
-- sortie base64 opaque : lire ces colonnes en SQL direct ne donne
-- rien d'exploitable.
-- =============================================================

create table public.strava_connections (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null unique references auth.users(id) on delete cascade,

  strava_athlete_id         bigint not null,

  access_token_encrypted    text not null,
  refresh_token_encrypted   text not null,
  expires_at                timestamptz not null,

  scopes                    text[] not null default '{}',

  connected_at              timestamptz not null default now(),
  last_imported_at          timestamptz,
  updated_at                timestamptz not null default now()
);

create index strava_connections_tenant_id_idx on public.strava_connections (tenant_id);

alter table public.strava_connections enable row level security;
alter table public.strava_connections force row level security;

create policy "strava_connections_select_own"
  on public.strava_connections for select
  using (tenant_id = (select auth.uid()));

create policy "strava_connections_insert_own"
  on public.strava_connections for insert
  with check (tenant_id = (select auth.uid()));

create policy "strava_connections_update_own"
  on public.strava_connections for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "strava_connections_delete_own"
  on public.strava_connections for delete
  using (tenant_id = (select auth.uid()));
