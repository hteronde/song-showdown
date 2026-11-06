USE music_bracket;
ALTER TABLE brackets ADD COLUMN finale_at DATETIME NULL, ADD COLUMN finale_start_round SMALLINT UNSIGNED NULL;
