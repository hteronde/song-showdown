USE music_bracket;

ALTER TABLE brackets ADD COLUMN tiebreaker_option ENUM('random', 'seed', 'admin_pick') NOT NULL DEFAULT 'admin_pick';
