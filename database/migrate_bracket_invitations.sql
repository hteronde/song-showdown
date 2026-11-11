-- Run once on existing databases before deploying invitation support.
-- Existing participants retain their access; application-created memberships explicitly start pending.
ALTER TABLE bracket_members
  ADD COLUMN invitation_status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'accepted',
  ADD COLUMN invitation_sent_at DATETIME(6) NULL,
  ADD COLUMN invitation_attempt_at DATETIME(6) NULL,
  ADD COLUMN invitation_delivery ENUM('unsent','sending','sent','failed') NOT NULL DEFAULT 'unsent',
  ADD COLUMN invitation_responded_at DATETIME(6) NULL;
