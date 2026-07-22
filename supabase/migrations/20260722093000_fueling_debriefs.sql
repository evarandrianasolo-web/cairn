-- =============================================================
-- 0006 — fueling_logs + debriefs
-- =============================================================
-- Module Fueling. La seule métrique quantitative est le gramme de
-- glucides. La bibliothèque stocke des produits et des grammes,
-- rien d'autre — pas de valeur énergétique, sous aucune forme.
--
-- Aucun état 🟢🟡🔴 n'est stocké : les trois états se dérivent à
-- l'affichage. Rien à figer en base, et surtout aucun score chiffré,
-- qui se gamifierait dans le mauvais sens.
--
-- Voir PRD §5.2 et CLAUDE.md § Règles santé.
-- =============================================================


create table public.fueling_logs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references auth.users(id) on delete cascade,

  activity_id       uuid references public.activities(id) on delete cascade,
  race_id           uuid references public.races(id) on delete cascade,

  intake_pattern    fueling_intake not null,
  carbs_g           integer      check (carbs_g >= 0),
  carbs_g_per_hour  numeric(5,1) check (carbs_g_per_hour >= 0),

  -- [{ "label": "gel citron", "carbs_g": 25, "qty": 3 }, ...]
  products          jsonb,

  -- « oublié » et « nausée » appellent deux réponses différentes.
  issue             fueling_issue not null default 'aucun',

  post_window_fed   boolean,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index fueling_logs_tenant_id_idx on public.fueling_logs (tenant_id);

alter table public.fueling_logs enable row level security;
alter table public.fueling_logs force row level security;

create policy "fueling_logs_select_own"
  on public.fueling_logs for select
  using (tenant_id = (select auth.uid()));

create policy "fueling_logs_insert_own"
  on public.fueling_logs for insert
  with check (tenant_id = (select auth.uid()));

create policy "fueling_logs_update_own"
  on public.fueling_logs for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "fueling_logs_delete_own"
  on public.fueling_logs for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------

create table public.debriefs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references auth.users(id) on delete cascade,

  kind          debrief_kind not null default 'course',
  race_id       uuid references public.races(id) on delete cascade,
  period_start  date,
  period_end    date,

  narrative     text,
  what_worked   text,
  what_failed   text,

  -- Axes de travail du bloc suivant.
  -- ["descente technique", "fueling au-dela de 60 g/h"]
  focus_areas   jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index debriefs_tenant_id_idx on public.debriefs (tenant_id);

alter table public.debriefs enable row level security;
alter table public.debriefs force row level security;

create policy "debriefs_select_own"
  on public.debriefs for select
  using (tenant_id = (select auth.uid()));

create policy "debriefs_insert_own"
  on public.debriefs for insert
  with check (tenant_id = (select auth.uid()));

create policy "debriefs_update_own"
  on public.debriefs for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "debriefs_delete_own"
  on public.debriefs for delete
  using (tenant_id = (select auth.uid()));
