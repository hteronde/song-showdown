ALTER TABLE brackets MODIFY COLUMN tiebreaker_option ENUM('random','seed','seed_low','admin_pick') NOT NULL DEFAULT 'admin_pick';
