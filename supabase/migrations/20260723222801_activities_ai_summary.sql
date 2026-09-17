-- Resume d'analyse IA d'une activite, court (2-4 phrases). Genere a
-- la demande via /activities/[id]. L'utilisateur peut regenerer, le
-- champ est ecrase a chaque appel. Aucune donnee sensible : le prompt
-- utilise le contexte deja transmis au coach chat.
alter table public.activities
  add column if not exists ai_summary text,
  add column if not exists ai_summary_at timestamptz;

comment on column public.activities.ai_summary is
  'Analyse courte generee par le coach IA a la demande. Ecrase a chaque regeneration.';
comment on column public.activities.ai_summary_at is
  'Timestamp de la derniere generation.';
