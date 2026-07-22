-- Ajoute l'impact « oriente » pour les contraintes qui n'imposent ni
-- blocage, ni allègement, ni décalage, seulement une orientation de séance.
alter type constraint_impact add value 'oriente';

-- Champ libre court pour capter l'orientation :
--   « randos privilégiées »
--   « pas de D+ »
--   « focus vitesse »
alter table public.constraints add column focus text;
