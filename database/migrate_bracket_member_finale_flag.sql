USE music_bracket;

ALTER TABLE bracket_members
  ADD COLUMN finale_participant BOOLEAN NOT NULL DEFAULT TRUE AFTER user_id;

-- Preserve users with historical ballots as general bracket participants.
INSERT IGNORE INTO bracket_members (bracket_id, family_id, user_id, finale_participant)
SELECT DISTINCT v.bracket_id, b.family_id, v.user_id, TRUE
FROM votes AS v
JOIN brackets AS b ON b.bracket_id = v.bracket_id
JOIN users AS u ON u.user_id = v.user_id AND u.family_id = b.family_id;
