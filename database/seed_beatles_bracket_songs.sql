-- Link the Beatles catalog songs to bracket 1 and assign 1–16 seeds in each
-- of the four regions. Safe to run again: existing bracket/song links are kept.
USE music_bracket;

INSERT INTO bracket_songs (bracket_id, region_number, song_id, seed_number)
SELECT 1, seed.region_number, songs.song_id, seed.seed_number
FROM (
  SELECT 'Come Together' AS title, 1 AS region_number, 1 AS seed_number
  UNION ALL SELECT 'Things We Said Today', 1, 16
  UNION ALL SELECT 'I’ve Got a Feeling', 1, 8
  UNION ALL SELECT 'I’m Looking Through You', 1, 9
  UNION ALL SELECT 'Rain', 1, 5
  UNION ALL SELECT 'Penny Lane', 1, 12
  UNION ALL SELECT 'I Feel Fine', 1, 4
  UNION ALL SELECT 'Across the Universe', 1, 13
  UNION ALL SELECT 'Ob-La-Di, Ob-La-Da', 1, 6
  UNION ALL SELECT 'I Am the Walrus', 1, 11
  UNION ALL SELECT 'Let It Be', 1, 3
  UNION ALL SELECT 'Can’t Buy Me Love', 1, 14
  UNION ALL SELECT 'The Fool on the Hill', 1, 7
  UNION ALL SELECT 'Hey Jude', 1, 10
  UNION ALL SELECT 'Day Tripper', 1, 2
  UNION ALL SELECT 'All You Need Is Love', 1, 15

  UNION ALL SELECT 'A Day in the Life', 2, 1
  UNION ALL SELECT 'Honey Pie', 2, 16
  UNION ALL SELECT 'You Never Give Me Your Money', 2, 8
  UNION ALL SELECT 'Because', 2, 9
  UNION ALL SELECT 'While My Guitar Gently Weeps', 2, 5
  UNION ALL SELECT 'You’ve Got to Hide Your Love Away', 2, 12
  UNION ALL SELECT 'I Saw Her Standing There', 2, 4
  UNION ALL SELECT 'Girl', 2, 13
  UNION ALL SELECT 'Hello Goodbye', 2, 6
  UNION ALL SELECT 'Got to Get You Into My Life', 2, 11
  UNION ALL SELECT 'Norwegian Wood', 2, 3
  UNION ALL SELECT 'For No One', 2, 14
  UNION ALL SELECT 'In My Life', 2, 7
  UNION ALL SELECT 'You’re Going to Lose That Girl', 2, 10
  UNION ALL SELECT 'Paperback Writer', 2, 2
  UNION ALL SELECT 'Revolution', 2, 15

  UNION ALL SELECT 'Blackbird', 3, 1
  UNION ALL SELECT 'And Your Bird Can Sing', 3, 16
  UNION ALL SELECT 'Everybody’s Got Something to Hide Except Me and My Monkey', 3, 8
  UNION ALL SELECT 'Ticket to Ride', 3, 9
  UNION ALL SELECT 'Revolution 1', 3, 5
  UNION ALL SELECT 'The Inner Light', 3, 12
  UNION ALL SELECT 'Help!', 3, 4
  UNION ALL SELECT 'This Boy', 3, 13
  UNION ALL SELECT 'Oh! Darling', 3, 6
  UNION ALL SELECT 'Free as a Bird', 3, 11
  UNION ALL SELECT 'Here, There and Everywhere', 3, 3
  UNION ALL SELECT 'I’ll Cry Instead', 3, 14
  UNION ALL SELECT 'Strawberry Fields Forever', 3, 7
  UNION ALL SELECT 'Helter Skelter', 3, 10
  UNION ALL SELECT 'Abbey Road Medley 2', 3, 2
  UNION ALL SELECT 'Tomorrow Never Knows', 3, 15

  UNION ALL SELECT 'Here Comes the Sun', 4, 1
  UNION ALL SELECT 'And I Love Her', 4, 16
  UNION ALL SELECT 'She’s Leaving Home', 4, 8
  UNION ALL SELECT 'Happiness Is a Warm Gun', 4, 9
  UNION ALL SELECT 'I Me Mine', 4, 5
  UNION ALL SELECT 'Back in the U.S.S.R.', 4, 12
  UNION ALL SELECT 'Dear Prudence', 4, 4
  UNION ALL SELECT 'Eight Days a Week', 4, 13
  UNION ALL SELECT 'Eleanor Rigby', 4, 6
  UNION ALL SELECT 'Something', 4, 11
  UNION ALL SELECT 'Abbey Road Medley 1', 4, 3
  UNION ALL SELECT 'If I Needed Someone', 4, 14
  UNION ALL SELECT 'If I Fell', 4, 7
  UNION ALL SELECT 'She Loves You', 4, 10
  UNION ALL SELECT 'Lady Madonna', 4, 2
  UNION ALL SELECT 'Yesterday', 4, 15
) AS seed
JOIN songs
  ON songs.artist = 'The Beatles'
 AND songs.title = seed.title
LEFT JOIN bracket_songs AS existing
  ON existing.bracket_id = 1
 AND existing.song_id = songs.song_id
WHERE existing.bracket_song_id IS NULL;
