-- Structure d'abonnement Cairn. Aucun provider de paiement branche
-- en V1 : la table subscriptions est peuplee automatiquement par un
-- trigger signup (trial 7 jours) et par un webhook Paddle plus tard.
-- Voir docs/paiement-paddle.md pour la sequence d'activation.

create table if not exists public.subscription_plans (
  code text primary key,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'EUR',
  interval text not null check (interval in ('month', 'year', 'trial')),
  description text,
  is_public boolean not null default false,
  paddle_price_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Plans d''abonnement. Reference publique. is_public=false = plan interne (beta, dogfood), non listable dans l''UI de souscription.';

alter table public.subscription_plans enable row level security;

create policy "subscription_plans: read for authenticated"
  on public.subscription_plans for select
  using (auth.role() = 'authenticated');

insert into public.subscription_plans (code, name, price_cents, currency, interval, description, is_public, sort_order)
values
  ('beta', 'Beta interne', 0, 'EUR', 'trial', 'Acces complet dogfood, pas de facturation.', false, 0),
  ('trial', 'Essai gratuit 7 jours', 0, 'EUR', 'trial', 'Acces complet pendant 7 jours a la creation du compte.', false, 1),
  ('coach_mensuel', 'Coach mensuel', 790, 'EUR', 'month', 'Acces complet au coach IA, planning adaptatif, analyse laps, fueling.', true, 2),
  ('coach_annuel', 'Coach annuel', 6900, 'EUR', 'year', 'Acces complet, 2 mois offerts sur l''annee.', true, 3)
on conflict (code) do nothing;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  provider text check (provider in ('paddle', 'stripe', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Une ligne par phase d''abonnement (trial, abonnement paye, etc.). L''abonnement courant du tenant = la ligne la plus recente non canceled/expired.';

create index if not exists subscriptions_tenant_current_idx
  on public.subscriptions (tenant_id, created_at desc);

alter table public.subscriptions enable row level security;

create policy "subscriptions: select own"
  on public.subscriptions for select
  using (tenant_id = auth.uid());

-- Pas d'insert / update / delete cote user : geres par le trigger
-- signup, le webhook Paddle, et les server actions dediees. Aucune
-- policy = tout refuse par defaut, sauf service_role.

create or replace function public.create_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    tenant_id,
    plan_code,
    status,
    trial_end,
    current_period_start,
    current_period_end
  ) values (
    new.id,
    'trial',
    'trialing',
    now() + interval '7 days',
    now(),
    now() + interval '7 days'
  );
  return new;
end;
$$;

drop trigger if exists create_trial_on_signup on auth.users;
create trigger create_trial_on_signup
  after insert on auth.users
  for each row execute function public.create_trial_subscription();

insert into public.subscriptions (tenant_id, plan_code, status, current_period_start)
select id, 'beta', 'active', now()
from auth.users
where id not in (select tenant_id from public.subscriptions)
on conflict do nothing;
