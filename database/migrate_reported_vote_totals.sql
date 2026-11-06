USE music_bracket;
CREATE TABLE IF NOT EXISTS matchup_reported_totals (
  bracket_id BIGINT UNSIGNED NOT NULL,
  matchup_id BIGINT UNSIGNED NOT NULL,
  votes_a SMALLINT UNSIGNED NOT NULL,
  votes_b SMALLINT UNSIGNED NOT NULL,
  source_note VARCHAR(500) NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bracket_id,matchup_id),
  CONSTRAINT fk_reported_totals_matchup FOREIGN KEY (bracket_id,matchup_id) REFERENCES matchups(bracket_id,matchup_id) ON DELETE CASCADE
) ENGINE=InnoDB;
