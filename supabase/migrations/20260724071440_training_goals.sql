-- Objectifs transversaux (autres que les courses).
-- Exemples : "améliorer les descentes", "augmenter le volume à 80 km/sem",
-- "tenir 60 g/h sur les longues", "renforcement excentrique quadris".
--
-- Le coach IA les recoit dans son contexte et les prompts de generation
-- de plan pour orienter les seances. Ils ne bloquent rien --
-- l'utilisateur les archive ou les marque atteints quand c'est le cas.
create table public.training_goals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references auth.users(id) on delete cascade,

  label        text not null,
  area         text,
  -- 'vitesse' | 'volume' | 'descente' | 'montee' | 'technique' |
  -- 'fueling' | 'mental' | 'autre'
  target_date  date,
  status       text not null default 'active',
  -- 'active' | 'atteint' | 'abandonne'
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint training_goals_status_check
    check (status in ('active', 'atteint', 'abandonne'))
);

create index training_goals_tenant_status_idx
  on public.training_goals (tenant_id, status);

alter table public.training_goals enable row level security;
alter table public.training_goals force row level security;

create policy "training_goals_select_own"
  on public.training_goals for select
  using (tenant_id = (select auth.uid()));

create policy "training_goals_insert_own"
  on public.training_goals for insert
  with check (tenant_id = (select auth.uid()));

create policy "training_goals_update_own"
  on public.training_goals for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "training_goals_delete_own"
  on public.training_goals for delete
  using (tenant_id = (select auth.uid()));
