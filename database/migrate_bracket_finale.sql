USE music_bracket;

CREATE TABLE IF NOT EXISTS bracket_finale_sessions (
  bracket_id BIGINT UNSIGNED NOT NULL,
  started_by_user_id BIGINT UNSIGNED NOT NULL,
  start_round_number SMALLINT UNSIGNED NOT NULL,
  status ENUM('active', 'complete') NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (bracket_id),
  CONSTRAINT fk_finale_bracket FOREIGN KEY (bracket_id) REFERENCES brackets (bracket_id) ON DELETE CASCADE,
  CONSTRAINT fk_finale_admin FOREIGN KEY (started_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_finale_round FOREIGN KEY (bracket_id, start_round_number) REFERENCES bracket_rounds (bracket_id, round_number)
) ENGINE=InnoDB;
