-- Rename the existing songs.songwriter field without changing its values.
USE music_bracket;

ALTER TABLE songs
  CHANGE COLUMN songwriter category VARCHAR(255) NULL;
