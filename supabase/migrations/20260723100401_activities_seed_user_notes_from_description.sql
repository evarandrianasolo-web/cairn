-- Seed automatique de user_notes depuis la description Strava.
-- Se declenche UNIQUEMENT a l'INSERT : les re-imports Strava n'ecrasent
-- jamais les notes qu'Eva a pu editer entre-temps.
create or replace function seed_user_notes_from_description()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.user_notes is null
     and new.description is not null
     and length(trim(new.description)) > 0
  then
    new.user_notes := new.description;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_seed_user_notes on activities;
create trigger activities_seed_user_notes
before insert on activities
for each row
execute function seed_user_notes_from_description();

-- Backfill : les 1904 activites deja importees avaient description sans
-- que user_notes soit alimente. On repare une seule fois, sans toucher
-- aux notes qu'Eva aurait pu commencer a saisir.
update activities
set user_notes = description
where description is not null
  and length(trim(description)) > 0
  and (user_notes is null or length(trim(user_notes)) = 0);
