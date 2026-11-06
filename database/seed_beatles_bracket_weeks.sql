-- Add 32 undated historical weeks for completed Beatles bracket 1.
-- Two matchups fit in each week except the final championship week, which has one.
-- Safe to run again: existing week numbers are left unchanged.
USE music_bracket;

INSERT INTO bracket_weeks (bracket_id, round_id, week_number, opens_at, closes_at)
SELECT 1, rounds.round_id, schedule.week_number, NULL, NULL
FROM (
  SELECT 1 AS week_number, 1 AS round_number
  UNION ALL SELECT 2, 1
  UNION ALL SELECT 3, 1
  UNION ALL SELECT 4, 1
  UNION ALL SELECT 5, 1
  UNION ALL SELECT 6, 1
  UNION ALL SELECT 7, 1
  UNION ALL SELECT 8, 1
  UNION ALL SELECT 9, 1
  UNION ALL SELECT 10, 1
  UNION ALL SELECT 11, 1
  UNION ALL SELECT 12, 1
  UNION ALL SELECT 13, 1
  UNION ALL SELECT 14, 1
  UNION ALL SELECT 15, 1
  UNION ALL SELECT 16, 1
  UNION ALL SELECT 17, 2
  UNION ALL SELECT 18, 2
  UNION ALL SELECT 19, 2
  UNION ALL SELECT 20, 2
  UNION ALL SELECT 21, 2
  UNION ALL SELECT 22, 2
  UNION ALL SELECT 23, 2
  UNION ALL SELECT 24, 2
  UNION ALL SELECT 25, 3
  UNION ALL SELECT 26, 3
  UNION ALL SELECT 27, 3
  UNION ALL SELECT 28, 3
  UNION ALL SELECT 29, 4
  UNION ALL SELECT 30, 4
  UNION ALL SELECT 31, 5
  UNION ALL SELECT 32, 6
) AS schedule
JOIN bracket_rounds AS rounds
  ON rounds.bracket_id = 1
 AND rounds.round_number = schedule.round_number
LEFT JOIN bracket_weeks AS existing
  ON existing.bracket_id = 1
 AND existing.week_number = schedule.week_number
WHERE existing.week_id IS NULL;
