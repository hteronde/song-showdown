-- Add the 32 completed opening-round matchups for Beatles bracket 1.
-- Two games are assigned to each of weeks 1–16. Winners reflect the supplied
-- historical bracket. Safe to run again: existing week/game slots are kept.
USE music_bracket;

INSERT INTO matchups (
  bracket_id,
  week_id,
  matchup_number,
  song_a_entry_id,
  song_b_entry_id,
  winner_entry_id
)
SELECT
  1,
  weeks.week_id,
  MOD(games.game_number - 1, 2) + 1,
  entry_a.bracket_song_id,
  entry_b.bracket_song_id,
  winner.bracket_song_id
FROM (
  SELECT 1 AS game_number, 1 AS region_number, 1 AS seed_a, 16 AS seed_b, 1 AS winner_seed
  UNION ALL SELECT 2, 1, 8, 9, 8
  UNION ALL SELECT 3, 1, 5, 12, 5
  UNION ALL SELECT 4, 1, 4, 13, 13
  UNION ALL SELECT 5, 1, 6, 11, 11
  UNION ALL SELECT 6, 1, 3, 14, 3
  UNION ALL SELECT 7, 1, 7, 10, 10
  UNION ALL SELECT 8, 1, 2, 15, 2

  UNION ALL SELECT 9, 2, 1, 16, 1
  UNION ALL SELECT 10, 2, 8, 9, 9
  UNION ALL SELECT 11, 2, 5, 12, 5
  UNION ALL SELECT 12, 2, 4, 13, 13
  UNION ALL SELECT 13, 2, 6, 11, 11
  UNION ALL SELECT 14, 2, 3, 14, 3
  UNION ALL SELECT 15, 2, 7, 10, 7
  UNION ALL SELECT 16, 2, 2, 15, 15

  UNION ALL SELECT 17, 3, 1, 16, 1
  UNION ALL SELECT 18, 3, 8, 9, 9
  UNION ALL SELECT 19, 3, 5, 12, 5
  UNION ALL SELECT 20, 3, 4, 13, 4
  UNION ALL SELECT 21, 3, 6, 11, 6
  UNION ALL SELECT 22, 3, 3, 14, 3
  UNION ALL SELECT 23, 3, 7, 10, 7
  UNION ALL SELECT 24, 3, 2, 15, 15

  UNION ALL SELECT 25, 4, 1, 16, 1
  UNION ALL SELECT 26, 4, 8, 9, 8
  UNION ALL SELECT 27, 4, 5, 12, 12
  UNION ALL SELECT 28, 4, 4, 13, 4
  UNION ALL SELECT 29, 4, 6, 11, 11
  UNION ALL SELECT 30, 4, 3, 14, 3
  UNION ALL SELECT 31, 4, 7, 10, 7
  UNION ALL SELECT 32, 4, 2, 15, 15
) AS games
JOIN bracket_weeks AS weeks
  ON weeks.bracket_id = 1
 AND weeks.week_number = FLOOR((games.game_number - 1) / 2) + 1
JOIN bracket_songs AS entry_a
  ON entry_a.bracket_id = 1
 AND entry_a.region_number = games.region_number
 AND entry_a.seed_number = games.seed_a
JOIN bracket_songs AS entry_b
  ON entry_b.bracket_id = 1
 AND entry_b.region_number = games.region_number
 AND entry_b.seed_number = games.seed_b
JOIN bracket_songs AS winner
  ON winner.bracket_id = 1
 AND winner.region_number = games.region_number
 AND winner.seed_number = games.winner_seed
LEFT JOIN matchups AS existing
  ON existing.week_id = weeks.week_id
 AND existing.matchup_number = MOD(games.game_number - 1, 2) + 1
WHERE existing.matchup_id IS NULL;
