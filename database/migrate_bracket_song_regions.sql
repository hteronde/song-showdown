-- Update an existing database to allow four regions, each with seeds 1–16.
-- Converts old sequential positions 1–64 into region/seed pairs.
USE music_bracket;

ALTER TABLE bracket_songs
  ADD COLUMN region_number TINYINT UNSIGNED NULL AFTER bracket_id;

ALTER TABLE bracket_songs
  DROP INDEX uq_bracket_seed;

UPDATE bracket_songs
SET region_number = FLOOR((seed_number - 1) / 16) + 1,
    seed_number = MOD(seed_number - 1, 16) + 1;

ALTER TABLE bracket_songs
  MODIFY COLUMN region_number TINYINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uq_bracket_region_seed (bracket_id, region_number, seed_number),
  ADD CONSTRAINT chk_bracket_song_region CHECK (region_number BETWEEN 1 AND 4),
  ADD CONSTRAINT chk_bracket_song_seed CHECK (seed_number BETWEEN 1 AND 16);
