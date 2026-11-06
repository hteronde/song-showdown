-- Save the supplied first-round Led Zeppelin ballots and recompute first-round winners.
-- Safe to rerun: each participant's vote is updated in place if it already exists.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS led_round1_vote_seed;
CREATE TEMPORARY TABLE led_round1_vote_seed (
  display_name VARCHAR(120) NOT NULL,
  game_number TINYINT UNSIGNED NOT NULL,
  selected_title VARCHAR(200) NOT NULL,
  PRIMARY KEY (display_name, game_number)
);

INSERT INTO led_round1_vote_seed (display_name, game_number, selected_title) VALUES
  ('Brett', 1, 'Stairway to Heaven'),
  ('Brett', 2, 'Tangerine'),
  ('Brett', 3, 'Babe, I''m Gonna Leave You'),
  ('Brett', 4, 'Good Times Bad Times'),
  ('Brett', 5, 'Immigrant Song'),
  ('Brett', 6, 'Over the Hills and Far Away'),
  ('Brett', 7, 'What Is and What Should Never Be'),
  ('Brett', 8, 'You Shook Me'),
  ('Brett', 9, 'Black Dog'),
  ('Brett', 10, 'No Quarter'),
  ('Brett', 11, 'D''yer Mak''er'),
  ('Brett', 12, 'Misty Mountain Hop'),
  ('Brett', 13, 'Whole Lotta Love'),
  ('Brett', 14, 'Since I''ve Been Loving You'),
  ('Brett', 15, 'When the Levee Breaks'),
  ('Brett', 16, 'The Lemon Song'),
  ('Dave', 1, 'Stairway to Heaven'),
  ('Dave', 2, 'Tangerine'),
  ('Dave', 3, 'The Ocean'),
  ('Dave', 4, 'Houses of the Holy'),
  ('Dave', 5, 'Immigrant Song'),
  ('Dave', 6, 'Over the Hills and Far Away'),
  ('Dave', 7, 'What Is and What Should Never Be'),
  ('Dave', 8, 'Rock and Roll'),
  ('Dave', 9, 'In the Evening'),
  ('Dave', 10, 'Heartbreaker'),
  ('Dave', 11, 'D''yer Mak''er'),
  ('Dave', 12, 'Misty Mountain Hop'),
  ('Dave', 13, 'Whole Lotta Love'),
  ('Dave', 14, 'Dazed and Confused'),
  ('Dave', 15, 'When the Levee Breaks'),
  ('Dave', 16, 'Kashmir'),
  ('Hezi', 1, 'In the Light'),
  ('Hezi', 2, 'Tangerine'),
  ('Hezi', 3, 'The Ocean'),
  ('Hezi', 4, 'Good Times Bad Times'),
  ('Hezi', 5, 'Immigrant Song'),
  ('Hezi', 6, 'Communication Breakdown'),
  ('Hezi', 7, 'What Is and What Should Never Be'),
  ('Hezi', 8, 'Rock and Roll'),
  ('Hezi', 9, 'In the Evening'),
  ('Hezi', 10, 'Heartbreaker'),
  ('Hezi', 11, 'D''yer Mak''er'),
  ('Hezi', 12, 'Misty Mountain Hop'),
  ('Hezi', 13, 'Black Mountain Side'),
  ('Hezi', 14, 'Dazed and Confused'),
  ('Hezi', 15, 'When the Levee Breaks'),
  ('Hezi', 16, 'Kashmir'),
  ('Holden', 1, 'Stairway to Heaven'),
  ('Holden', 2, 'Tangerine'),
  ('Holden', 3, 'Babe, I''m Gonna Leave You'),
  ('Holden', 4, 'Good Times Bad Times'),
  ('Holden', 5, 'I''m Gonna Crawl'),
  ('Holden', 6, 'Over the Hills and Far Away'),
  ('Holden', 7, 'What Is and What Should Never Be'),
  ('Holden', 8, 'You Shook Me'),
  ('Holden', 9, 'Black Dog'),
  ('Holden', 10, 'No Quarter'),
  ('Holden', 11, 'The Rain Song'),
  ('Holden', 12, 'Ramble On'),
  ('Holden', 13, 'Whole Lotta Love'),
  ('Holden', 14, 'Dazed and Confused'),
  ('Holden', 15, 'When the Levee Breaks'),
  ('Holden', 16, 'Kashmir'),
  ('Isa', 1, 'In the Light'),
  ('Isa', 2, 'All My Love'),
  ('Isa', 3, 'Babe, I''m Gonna Leave You'),
  ('Isa', 4, 'Good Times Bad Times'),
  ('Isa', 5, 'Immigrant Song'),
  ('Isa', 6, 'Communication Breakdown'),
  ('Isa', 7, 'What Is and What Should Never Be'),
  ('Isa', 8, 'You Shook Me'),
  ('Isa', 9, 'In the Evening'),
  ('Isa', 10, 'Heartbreaker'),
  ('Isa', 11, 'D''yer Mak''er'),
  ('Isa', 12, 'Ramble On'),
  ('Isa', 13, 'Whole Lotta Love'),
  ('Isa', 14, 'Dazed and Confused'),
  ('Isa', 15, 'When the Levee Breaks'),
  ('Isa', 16, 'Kashmir'),
  ('Jeff', 1, 'Stairway to Heaven'),
  ('Jeff', 2, 'All My Love'),
  ('Jeff', 3, 'Babe, I''m Gonna Leave You'),
  ('Jeff', 4, 'Good Times Bad Times'),
  ('Jeff', 5, 'Immigrant Song'),
  ('Jeff', 6, 'Over the Hills and Far Away'),
  ('Jeff', 7, 'What Is and What Should Never Be'),
  ('Jeff', 8, 'You Shook Me'),
  ('Jeff', 9, 'Black Dog'),
  ('Jeff', 10, 'Heartbreaker'),
  ('Jeff', 11, 'The Rain Song'),
  ('Jeff', 12, 'Ramble On'),
  ('Jeff', 13, 'Whole Lotta Love'),
  ('Jeff', 14, 'Dazed and Confused'),
  ('Jeff', 15, 'Thank You'),
  ('Jeff', 16, 'The Lemon Song'),
  ('Jim', 1, 'Stairway to Heaven'),
  ('Jim', 2, 'Tangerine'),
  ('Jim', 3, 'Babe, I''m Gonna Leave You'),
  ('Jim', 4, 'Good Times Bad Times'),
  ('Jim', 5, 'I''m Gonna Crawl'),
  ('Jim', 6, 'Communication Breakdown'),
  ('Jim', 7, 'What Is and What Should Never Be'),
  ('Jim', 8, 'You Shook Me'),
  ('Jim', 9, 'Black Dog'),
  ('Jim', 10, 'Heartbreaker'),
  ('Jim', 11, 'The Rain Song'),
  ('Jim', 12, 'Ramble On'),
  ('Jim', 13, 'Whole Lotta Love'),
  ('Jim', 14, 'Dazed and Confused'),
  ('Jim', 15, 'Thank You'),
  ('Jim', 16, 'Kashmir'),
  ('Lennon', 1, 'Stairway to Heaven'),
  ('Lennon', 2, 'All My Love'),
  ('Lennon', 3, 'The Ocean'),
  ('Lennon', 4, 'Houses of the Holy'),
  ('Lennon', 5, 'Immigrant Song'),
  ('Lennon', 6, 'Communication Breakdown'),
  ('Lennon', 7, 'Going to California'),
  ('Lennon', 8, 'You Shook Me'),
  ('Lennon', 9, 'Black Dog'),
  ('Lennon', 10, 'Heartbreaker'),
  ('Lennon', 11, 'D''yer Mak''er'),
  ('Lennon', 12, 'Misty Mountain Hop'),
  ('Lennon', 13, 'Black Mountain Side'),
  ('Lennon', 14, 'Since I''ve Been Loving You'),
  ('Lennon', 15, 'When the Levee Breaks'),
  ('Lennon', 16, 'Kashmir'),
  ('Marcia', 1, 'Stairway to Heaven'),
  ('Marcia', 2, 'All My Love'),
  ('Marcia', 3, 'The Ocean'),
  ('Marcia', 4, 'Houses of the Holy'),
  ('Marcia', 5, 'Immigrant Song'),
  ('Marcia', 6, 'Over the Hills and Far Away'),
  ('Marcia', 7, 'What Is and What Should Never Be'),
  ('Marcia', 8, 'Rock and Roll'),
  ('Marcia', 9, 'Black Dog'),
  ('Marcia', 10, 'Heartbreaker'),
  ('Marcia', 11, 'D''yer Mak''er'),
  ('Marcia', 12, 'Misty Mountain Hop'),
  ('Marcia', 13, 'Whole Lotta Love'),
  ('Marcia', 14, 'Dazed and Confused'),
  ('Marcia', 15, 'Thank You'),
  ('Marcia', 16, 'Kashmir'),
  ('Roy', 1, 'Stairway to Heaven'),
  ('Roy', 2, 'All My Love'),
  ('Roy', 3, 'The Ocean'),
  ('Roy', 4, 'Houses of the Holy'),
  ('Roy', 5, 'Immigrant Song'),
  ('Roy', 6, 'Over the Hills and Far Away'),
  ('Roy', 7, 'What Is and What Should Never Be'),
  ('Roy', 8, 'You Shook Me'),
  ('Roy', 9, 'Black Dog'),
  ('Roy', 10, 'No Quarter'),
  ('Roy', 11, 'The Rain Song'),
  ('Roy', 12, 'Ramble On'),
  ('Roy', 13, 'Whole Lotta Love'),
  ('Roy', 14, 'Dazed and Confused'),
  ('Roy', 15, 'When the Levee Breaks'),
  ('Roy', 16, 'Kashmir'),
  ('Scott', 1, 'In the Light'),
  ('Scott', 2, 'All My Love'),
  ('Scott', 3, 'The Ocean'),
  ('Scott', 4, 'Good Times Bad Times'),
  ('Scott', 5, 'Immigrant Song'),
  ('Scott', 6, 'Over the Hills and Far Away'),
  ('Scott', 7, 'What Is and What Should Never Be'),
  ('Scott', 8, 'Rock and Roll'),
  ('Scott', 9, 'In the Evening'),
  ('Scott', 10, 'No Quarter'),
  ('Scott', 11, 'The Rain Song'),
  ('Scott', 12, 'Ramble On'),
  ('Scott', 13, 'Whole Lotta Love'),
  ('Scott', 14, 'Dazed and Confused'),
  ('Scott', 15, 'When the Levee Breaks'),
  ('Scott', 16, 'The Lemon Song'),
  ('Sharon', 1, 'Stairway to Heaven'),
  ('Sharon', 2, 'All My Love'),
  ('Sharon', 3, 'The Ocean'),
  ('Sharon', 4, 'Houses of the Holy'),
  ('Sharon', 5, 'Immigrant Song'),
  ('Sharon', 6, 'Over the Hills and Far Away'),
  ('Sharon', 7, 'Going to California'),
  ('Sharon', 8, 'Rock and Roll'),
  ('Sharon', 9, 'Black Dog'),
  ('Sharon', 10, 'Heartbreaker'),
  ('Sharon', 11, 'D''yer Mak''er'),
  ('Sharon', 12, 'Misty Mountain Hop'),
  ('Sharon', 13, 'Whole Lotta Love'),
  ('Sharon', 14, 'Dazed and Confused'),
  ('Sharon', 15, 'When the Levee Breaks'),
  ('Sharon', 16, 'Kashmir'),
  ('Teresa', 1, 'Stairway to Heaven'),
  ('Teresa', 2, 'All My Love'),
  ('Teresa', 3, 'The Ocean'),
  ('Teresa', 4, 'Good Times Bad Times'),
  ('Teresa', 5, 'I''m Gonna Crawl'),
  ('Teresa', 6, 'Over the Hills and Far Away'),
  ('Teresa', 7, 'What Is and What Should Never Be'),
  ('Teresa', 8, 'You Shook Me'),
  ('Teresa', 9, 'In the Evening'),
  ('Teresa', 10, 'Heartbreaker'),
  ('Teresa', 11, 'The Rain Song'),
  ('Teresa', 12, 'Ramble On'),
  ('Teresa', 13, 'Whole Lotta Love'),
  ('Teresa', 14, 'Since I''ve Been Loving You'),
  ('Teresa', 15, 'Thank You'),
  ('Teresa', 16, 'Kashmir');

SET @led_bracket_id = (
  SELECT bracket_id FROM brackets
  WHERE artist = 'Led Zeppelin'
    AND family_id = (SELECT family_id FROM families WHERE name = 'Morgan' ORDER BY family_id LIMIT 1)
  ORDER BY bracket_id LIMIT 1
);

START TRANSACTION;

INSERT INTO votes (bracket_id, matchup_id, user_id, selected_entry_id, comment, submitted_at)
SELECT @led_bracket_id, matchup.matchup_id, voter.user_id, selected_entry.bracket_song_id, NULL, CURRENT_TIMESTAMP
FROM led_round1_vote_seed AS ballot
JOIN users AS voter ON voter.display_name = ballot.display_name
JOIN bracket_rounds AS round_row
  ON round_row.bracket_id = @led_bracket_id AND round_row.round_number = 1
JOIN bracket_weeks AS target_week
  ON target_week.bracket_id = @led_bracket_id
 AND target_week.round_id = round_row.round_id
 AND target_week.week_number = FLOOR((ballot.game_number - 1) / 2) + 1
JOIN matchups AS matchup
  ON matchup.bracket_id = @led_bracket_id
 AND matchup.week_id = target_week.week_id
 AND matchup.matchup_number = MOD(ballot.game_number - 1, 2) + 1
JOIN bracket_songs AS selected_entry ON selected_entry.bracket_id = @led_bracket_id
JOIN songs AS selected_song
  ON selected_song.song_id = selected_entry.song_id
 AND selected_song.title = ballot.selected_title
ON DUPLICATE KEY UPDATE
  selected_entry_id = VALUES(selected_entry_id),
  comment = NULL,
  submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP);

-- Set each first-round matchup winner to its most-voted song.
UPDATE matchups AS target
JOIN bracket_weeks AS target_week
  ON target_week.week_id = target.week_id AND target_week.bracket_id = target.bracket_id
JOIN bracket_rounds AS target_round
  ON target_round.round_id = target_week.round_id AND target_round.bracket_id = target.bracket_id
JOIN (
  SELECT vote_totals.matchup_id, vote_totals.selected_entry_id,
         ROW_NUMBER() OVER (
           PARTITION BY vote_totals.matchup_id
           ORDER BY vote_totals.vote_count DESC, vote_totals.selected_entry_id
         ) AS vote_rank
  FROM (
    SELECT v.matchup_id, v.selected_entry_id, COUNT(*) AS vote_count
    FROM votes AS v
    JOIN matchups AS m ON m.matchup_id = v.matchup_id AND m.bracket_id = @led_bracket_id
    JOIN bracket_weeks AS w ON w.week_id = m.week_id AND w.bracket_id = m.bracket_id
    JOIN bracket_rounds AS r ON r.round_id = w.round_id AND r.bracket_id = w.bracket_id
    WHERE r.round_number = 1 AND v.submitted_at IS NOT NULL
    GROUP BY v.matchup_id, v.selected_entry_id
  ) AS vote_totals
) AS majority
  ON majority.matchup_id = target.matchup_id AND majority.vote_rank = 1
SET target.winner_entry_id = majority.selected_entry_id
WHERE target.bracket_id = @led_bracket_id AND target_round.round_number = 1;

COMMIT;

SELECT matchup.matchup_id, target_week.week_number, matchup.matchup_number,
       song_a.title AS song_a, song_b.title AS song_b,
       COUNT(vote.vote_id) AS vote_count, winner.title AS winner
FROM matchups AS matchup
JOIN bracket_weeks AS target_week ON target_week.week_id = matchup.week_id
JOIN bracket_songs AS entry_a ON entry_a.bracket_song_id = matchup.song_a_entry_id
JOIN songs AS song_a ON song_a.song_id = entry_a.song_id
JOIN bracket_songs AS entry_b ON entry_b.bracket_song_id = matchup.song_b_entry_id
JOIN songs AS song_b ON song_b.song_id = entry_b.song_id
JOIN bracket_songs AS entry_winner ON entry_winner.bracket_song_id = matchup.winner_entry_id
JOIN songs AS winner ON winner.song_id = entry_winner.song_id
LEFT JOIN votes AS vote ON vote.matchup_id = matchup.matchup_id AND vote.submitted_at IS NOT NULL
JOIN bracket_rounds AS target_round ON target_round.round_id = target_week.round_id
WHERE matchup.bracket_id = @led_bracket_id AND target_round.round_number = 1
GROUP BY matchup.matchup_id, target_week.week_number, matchup.matchup_number,
         song_a.title, song_b.title, winner.title
ORDER BY target_week.week_number, matchup.matchup_number;

DROP TEMPORARY TABLE led_round1_vote_seed;
