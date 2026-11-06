USE music_bracket;

ALTER TABLE bracket_members
  ADD COLUMN non_finale_participant BOOLEAN NOT NULL DEFAULT TRUE AFTER finale_participant;
