USE music_bracket;

ALTER TABLE matchups ADD COLUMN random_tiebreaker_vote_entry_id BIGINT UNSIGNED NULL AFTER winner_entry_id;
