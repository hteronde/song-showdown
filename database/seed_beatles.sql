-- Add the 64 tracks from the completed family bracket to the song catalog.
-- `year` is the year of the Beatles' first official release of the recording.
-- Safe to run again: existing Beatles titles have their year and category
-- refreshed, and missing titles are inserted. Album remains NULL until entered;
-- category stores the songwriter for this Beatles bracket.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS beatles_song_seed;
CREATE TEMPORARY TABLE beatles_song_seed (
  title VARCHAR(200) NOT NULL PRIMARY KEY,
  release_year SMALLINT UNSIGNED NOT NULL,
  category VARCHAR(255) NOT NULL
);

INSERT INTO beatles_song_seed (title, release_year, category) VALUES
  ('Come Together', 1969, 'Lennon'),
  ('Things We Said Today', 1964, 'McCartney'),
  ('I’ve Got a Feeling', 1970, 'McCartney'),
  ('I’m Looking Through You', 1965, 'McCartney'),
  ('Rain', 1966, 'Lennon'),
  ('Penny Lane', 1967, 'McCartney'),
  ('I Feel Fine', 1964, 'Lennon'),
  ('Across the Universe', 1969, 'Lennon'),
  ('Ob-La-Di, Ob-La-Da', 1968, 'McCartney'),
  ('I Am the Walrus', 1967, 'Lennon'),
  ('Let It Be', 1970, 'McCartney'),
  ('Can’t Buy Me Love', 1964, 'McCartney'),
  ('The Fool on the Hill', 1967, 'McCartney'),
  ('Hey Jude', 1968, 'McCartney'),
  ('Day Tripper', 1965, 'Lennon'),
  ('All You Need Is Love', 1967, 'Lennon'),
  ('A Day in the Life', 1967, 'Lennon'),
  ('Honey Pie', 1968, 'McCartney'),
  ('You Never Give Me Your Money', 1969, 'McCartney'),
  ('Because', 1969, 'Lennon'),
  ('While My Guitar Gently Weeps', 1968, 'Harrison'),
  ('You’ve Got to Hide Your Love Away', 1965, 'Lennon'),
  ('I Saw Her Standing There', 1963, 'McCartney'),
  ('Girl', 1965, 'Lennon'),
  ('Hello Goodbye', 1967, 'McCartney'),
  ('Got to Get You Into My Life', 1966, 'McCartney'),
  ('Norwegian Wood', 1965, 'Lennon'),
  ('For No One', 1966, 'McCartney'),
  ('In My Life', 1965, 'Lennon'),
  ('You’re Going to Lose That Girl', 1965, 'Lennon'),
  ('Paperback Writer', 1966, 'McCartney'),
  ('Revolution', 1968, 'Lennon'),
  ('Blackbird', 1968, 'McCartney'),
  ('And Your Bird Can Sing', 1966, 'Lennon'),
  ('Everybody’s Got Something to Hide Except Me and My Monkey', 1968, 'Lennon'),
  ('Ticket to Ride', 1965, 'Lennon'),
  ('Revolution 1', 1968, 'Lennon'),
  ('The Inner Light', 1968, 'Harrison'),
  ('Help!', 1965, 'Lennon'),
  ('This Boy', 1963, 'Lennon'),
  ('Oh! Darling', 1969, 'McCartney'),
  ('Free as a Bird', 1995, 'Lennon'),
  ('Here, There and Everywhere', 1966, 'McCartney'),
  ('I’ll Cry Instead', 1964, 'Lennon'),
  ('Strawberry Fields Forever', 1967, 'Lennon'),
  ('Helter Skelter', 1968, 'McCartney'),
  ('Abbey Road Medley 2', 1969, 'McCartney'),
  ('Tomorrow Never Knows', 1966, 'Lennon'),
  ('Here Comes the Sun', 1969, 'McCartney'),
  ('And I Love Her', 1964, 'McCartney'),
  ('She’s Leaving Home', 1967, 'McCartney'),
  ('Happiness Is a Warm Gun', 1968, 'Lennon'),
  ('I Me Mine', 1970, 'Harrison'),
  ('Back in the U.S.S.R.', 1968, 'McCartney'),
  ('Dear Prudence', 1968, 'Lennon'),
  ('Eight Days a Week', 1964, 'McCartney-Lennon'),
  ('Eleanor Rigby', 1966, 'McCartney'),
  ('Something', 1969, 'Harrison'),
  ('Abbey Road Medley 1', 1969, 'Lennon-McCartney'),
  ('If I Needed Someone', 1965, 'Harrison'),
  ('If I Fell', 1964, 'Lennon'),
  ('She Loves You', 1963, 'Lennon-McCartney'),
  ('Lady Madonna', 1968, 'McCartney'),
  ('Yesterday', 1965, 'McCartney');

INSERT INTO songs (artist, title, `year`, category)
SELECT 'The Beatles', seed.title, seed.release_year, seed.category
FROM beatles_song_seed AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM songs AS existing
  WHERE existing.artist = 'The Beatles'
    AND existing.title = seed.title
);

UPDATE songs AS existing
JOIN beatles_song_seed AS seed ON seed.title = existing.title
SET existing.`year` = seed.release_year,
    existing.category = seed.category
WHERE existing.artist = 'The Beatles';

DROP TEMPORARY TABLE beatles_song_seed;
