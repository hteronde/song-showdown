-- Development-only family and profile records for the prototype.
-- The example.com addresses are placeholders, not real login addresses.
-- Safe to rerun: existing sample profiles are reused and assigned to Morgan.

USE music_bracket;

START TRANSACTION;

INSERT INTO families (name)
SELECT 'Morgan'
WHERE NOT EXISTS (
  SELECT 1 FROM families WHERE name = 'Morgan'
);

SET @morgan_family_id = (
  SELECT family_id
  FROM families
  WHERE name = 'Morgan'
  ORDER BY family_id
  LIMIT 1
);

INSERT INTO users (family_id, email, display_name, `user_role`)
SELECT @morgan_family_id, 'alex@example.com', 'Alex Morgan', 'super'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'alex@example.com');

INSERT INTO users (family_id, email, display_name, `user_role`)
SELECT @morgan_family_id, 'sam@example.com', 'Sam Morgan', 'viewer'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'sam@example.com');

INSERT INTO users (family_id, email, display_name, `user_role`)
SELECT @morgan_family_id, 'jules@example.com', 'Jules Morgan', 'viewer'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'jules@example.com');

INSERT INTO users (family_id, email, display_name, `user_role`)
SELECT @morgan_family_id, 'mama@example.com', 'Mama', 'viewer'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'mama@example.com');

UPDATE users
SET family_id = @morgan_family_id,
    `user_role` = CASE WHEN email = 'alex@example.com' THEN 'super' ELSE 'viewer' END
WHERE email IN (
  'alex@example.com',
  'sam@example.com',
  'jules@example.com',
  'mama@example.com'
);

COMMIT;
