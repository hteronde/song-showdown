-- Run before deploying session notifications. Safe to rerun.
-- The activation timestamp prevents historical-session email floods.
USE music_bracket;

CREATE TABLE IF NOT EXISTS session_email_settings (
  settings_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  enabled_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
INSERT IGNORE INTO session_email_settings (settings_id) VALUES (1);

CREATE TABLE IF NOT EXISTS session_email_deliveries (
  delivery_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  bracket_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('start','end') NOT NULL,
  delivery_status ENUM('pending','sending','sent','skipped') NOT NULL DEFAULT 'pending',
  attempt_at DATETIME(6) NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payload JSON NULL,
  sent_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_session_recipient_event (week_id,user_id,event_type),
  KEY ix_session_email_pending (delivery_status,attempt_at),
  CONSTRAINT fk_session_email_week FOREIGN KEY (week_id,bracket_id) REFERENCES bracket_weeks(week_id,bracket_id) ON DELETE CASCADE,
  CONSTRAINT fk_session_email_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
