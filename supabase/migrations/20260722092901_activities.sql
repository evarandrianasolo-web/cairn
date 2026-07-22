-- =============================================================
-- 0002 — activities
-- =============================================================
-- Séances réalisées, importées de Strava.
--
-- Aucune donnée de santé ici, et volontairement aucune colonne de
-- payload brut : la charge utile Strava transporte la fréquence
-- cardiaque, qui doit être filtrée à l'ingestion en l'absence de
-- consentement. La stocker sous forme brute reviendrait à détenir
-- la donnée qu'on prétend écarter.
--
-- L'effort relatif Strava est dérivé de la FC : il vit dans
-- activity_health, pas ici. Voir PRD §6.3.
-- =============================================================

create table public.activities (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references auth.users(id) on delete cascade,

  strava_activity_id  bigint,
  source              text not null default 'strava',

  name                text,
  description         text,
  sport_type          text,

  started_at          timestamptz not null,
  distance_m          integer,
  elevation_gain_m    integer,
  moving_time_s       integer,
  elapsed_time_s      integer,
  avg_pace_s_per_km   numeric(6,2),
  avg_cadence         numeric(5,1),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint activities_strava_unique unique (tenant_id, strava_activity_id)
);

create index activities_tenant_id_idx  on public.activities (tenant_id);
create index activities_started_at_idx on public.activities (tenant_id, started_at desc);

alter table public.activities enable row level security;
alter table public.activities force row level security;

create policy "activities_select_own"
  on public.activities for select
  using (tenant_id = (select auth.uid()));

create policy "activities_insert_own"
  on public.activities for insert
  with check (tenant_id = (select auth.uid()));

create policy "activities_update_own"
  on public.activities for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "activities_delete_own"
  on public.activities for delete
  using (tenant_id = (select auth.uid()));
