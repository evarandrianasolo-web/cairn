-- =============================================================
-- 0007 — coach_threads + coach_messages
-- =============================================================
-- Les messages sont une table à part entière, pas un blob dans le
-- fil. Le contexte coach est pré-calculé avec un budget de 2 à 4 k
-- tokens et le détail se récupère à la demande (PRD §3.4) : il faut
-- pouvoir paginer, lire les N derniers messages et n'écrire que le
-- message ajouté. Un jsonb se réécrirait en entier à chaque tour.
-- =============================================================


create table public.coach_threads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references auth.users(id) on delete cascade,

  title            text,
  last_message_at  timestamptz,
  archived         boolean not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index coach_threads_tenant_id_idx on public.coach_threads (tenant_id);

alter table public.coach_threads enable row level security;
alter table public.coach_threads force row level security;

create policy "coach_threads_select_own"
  on public.coach_threads for select
  using (tenant_id = (select auth.uid()));

create policy "coach_threads_insert_own"
  on public.coach_threads for insert
  with check (tenant_id = (select auth.uid()));

create policy "coach_threads_update_own"
  on public.coach_threads for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "coach_threads_delete_own"
  on public.coach_threads for delete
  using (tenant_id = (select auth.uid()));


-- ---------------------------------------------------------------
-- tokens_in / tokens_out / tool_calls sont posés dès maintenant :
-- le coût IA par utilisateur est la ligne budgétaire qui décide du
-- pricing, et on ne peut pas le reconstituer après coup.

create table public.coach_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references auth.users(id) on delete cascade,

  thread_id   uuid not null references public.coach_threads(id) on delete cascade,

  role        coach_role not null,
  content     text not null,
  tool_calls  jsonb,

  model       text,
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,

  created_at  timestamptz not null default now()
);

create index coach_messages_tenant_id_idx on public.coach_messages (tenant_id);
create index coach_messages_thread_idx    on public.coach_messages (tenant_id, thread_id, created_at);

alter table public.coach_messages enable row level security;
alter table public.coach_messages force row level security;

create policy "coach_messages_select_own"
  on public.coach_messages for select
  using (tenant_id = (select auth.uid()));

create policy "coach_messages_insert_own"
  on public.coach_messages for insert
  with check (tenant_id = (select auth.uid()));

create policy "coach_messages_update_own"
  on public.coach_messages for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "coach_messages_delete_own"
  on public.coach_messages for delete
  using (tenant_id = (select auth.uid()));
