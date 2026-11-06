-- Preserve the existing displayed order for every bracket.
ALTER TABLE bracket_songs ADD COLUMN position SMALLINT UNSIGNED NOT NULL DEFAULT 0;
CREATE TEMPORARY TABLE bracket_song_positions AS
SELECT bracket_song_id, ROW_NUMBER() OVER (
  PARTITION BY bracket_id ORDER BY region_number, bracket_song_id
) AS song_position FROM bracket_songs;
UPDATE bracket_songs bs JOIN bracket_song_positions p USING (bracket_song_id)
SET bs.position=p.song_position;
DROP TEMPORARY TABLE bracket_song_positions;
CREATE INDEX idx_bracket_song_position ON bracket_songs (bracket_id, position);
