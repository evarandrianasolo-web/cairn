-- Compteur des appels API Anthropic pour piloter les couts par tenant
-- et par fonction. Append-only : chaque appel API insere une ligne.
-- Aucune donnee sensible ; feature + tokens + cout estime seulement.
create table public.ai_calls (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references auth.users(id) on delete cascade,

  feature        text not null,
  -- 'coach-chat' : chat conversationnel /coach/[id]
  -- 'debrief-from-notes' : proposeDebriefFromActivity
  -- 'fueling-from-notes' : proposeFuelingFromActivity
  -- 'plan-generate' : generatePlanWeek
  -- 'plan-readjust' : readjustPlanWeek
  -- Autres a ajouter au fur et a mesure.

  model          text not null,
  tokens_in      integer not null default 0,
  tokens_out     integer not null default 0,
  cost_usd_x1e6  integer not null default 0,
  -- Cout estime en USD * 1_000_000 pour eviter les floats en base.
  -- Ex : 0.0125 USD = 12500.

  meta           jsonb,
  -- Metadonnees optionnelles : thread_id, activity_id, iso_week, etc.
  -- Champs libres, indexables si besoin plus tard.

  created_at     timestamptz not null default now()
);

create index ai_calls_tenant_created_idx
  on public.ai_calls (tenant_id, created_at desc);
create index ai_calls_tenant_feature_idx
  on public.ai_calls (tenant_id, feature, created_at desc);

alter table public.ai_calls enable row level security;
alter table public.ai_calls force row level security;

-- Append-only : lecture + insertion, pas d'update ni de delete par
-- l'utilisateur. Les rows sont un journal.
create policy "ai_calls_select_own"
  on public.ai_calls for select
  using (tenant_id = (select auth.uid()));

create policy "ai_calls_insert_own"
  on public.ai_calls for insert
  with check (tenant_id = (select auth.uid()));

comment on table public.ai_calls is
  'Journal append-only des appels Anthropic pour piloter les couts et les usages par tenant/feature. Pas de PII, pas de contenu de message.';
