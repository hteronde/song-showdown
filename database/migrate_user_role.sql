-- Rename users.member_role to users.role without changing its values.
USE music_bracket;

ALTER TABLE users
  CHANGE COLUMN member_role `role` ENUM('owner', 'member') NULL;
