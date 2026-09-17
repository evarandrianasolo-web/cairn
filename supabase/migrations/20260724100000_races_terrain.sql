-- Ajoute un champ terrain sur races (route / trail / mixte).
-- Guide la strategie d'estimation : une course route de 5 km doit
-- s'appuyer sur les temps de reference route, pas sur une sortie
-- vallonnee du pool.

alter table public.races
  add column if not exists terrain text not null default 'trail'
    check (terrain in ('route', 'trail', 'mixte'));

comment on column public.races.terrain is
  'Type de terrain : route (plat/asphalte), trail (nature/denivele), mixte. Guide la strategie d''estimation.';
