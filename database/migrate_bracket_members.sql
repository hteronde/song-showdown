-- Add bracket-specific participation to an existing music_bracket database.
-- Existing creators and users with recorded votes are retained as participants.
USE music_bracket;

ALTER TABLE brackets
  ADD UNIQUE KEY uq_brackets_id_family (bracket_id, family_id);

CREATE TABLE bracket_members (
  bracket_id BIGINT UNSIGNED NOT NULL,
  family_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bracket_id, user_id),
  CONSTRAINT fk_bracket_members_bracket FOREIGN KEY (bracket_id, family_id)
    REFERENCES brackets (bracket_id, family_id),
  CONSTRAINT fk_bracket_members_family_member FOREIGN KEY (family_id, user_id)
    REFERENCES family_members (family_id, user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO bracket_members (bracket_id, family_id, user_id)
SELECT b.bracket_id, b.family_id, b.created_by_user_id
FROM brackets AS b
JOIN family_members AS fm
  ON fm.family_id = b.family_id
 AND fm.user_id = b.created_by_user_id;

INSERT IGNORE INTO bracket_members (bracket_id, family_id, user_id)
SELECT DISTINCT b.bracket_id, b.family_id, v.user_id
FROM votes AS v
JOIN matchups AS m
  ON m.matchup_id = v.matchup_id
JOIN brackets AS b
  ON b.bracket_id = m.bracket_id
JOIN family_members AS fm
  ON fm.family_id = b.family_id
 AND fm.user_id = v.user_id;
