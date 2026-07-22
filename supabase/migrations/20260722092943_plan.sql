-- =============================================================
-- 0005 — session_templates + plan_weeks + planned_sessions
-- =============================================================
-- Banque de séances, semaines de plan en numérotation ISO,
-- séances prévues qui se matchent avec les activités réelles.
-- =============================================================


create table public.session_templates (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  name                 text not null,
  session_type         session_type not null,
  intent               text,
  structure            jsonb,
  default_duration_s   integer,
  default_distance_m   integer,
  default_elevation_m  integer,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index session_templates_tenant_id_idx on public.session_templates (tenant_id);

alter table public.session_templates enable row level security;
alter table public.session_templates force row level security;

create policy "session_templates_select_own"
  on public.session_templates for select
  using (tenant_id = (select auth.uid()));

create policy "session_templates_insert_own"
  on public.session_templates for insert
  with check (tenant_id = (select auth.uid()));

create policy "session_templates_update_own"
  on public.session_templates for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "session_templates_delete_own"
  on public.session_templates for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.plan_weeks (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references auth.users(id) on delete cascade,

  iso_year            smallint not null,
  iso_week            smallint not null check (iso_week between 1 and 53),
  phase               plan_phase not null default 'base',
  target_race_id      uuid references public.races(id) on delete set null,

  target_distance_m   integer,
  target_elevation_m  integer,
  target_sessions     smallint,
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint plan_weeks_unique unique (tenant_id, iso_year, iso_week)
);

create index plan_weeks_tenant_id_idx on public.plan_weeks (tenant_id);

alter table public.plan_weeks enable row level security;
alter table public.plan_weeks force row level security;

create policy "plan_weeks_select_own"
  on public.plan_weeks for select
  using (tenant_id = (select auth.uid()));

create policy "plan_weeks_insert_own"
  on public.plan_weeks for insert
  with check (tenant_id = (select auth.uid()));

create policy "plan_weeks_update_own"
  on public.plan_weeks for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "plan_weeks_delete_own"
  on public.plan_weeks for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.planned_sessions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  plan_week_id         uuid not null references public.plan_weeks(id) on delete cascade,
  template_id          uuid references public.session_templates(id) on delete set null,

  scheduled_on         date not null,
  session_type         session_type not null,
  intent               text,

  target_distance_m    integer,
  target_elevation_m   integer,
  target_duration_s    integer,

  status               session_status not null default 'prevue',
  matched_activity_id  uuid references public.activities(id) on delete set null,

  -- Séance imposée par le club. Le coach en adapte l'intention ;
  -- il n'ajoute jamais une séance concurrente le même jour.
  is_club              boolean not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index planned_sessions_tenant_id_idx on public.planned_sessions (tenant_id);
create index planned_sessions_date_idx      on public.planned_sessions (tenant_id, scheduled_on);

alter table public.planned_sessions enable row level security;
alter table public.planned_sessions force row level security;

create policy "planned_sessions_select_own"
  on public.planned_sessions for select
  using (tenant_id = (select auth.uid()));

create policy "planned_sessions_insert_own"
  on public.planned_sessions for insert
  with check (tenant_id = (select auth.uid()));

create policy "planned_sessions_update_own"
  on public.planned_sessions for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "planned_sessions_delete_own"
  on public.planned_sessions for delete
  using (tenant_id = (select auth.uid()));
