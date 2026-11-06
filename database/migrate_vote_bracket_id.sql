USE music_bracket;

ALTER TABLE votes
  ADD COLUMN bracket_id BIGINT UNSIGNED NULL AFTER vote_id;

UPDATE votes AS v
JOIN matchups AS m ON m.matchup_id = v.matchup_id
SET v.bracket_id = m.bracket_id;

ALTER TABLE votes
  MODIFY bracket_id BIGINT UNSIGNED NOT NULL,
  DROP FOREIGN KEY fk_votes_matchup,
  ADD KEY ix_votes_bracket_matchup (bracket_id, matchup_id),
  ADD CONSTRAINT fk_votes_matchup_bracket
    FOREIGN KEY (bracket_id, matchup_id)
    REFERENCES matchups (bracket_id, matchup_id);
