USE music_bracket;

ALTER TABLE bracket_finale_sessions
  MODIFY status ENUM('active', 'paused', 'complete') NOT NULL DEFAULT 'active';
