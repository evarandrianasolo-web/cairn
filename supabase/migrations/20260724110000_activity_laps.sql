-- Laps d'une activite, recuperes depuis Strava. Un lap = un split
-- de la seance (bouton lap sur la montre ou auto-lap kilometrique).
-- On garde tenant_id explicite pour RLS forte (jamais de filtrage
-- applicatif via la relation activities.tenant_id).

create table if not exists public.activity_laps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  lap_index integer not null,
  distance_m integer not null check (distance_m >= 0),
  moving_time_s integer not null check (moving_time_s >= 0),
  elapsed_time_s integer check (elapsed_time_s >= 0),
  avg_pace_s_per_km numeric(6,2),
  elevation_gain_m integer,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  unique (activity_id, lap_index)
);

comment on table public.activity_laps is
  'Splits (laps) d''une activite, importes depuis Strava. is_manual=true si presses au bouton pendant la seance (variance des distances), false si auto-lap kilometrique.';

create index if not exists activity_laps_tenant_activity_idx
  on public.activity_laps (tenant_id, activity_id, lap_index);

create index if not exists activity_laps_tenant_distance_idx
  on public.activity_laps (tenant_id, distance_m)
  where distance_m >= 800;

alter table public.activity_laps enable row level security;

create policy "activity_laps: select own"
  on public.activity_laps for select
  using (tenant_id = auth.uid());

create policy "activity_laps: insert own"
  on public.activity_laps for insert
  with check (tenant_id = auth.uid());

create policy "activity_laps: update own"
  on public.activity_laps for update
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

create policy "activity_laps: delete own"
  on public.activity_laps for delete
  using (tenant_id = auth.uid());
