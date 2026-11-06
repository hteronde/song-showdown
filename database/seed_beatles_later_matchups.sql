-- Add the Round of 32 through Championship results shown in the historical
-- Beatles bracket diagram. Safe to run again: existing game slots are kept.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS requested_matchups;
DROP TEMPORARY TABLE IF EXISTS round_schedule;
DROP TEMPORARY TABLE IF EXISTS next_round_schedule;

CREATE TEMPORARY TABLE round_schedule (
  round_number SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  first_week SMALLINT UNSIGNED NOT NULL
);

INSERT INTO round_schedule (round_number, first_week) VALUES
  (1, 1),
  (2, 17),
  (3, 25),
  (4, 29),
  (5, 31),
  (6, 32);

CREATE TEMPORARY TABLE next_round_schedule LIKE round_schedule;
INSERT INTO next_round_schedule SELECT * FROM round_schedule;

CREATE TEMPORARY TABLE requested_matchups (
  round_number SMALLINT UNSIGNED NOT NULL,
  game_number SMALLINT UNSIGNED NOT NULL,
  song_a_title VARCHAR(200) NOT NULL,
  song_b_title VARCHAR(200) NOT NULL,
  winner_title VARCHAR(200) NOT NULL,
  PRIMARY KEY (round_number, game_number)
);

INSERT INTO requested_matchups
  (round_number, game_number, song_a_title, song_b_title, winner_title)
VALUES
  (2, 1, 'Come Together', 'I’ve Got a Feeling', 'Come Together'),
  (2, 2, 'Rain', 'Across the Universe', 'Across the Universe'),
  (2, 3, 'I Am the Walrus', 'Let It Be', 'Let It Be'),
  (2, 4, 'Hey Jude', 'Day Tripper', 'Hey Jude'),
  (2, 5, 'A Day in the Life', 'Because', 'A Day in the Life'),
  (2, 6, 'While My Guitar Gently Weeps', 'Girl', 'While My Guitar Gently Weeps'),
  (2, 7, 'Got to Get You Into My Life', 'Norwegian Wood', 'Norwegian Wood'),
  (2, 8, 'In My Life', 'Revolution', 'In My Life'),
  (2, 9, 'Blackbird', 'Ticket to Ride', 'Blackbird'),
  (2, 10, 'Revolution 1', 'Help!', 'Help!'),
  (2, 11, 'Oh! Darling', 'Here, There and Everywhere', 'Here, There and Everywhere'),
  (2, 12, 'Strawberry Fields Forever', 'Tomorrow Never Knows', 'Strawberry Fields Forever'),
  (2, 13, 'Here Comes the Sun', 'She’s Leaving Home', 'Here Comes the Sun'),
  (2, 14, 'Back in the U.S.S.R.', 'Dear Prudence', 'Dear Prudence'),
  (2, 15, 'Something', 'Abbey Road Medley 1', 'Something'),
  (2, 16, 'If I Fell', 'Yesterday', 'If I Fell'),

  (3, 1, 'Come Together', 'Across the Universe', 'Come Together'),
  (3, 2, 'Let It Be', 'Hey Jude', 'Let It Be'),
  (3, 3, 'A Day in the Life', 'While My Guitar Gently Weeps', 'While My Guitar Gently Weeps'),
  (3, 4, 'Norwegian Wood', 'In My Life', 'In My Life'),
  (3, 5, 'Blackbird', 'Help!', 'Blackbird'),
  (3, 6, 'Here, There and Everywhere', 'Strawberry Fields Forever', 'Strawberry Fields Forever'),
  (3, 7, 'Here Comes the Sun', 'Dear Prudence', 'Here Comes the Sun'),
  (3, 8, 'Something', 'If I Fell', 'Something'),

  (4, 1, 'Come Together', 'Let It Be', 'Come Together'),
  (4, 2, 'While My Guitar Gently Weeps', 'In My Life', 'While My Guitar Gently Weeps'),
  (4, 3, 'Blackbird', 'Strawberry Fields Forever', 'Blackbird'),
  (4, 4, 'Here Comes the Sun', 'Something', 'Something'),

  (5, 1, 'Come Together', 'While My Guitar Gently Weeps', 'Come Together'),
  (5, 2, 'Blackbird', 'Something', 'Something'),

  (6, 1, 'Come Together', 'Something', 'Come Together');

START TRANSACTION;

-- Add all 31 games, using the existing week schedule and bracket song entries.
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
  target_week.week_id,
  MOD(requested.game_number - 1, 2) + 1,
  entry_a.bracket_song_id,
  entry_b.bracket_song_id,
  winner.bracket_song_id
FROM requested_matchups AS requested
JOIN round_schedule AS schedule
  ON schedule.round_number = requested.round_number
JOIN bracket_rounds AS target_round
  ON target_round.bracket_id = 1
 AND target_round.round_number = requested.round_number
JOIN bracket_weeks AS target_week
  ON target_week.bracket_id = 1
 AND target_week.round_id = target_round.round_id
 AND target_week.week_number = schedule.first_week + FLOOR((requested.game_number - 1) / 2)
JOIN bracket_songs AS entry_a
  ON entry_a.bracket_id = 1
JOIN songs AS song_a
  ON song_a.song_id = entry_a.song_id
 AND song_a.title = requested.song_a_title
JOIN bracket_songs AS entry_b
  ON entry_b.bracket_id = 1
JOIN songs AS song_b
  ON song_b.song_id = entry_b.song_id
 AND song_b.title = requested.song_b_title
JOIN bracket_songs AS winner
  ON winner.bracket_id = 1
JOIN songs AS winning_song
  ON winning_song.song_id = winner.song_id
 AND winning_song.title = requested.winner_title
LEFT JOIN matchups AS existing
  ON existing.week_id = target_week.week_id
 AND existing.matchup_number = MOD(requested.game_number - 1, 2) + 1
WHERE existing.matchup_id IS NULL;

-- Route every winner to the correct slot in the next round.
UPDATE matchups AS parent
JOIN bracket_weeks AS parent_week
  ON parent_week.week_id = parent.week_id
 AND parent_week.bracket_id = parent.bracket_id
JOIN bracket_rounds AS parent_round
  ON parent_round.round_id = parent_week.round_id
 AND parent_round.bracket_id = parent.bracket_id
JOIN round_schedule AS parent_schedule
  ON parent_schedule.round_number = parent_round.round_number
JOIN next_round_schedule AS next_schedule
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
      'A',
      'B'
    )
WHERE parent.bracket_id = 1
  AND parent_round.round_number BETWEEN 1 AND 5;

COMMIT;

SELECT r.round_number, r.name, COUNT(m.matchup_id) AS matchup_count
FROM bracket_rounds AS r
LEFT JOIN bracket_weeks AS w
  ON w.bracket_id = r.bracket_id AND w.round_id = r.round_id
LEFT JOIN matchups AS m
  ON m.bracket_id = w.bracket_id AND m.week_id = w.week_id
WHERE r.bracket_id = 1
GROUP BY r.round_number, r.name
ORDER BY r.round_number;

DROP TEMPORARY TABLE requested_matchups;
DROP TEMPORARY TABLE round_schedule;
DROP TEMPORARY TABLE next_round_schedule;
