USE music_bracket;

ALTER TABLE brackets ADD COLUMN paused_at DATETIME(6) NULL AFTER start_at;
