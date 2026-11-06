-- Add verified tracks from the official Beatles YouTube channel to the shared catalog.
-- Existing YouTube URLs are preserved. Spotify URLs are not changed.
-- The two Abbey Road Medley entries have no exact-title official-channel track.
USE music_bracket;

DROP TEMPORARY TABLE IF EXISTS beatles_youtube_links;
CREATE TEMPORARY TABLE beatles_youtube_links (
  title VARCHAR(200) NOT NULL PRIMARY KEY,
  youtube_url VARCHAR(2048) NOT NULL
);

INSERT INTO beatles_youtube_links (title, youtube_url) VALUES
  ('Come Together', 'https://www.youtube.com/watch?v=45cYwDMibGo'),
  ('Things We Said Today', 'https://www.youtube.com/watch?v=NItAlTsPuQg'),
  ('I’ve Got a Feeling', 'https://www.youtube.com/watch?v=DbKPZd5oihc'),
  ('I’m Looking Through You', 'https://www.youtube.com/watch?v=brREJG5oWhk'),
  ('Rain', 'https://www.youtube.com/watch?v=cK5G8fPmWeA'),
  ('Penny Lane', 'https://www.youtube.com/watch?v=z7syIxQCquo'),
  ('I Feel Fine', 'https://www.youtube.com/watch?v=xLBVgnZyuic'),
  ('Across the Universe', 'https://www.youtube.com/watch?v=90M60PzmxEE'),
  ('Ob-La-Di, Ob-La-Da', 'https://www.youtube.com/watch?v=9x5WY_jmsko'),
  ('I Am the Walrus', 'https://www.youtube.com/watch?v=t1Jm5epJr10'),
  ('Let It Be', 'https://www.youtube.com/watch?v=QDYfEBY9NM4'),
  ('Can’t Buy Me Love', 'https://www.youtube.com/watch?v=h3WJiqc_bEs'),
  ('The Fool on the Hill', 'https://www.youtube.com/watch?v=wsRatIMUSu8'),
  ('Hey Jude', 'https://www.youtube.com/watch?v=mQER0A0ej0M'),
  ('Day Tripper', 'https://www.youtube.com/watch?v=2IbPn5j2YKk'),
  ('All You Need Is Love', 'https://www.youtube.com/watch?v=4EGczv7iiEk'),
  ('A Day in the Life', 'https://www.youtube.com/watch?v=UYeV7jLBXvA'),
  ('Honey Pie', 'https://www.youtube.com/watch?v=0Sr0efOe8yk'),
  ('You Never Give Me Your Money', 'https://www.youtube.com/watch?v=BpndGZ71yww'),
  ('Because', 'https://www.youtube.com/watch?v=hL0tnrl2L_U'),
  ('While My Guitar Gently Weeps', 'https://www.youtube.com/watch?v=YFDg-pgE0Hk'),
  ('You’ve Got to Hide Your Love Away', 'https://www.youtube.com/watch?v=oRrz3yYC2Yg'),
  ('I Saw Her Standing There', 'https://www.youtube.com/watch?v=oxwAB3SECtc'),
  ('Girl', 'https://www.youtube.com/watch?v=mmiSKzlzuI0'),
  ('Hello Goodbye', 'https://www.youtube.com/watch?v=rblYSKz_VnI'),
  ('Got to Get You Into My Life', 'https://www.youtube.com/watch?v=r95-7zfgtLw'),
  ('Norwegian Wood', 'https://www.youtube.com/watch?v=hqDgdRrh9Pk'),
  ('For No One', 'https://www.youtube.com/watch?v=hgJ7dmr_ysU'),
  ('In My Life', 'https://www.youtube.com/watch?v=ngzQTxXEcxQ'),
  ('You’re Going to Lose That Girl', 'https://www.youtube.com/watch?v=vqpEZuv29qE'),
  ('Paperback Writer', 'https://www.youtube.com/watch?v=SepZDSkY4Ro'),
  ('Revolution', 'https://www.youtube.com/watch?v=AFckPkukF7g'),
  ('Blackbird', 'https://www.youtube.com/watch?v=Man4Xw8Xypo'),
  ('And Your Bird Can Sing', 'https://www.youtube.com/watch?v=9g2eU9YGwWQ'),
  ('Everybody’s Got Something to Hide Except Me and My Monkey', 'https://www.youtube.com/watch?v=eyV3zCq1OHM'),
  ('Ticket to Ride', 'https://www.youtube.com/watch?v=UHsN9d4FTVI'),
  ('Revolution 1', 'https://www.youtube.com/watch?v=OmsXsIv2Ppw'),
  ('The Inner Light', 'https://www.youtube.com/watch?v=sa3948JzWCc'),
  ('Help!', 'https://www.youtube.com/watch?v=N4KvafPbauw'),
  ('This Boy', 'https://www.youtube.com/watch?v=VhuU8KDLdO4'),
  ('Oh! Darling', 'https://www.youtube.com/watch?v=9BznFjbcBVs'),
  ('Free as a Bird', 'https://www.youtube.com/watch?v=6cDHvw8fn2c'),
  ('Here, There and Everywhere', 'https://www.youtube.com/watch?v=6VcfBh3hWO4'),
  ('I’ll Cry Instead', 'https://www.youtube.com/watch?v=zfnkMBOSIUQ'),
  ('Strawberry Fields Forever', 'https://www.youtube.com/watch?v=44GB53rnI3c'),
  ('Helter Skelter', 'https://www.youtube.com/watch?v=vWW2SzoAXMo'),
  ('Tomorrow Never Knows', 'https://www.youtube.com/watch?v=m4BuziKGMy4'),
  ('Here Comes the Sun', 'https://www.youtube.com/watch?v=KQetemT1sWc'),
  ('And I Love Her', 'https://www.youtube.com/watch?v=atZwaJ84XP4'),
  ('She’s Leaving Home', 'https://www.youtube.com/watch?v=VaBPY78D88g'),
  ('Happiness Is a Warm Gun', 'https://www.youtube.com/watch?v=vdvnOH060Qg'),
  ('I Me Mine', 'https://www.youtube.com/watch?v=seqaTuXkqFI'),
  ('Back in the U.S.S.R.', 'https://www.youtube.com/watch?v=dc2tJqnkLLA'),
  ('Dear Prudence', 'https://www.youtube.com/watch?v=wQA59IkCF5I'),
  ('Eight Days a Week', 'https://www.youtube.com/watch?v=XTfmuDjwQTw'),
  ('Eleanor Rigby', 'https://www.youtube.com/watch?v=6gluNoLVKiQ'),
  ('Something', 'https://www.youtube.com/watch?v=uXRvmkQLyTc'),
  ('If I Needed Someone', 'https://www.youtube.com/watch?v=1rfXZCzuCpc'),
  ('If I Fell', 'https://www.youtube.com/watch?v=F_80s6S_7Vw'),
  ('She Loves You', 'https://www.youtube.com/watch?v=nGbWU8S3vzs'),
  ('Lady Madonna', 'https://www.youtube.com/watch?v=czhd27cN2dg'),
  ('Yesterday', 'https://www.youtube.com/watch?v=fCV9oqtwyVA');

UPDATE songs AS existing
JOIN beatles_youtube_links AS links
  ON links.title = existing.title
SET existing.youtube_url = COALESCE(existing.youtube_url, links.youtube_url)
WHERE existing.artist = 'The Beatles';

DROP TEMPORARY TABLE beatles_youtube_links;
