-- Add playlist links scoped to a bracket or to one of its weeks.
USE music_bracket;

ALTER TABLE bracket_weeks
  ADD UNIQUE KEY uq_bracket_week_pair (bracket_id, week_id);

CREATE TABLE bracket_playlists (
  playlist_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NULL,
  playlist_name VARCHAR(160) NOT NULL,
  playlist_url VARCHAR(2048) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (playlist_id),
  KEY ix_bracket_playlists_scope (bracket_id, week_id),
  CONSTRAINT fk_bracket_playlists_bracket FOREIGN KEY (bracket_id)
    REFERENCES brackets (bracket_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bracket_playlists_week FOREIGN KEY (bracket_id, week_id)
    REFERENCES bracket_weeks (bracket_id, week_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
