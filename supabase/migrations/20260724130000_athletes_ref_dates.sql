-- Date de chaque temps de reference : sert a decider si le ref est
-- encore d'actualite ou si les seances de vitesse recentes doivent
-- primer dans l'inference des allures.

alter table public.athletes
  add column if not exists ref_5km_at date,
  add column if not exists ref_10km_at date,
  add column if not exists ref_semi_at date,
  add column if not exists ref_marathon_at date;

comment on column public.athletes.ref_5km_at is
  'Date du temps de reference 5 km (jour de la perf). Sert a decider si le ref est encore d''actualite vs les seances recentes.';
