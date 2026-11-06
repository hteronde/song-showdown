-- Verified Apple Music artwork. Existing cover URLs are preserved.
-- Beatles Single entries use Past Masters; Free as a Bird uses Anthology 1.
USE music_bracket;
START TRANSACTION;

-- https://music.apple.com/us/album/comfort-eagle/181630530?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ed/9f/91/ed9f9138-8c79-3a7f-4688-9b54c6657292/074646213223.jpg/600x600bb.jpg' WHERE LOWER(artist)='cake' AND album='Comfort Eagle' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/fashion-nugget/1632472281?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/b7/5d/ee/b75deeb0-cb5d-d6fd-9cd8-17e57e772fc1/196589267740.jpg/600x600bb.jpg' WHERE LOWER(artist)='cake' AND album='Fashion Nugget' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/motorcade-of-generosity/277260090?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music/48/c9/7f/mzi.zlgonifw.jpg/600x600bb.jpg' WHERE LOWER(artist)='cake' AND album='Motorcade of Generosity' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/prolonging-the-magic/254830898?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ed/e6/67/ede6678d-20f6-b474-9af2-81dbbdc4a037/614223809229.jpg/600x600bb.jpg' WHERE LOWER(artist)='cake' AND album='Prolonging the Magic' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/houses-of-the-holy-remastered/580707916?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/4f/88/ad/4f88ad28-3953-fded-6c18-fe87b5d0dc7b/dj.iqdrlirx.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='Houses of the Holy' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/in-through-the-out-door-remastered/580707622?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music7/v4/32/33/78/32337882-4dcf-b4ff-c2b1-988297b1aa2a/dj.bazmvvpg.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='In Through the Out Door' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/led-zeppelin-remastered/580708520?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/4c/7b/80/4c7b80b4-ed35-4e06-ec80-2f7aaaabb5c5/dj.pjjmtwdc.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='Led Zeppelin' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/led-zeppelin-ii-remastered/580708374?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/1a/3d/bb/1a3dbb86-c1f8-737e-571f-d6b647a230be/dj.rhubuvkd.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='Led Zeppelin II' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/led-zeppelin-iii-remastered/580708279?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/62/fd/14/62fd14aa-d202-a86a-d948-0a5550b35fc3/dj.rkzuiqye.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='Led Zeppelin III' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/led-zeppelin-iv-remastered/580708175?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/5c/15/9b/5c159b27-95ca-b9a7-84e3-28e795fffd39/dj.kvkrpptq.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='Led Zeppelin IV' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/physical-graffiti-remastered/580707980?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/82/6c/5d/826c5d66-67b7-62f2-4d78-dd3c7b415e08/dj.pifhrvpa.jpg/600x600bb.jpg' WHERE LOWER(artist)='led zeppelin' AND album='Physical Graffiti' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/a-hard-days-night/1441164416?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/db/a2/7a/dba27a46-3685-508d-d32e-a0e73cc82251/00602567713296.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='A Hard Days Night' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/abbey-road-remastered/1441164426?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/df/db/61/dfdb615d-47f8-06e9-9533-b96daccc029f/18UMGIM31076.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Abbey Road' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/anthology-1/1441152311?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/7b/0a/93/7b0a9379-07c0-188e-dc3d-c4c8b5c0f653/00602567715894.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Anthology' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/the-beatles-the-white-album/1441133180?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/fa/5b/89/fa5b898d-bad6-e053-4195-260e5c74f2bb/00602567725466.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Beatles (White Album)' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/beatles-for-sale/1441165005?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/79/2c/10/792c1019-387f-e819-ac8f-bc989f20a970/00602567725190.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Beatles For Sale' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/help/1441164524?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/1a/19/db/1a19db26-17ad-b986-11a9-f72ac7a6194b/18UMGIM31214.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Help!' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/let-it-be/1441164495?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/ae/98/4c/ae984c7a-cd06-a7cd-e8bf-32cb15ba698d/00602567705475.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Let It Be' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/magical-mystery-tour/1441163490?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/43/0e/37/430e3790-75d5-c96a-1380-f9d9803aa700/18UMGIM31245.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Magical Mystery Tour' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/please-please-me/1441164816?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/9c/ff/b5/9cffb5a6-a37f-c84a-7240-0333a071bc92/00602567725275.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Please Please Me' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/revolver/1441164670?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/58/4a/10/584a1058-de0a-6a6b-d0bd-da09a028b8bc/00602567705499.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Revolver' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/rubber-soul/1441164359?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/af/20/aa/af20aa89-4002-11fb-25d8-ff544af67eb4/00602567725404.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Rubber Soul' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/sgt-peppers-lonely-hearts-club-band/1441164604?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/6f/79/8d/6f798d84-7475-8525-fc91-f7b51b2b5a9b/00602567725428.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Sgt Peppers Lonely Hearts Club Band' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/sgt-peppers-lonely-hearts-club-band/1441164604?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/6f/79/8d/6f798d84-7475-8525-fc91-f7b51b2b5a9b/00602567725428.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Sgt. Peppers Lonely Hearts Club Band' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

-- https://music.apple.com/us/album/past-masters-vols-1-2/1441133181?uo=4
UPDATE songs SET album_cover_url='https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/01/69/02/01690216-48fc-1c54-b1de-48170d16b1c3/00602567725268.rgb.jpg/600x600bb.jpg' WHERE LOWER(artist)='the beatles' AND album='Single' AND (album_cover_url IS NULL OR TRIM(album_cover_url)='');

COMMIT;
