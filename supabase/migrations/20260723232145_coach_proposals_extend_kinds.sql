-- Etendre les types de propositions coach : ajout de 'race' (nouvelle
-- course a inscrire) et 'debrief_axis' (axe de travail supplementaire
-- a ajouter au dernier debrief).
alter table public.coach_proposals
  drop constraint coach_proposals_kind_check;

alter table public.coach_proposals
  add constraint coach_proposals_kind_check
    check (kind in ('constraint', 'race', 'debrief_axis'));
