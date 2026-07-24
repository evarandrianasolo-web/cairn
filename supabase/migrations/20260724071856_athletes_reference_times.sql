-- Temps de reference course a pied (secondes) pour calculer les
-- allures cibles EF / seuil / VMA. Optionnels, l'utilisateur remplit
-- au moins un pour que le coach affine ses recommandations.
alter table public.athletes
  add column if not exists ref_5km_s     integer,
  add column if not exists ref_10km_s    integer,
  add column if not exists ref_semi_s    integer,
  add column if not exists ref_marathon_s integer;

comment on column public.athletes.ref_5km_s is
  'Meilleur temps 5 km en secondes. Base pour VMA courte.';
comment on column public.athletes.ref_10km_s is
  'Meilleur temps 10 km en secondes.';
comment on column public.athletes.ref_semi_s is
  'Meilleur temps semi-marathon en secondes. Base pour seuil.';
comment on column public.athletes.ref_marathon_s is
  'Meilleur temps marathon en secondes.';
