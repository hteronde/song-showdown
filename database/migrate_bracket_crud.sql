-- Add the scheduling fields used by the admin bracket manager and allow 128 songs.
USE music_bracket;

ALTER TABLE brackets
  ADD COLUMN start_at DATETIME NULL AFTER bracket_year,
  ADD COLUMN songs_per_session SMALLINT UNSIGNED NOT NULL DEFAULT 2 AFTER start_at,
  ADD COLUMN session_duration_minutes INT UNSIGNED NOT NULL DEFAULT 10080 AFTER songs_per_session,
  ADD CONSTRAINT chk_brackets_session_size CHECK (songs_per_session IN (2, 4, 8)),
  ADD CONSTRAINT chk_brackets_session_duration CHECK (session_duration_minutes > 0);

ALTER TABLE bracket_songs DROP CHECK chk_bracket_song_region;
ALTER TABLE bracket_songs
  ADD CONSTRAINT chk_bracket_song_region CHECK (region_number BETWEEN 1 AND 8);
