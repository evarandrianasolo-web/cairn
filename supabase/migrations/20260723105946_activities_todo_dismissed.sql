-- Marque les raisons d'apparition dans /activites?filter=todo qu'Eva a
-- explicitement ecartees. Un array vide (defaut) = rien de masque, le
-- calcul reasonsFor() applique ses regles normales. Une valeur ex.
-- {'fueling'} signifie 'ne me redemande pas de fueling sur cette
-- seance', sans supprimer la donnee associee.
alter table activities
  add column if not exists todo_dismissed text[] not null default '{}';

comment on column activities.todo_dismissed is
  'Raisons ecartees pour la vue /activites?filter=todo : ''debrief'', ''fueling'', ''link''. Modifie via dismissActivityTodo().';
