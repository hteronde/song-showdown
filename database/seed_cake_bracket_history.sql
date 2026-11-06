-- Add the completed 16-song Cake bracket shown in the history results.
-- Safe to rerun: existing bracket, songs, weeks, and matchup slots are kept.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS cake_song_seed;
DROP TEMPORARY TABLE IF EXISTS cake_matchup_seed;
DROP TEMPORARY TABLE IF EXISTS cake_round_schedule;
DROP TEMPORARY TABLE IF EXISTS cake_next_round_schedule;

CREATE TEMPORARY TABLE cake_song_seed (
  seed_number SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  album VARCHAR(200) NOT NULL,
  release_year SMALLINT UNSIGNED NOT NULL,
  youtube_url VARCHAR(2048) NOT NULL
);

INSERT INTO cake_song_seed (seed_number, title, album, release_year, youtube_url) VALUES
  (1, 'Satan Is My Motor', 'Prolonging the Magic', 1998, 'https://www.youtube.com/watch?v=Vai6YG3mYs8'),
  (2, 'Stickshifts and Safetybelts', 'Fashion Nugget', 1996, 'https://www.youtube.com/watch?v=GQANg8OnIE4'),
  (3, 'Comfort Eagle', 'Comfort Eagle', 2001, 'https://www.youtube.com/watch?v=ezoOnI95BpE'),
  (4, 'You Turn the Screws', 'Prolonging the Magic', 1998, 'https://www.youtube.com/watch?v=zejIhEP2IMc'),
  (5, 'Short Skirt/Long Jacket', 'Comfort Eagle', 2001, 'https://www.youtube.com/watch?v=X5KmB8Laemg'),
  (6, 'Cool Blue Reason', 'Prolonging the Magic', 1998, 'https://www.youtube.com/watch?v=FDGcfX5TC4I'),
  (7, 'Sheep Go to Heaven', 'Prolonging the Magic', 1998, 'https://www.youtube.com/watch?v=QJVC44zj6FI'),
  (8, 'You Part the Waters', 'Motorcade of Generosity', 1994, 'https://www.youtube.com/watch?v=7ZcjSjm5RSk'),
  (9, 'Never There', 'Prolonging the Magic', 1998, 'https://www.youtube.com/watch?v=FRZzUh9hcTo'),
  (10, 'The Distance', 'Fashion Nugget', 1996, 'https://www.youtube.com/watch?v=F_HoMkkRHv8'),
  (11, 'Rock N'' Roll Lifestyle', 'Motorcade of Generosity', 1994, 'https://www.youtube.com/watch?v=2BW6CVqJNdU'),
  (12, 'Meanwhile, Rick James...', 'Comfort Eagle', 2001, 'https://www.youtube.com/watch?v=anKd4-jpeII'),
  (13, 'Nugget', 'Fashion Nugget', 1996, 'https://www.youtube.com/watch?v=ov3Lh_ELdkI'),
  (14, 'Shadow Stabbing', 'Comfort Eagle', 2001, 'https://www.youtube.com/watch?v=xEGiLVhTDB4'),
  (15, 'Comanche', 'Motorcade of Generosity', 1994, 'https://www.youtube.com/watch?v=Fxm-EUh1ueU'),
  (16, 'Let Me Go', 'Prolonging the Magic', 1998, 'https://www.youtube.com/watch?v=ClIV5paa1pg');

SET @cake_family_id = (
  SELECT family_id FROM families WHERE name = 'Morgan' ORDER BY family_id LIMIT 1
);
SET @cake_owner_id = (
  SELECT user_id FROM users WHERE family_id = @cake_family_id ORDER BY user_id LIMIT 1
);

INSERT INTO songs (artist, title)
SELECT 'Cake', seed.title
FROM cake_song_seed AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM songs AS existing
  WHERE existing.artist = 'Cake' AND existing.title = seed.title
);

-- Refresh metadata for Cake songs already in the database, while preserving
-- any non-empty values a user may have supplied.
UPDATE songs AS existing
JOIN cake_song_seed AS seed ON seed.title = existing.title
SET existing.album = seed.album,
    existing.`year` = seed.release_year,
    existing.youtube_url = seed.youtube_url
WHERE existing.artist = 'Cake';

INSERT INTO brackets (family_id, created_by_user_id, title, artist, status, completed_at)
SELECT @cake_family_id, @cake_owner_id, 'Cake Bracket', 'Cake', 'complete', CURRENT_TIMESTAMP
WHERE @cake_family_id IS NOT NULL
  AND @cake_owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM brackets
    WHERE family_id = @cake_family_id AND title = 'Cake Bracket' AND artist = 'Cake'
  );

SET @cake_bracket_id = (
  SELECT bracket_id FROM brackets
  WHERE family_id = @cake_family_id AND title = 'Cake Bracket' AND artist = 'Cake'
  ORDER BY bracket_id LIMIT 1
);

UPDATE brackets
SET status = 'complete', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
WHERE bracket_id = @cake_bracket_id;

INSERT INTO bracket_songs (bracket_id, region_number, song_id, seed_number)
SELECT @cake_bracket_id, 1, song.song_id, seed.seed_number
FROM cake_song_seed AS seed
JOIN songs AS song ON song.artist = 'Cake' AND song.title = seed.title
LEFT JOIN bracket_songs AS existing
  ON existing.bracket_id = @cake_bracket_id AND existing.song_id = song.song_id
WHERE existing.bracket_song_id IS NULL;

INSERT INTO bracket_rounds (bracket_id, round_number, name)
SELECT @cake_bracket_id, schedule.round_number, schedule.round_name
FROM (
  SELECT 1 AS round_number, 'Round of 16' AS round_name
  UNION ALL SELECT 2, 'Quarterfinals'
  UNION ALL SELECT 3, 'Semifinals'
  UNION ALL SELECT 4, 'Championship'
) AS schedule
LEFT JOIN bracket_rounds AS existing
  ON existing.bracket_id = @cake_bracket_id
 AND existing.round_number = schedule.round_number
WHERE existing.round_id IS NULL;

CREATE TEMPORARY TABLE cake_round_schedule (
  round_number SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  first_week SMALLINT UNSIGNED NOT NULL
);

INSERT INTO cake_round_schedule (round_number, first_week) VALUES
  (1, 1), (2, 5), (3, 7), (4, 8);

CREATE TEMPORARY TABLE cake_next_round_schedule LIKE cake_round_schedule;
INSERT INTO cake_next_round_schedule SELECT * FROM cake_round_schedule;

INSERT INTO bracket_weeks (bracket_id, round_id, week_number, opens_at, closes_at)
SELECT @cake_bracket_id, round_row.round_id,
       schedule.first_week + offset_weeks.week_offset, NULL, NULL
FROM cake_round_schedule AS schedule
JOIN bracket_rounds AS round_row
  ON round_row.bracket_id = @cake_bracket_id
 AND round_row.round_number = schedule.round_number
JOIN (
  SELECT 0 AS week_offset
  UNION ALL SELECT 1
  UNION ALL SELECT 2
  UNION ALL SELECT 3
) AS offset_weeks
  ON offset_weeks.week_offset < CASE schedule.round_number
    WHEN 1 THEN 4
    WHEN 2 THEN 2
    WHEN 3 THEN 1
    ELSE 1
  END
LEFT JOIN bracket_weeks AS existing
  ON existing.bracket_id = @cake_bracket_id
 AND existing.week_number = schedule.first_week + offset_weeks.week_offset
WHERE existing.week_id IS NULL;

CREATE TEMPORARY TABLE cake_matchup_seed (
  round_number SMALLINT UNSIGNED NOT NULL,
  game_number SMALLINT UNSIGNED NOT NULL,
  song_a_title VARCHAR(200) NOT NULL,
  song_b_title VARCHAR(200) NOT NULL,
  winner_title VARCHAR(200) NOT NULL,
  PRIMARY KEY (round_number, game_number)
);

INSERT INTO cake_matchup_seed
  (round_number, game_number, song_a_title, song_b_title, winner_title)
VALUES
  (1, 1, 'Satan Is My Motor', 'Stickshifts and Safetybelts', 'Satan Is My Motor'),
  (1, 2, 'Comfort Eagle', 'You Turn the Screws', 'Comfort Eagle'),
  (1, 3, 'Short Skirt/Long Jacket', 'Cool Blue Reason', 'Short Skirt/Long Jacket'),
  (1, 4, 'Sheep Go to Heaven', 'You Part the Waters', 'Sheep Go to Heaven'),
  (1, 5, 'Never There', 'The Distance', 'Never There'),
  (1, 6, 'Rock N'' Roll Lifestyle', 'Meanwhile, Rick James...', 'Rock N'' Roll Lifestyle'),
  (1, 7, 'Nugget', 'Shadow Stabbing', 'Nugget'),
  (1, 8, 'Comanche', 'Let Me Go', 'Let Me Go'),
  (2, 1, 'Satan Is My Motor', 'Comfort Eagle', 'Comfort Eagle'),
  (2, 2, 'Short Skirt/Long Jacket', 'Sheep Go to Heaven', 'Short Skirt/Long Jacket'),
  (2, 3, 'Never There', 'Rock N'' Roll Lifestyle', 'Never There'),
  (2, 4, 'Nugget', 'Let Me Go', 'Nugget'),
  (3, 1, 'Comfort Eagle', 'Short Skirt/Long Jacket', 'Comfort Eagle'),
  (3, 2, 'Never There', 'Nugget', 'Never There'),
  (4, 1, 'Comfort Eagle', 'Never There', 'Never There');

START TRANSACTION;

INSERT INTO matchups (
  bracket_id, week_id, matchup_number,
  song_a_entry_id, song_b_entry_id, winner_entry_id
)
SELECT
  @cake_bracket_id,
  target_week.week_id,
  MOD(seed.game_number - 1, 2) + 1,
  entry_a.bracket_song_id,
  entry_b.bracket_song_id,
  winner.bracket_song_id
FROM cake_matchup_seed AS seed
JOIN cake_round_schedule AS schedule
  ON schedule.round_number = seed.round_number
JOIN bracket_rounds AS target_round
  ON target_round.bracket_id = @cake_bracket_id
 AND target_round.round_number = seed.round_number
JOIN bracket_weeks AS target_week
  ON target_week.bracket_id = @cake_bracket_id
 AND target_week.round_id = target_round.round_id
 AND target_week.week_number = schedule.first_week + FLOOR((seed.game_number - 1) / 2)
JOIN bracket_songs AS entry_a
  ON entry_a.bracket_id = @cake_bracket_id
JOIN songs AS song_a
  ON song_a.song_id = entry_a.song_id
 AND song_a.title = seed.song_a_title
JOIN bracket_songs AS entry_b
  ON entry_b.bracket_id = @cake_bracket_id
JOIN songs AS song_b
  ON song_b.song_id = entry_b.song_id
 AND song_b.title = seed.song_b_title
JOIN bracket_songs AS winner
  ON winner.bracket_id = @cake_bracket_id
JOIN songs AS winning_song
  ON winning_song.song_id = winner.song_id
 AND winning_song.title = seed.winner_title
LEFT JOIN matchups AS existing
  ON existing.week_id = target_week.week_id
 AND existing.matchup_number = MOD(seed.game_number - 1, 2) + 1
WHERE existing.matchup_id IS NULL;

-- Keep winner values aligned with the supplied results if this seed is rerun.
UPDATE matchups AS target
JOIN bracket_weeks AS target_week
  ON target_week.week_id = target.week_id
 AND target_week.bracket_id = target.bracket_id
JOIN bracket_rounds AS target_round
  ON target_round.round_id = target_week.round_id
 AND target_round.bracket_id = target.bracket_id
JOIN cake_round_schedule AS schedule
  ON schedule.round_number = target_round.round_number
JOIN cake_matchup_seed AS seed
  ON seed.round_number = target_round.round_number
 AND target_week.week_number = schedule.first_week + FLOOR((seed.game_number - 1) / 2)
 AND target.matchup_number = MOD(seed.game_number - 1, 2) + 1
JOIN bracket_songs AS entry_a
  ON entry_a.bracket_id = @cake_bracket_id
JOIN songs AS song_a
  ON song_a.song_id = entry_a.song_id
 AND song_a.title = seed.song_a_title
JOIN bracket_songs AS entry_b
  ON entry_b.bracket_id = @cake_bracket_id
JOIN songs AS song_b
  ON song_b.song_id = entry_b.song_id
 AND song_b.title = seed.song_b_title
JOIN bracket_songs AS winner
  ON winner.bracket_id = @cake_bracket_id
JOIN songs AS winning_song
  ON winning_song.song_id = winner.song_id
 AND winning_song.title = seed.winner_title
SET target.song_a_entry_id = entry_a.bracket_song_id,
    target.song_b_entry_id = entry_b.bracket_song_id,
    target.winner_entry_id = winner.bracket_song_id
WHERE target.bracket_id = @cake_bracket_id;

UPDATE matchups AS parent
JOIN bracket_weeks AS parent_week
  ON parent_week.week_id = parent.week_id
 AND parent_week.bracket_id = parent.bracket_id
JOIN bracket_rounds AS parent_round
  ON parent_round.round_id = parent_week.round_id
 AND parent_round.bracket_id = parent.bracket_id
JOIN cake_round_schedule AS parent_schedule
  ON parent_schedule.round_number = parent_round.round_number
JOIN cake_next_round_schedule AS next_schedule
  ON next_schedule.round_number = parent_round.round_number + 1
JOIN bracket_rounds AS next_round
  ON next_round.bracket_id = parent.bracket_id
 AND next_round.round_number = next_schedule.round_number
JOIN bracket_weeks AS next_week
  ON next_week.bracket_id = parent.bracket_id
 AND next_week.round_id = next_round.round_id
 AND next_week.week_number = next_schedule.first_week + FLOOR((
   FLOOR(((parent_week.week_number - parent_schedule.first_week) * 2 + parent.matchup_number + 1) / 2) - 1
 ) / 2)
JOIN matchups AS next_game
  ON next_game.week_id = next_week.week_id
 AND next_game.bracket_id = parent.bracket_id
 AND next_game.matchup_number = MOD(
   FLOOR(((parent_week.week_number - parent_schedule.first_week) * 2 + parent.matchup_number + 1) / 2) - 1,
   2
 ) + 1
SET parent.next_matchup_id = next_game.matchup_id,
    parent.next_slot = IF(
      MOD((parent_week.week_number - parent_schedule.first_week) * 2 + parent.matchup_number, 2) = 1,
      'A', 'B'
    )
WHERE parent.bracket_id = @cake_bracket_id
  AND parent_round.round_number BETWEEN 1 AND 3;

COMMIT;

SELECT b.bracket_id, b.title, b.artist, b.status,
       COUNT(DISTINCT bs.bracket_song_id) AS song_count,
       COUNT(DISTINCT m.matchup_id) AS matchup_count
FROM brackets AS b
LEFT JOIN bracket_songs AS bs ON bs.bracket_id = b.bracket_id
LEFT JOIN matchups AS m ON m.bracket_id = b.bracket_id
WHERE b.bracket_id = @cake_bracket_id
GROUP BY b.bracket_id, b.title, b.artist, b.status;

DROP TEMPORARY TABLE cake_matchup_seed;
DROP TEMPORARY TABLE cake_song_seed;
DROP TEMPORARY TABLE cake_round_schedule;
DROP TEMPORARY TABLE cake_next_round_schedule;
