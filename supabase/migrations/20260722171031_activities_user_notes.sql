-- Notes personnelles sur une activité, indépendantes de la description
-- Strava. Ne sont jamais écrasées par un re-import : runInitialImport
-- construit son payload avec transformActivity qui n'inclut pas user_notes,
-- donc l'upsert ne touche pas cette colonne.
alter table public.activities add column user_notes text;
