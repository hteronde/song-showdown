-- Replace family_members with a direct, optional family assignment on users.
-- Run after migrate_bracket_members.sql on databases that already have brackets.
-- This migration assumes each user has at most one family_members row.
USE music_bracket;

ALTER TABLE users
  ADD COLUMN family_id BIGINT UNSIGNED NULL,
  ADD COLUMN `role` ENUM('owner', 'member') NULL,
  ADD COLUMN family_joined_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  ADD UNIQUE KEY uq_users_id_family (user_id, family_id);

UPDATE users AS u
JOIN family_members AS fm
  ON fm.user_id = u.user_id
SET u.family_id = fm.family_id,
    u.`role` = fm.member_role,
    u.family_joined_at = fm.joined_at;

UPDATE users
SET family_joined_at = NULL
WHERE family_id IS NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_family FOREIGN KEY (family_id)
    REFERENCES families (family_id);

ALTER TABLE bracket_members
  DROP FOREIGN KEY fk_bracket_members_family_member,
  ADD CONSTRAINT fk_bracket_members_user_family FOREIGN KEY (user_id, family_id)
    REFERENCES users (user_id, family_id)
    ON DELETE CASCADE;

DROP TABLE family_members;
