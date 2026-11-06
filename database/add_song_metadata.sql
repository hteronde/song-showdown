-- Update an existing music_bracket database.
-- songs already has album; rename release_year to year and add category.
USE music_bracket;

ALTER TABLE songs
  CHANGE COLUMN release_year `year` SMALLINT UNSIGNED NULL,
  ADD COLUMN category VARCHAR(255) NULL AFTER `year`;
