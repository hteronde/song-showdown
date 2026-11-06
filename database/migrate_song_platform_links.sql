-- Add shared YouTube and Spotify links to catalog songs.
USE music_bracket;

ALTER TABLE songs
  ADD COLUMN youtube_url VARCHAR(2048) NULL AFTER category,
  ADD COLUMN spotify_url VARCHAR(2048) NULL AFTER youtube_url;
