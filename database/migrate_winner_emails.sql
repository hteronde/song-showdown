-- Run each statement once before deployment. Existing completed brackets are not emailed.
ALTER TABLE music_bracket.session_email_deliveries
  MODIFY COLUMN event_type ENUM('start','end','winner') NOT NULL;

ALTER TABLE music_bracket.session_email_settings
  ADD COLUMN winner_enabled_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

ALTER TABLE music_bracket.brackets
  MODIFY COLUMN completed_at DATETIME(6) NULL;
