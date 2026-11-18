ALTER TABLE matchups ADD COLUMN decided_tiebreaker ENUM('random', 'seed', 'seed_low', 'admin_pick') NULL;
