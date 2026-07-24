-- Propositions du coach IA a valider par l'utilisateur avant ecriture
-- reelle dans les tables metier. Cf. CLAUDE.md § Plan :
-- "le coach ne dit jamais 'c'est fait' sans afficher le differentiel
-- confirmable".
--
-- V0 : uniquement kind='constraint' (le coach detecte une info type
-- garde/deplacement/blessure/... dans une conversation, il propose de
-- creer une contrainte, Eva accepte ou rejette).
--
-- payload : contenu de la proposition, forme libre en jsonb, valide
-- cote application avant creation reelle.
--
-- applied_ref : id de la ligne creee dans la table metier apres
-- acceptation, pour tracabilite / annulation eventuelle.
create table public.coach_proposals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references auth.users(id) on delete cascade,
  thread_id      uuid not null references public.coach_threads(id) on delete cascade,

  kind           text not null,
  payload        jsonb not null,
  status         text not null default 'pending',
  applied_ref    uuid,

  created_at     timestamptz not null default now(),
  decided_at     timestamptz,

  constraint coach_proposals_kind_check
    check (kind in ('constraint')),
  constraint coach_proposals_status_check
    check (status in ('pending', 'accepted', 'rejected'))
);

create index coach_proposals_thread_status_idx
  on public.coach_proposals (thread_id, status);
create index coach_proposals_tenant_created_idx
  on public.coach_proposals (tenant_id, created_at desc);

alter table public.coach_proposals enable row level security;
alter table public.coach_proposals force row level security;

create policy "coach_proposals_select_own"
  on public.coach_proposals for select
  using (tenant_id = (select auth.uid()));

create policy "coach_proposals_insert_own"
  on public.coach_proposals for insert
  with check (tenant_id = (select auth.uid()));

create policy "coach_proposals_update_own"
  on public.coach_proposals for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "coach_proposals_delete_own"
  on public.coach_proposals for delete
  using (tenant_id = (select auth.uid()));

comment on table public.coach_proposals is
  'Propositions du coach IA en attente de validation utilisateur. Aucune ecriture metier tant que status=pending.';
