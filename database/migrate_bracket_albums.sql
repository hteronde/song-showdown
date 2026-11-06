USE music_bracket;

CREATE TABLE IF NOT EXISTS bracket_albums (
  bracket_album_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bracket_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  `year` SMALLINT UNSIGNED NULL,
  album_cover_url VARCHAR(2048) NULL,
  PRIMARY KEY (bracket_album_id),
  UNIQUE KEY uq_bracket_album_title (bracket_id,title),
  UNIQUE KEY uq_bracket_album_pair (bracket_id,bracket_album_id),
  CONSTRAINT fk_albums_bracket FOREIGN KEY (bracket_id) REFERENCES brackets(bracket_id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE bracket_songs ADD COLUMN bracket_album_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_bracket_song_album FOREIGN KEY (bracket_id,bracket_album_id) REFERENCES bracket_albums(bracket_id,bracket_album_id);

INSERT IGNORE INTO bracket_albums (bracket_id,title,`year`,album_cover_url)
SELECT bs.bracket_id,s.album,
  CASE WHEN COUNT(DISTINCT s.year)=1 THEN MIN(s.year) ELSE NULL END,
  CASE WHEN COUNT(DISTINCT NULLIF(s.album_cover_url,''))=1 THEN MAX(NULLIF(s.album_cover_url,'')) ELSE NULL END
FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id
WHERE s.album IS NOT NULL AND TRIM(s.album)<>'' GROUP BY bs.bracket_id,s.album;

UPDATE bracket_songs bs JOIN songs s ON s.song_id=bs.song_id
JOIN bracket_albums ba ON ba.bracket_id=bs.bracket_id AND ba.title=s.album
SET bs.bracket_album_id=ba.bracket_album_id WHERE bs.bracket_album_id IS NULL;
