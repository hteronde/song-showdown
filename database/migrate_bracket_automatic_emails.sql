-- Run once against the music_bracket database before deploying the application.
ALTER TABLE music_bracket.brackets
  ADD COLUMN automatic_emails_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN automatic_emails_enabled_at DATETIME(6) NULL;
