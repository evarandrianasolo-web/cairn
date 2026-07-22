-- =============================================================
-- 0008 — consent_records + plan_revisions
-- =============================================================


-- JOURNAL DE CONSENTEMENT --------------------------------------
-- On conserve la version EXACTE du texte affiché au moment de
-- l'octroi ou du retrait. En cas de contrôle, la charge de la
-- preuve du consentement pèse sur le responsable de traitement.

create table public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references auth.users(id) on delete cascade,

  scope           consent_scope not null,
  granted         boolean not null,

  policy_version  text not null,
  policy_text     text not null,

  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index consent_records_tenant_id_idx on public.consent_records (tenant_id);
create index consent_records_scope_idx     on public.consent_records (tenant_id, scope, occurred_at desc);

alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;

create policy "consent_records_select_own"
  on public.consent_records for select
  using (tenant_id = (select auth.uid()));

create policy "consent_records_insert_own"
  on public.consent_records for insert
  with check (tenant_id = (select auth.uid()));

-- DEUX POLICIES, PAS QUATRE — ce n'est pas un oubli.
-- Un journal de consentement qui s'édite ou s'efface n'a aucune
-- valeur probante. Un retrait n'est pas une modification de la
-- ligne d'octroi : c'est une NOUVELLE ligne, avec granted = false.
-- L'état courant d'un consentement se lit en prenant la ligne la
-- plus récente pour un scope donné. Ne pas « compléter » ce jeu
-- de policies.


-- HISTORIQUE DU PLAN --------------------------------------------
-- Toute écriture de l'IA sur le plan passe ici : déclencheur, diff,
-- auteur, annulable. Le coach ne dit jamais « c'est fait » sans
-- afficher le différentiel confirmable.

create table public.plan_revisions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references auth.users(id) on delete cascade,

  plan_week_id         uuid references public.plan_weeks(id) on delete cascade,

  trigger              revision_trigger not null,
  author               revision_author  not null,

  diff                 jsonb not null,
  summary              text,

  reverted_at          timestamptz,
  reverts_revision_id  uuid references public.plan_revisions(id) on delete set null,

  created_at           timestamptz not null default now()
);

create index plan_revisions_tenant_id_idx on public.plan_revisions (tenant_id);
create index plan_revisions_week_idx      on public.plan_revisions (tenant_id, plan_week_id, created_at desc);

alter table public.plan_revisions enable row level security;
alter table public.plan_revisions force row level security;

create policy "plan_revisions_select_own"
  on public.plan_revisions for select
  using (tenant_id = (select auth.uid()));

create policy "plan_revisions_insert_own"
  on public.plan_revisions for insert
  with check (tenant_id = (select auth.uid()));

create policy "plan_revisions_update_own"
  on public.plan_revisions for update
  using      (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "plan_revisions_delete_own"
  on public.plan_revisions for delete
  using (tenant_id = (select auth.uid()));
