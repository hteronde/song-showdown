-- Record the completed 32-song Led Zeppelin bracket and its supplied results.
-- Safe to rerun: songs, bracket entries, rounds, weeks, and matchup slots are reused.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS led_song_seed;
DROP TEMPORARY TABLE IF EXISTS led_matchup_seed;
DROP TEMPORARY TABLE IF EXISTS led_round_schedule;
DROP TEMPORARY TABLE IF EXISTS led_next_round_schedule;

CREATE TEMPORARY TABLE led_song_seed (
  region_number TINYINT UNSIGNED NOT NULL,
  seed_number TINYINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  album VARCHAR(200) NOT NULL,
  release_year SMALLINT UNSIGNED NOT NULL,
  youtube_url VARCHAR(2048) NOT NULL,
  PRIMARY KEY (region_number, seed_number),
  UNIQUE KEY uq_led_song_title (title)
);

INSERT INTO led_song_seed
  (region_number, seed_number, title, album, release_year, youtube_url)
VALUES
  (1, 1, 'Stairway to Heaven', 'Led Zeppelin IV', 1971, 'https://www.youtube.com/watch?v=QkF3oxziUI4'),
  (1, 8, 'In the Light', 'Physical Graffiti', 1975, 'https://www.youtube.com/watch?v=PTLSvw6xTPM'),
  (1, 4, 'All My Love', 'In Through the Out Door', 1979, 'https://www.youtube.com/watch?v=vwFz3EThGMU'),
  (1, 5, 'Tangerine', 'Led Zeppelin III', 1970, 'https://www.youtube.com/watch?v=KaFjxLMsOuo'),
  (1, 3, 'Babe, I''m Gonna Leave You', 'Led Zeppelin', 1969, 'https://www.youtube.com/watch?v=zX_wwlIZ6ko'),
  (1, 6, 'The Ocean', 'Houses of the Holy', 1973, 'https://www.youtube.com/watch?v=oqAmnEKlIZw'),
  (1, 2, 'Good Times Bad Times', 'Led Zeppelin', 1969, 'https://www.youtube.com/watch?v=TA9Rec1qAFQ'),
  (1, 7, 'Houses of the Holy', 'Physical Graffiti', 1975, 'https://www.youtube.com/watch?v=Ncp1RtdO94I'),
  (2, 1, 'Immigrant Song', 'Led Zeppelin III', 1970, 'https://www.youtube.com/watch?v=P3Y8OWkiUts'),
  (2, 8, 'I''m Gonna Crawl', 'In Through the Out Door', 1979, 'https://www.youtube.com/watch?v=F_qci-Gd-2Q'),
  (2, 4, 'Over the Hills and Far Away', 'Houses of the Holy', 1973, 'https://www.youtube.com/watch?v=Am9gu4wkY9E'),
  (2, 5, 'Communication Breakdown', 'Led Zeppelin', 1969, 'https://www.youtube.com/watch?v=2atkj_KWLl0'),
  (2, 3, 'Going to California', 'Led Zeppelin IV', 1971, 'https://www.youtube.com/watch?v=NrUIJY_Xu2s'),
  (2, 6, 'What Is and What Should Never Be', 'Led Zeppelin II', 1969, 'https://www.youtube.com/watch?v=LiczyhDwuBs'),
  (2, 2, 'Rock and Roll', 'Led Zeppelin IV', 1971, 'https://www.youtube.com/watch?v=D2lSwosw9xY'),
  (2, 7, 'You Shook Me', 'Led Zeppelin', 1969, 'https://www.youtube.com/watch?v=zWPM47aPNUM'),
  (3, 1, 'Black Dog', 'Led Zeppelin IV', 1971, 'https://www.youtube.com/watch?v=2KPEHohJMuw'),
  (3, 8, 'In the Evening', 'In Through the Out Door', 1979, 'https://www.youtube.com/watch?v=bJSJavz1AOM'),
  (3, 4, 'Heartbreaker', 'Led Zeppelin II', 1969, 'https://www.youtube.com/watch?v=e5O4073zCKA'),
  (3, 5, 'No Quarter', 'Houses of the Holy', 1973, 'https://www.youtube.com/watch?v=_vG_mTt6hCs'),
  (3, 3, 'D''yer Mak''er', 'Houses of the Holy', 1973, 'https://www.youtube.com/watch?v=rwy07azI8nc'),
  (3, 6, 'The Rain Song', 'Houses of the Holy', 1973, 'https://www.youtube.com/watch?v=g8VduT7aR2c'),
  (3, 2, 'Ramble On', 'Led Zeppelin II', 1969, 'https://www.youtube.com/watch?v=LzGBQerkvWs'),
  (3, 7, 'Misty Mountain Hop', 'Led Zeppelin IV', 1971, 'https://www.youtube.com/watch?v=y6M3YQ_EF2E'),
  (4, 1, 'Whole Lotta Love', 'Led Zeppelin II', 1969, 'https://www.youtube.com/watch?v=HibBnC6SVk8'),
  (4, 8, 'Black Mountain Side', 'Led Zeppelin', 1969, 'https://www.youtube.com/watch?v=sUFCkM-tNUQ'),
  (4, 4, 'Dazed and Confused', 'Led Zeppelin', 1969, 'https://www.youtube.com/watch?v=w772GXG5LnE'),
  (4, 5, 'Since I''ve Been Loving You', 'Led Zeppelin III', 1970, 'https://www.youtube.com/watch?v=vcIem-L398w'),
  (4, 3, 'When the Levee Breaks', 'Led Zeppelin IV', 1971, 'https://www.youtube.com/watch?v=JM3fodiK9rY'),
  (4, 6, 'Thank You', 'Led Zeppelin II', 1969, 'https://www.youtube.com/watch?v=12KbOAc8vmk'),
  (4, 2, 'Kashmir', 'Physical Graffiti', 1975, 'https://www.youtube.com/watch?v=ww9484EM2OQ'),
  (4, 7, 'The Lemon Song', 'Led Zeppelin II', 1969, 'https://www.youtube.com/watch?v=8gWbKAcuzN8');

CREATE TEMPORARY TABLE led_matchup_seed (
  round_number TINYINT UNSIGNED NOT NULL,
  game_number TINYINT UNSIGNED NOT NULL,
  song_a_title VARCHAR(200) NOT NULL,
  song_b_title VARCHAR(200) NOT NULL,
  winner_title VARCHAR(200) NOT NULL,
  PRIMARY KEY (round_number, game_number)
);

INSERT INTO led_matchup_seed
  (round_number, game_number, song_a_title, song_b_title, winner_title)
VALUES
  (1, 1, 'Stairway to Heaven', 'In the Light', 'Stairway to Heaven'),
  (1, 2, 'All My Love', 'Tangerine', 'All My Love'),
  (1, 3, 'Babe, I''m Gonna Leave You', 'The Ocean', 'The Ocean'),
  (1, 4, 'Good Times Bad Times', 'Houses of the Holy', 'Good Times Bad Times'),
  (1, 5, 'Immigrant Song', 'I''m Gonna Crawl', 'Immigrant Song'),
  (1, 6, 'Over the Hills and Far Away', 'Communication Breakdown', 'Over the Hills and Far Away'),
  (1, 7, 'Going to California', 'What Is and What Should Never Be', 'What Is and What Should Never Be'),
  (1, 8, 'Rock and Roll', 'You Shook Me', 'You Shook Me'),
  (1, 9, 'Black Dog', 'In the Evening', 'Black Dog'),
  (1, 10, 'Heartbreaker', 'No Quarter', 'Heartbreaker'),
  (1, 11, 'D''yer Mak''er', 'The Rain Song', 'D''yer Mak''er'),
  (1, 12, 'Ramble On', 'Misty Mountain Hop', 'Ramble On'),
  (1, 13, 'Whole Lotta Love', 'Black Mountain Side', 'Whole Lotta Love'),
  (1, 14, 'Dazed and Confused', 'Since I''ve Been Loving You', 'Dazed and Confused'),
  (1, 15, 'When the Levee Breaks', 'Thank You', 'When the Levee Breaks'),
  (1, 16, 'Kashmir', 'The Lemon Song', 'Kashmir'),

  (2, 1, 'Stairway to Heaven', 'All My Love', 'Stairway to Heaven'),
  (2, 2, 'The Ocean', 'Good Times Bad Times', 'The Ocean'),
  (2, 3, 'Immigrant Song', 'Over the Hills and Far Away', 'Over the Hills and Far Away'),
  (2, 4, 'What Is and What Should Never Be', 'You Shook Me', 'What Is and What Should Never Be'),
  (2, 5, 'Black Dog', 'Heartbreaker', 'Heartbreaker'),
  (2, 6, 'D''yer Mak''er', 'Ramble On', 'Ramble On'),
  (2, 7, 'Whole Lotta Love', 'Dazed and Confused', 'Dazed and Confused'),
  (2, 8, 'When the Levee Breaks', 'Kashmir', 'Kashmir'),

  (3, 1, 'Stairway to Heaven', 'The Ocean', 'Stairway to Heaven'),
  (3, 2, 'Over the Hills and Far Away', 'What Is and What Should Never Be', 'What Is and What Should Never Be'),
  (3, 3, 'Heartbreaker', 'Ramble On', 'Ramble On'),
  (3, 4, 'Dazed and Confused', 'Kashmir', 'Kashmir'),

  (4, 1, 'Stairway to Heaven', 'What Is and What Should Never Be', 'What Is and What Should Never Be'),
  (4, 2, 'Ramble On', 'Kashmir', 'Kashmir'),
  (5, 1, 'What Is and What Should Never Be', 'Kashmir', 'Kashmir');

SET @led_bracket_id = (
  SELECT bracket_id FROM brackets
  WHERE artist = 'Led Zeppelin'
    AND family_id = (SELECT family_id FROM families WHERE name = 'Morgan' ORDER BY family_id LIMIT 1)
  ORDER BY bracket_id LIMIT 1
);

-- Fill the existing placeholder bracket, or restore it to a completed state.
UPDATE brackets
SET status = 'complete', completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
WHERE bracket_id = @led_bracket_id;

INSERT INTO songs (artist, title)
SELECT 'Led Zeppelin', seed.title
FROM led_song_seed AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM songs AS existing
  WHERE existing.artist = 'Led Zeppelin' AND existing.title = seed.title
);

UPDATE songs AS existing
JOIN led_song_seed AS seed ON seed.title = existing.title
SET existing.album = seed.album,
    existing.`year` = seed.release_year,
    existing.youtube_url = seed.youtube_url
WHERE existing.artist = 'Led Zeppelin';

INSERT INTO bracket_songs (bracket_id, region_number, song_id, seed_number)
SELECT @led_bracket_id, seed.region_number, song.song_id, seed.seed_number
FROM led_song_seed AS seed
JOIN songs AS song ON song.artist = 'Led Zeppelin' AND song.title = seed.title
LEFT JOIN bracket_songs AS existing
  ON existing.bracket_id = @led_bracket_id
 AND existing.region_number = seed.region_number
 AND existing.seed_number = seed.seed_number
WHERE @led_bracket_id IS NOT NULL
  AND existing.bracket_song_id IS NULL;

INSERT INTO bracket_rounds (bracket_id, round_number, name)
SELECT @led_bracket_id, schedule.round_number, schedule.round_name
FROM (
  SELECT 1 AS round_number, 'Round of 32' AS round_name
  UNION ALL SELECT 2, 'Round of 16'
  UNION ALL SELECT 3, 'Quarterfinals'
  UNION ALL SELECT 4, 'Semifinals'
  UNION ALL SELECT 5, 'Championship'
) AS schedule
LEFT JOIN bracket_rounds AS existing
  ON existing.bracket_id = @led_bracket_id
 AND existing.round_number = schedule.round_number
WHERE @led_bracket_id IS NOT NULL
  AND existing.round_id IS NULL;

CREATE TEMPORARY TABLE led_round_schedule (
  round_number TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  first_week SMALLINT UNSIGNED NOT NULL
);

INSERT INTO led_round_schedule (round_number, first_week) VALUES
  (1, 1), (2, 9), (3, 13), (4, 15), (5, 16);

CREATE TEMPORARY TABLE led_next_round_schedule LIKE led_round_schedule;
INSERT INTO led_next_round_schedule SELECT * FROM led_round_schedule;

INSERT INTO bracket_weeks (bracket_id, round_id, week_number, opens_at, closes_at)
SELECT @led_bracket_id, round_row.round_id,
       schedule.first_week + week_offset.offset_number,
       CURRENT_TIMESTAMP - INTERVAL 2 DAY,
       CURRENT_TIMESTAMP - INTERVAL 1 DAY
FROM led_round_schedule AS schedule
JOIN bracket_rounds AS round_row
  ON round_row.bracket_id = @led_bracket_id
 AND round_row.round_number = schedule.round_number
JOIN (
  SELECT 0 AS offset_number UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
) AS week_offset
  ON week_offset.offset_number < CASE schedule.round_number
    WHEN 1 THEN 8 WHEN 2 THEN 4 WHEN 3 THEN 2 ELSE 1
  END
LEFT JOIN bracket_weeks AS existing
  ON existing.bracket_id = @led_bracket_id
 AND existing.week_number = schedule.first_week + week_offset.offset_number
WHERE existing.week_id IS NULL;

START TRANSACTION;

INSERT INTO matchups (
  bracket_id, week_id, matchup_number,
  song_a_entry_id, song_b_entry_id, winner_entry_id
)
SELECT
  @led_bracket_id,
  target_week.week_id,
  MOD(seed.game_number - 1, 2) + 1,
  entry_a.bracket_song_id,
  entry_b.bracket_song_id,
  winner.bracket_song_id
FROM led_matchup_seed AS seed
JOIN led_round_schedule AS schedule
  ON schedule.round_number = seed.round_number
JOIN bracket_rounds AS target_round
  ON target_round.bracket_id = @led_bracket_id
 AND target_round.round_number = seed.round_number
JOIN bracket_weeks AS target_week
  ON target_week.bracket_id = @led_bracket_id
 AND target_week.round_id = target_round.round_id
 AND target_week.week_number = schedule.first_week + FLOOR((seed.game_number - 1) / 2)
JOIN bracket_songs AS entry_a
  ON entry_a.bracket_id = @led_bracket_id
JOIN songs AS song_a
  ON song_a.song_id = entry_a.song_id AND song_a.title = seed.song_a_title
JOIN bracket_songs AS entry_b
  ON entry_b.bracket_id = @led_bracket_id
JOIN songs AS song_b
  ON song_b.song_id = entry_b.song_id AND song_b.title = seed.song_b_title
JOIN bracket_songs AS winner
  ON winner.bracket_id = @led_bracket_id
JOIN songs AS winning_song
  ON winning_song.song_id = winner.song_id AND winning_song.title = seed.winner_title
LEFT JOIN matchups AS existing
  ON existing.week_id = target_week.week_id
 AND existing.matchup_number = MOD(seed.game_number - 1, 2) + 1
WHERE existing.matchup_id IS NULL;

-- Keep the stored sides and winners aligned with the supplied results on reruns.
UPDATE matchups AS target
JOIN bracket_weeks AS target_week
  ON target_week.week_id = target.week_id AND target_week.bracket_id = target.bracket_id
JOIN bracket_rounds AS target_round
  ON target_round.round_id = target_week.round_id AND target_round.bracket_id = target.bracket_id
JOIN led_round_schedule AS schedule
  ON schedule.round_number = target_round.round_number
JOIN led_matchup_seed AS seed
  ON seed.round_number = target_round.round_number
 AND target_week.week_number = schedule.first_week + FLOOR((seed.game_number - 1) / 2)
 AND target.matchup_number = MOD(seed.game_number - 1, 2) + 1
JOIN bracket_songs AS entry_a ON entry_a.bracket_id = @led_bracket_id
JOIN songs AS song_a ON song_a.song_id = entry_a.song_id AND song_a.title = seed.song_a_title
JOIN bracket_songs AS entry_b ON entry_b.bracket_id = @led_bracket_id
JOIN songs AS song_b ON song_b.song_id = entry_b.song_id AND song_b.title = seed.song_b_title
JOIN bracket_songs AS winner ON winner.bracket_id = @led_bracket_id
JOIN songs AS winning_song ON winning_song.song_id = winner.song_id AND winning_song.title = seed.winner_title
SET target.song_a_entry_id = entry_a.bracket_song_id,
    target.song_b_entry_id = entry_b.bracket_song_id,
    target.winner_entry_id = winner.bracket_song_id
WHERE target.bracket_id = @led_bracket_id;

-- Route each winner into its correct next-round slot.
UPDATE matchups AS parent
JOIN bracket_weeks AS parent_week
  ON parent_week.week_id = parent.week_id AND parent_week.bracket_id = parent.bracket_id
JOIN bracket_rounds AS parent_round
  ON parent_round.round_id = parent_week.round_id AND parent_round.bracket_id = parent.bracket_id
JOIN led_round_schedule AS parent_schedule
  ON parent_schedule.round_number = parent_round.round_number
JOIN led_next_round_schedule AS next_schedule
  ON next_schedule.round_number = parent_round.round_number + 1
JOIN bracket_rounds AS next_round
  ON next_round.bracket_id = parent.bracket_id AND next_round.round_number = next_schedule.round_number
JOIN bracket_weeks AS next_week
  ON next_week.bracket_id = parent.bracket_id
 AND next_week.round_id = next_round.round_id
 AND next_week.week_number = next_schedule.first_week + FLOOR((FLOOR(((parent_week.week_number - parent_schedule.first_week) * 2 + parent.matchup_number - 1) / 2)) / 2)
JOIN matchups AS next_game
  ON next_game.week_id = next_week.week_id
 AND next_game.bracket_id = parent.bracket_id
 AND next_game.matchup_number = MOD(FLOOR(((parent_week.week_number - parent_schedule.first_week) * 2 + parent.matchup_number - 1) / 2), 2) + 1
SET parent.next_matchup_id = next_game.matchup_id,
    parent.next_slot = IF(
      MOD((parent_week.week_number - parent_schedule.first_week) * 2 + parent.matchup_number, 2) = 1,
      'A', 'B'
    )
WHERE parent.bracket_id = @led_bracket_id
  AND parent_round.round_number BETWEEN 1 AND 4;

COMMIT;

SELECT b.bracket_id, b.title, b.artist, b.status,
       COUNT(DISTINCT bs.bracket_song_id) AS song_count,
       COUNT(DISTINCT m.matchup_id) AS matchup_count
FROM brackets AS b
LEFT JOIN bracket_songs AS bs ON bs.bracket_id = b.bracket_id
LEFT JOIN matchups AS m ON m.bracket_id = b.bracket_id
WHERE b.bracket_id = @led_bracket_id
GROUP BY b.bracket_id, b.title, b.artist, b.status;

DROP TEMPORARY TABLE led_song_seed;
DROP TEMPORARY TABLE led_matchup_seed;
DROP TEMPORARY TABLE led_round_schedule;
DROP TEMPORARY TABLE led_next_round_schedule;
