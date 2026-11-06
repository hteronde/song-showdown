USE music_bracket;
ALTER TABLE brackets ADD COLUMN randomization_mode ENUM('none','round1','each_round') NOT NULL DEFAULT 'none';
ALTER TABLE bracket_rounds ADD COLUMN randomized_at DATETIME(6) NULL;
