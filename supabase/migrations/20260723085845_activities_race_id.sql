-- Une activité Strava peut correspondre à une course prévue dans races.
-- nullable : la plupart des activités ne sont pas des courses (entraînement).
-- on delete set null : supprimer une course dissocie les activités liées
-- sans supprimer les activités elles-mêmes.
--
-- Cette colonne n'est PAS incluse dans transformActivity côté import Strava,
-- donc un rafraîchissement upsert ne réinitialise pas la liaison.
alter table public.activities
  add column race_id uuid references public.races(id) on delete set null;

create index activities_race_id_idx on public.activities (race_id)
  where race_id is not null;
