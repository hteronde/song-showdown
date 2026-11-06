-- Create the completed Beatles history bracket for the Morgan family.
-- Safe to rerun: an existing bracket with this family/title/artist is reused.
USE music_bracket;

INSERT INTO brackets (
  family_id,
  created_by_user_id,
  title,
  artist,
  bracket_year,
  status
)
SELECT
  family.family_id,
  creator.user_id,
  'Family Beatles Bracket',
  'The Beatles',
  NULL,
  'complete'
FROM families AS family
JOIN users AS creator
  ON creator.family_id = family.family_id
WHERE family.name = 'Morgan'
  AND creator.email = 'alex@example.com'
  AND NOT EXISTS (
    SELECT 1
    FROM brackets AS existing
    WHERE existing.family_id = family.family_id
      AND existing.title = 'Family Beatles Bracket'
      AND existing.artist = 'The Beatles'
  );

INSERT IGNORE INTO bracket_members (bracket_id, family_id, user_id)
SELECT bracket.bracket_id, bracket.family_id, bracket.created_by_user_id
FROM brackets AS bracket
WHERE bracket.title = 'Family Beatles Bracket'
  AND bracket.artist = 'The Beatles'
  AND EXISTS (
    SELECT 1
    FROM families AS family
    WHERE family.family_id = bracket.family_id
      AND family.name = 'Morgan'
  );
