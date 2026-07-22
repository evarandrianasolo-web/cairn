-- =============================================================
-- 0004 — races + constraints
-- =============================================================
-- La priorité de course structure toute la périodisation.
-- Les contraintes de vie sont le différenciateur produit.
-- =============================================================


create table public.races (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references auth.users(id) on delete cascade,

  name              text not null,
  race_date         date not null,
  location          text,
  distance_m        integer,
  elevation_gain_m  integer,
  priority          race_priority not null default 'C',
  status            race_status   not null default 'envisagee',

  goal_time_s       integer,
  result_time_s     integer,
  result_rank       integer,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index races_tenant_id_idx on public.races (tenant_id);
create index races_date_idx      on public.races (tenant_id, race_date);

alter table public.races enable row level security;
alter table public.races force row level security;

create policy "races_select_own"
  on public.races for select
  using (tenant_id = (select auth.uid()));

create policy "races_insert_own"
  on public.races for insert
  with check (tenant_id = (select auth.uid()));

create policy "races_update_own"
  on public.races for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "races_delete_own"
  on public.races for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.constraints (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references auth.users(id) on delete cascade,

  label            text not null,
  kind             constraint_kind   not null,
  type             constraint_type   not null default 'autre',
  impact           constraint_impact not null default 'bloque',

  -- Récurrente : règle RFC 5545.
  -- Le club du mardi et du jeudi s'écrit FREQ=WEEKLY;BYDAY=TU,TH
  recurrence_rule  text,

  -- Ponctuelle : bornes de la période concernée.
  starts_on        date,
  ends_on          date,

  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint constraints_shape check (
    (kind = 'recurrente'  and recurrence_rule is not null)
    or (kind = 'ponctuelle' and starts_on is not null)
  )
);

create index constraints_tenant_id_idx on public.constraints (tenant_id);
create index constraints_period_idx    on public.constraints (tenant_id, starts_on, ends_on);

alter table public.constraints enable row level security;
alter table public.constraints force row level security;

create policy "constraints_select_own"
  on public.constraints for select
  using (tenant_id = (select auth.uid()));

create policy "constraints_insert_own"
  on public.constraints for insert
  with check (tenant_id = (select auth.uid()));

create policy "constraints_update_own"
  on public.constraints for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "constraints_delete_own"
  on public.constraints for delete
  using (tenant_id = (select auth.uid()));
