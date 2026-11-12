-- Starter schema for the family music bracket.
-- Target: MySQL 8.0.16+ (enforced CHECK constraints).

CREATE DATABASE IF NOT EXISTS music_bracket
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE music_bracket;

CREATE TABLE families (
  family_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (family_id)
) ENGINE=InnoDB;

CREATE TABLE users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NULL,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  `user_role` ENUM('super', 'viewer') NULL,
  family_joined_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  -- Store a scrypt hash here. NULL means the account has not set a password yet.
  password_hash VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_id_family (user_id, family_id),
  CONSTRAINT fk_users_family FOREIGN KEY (family_id)
    REFERENCES families (family_id)
) ENGINE=InnoDB;

CREATE TABLE auth_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (token_hash),
  KEY ix_auth_sessions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE brackets (
  bracket_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  family_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  artist VARCHAR(160) NOT NULL,
  logo_url VARCHAR(2048) NULL,
  draft_settings JSON NULL,
  bracket_year SMALLINT UNSIGNED NULL,
  start_at DATETIME(6) NULL,
  finale_at DATETIME NULL,
  finale_start_round SMALLINT UNSIGNED NULL,
  paused_at DATETIME(6) NULL,
  automatic_emails_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  automatic_emails_enabled_at DATETIME(6) NULL,
  anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  seeding_size SMALLINT UNSIGNED NULL,
  randomization_mode ENUM('none','round1','each_round') NOT NULL DEFAULT 'none',
  songs_per_session SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  session_duration_minutes INT UNSIGNED NULL DEFAULT 10080,
  tiebreaker_option ENUM('random', 'seed', 'seed_low', 'admin_pick') NOT NULL DEFAULT 'admin_pick',
  status ENUM('draft', 'active', 'complete') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (bracket_id),
  KEY ix_brackets_family_status (family_id, status),
  UNIQUE KEY uq_brackets_id_family (bracket_id, family_id),
  CONSTRAINT fk_brackets_family FOREIGN KEY (family_id)
    REFERENCES families (family_id),
  CONSTRAINT fk_brackets_creator FOREIGN KEY (created_by_user_id)
    REFERENCES users (user_id),
  CONSTRAINT chk_brackets_session_size CHECK (songs_per_session IN (2, 4, 8)),
  CONSTRAINT chk_brackets_session_duration CHECK (session_duration_minutes > 0)
) ENGINE=InnoDB;

CREATE TABLE bracket_members (
  bracket_id BIGINT UNSIGNED NOT NULL,
  family_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  finale_participant BOOLEAN NOT NULL DEFAULT TRUE,
  non_finale_participant BOOLEAN NOT NULL DEFAULT TRUE,
  bracket_role ENUM('member','commissioner') NOT NULL DEFAULT 'member',
  invitation_status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'accepted',
  invitation_sent_at DATETIME(6) NULL,
  invitation_attempt_at DATETIME(6) NULL,
  invitation_delivery ENUM('unsent','sending','sent','failed') NOT NULL DEFAULT 'unsent',
  invitation_responded_at DATETIME(6) NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bracket_id, user_id),
  CONSTRAINT fk_bracket_members_bracket FOREIGN KEY (bracket_id, family_id)
    REFERENCES brackets (bracket_id, family_id),
  CONSTRAINT fk_bracket_members_user_family FOREIGN KEY (user_id, family_id)
    REFERENCES users (user_id, family_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE songs (
  song_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  artist VARCHAR(160) NOT NULL,
  title VARCHAR(200) NOT NULL,
  album VARCHAR(200) NULL,
  `year` SMALLINT UNSIGNED NULL,
  category VARCHAR(255) NULL,
  youtube_url VARCHAR(2048) NULL,
  spotify_url VARCHAR(2048) NULL,
  album_cover_url VARCHAR(2048) NULL,
  PRIMARY KEY (song_id),
  KEY ix_songs_artist_title (artist, title)
) ENGINE=InnoDB;

-- A song can appear in many brackets. The seed belongs to this bracket entry,
-- rather than to the catalog song itself.
CREATE TABLE bracket_albums (
  bracket_album_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  `year` SMALLINT UNSIGNED NULL,
  album_cover_url VARCHAR(2048) NULL,
  PRIMARY KEY (bracket_album_id),
  UNIQUE KEY uq_bracket_album_title (bracket_id,title),
  UNIQUE KEY uq_bracket_album_pair (bracket_id,bracket_album_id),
  CONSTRAINT fk_albums_bracket FOREIGN KEY (bracket_id) REFERENCES brackets(bracket_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bracket_songs (
  bracket_song_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  region_number TINYINT UNSIGNED NOT NULL,
  song_id BIGINT UNSIGNED NOT NULL,
  seed_number SMALLINT UNSIGNED NOT NULL,
  assigned_seed SMALLINT UNSIGNED NULL,
  bracket_album_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (bracket_song_id),
  KEY idx_bracket_song_position (bracket_id, position),
  UNIQUE KEY uq_bracket_song_id (bracket_id, bracket_song_id),
  UNIQUE KEY uq_bracket_song (bracket_id, song_id),
  UNIQUE KEY uq_bracket_region_seed (bracket_id, region_number, seed_number),
  CONSTRAINT chk_bracket_song_region CHECK (region_number BETWEEN 1 AND 8),
  CONSTRAINT chk_bracket_song_seed CHECK (seed_number BETWEEN 1 AND 16),
  CONSTRAINT fk_bracket_song_album FOREIGN KEY (bracket_id,bracket_album_id) REFERENCES bracket_albums(bracket_id,bracket_album_id),
  CONSTRAINT fk_bracket_songs_bracket FOREIGN KEY (bracket_id)
    REFERENCES brackets (bracket_id),
  CONSTRAINT fk_bracket_songs_song FOREIGN KEY (song_id)
    REFERENCES songs (song_id)
) ENGINE=InnoDB;

CREATE TABLE bracket_rounds (
  randomized_at DATETIME(6) NULL,
  round_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  round_number SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (round_id),
  UNIQUE KEY uq_bracket_round_number (bracket_id, round_number),
  UNIQUE KEY uq_round_bracket_pair (bracket_id, round_id),
  CONSTRAINT fk_rounds_bracket FOREIGN KEY (bracket_id)
    REFERENCES brackets (bracket_id)
) ENGINE=InnoDB;

CREATE TABLE bracket_finale_sessions (
  bracket_id BIGINT UNSIGNED NOT NULL,
  started_by_user_id BIGINT UNSIGNED NOT NULL,
  start_round_number SMALLINT UNSIGNED NOT NULL,
  status ENUM('active', 'paused', 'complete') NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (bracket_id),
  CONSTRAINT fk_finale_bracket FOREIGN KEY (bracket_id) REFERENCES brackets (bracket_id) ON DELETE CASCADE,
  CONSTRAINT fk_finale_admin FOREIGN KEY (started_by_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_finale_round FOREIGN KEY (bracket_id, start_round_number) REFERENCES bracket_rounds (bracket_id, round_number)
) ENGINE=InnoDB;

-- A round can span multiple voting weeks. Put the deadline on each week so a
-- 32-game round can be scheduled as two matchups per week.
CREATE TABLE bracket_weeks (
  week_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  round_id BIGINT UNSIGNED NOT NULL,
  week_number SMALLINT UNSIGNED NOT NULL,
  opens_at DATETIME(6) NULL,
  closes_at DATETIME(6) NULL,
  PRIMARY KEY (week_id),
  UNIQUE KEY uq_bracket_week_number (bracket_id, week_number),
  UNIQUE KEY uq_bracket_week_pair (bracket_id, week_id),
  UNIQUE KEY uq_week_bracket_pair (week_id, bracket_id),
  CONSTRAINT chk_week_dates CHECK (closes_at > opens_at),
  CONSTRAINT fk_weeks_round FOREIGN KEY (bracket_id, round_id)
    REFERENCES bracket_rounds (bracket_id, round_id)
) ENGINE=InnoDB;

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

CREATE TABLE matchups (
  matchup_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NOT NULL,
  matchup_number SMALLINT UNSIGNED NOT NULL,
  song_a_entry_id BIGINT UNSIGNED NOT NULL,
  song_b_entry_id BIGINT UNSIGNED NOT NULL,
  winner_entry_id BIGINT UNSIGNED NULL,
  random_tiebreaker_vote_entry_id BIGINT UNSIGNED NULL,
  admin_tiebreaker_entry_id BIGINT UNSIGNED NULL,
  -- The winning entry is routed to slot A or B of the next matchup.
  next_matchup_id BIGINT UNSIGNED NULL,
  next_slot ENUM('A', 'B') NULL,
  PRIMARY KEY (matchup_id),
  UNIQUE KEY uq_week_matchup_number (week_id, matchup_number),
  UNIQUE KEY uq_matchup_bracket_pair (bracket_id, matchup_id),
  CONSTRAINT chk_matchup_songs_differ CHECK (song_a_entry_id <> song_b_entry_id),
  CONSTRAINT chk_winner_is_in_matchup CHECK (
    winner_entry_id IS NULL OR winner_entry_id = song_a_entry_id OR winner_entry_id = song_b_entry_id
  ),
  CONSTRAINT chk_next_slot CHECK (
    (next_matchup_id IS NULL AND next_slot IS NULL) OR
    (next_matchup_id IS NOT NULL AND next_slot IS NOT NULL)
  ),
  CONSTRAINT fk_matchups_week FOREIGN KEY (week_id, bracket_id)
    REFERENCES bracket_weeks (week_id, bracket_id),
  CONSTRAINT fk_matchups_song_a FOREIGN KEY (bracket_id, song_a_entry_id)
    REFERENCES bracket_songs (bracket_id, bracket_song_id),
  CONSTRAINT fk_matchups_song_b FOREIGN KEY (bracket_id, song_b_entry_id)
    REFERENCES bracket_songs (bracket_id, bracket_song_id),
  CONSTRAINT fk_matchups_winner FOREIGN KEY (bracket_id, winner_entry_id)
    REFERENCES bracket_songs (bracket_id, bracket_song_id),
  CONSTRAINT fk_matchups_next FOREIGN KEY (next_matchup_id)
    REFERENCES matchups (matchup_id)
) ENGINE=InnoDB;

CREATE TABLE matchup_reported_totals (
  bracket_id BIGINT UNSIGNED NOT NULL,
  matchup_id BIGINT UNSIGNED NOT NULL,
  votes_a SMALLINT UNSIGNED NOT NULL,
  votes_b SMALLINT UNSIGNED NOT NULL,
  source_note VARCHAR(500) NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bracket_id,matchup_id),
  CONSTRAINT fk_reported_totals_matchup FOREIGN KEY (bracket_id,matchup_id) REFERENCES matchups(bracket_id,matchup_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE votes (
  vote_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  matchup_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  selected_entry_id BIGINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NULL,
  -- NULL means the vote is still a draft. Set this when the user submits.
  submitted_at DATETIME NULL,
  PRIMARY KEY (vote_id),
  UNIQUE KEY uq_vote_per_user_per_matchup (matchup_id, user_id),
  KEY ix_votes_bracket_matchup (bracket_id, matchup_id),
  KEY ix_votes_user (user_id),
  CONSTRAINT fk_votes_matchup_bracket FOREIGN KEY (bracket_id, matchup_id)
    REFERENCES matchups (bracket_id, matchup_id),
  CONSTRAINT fk_votes_user FOREIGN KEY (user_id)
    REFERENCES users (user_id),
  CONSTRAINT fk_votes_selected_song FOREIGN KEY (selected_entry_id)
    REFERENCES bracket_songs (bracket_song_id)
) ENGINE=InnoDB;

-- Enforce that a vote selects one of the two songs in that matchup.
DELIMITER $$

CREATE TRIGGER votes_validate_insert
BEFORE INSERT ON votes
FOR EACH ROW
BEGIN
  DECLARE option_a BIGINT UNSIGNED;
  DECLARE option_b BIGINT UNSIGNED;
  SELECT song_a_entry_id, song_b_entry_id
    INTO option_a, option_b
    FROM matchups
    WHERE matchup_id = NEW.matchup_id;
  IF NEW.selected_entry_id <> option_a AND NEW.selected_entry_id <> option_b THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The selected song must be one of this matchup’s songs';
  END IF;
END$$

CREATE TRIGGER votes_validate_update
BEFORE UPDATE ON votes
FOR EACH ROW
BEGIN
  DECLARE option_a BIGINT UNSIGNED;
  DECLARE option_b BIGINT UNSIGNED;
  SELECT song_a_entry_id, song_b_entry_id
    INTO option_a, option_b
    FROM matchups
    WHERE matchup_id = NEW.matchup_id;
  IF NEW.selected_entry_id <> option_a AND NEW.selected_entry_id <> option_b THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The selected song must be one of this matchup’s songs';
  END IF;
END$$

DELIMITER ;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  KEY ix_password_reset_user (user_id, created_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
