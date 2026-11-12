// Preview by default. --apply deletes only unassigned duplicates after backing them up.
// Use --expected-brackets=1 only for a local database with no retained copy bracket.
import mysql from 'mysql2/promise';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const apply=process.argv.includes('--apply');
const expected=Number(process.argv.find(arg=>arg.startsWith('--expected-brackets='))?.split('=')[1]||2);
if(![1,2].includes(expected))throw Error('Expected bracket count must be 1 or 2.');
const titles=expected===1?['Radiohead Bracket']:['Radiohead Bracket','Radiohead Bracket copy'];
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||8889),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'music_bracket',...(process.env.DB_SSL==='true'?{ssl:{rejectUnauthorized:true}}:{})});
try {
  await c.beginTransaction();
  const [brackets]=await c.execute(`SELECT bracket_id,title FROM brackets WHERE title IN (${titles.map(()=>'?').join(',')}) ORDER BY bracket_id FOR UPDATE`,titles);
  if(brackets.length!==expected || titles.some(title=>brackets.filter(b=>b.title===title).length!==1))throw Error('Expected retained brackets were not found uniquely. Nothing deleted.');
  const [songs]=await c.execute("SELECT * FROM songs WHERE LOWER(TRIM(artist))='radiohead' ORDER BY song_id FOR UPDATE");
  const [assignments]=await c.execute("SELECT bs.song_id,bs.bracket_id FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id WHERE LOWER(TRIM(s.artist))='radiohead'");
  const bracketIds=new Set(brackets.map(b=>Number(b.bracket_id)));
  const protectedIds=new Set(assignments.filter(a=>bracketIds.has(Number(a.bracket_id))).map(a=>Number(a.song_id)));
  const protectedSongs=songs.filter(s=>protectedIds.has(Number(s.song_id)));
  const songTitles=new Set(protectedSongs.map(s=>s.title));
  if(!songTitles.size)throw Error('Retained brackets have no Radiohead songs. Nothing deleted.');
  for(const title of songTitles) {
    const retained=protectedSongs.filter(s=>s.title===title);
    if(retained.length!==expected || brackets.some(b=>!retained.some(s=>assignments.some(a=>Number(a.song_id)===Number(s.song_id)&&Number(a.bracket_id)===Number(b.bracket_id)))))throw Error(`Retained bracket song lists differ for ${title}. Nothing deleted.`);
  }
  const assignedIds=new Set(assignments.map(a=>Number(a.song_id)));
  const candidates=songs.filter(s=>songTitles.has(s.title)&&!protectedIds.has(Number(s.song_id)));
  if(candidates.some(s=>assignedIds.has(Number(s.song_id))))throw Error('Additional Radiohead copies belong to other brackets. Nothing deleted.');
  console.log(JSON.stringify({mode:apply?'apply':'preview',retainedBrackets:brackets,retainedSongs:protectedSongs.length,unassignedDuplicates:candidates.length,unrelatedRadioheadSongs:songs.filter(s=>!songTitles.has(s.title)).length}));
  if(apply&&candidates.length) {
    const directory=new URL('../.local-backups/',import.meta.url);
    await mkdir(directory,{recursive:true,mode:0o700});
    const file=new URL(`radiohead-songs-${Date.now()}.json`,directory);
    await writeFile(file,JSON.stringify({createdAt:new Date().toISOString(),database:process.env.DB_NAME||'music_bracket',retainedBrackets:brackets,songs:candidates},null,2),{mode:0o600,flag:'wx'});
    console.log('Recovery copy: '+fileURLToPath(file));
    for(const song of candidates) {
      const [result]=await c.execute('DELETE FROM songs WHERE song_id=? AND NOT EXISTS(SELECT 1 FROM bracket_songs bs WHERE bs.song_id=songs.song_id)',[song.song_id]);
      if(result.affectedRows!==1)throw Error('Assignments changed during cleanup. Rolling back.');
    }
    const [remaining]=await c.execute("SELECT s.song_id,s.title FROM songs s WHERE LOWER(TRIM(s.artist))='radiohead'");
    for(const title of songTitles)if(remaining.filter(s=>s.title===title).length!==expected)throw Error('Unexpected remaining song count. Rolling back.');
    if(protectedSongs.some(s=>!remaining.some(r=>Number(r.song_id)===Number(s.song_id))))throw Error('Retained song missing. Rolling back.');
    await c.commit();console.log(`Deleted ${candidates.length} unassigned duplicates; retained ${protectedSongs.length} assigned songs.`);
  } else {await c.rollback();console.log(apply?'No duplicates to delete.':'Preview only; no records changed.');}
} catch(error) {await c.rollback();console.error(error.code||error.message);process.exitCode=1;}
finally {await c.end();}
