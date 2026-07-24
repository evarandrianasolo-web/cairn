-- D- par lap : donnee terrain, non sensible. Nullable car pas
-- toujours calculable (necessite les streams altitude Strava).
alter table public.activity_laps
  add column if not exists elevation_loss_m integer;

comment on column public.activity_laps.elevation_loss_m is
  'Denivele negatif du lap, calcule depuis les streams altitude Strava. Null si les streams n''ont pas ete recuperees pour cette activite.';

-- Table SANTE separee pour la FC par lap. Respecte la regle CLAUDE.md
-- (donnees sante isolees, RLS stricte, consentement requis a l'ecriture).
-- min_hr et avg_hr proviennent des streams heartrate ; max_hr aussi
-- (Strava le donne aussi au niveau lap mais on refetch depuis streams
-- pour la coherence source).
create table if not exists public.activity_lap_health (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  lap_index integer not null,
  min_hr smallint check (min_hr is null or (min_hr >= 30 and min_hr <= 250)),
  avg_hr smallint check (avg_hr is null or (avg_hr >= 30 and avg_hr <= 250)),
  max_hr smallint check (max_hr is null or (max_hr >= 30 and max_hr <= 250)),
  created_at timestamptz not null default now(),
  unique (activity_id, lap_index)
);

comment on table public.activity_lap_health is
  'Frequences cardiaques par lap. Table sante separee : ecrite uniquement si consentement fc_stockage granted. Purgee au retrait du consentement.';

create index if not exists activity_lap_health_tenant_activity_idx
  on public.activity_lap_health (tenant_id, activity_id, lap_index);

alter table public.activity_lap_health enable row level security;

-- Pas de policy UPDATE : la donnee sante est immuable (creation ou
-- suppression, jamais modification -- meme regle qu'activity_health).
create policy "activity_lap_health: select own"
  on public.activity_lap_health for select
  using (tenant_id = auth.uid());

create policy "activity_lap_health: insert own"
  on public.activity_lap_health for insert
  with check (tenant_id = auth.uid());

create policy "activity_lap_health: delete own"
  on public.activity_lap_health for delete
  using (tenant_id = auth.uid());
