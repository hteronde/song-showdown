USE music_bracket;

ALTER TABLE songs ADD COLUMN album_cover_url VARCHAR(2048) NULL AFTER spotify_url;
