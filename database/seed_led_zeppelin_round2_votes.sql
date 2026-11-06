-- Save the supplied second-round Led Zeppelin ballots and recompute round-two winners.
-- Safe to rerun: each participant's vote is updated in place if it already exists.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS led_round2_vote_seed;
CREATE TEMPORARY TABLE led_round2_vote_seed (
  display_name VARCHAR(120) NOT NULL,
  game_number TINYINT UNSIGNED NOT NULL,
  selected_title VARCHAR(200) NOT NULL,
  PRIMARY KEY (display_name, game_number)
);

INSERT INTO led_round2_vote_seed (display_name, game_number, selected_title) VALUES
  ('Brett', 1, 'Stairway to Heaven'),
  ('Brett', 2, 'The Ocean'),
  ('Brett', 3, 'Over the Hills and Far Away'),
  ('Brett', 4, 'What Is and What Should Never Be'),
  ('Brett', 5, 'Heartbreaker'),
  ('Brett', 6, 'Ramble On'),
  ('Brett', 7, 'Whole Lotta Love'),
  ('Brett', 8, 'When the Levee Breaks'),
  ('Dave', 1, 'Stairway to Heaven'),
  ('Dave', 2, 'Good Times Bad Times'),
  ('Dave', 3, 'Over the Hills and Far Away'),
  ('Dave', 4, 'What Is and What Should Never Be'),
  ('Dave', 5, 'Black Dog'),
  ('Dave', 6, 'Ramble On'),
  ('Dave', 7, 'Whole Lotta Love'),
  ('Dave', 8, 'When the Levee Breaks'),
  ('Hezi', 1, 'All My Love'),
  ('Hezi', 2, 'The Ocean'),
  ('Hezi', 3, 'Over the Hills and Far Away'),
  ('Hezi', 4, 'What Is and What Should Never Be'),
  ('Hezi', 5, 'Heartbreaker'),
  ('Hezi', 6, 'D''yer Mak''er'),
  ('Hezi', 7, 'Dazed and Confused'),
  ('Hezi', 8, 'Kashmir'),
  ('Holden', 1, 'Stairway to Heaven'),
  ('Holden', 2, 'Good Times Bad Times'),
  ('Holden', 3, 'Over the Hills and Far Away'),
  ('Holden', 4, 'What Is and What Should Never Be'),
  ('Holden', 5, 'Heartbreaker'),
  ('Holden', 6, 'D''yer Mak''er'),
  ('Holden', 7, 'Whole Lotta Love'),
  ('Holden', 8, 'When the Levee Breaks'),
  ('Isa', 1, 'All My Love'),
  ('Isa', 2, 'Good Times Bad Times'),
  ('Isa', 3, 'Immigrant Song'),
  ('Isa', 4, 'You Shook Me'),
  ('Isa', 5, 'Heartbreaker'),
  ('Isa', 6, 'Ramble On'),
  ('Isa', 7, 'Dazed and Confused'),
  ('Isa', 8, 'Kashmir'),
  ('Jeff', 1, 'Stairway to Heaven'),
  ('Jeff', 2, 'Good Times Bad Times'),
  ('Jeff', 3, 'Over the Hills and Far Away'),
  ('Jeff', 4, 'What Is and What Should Never Be'),
  ('Jeff', 5, 'Black Dog'),
  ('Jeff', 6, 'Ramble On'),
  ('Jeff', 7, 'Dazed and Confused'),
  ('Jeff', 8, 'Kashmir'),
  ('Jim', 1, 'Stairway to Heaven'),
  ('Jim', 2, 'The Ocean'),
  ('Jim', 3, 'Over the Hills and Far Away'),
  ('Jim', 4, 'What Is and What Should Never Be'),
  ('Jim', 5, 'Heartbreaker'),
  ('Jim', 6, 'Ramble On'),
  ('Jim', 7, 'Dazed and Confused'),
  ('Jim', 8, 'Kashmir'),
  ('Lennon', 1, 'All My Love'),
  ('Lennon', 2, 'The Ocean'),
  ('Lennon', 3, 'Immigrant Song'),
  ('Lennon', 4, 'You Shook Me'),
  ('Lennon', 5, 'Heartbreaker'),
  ('Lennon', 6, 'D''yer Mak''er'),
  ('Lennon', 7, 'Dazed and Confused'),
  ('Lennon', 8, 'Kashmir'),
  ('Marcia', 1, 'All My Love'),
  ('Marcia', 2, 'The Ocean'),
  ('Marcia', 3, 'Over the Hills and Far Away'),
  ('Marcia', 4, 'What Is and What Should Never Be'),
  ('Marcia', 5, 'Black Dog'),
  ('Marcia', 6, 'D''yer Mak''er'),
  ('Marcia', 7, 'Whole Lotta Love'),
  ('Marcia', 8, 'Kashmir'),
  ('Roy', 1, 'Stairway to Heaven'),
  ('Roy', 2, 'The Ocean'),
  ('Roy', 3, 'Over the Hills and Far Away'),
  ('Roy', 4, 'What Is and What Should Never Be'),
  ('Roy', 5, 'Black Dog'),
  ('Roy', 6, 'Ramble On'),
  ('Roy', 7, 'Dazed and Confused'),
  ('Roy', 8, 'When the Levee Breaks'),
  ('Scott', 1, 'All My Love'),
  ('Scott', 2, 'The Ocean'),
  ('Scott', 3, 'Over the Hills and Far Away'),
  ('Scott', 4, 'What Is and What Should Never Be'),
  ('Scott', 5, 'Heartbreaker'),
  ('Scott', 6, 'Ramble On'),
  ('Scott', 7, 'Dazed and Confused'),
  ('Scott', 8, 'When the Levee Breaks'),
  ('Sharon', 1, 'Stairway to Heaven'),
  ('Sharon', 2, 'Good Times Bad Times'),
  ('Sharon', 3, 'Over the Hills and Far Away'),
  ('Sharon', 4, 'What Is and What Should Never Be'),
  ('Sharon', 5, 'Black Dog'),
  ('Sharon', 6, 'Ramble On'),
  ('Sharon', 7, 'Dazed and Confused'),
  ('Sharon', 8, 'Kashmir'),
  ('Teresa', 1, 'Stairway to Heaven'),
  ('Teresa', 2, 'The Ocean'),
  ('Teresa', 3, 'Over the Hills and Far Away'),
  ('Teresa', 4, 'You Shook Me'),
  ('Teresa', 5, 'Heartbreaker'),
  ('Teresa', 6, 'D''yer Mak''er'),
  ('Teresa', 7, 'Dazed and Confused'),
  ('Teresa', 8, 'Kashmir');

SET @led_bracket_id = (
  SELECT bracket_id FROM brackets
  WHERE artist = 'Led Zeppelin'
    AND family_id = (SELECT family_id FROM families WHERE name = 'Morgan' ORDER BY family_id LIMIT 1)
  ORDER BY bracket_id LIMIT 1
);

START TRANSACTION;

INSERT INTO votes (bracket_id, matchup_id, user_id, selected_entry_id, comment, submitted_at)
SELECT @led_bracket_id, matchup.matchup_id, voter.user_id, selected_entry.bracket_song_id, NULL, CURRENT_TIMESTAMP
FROM led_round2_vote_seed AS ballot
JOIN users AS voter ON voter.display_name = ballot.display_name
JOIN bracket_rounds AS round_row
  ON round_row.bracket_id = @led_bracket_id AND round_row.round_number = 2
JOIN bracket_weeks AS target_week
  ON target_week.bracket_id = @led_bracket_id
 AND target_week.round_id = round_row.round_id
 AND target_week.week_number = FLOOR((ballot.game_number - 1) / 2) + 9
JOIN matchups AS matchup
  ON matchup.bracket_id = @led_bracket_id
 AND matchup.week_id = target_week.week_id
 AND matchup.matchup_number = MOD(ballot.game_number - 1, 2) + 1
JOIN bracket_songs AS selected_entry ON selected_entry.bracket_id = @led_bracket_id
JOIN songs AS selected_song
  ON selected_song.song_id = selected_entry.song_id
 AND selected_song.title = ballot.selected_title
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  selected_entry_id = VALUES(selected_entry_id),
  comment = NULL,
  submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP);

-- Set each second-round matchup winner to its most-voted song.
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
    WHERE r.round_number = 2 AND v.submitted_at IS NOT NULL
    GROUP BY v.matchup_id, v.selected_entry_id
  ) AS vote_totals
) AS majority
  ON majority.matchup_id = target.matchup_id AND majority.vote_rank = 1
SET target.winner_entry_id = majority.selected_entry_id
WHERE target.bracket_id = @led_bracket_id AND target_round.round_number = 2;

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
WHERE matchup.bracket_id = @led_bracket_id AND target_round.round_number = 2
GROUP BY matchup.matchup_id, target_week.week_number, matchup.matchup_number,
         song_a.title, song_b.title, winner.title
ORDER BY target_week.week_number, matchup.matchup_number;

DROP TEMPORARY TABLE led_round2_vote_seed;
