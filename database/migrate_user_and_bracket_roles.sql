-- Run once after migrate_bracket_invitations.sql, while the old app is stopped.
-- MySQL DDL commits automatically: take a backup before applying.
ALTER TABLE users CHANGE COLUMN `role` user_role ENUM('owner','member','super','viewer') NULL;
UPDATE users SET user_role=CASE user_role WHEN 'owner' THEN 'super' WHEN 'member' THEN 'viewer' ELSE user_role END;
ALTER TABLE users MODIFY COLUMN user_role ENUM('super','viewer') NULL;
ALTER TABLE bracket_members ADD COLUMN bracket_role ENUM('member','commissioner') NOT NULL DEFAULT 'member';
UPDATE bracket_members bm JOIN users u ON u.user_id=bm.user_id
SET bm.bracket_role='commissioner' WHERE u.user_role='super';
