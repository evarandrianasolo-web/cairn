-- =============================================================
-- 0003 — activity_health + health_access_logs
-- =============================================================
-- Données de santé : table séparée, RLS stricte, accès journalisés.
-- Écrites UNIQUEMENT si le consentement fc_stockage est actif.
-- Le retrait du consentement PURGE les lignes — il ne pose pas un
-- drapeau d'affichage. Jamais transmises au modèle en valeur brute :
-- dérivé seulement (tendance, drapeau booléen).
-- =============================================================


create table public.activity_health (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references auth.users(id) on delete cascade,
  activity_id      uuid not null unique references public.activities(id) on delete cascade,

  avg_hr           smallint,
  max_hr           smallint,
  hr_drift         numeric(5,2),
  relative_effort  smallint,

  created_at       timestamptz not null default now()
);

create index activity_health_tenant_id_idx on public.activity_health (tenant_id);

alter table public.activity_health enable row level security;
alter table public.activity_health force row level security;

create policy "activity_health_select_own"
  on public.activity_health for select
  using (tenant_id = (select auth.uid()));

create policy "activity_health_insert_own"
  on public.activity_health for insert
  with check (tenant_id = (select auth.uid()));

create policy "activity_health_delete_own"
  on public.activity_health for delete
  using (tenant_id = (select auth.uid()));

-- TROIS POLICIES, PAS QUATRE — ce n'est pas un oubli.
-- Une mesure de santé ne se modifie pas : elle est créée à
-- l'ingestion, ou supprimée au retrait du consentement.
-- Voir docs/rls-pattern.sql.


-- =============================================================
-- JOURNAL D'ACCÈS AUX DONNÉES DE SANTÉ
-- =============================================================
-- Registre d'audit, exigé par PRD §7. Il enregistre QUI a touché
-- QUOI et QUAND — jamais les valeurs elles-mêmes. Aucune clé
-- étrangère vers la ligne consultée : supprimer une mesure ne doit
-- pas effacer la trace de sa consultation.
-- =============================================================

create table public.health_access_logs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references auth.users(id) on delete cascade,

  subject_table  text not null,
  subject_id     uuid,
  action         health_access_action not null,
  actor          health_access_actor  not null,

  -- Route, tâche planifiée ou outil à l'origine de l'accès.
  context        text,

  occurred_at    timestamptz not null default now()
);

create index health_access_logs_tenant_id_idx on public.health_access_logs (tenant_id);
create index health_access_logs_time_idx      on public.health_access_logs (tenant_id, occurred_at desc);

alter table public.health_access_logs enable row level security;
alter table public.health_access_logs force row level security;

create policy "health_access_logs_select_own"
  on public.health_access_logs for select
  using (tenant_id = (select auth.uid()));

create policy "health_access_logs_insert_own"
  on public.health_access_logs for insert
  with check (tenant_id = (select auth.uid()));

-- DEUX POLICIES, PAS QUATRE — ce n'est pas un oubli.
-- Un journal d'audit est append-only. Une ligne qu'on peut modifier
-- ou supprimer ne prouve plus rien, et c'est exactement ce qu'un
-- contrôle vient vérifier. Ne pas « compléter » ce jeu de policies.
