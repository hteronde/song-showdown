import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { disposableMysql } from './test-support/disposable-mysql.mjs';
import { createApiServer } from './api-server.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';

const enabled = process.env.HTTP_DB_TESTS === '1';
test('HTTP + disposable MySQL integration', {skip: !enabled, timeout: 120000}, async t => {
  const db = await disposableMysql();
  const app = createApiServer({pool: db.pool});
  try {
    await new Promise((resolve,reject) => {app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
    const base = `http://127.0.0.1:${app.server.address().port}`;
    async function http(path, {cookie, method='GET', body} = {}) {
      const response = await fetch(base+path,{method,signal:AbortSignal.timeout(15000),headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
    }
    const password='Integration password 123';
    const passwordHash=await hashPassword(password);
    const families=[];
    for(let i=0;i<2;i++) {
      const [family]=await db.pool.execute('INSERT INTO families (name) VALUES (?)',[`Integration family ${i}`]);
      const familyId=Number(family.insertId),users=[];
      for(const role of ['owner','member']) {
        const email=`${role}-${i}@integration.example`;
        const [user]=await db.pool.execute('INSERT INTO users (family_id,email,display_name,role,password_hash) VALUES (?,?,?,?,?)',[familyId,email,`${role} ${i}`,role,passwordHash]);
        const login=await http('/api/auth/login',{method:'POST',body:{username:email,password}});
        assert.equal(login.status,200);assert.ok(login.cookie);assert.match(login.headers.get('set-cookie'),/HttpOnly/);
        users.push({id:Number(user.insertId),email,cookie:login.cookie});
      }
      families.push({id:familyId,owner:users[0],member:users[1]});
    }
    let sequence=0;
    async function bracket(family,{complete=false,anonymous=false,finale=false}={}) {
      const [created]=await db.pool.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,status,start_at,completed_at,anonymous,session_duration_minutes,tiebreaker_option,finale_at,finale_start_round) VALUES (?,?,?,?,?,DATE_SUB(NOW(),INTERVAL 1 HOUR),?,?,NULL,'random',?,?)",[family.id,family.owner.id,`Test bracket ${++sequence}`,'Test artist',complete?'complete':'active',complete?new Date():null,anonymous,finale?new Date():null,finale?1:null]);
      const id=Number(created.insertId),entries=[],weeks=[],matches=[];
      for(const user of [family.owner,family.member])await db.pool.execute('INSERT INTO bracket_members (bracket_id,family_id,user_id) VALUES (?,?,?)',[id,family.id,user.id]);
      for(let i=0;i<4;i++) {
        const [song]=await db.pool.execute('INSERT INTO songs (artist,title) VALUES (?,?)',['Test artist',`Song ${sequence}-${i}`]);
        const [entry]=await db.pool.execute('INSERT INTO bracket_songs (bracket_id,position,region_number,song_id,seed_number) VALUES (?,?,1,?,?)',[id,i+1,song.insertId,i+1]);entries.push(Number(entry.insertId));
      }
      for(let round=1;round<=2;round++) {
        const [r]=await db.pool.execute('INSERT INTO bracket_rounds (bracket_id,round_number,name) VALUES (?,?,?)',[id,round,round===1?'Final Four':'Championship']);
        const [week]=await db.pool.execute('INSERT INTO bracket_weeks (bracket_id,round_id,week_number,opens_at) VALUES (?,?,?,?)',[id,r.insertId,round,round===1?new Date(Date.now()-60000):null]);weeks.push(Number(week.insertId));
      }
      for(const [week,a,b] of [[weeks[0],entries[0],entries[1]],[weeks[0],entries[2],entries[3]],[weeks[1],entries[0],entries[2]]]) {
        const [m]=await db.pool.execute('INSERT INTO matchups (bracket_id,week_id,matchup_number,song_a_entry_id,song_b_entry_id,winner_entry_id) VALUES (?,?,?,?,?,?)',[id,week,matches.length+1,a,b,complete?a:null]);matches.push(Number(m.insertId));
      }
      await db.pool.execute("UPDATE matchups SET next_matchup_id=?,next_slot='A' WHERE matchup_id=?",[matches[2],matches[0]]);
      await db.pool.execute("UPDATE matchups SET next_matchup_id=?,next_slot='B' WHERE matchup_id=?",[matches[2],matches[1]]);
      if(finale)await db.pool.execute("INSERT INTO bracket_finale_sessions (bracket_id,started_by_user_id,start_round_number,status) VALUES (?,?,1,'active')",[id,family.owner.id]);
      return {id,entries,weeks,matches};
    }
    const a=families[0],b=families[1];
    const vote=(br,user,index=0,entry=br.entries[index*2])=>http(`/api/matchups/${br.matches[index]}/votes`,{cookie:user.cookie,method:'POST',body:{userId:user.id,selectedEntryId:entry,comment:'Test vote'}});

    await t.test('HTTP authorization blocks unrelated owners and members on history, voting, finale reads/writes',async()=>{
      const foreign=await bracket(b,{complete:true});
      assert.equal((await http(`/api/brackets/${foreign.id}`)).status,401);
      for(const user of [a.owner,a.member])for(const suffix of ['', '/voting','/finale-options']) {
        const result=await http(`/api/brackets/${foreign.id}${suffix}`,{cookie:user.cookie});assert.equal(result.status,404);assert.equal(result.body.bracket,undefined);assert.equal(result.body.participants,undefined);
      }
      for(const user of [a.owner,a.member])for(const suffix of ['/finale','/finale/votes','/finale/participants','/finale/exit','/finale/resume']) {
        assert.equal((await http(`/api/brackets/${foreign.id}${suffix}`,{cookie:user.cookie,method:'POST',body:{}})).status,404);
      }
      assert.equal((await http(`/api/admin/brackets/${foreign.id}`,{cookie:a.owner.cookie})).status,404);
      assert.equal((await vote(foreign,a.owner)).status,404);
      assert.equal((await vote(foreign,a.member)).status,404);
      assert.equal((await http(`/api/brackets/${foreign.id}`,{cookie:b.member.cookie})).status,200);
      assert.equal((await http(`/api/admin/brackets/${foreign.id}`,{cookie:b.member.cookie})).status,403);
    });
    await t.test('login → vote → refreshed API data preserves selection; edits replace rather than duplicate votes',async()=>{
      const br=await bracket(a);
      assert.equal((await vote(br,a.member)).status,200);
      const result=await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});assert.equal(result.status,200);
      assert.equal(result.body.weeks[0].matchups[0].selectedEntryId,br.entries[0]);
      assert.equal((await vote(br,a.member,0,br.entries[1])).status,200);
      const refreshed=await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});assert.equal(refreshed.body.weeks[0].matchups[0].selectedEntryId,br.entries[1]);
      const [[count]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE matchup_id=? AND user_id=?',[br.matches[0],a.member.id]);assert.equal(Number(count.total),1);
      assert.equal((await vote(br,a.member,0,br.entries[2])).status,400);
      assert.equal((await http(`/api/matchups/${br.matches[0]}/votes`,{cookie:a.member.cookie,method:'POST',body:{userId:a.owner.id,selectedEntryId:br.entries[0]}})).status,403);
    });
    await t.test('anonymous HTTP views retain own vote but hide other participant identities',async()=>{
      const br=await bracket(a,{anonymous:true});
      assert.equal((await vote(br,a.member)).status,200);assert.equal((await vote(br,a.owner)).status,200);
      await db.pool.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE week_id=?',[br.weeks[0]]);
      const result=await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});assert.equal(result.status,200);
      const match=result.body.weeks[0].matchups[0];assert.equal(match.selectedEntryId,br.entries[0]);assert.deepEqual(match.ballots,[]);assert.equal(match.voteCountA,2);
      const admin=await http(`/api/brackets/${br.id}/voting`,{cookie:a.owner.cookie});assert.equal(admin.body.weeks[0].matchups[0].ballots.length,2);
    });
    await t.test('HTTP setup rejects email-only claims, expired tokens and token replay; logout revokes its session',async()=>{
      const email='initial@integration.example';
      const [created]=await db.pool.execute("INSERT INTO users (family_id,email,display_name,role) VALUES (?,?,?,'member')",[a.id,email,'Initial user']);
      assert.equal((await http('/api/auth/setup-password',{method:'POST',body:{username:email,password}})).status,400);
      const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
      await db.pool.execute('INSERT INTO password_reset_tokens (token_hash,user_id,expires_at) VALUES (?,?,DATE_SUB(NOW(),INTERVAL 1 MINUTE))',[hash,created.insertId]);
      assert.equal((await http('/api/auth/setup-password',{method:'POST',body:{token,password}})).status,400);
      await db.pool.execute('UPDATE password_reset_tokens SET expires_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE token_hash=?',[hash]);
      assert.equal((await http('/api/auth/setup-password',{method:'POST',body:{token,password}})).status,200);
      assert.equal((await http('/api/auth/reset-password',{method:'POST',body:{token,password:'Replay password 123'}})).status,400);
      const [[row]]=await db.pool.execute('SELECT password_hash FROM users WHERE user_id=?',[created.insertId]);assert.ok(await verifyPassword(password,row.password_hash));
      const login=await http('/api/auth/login',{method:'POST',body:{username:email,password}});assert.equal(login.status,200);
      assert.equal((await http('/api/auth/logout',{cookie:login.cookie,method:'POST',body:{}})).status,200);
      assert.equal((await http('/api/auth/session',{cookie:login.cookie})).body.authenticated,false);
    });
    await t.test('MySQL constraints reject foreign-family membership and a song outside the matchup',async()=>{
      const br=await bracket(a);
      await assert.rejects(db.pool.execute('INSERT INTO bracket_members (bracket_id,family_id,user_id) VALUES (?,?,?)',[br.id,a.id,b.member.id]),{code:'ER_NO_REFERENCED_ROW_2'});
      await assert.rejects(db.pool.execute('INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at) VALUES (?,?,?,?,NOW())',[br.id,br.matches[0],a.member.id,br.entries[2]]),error=>error.sqlState==='45000');
      await assert.rejects(db.pool.execute('UPDATE matchups SET winner_entry_id=? WHERE matchup_id=?',[br.entries[2],br.matches[0]]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'});
    });
    await t.test('a SQL failure halfway through an HTTP ballot save rolls back earlier ballot writes',async()=>{
      const br=await bracket(a);
      const path=`/api/admin/brackets/${br.id}/matchups/${br.matches[0]}/ballots`;
      const loaded=await http(path,{cookie:a.owner.cookie});assert.equal(loaded.status,200);assert.equal(loaded.body.canEdit,true);
      await db.pool.query(`CREATE TRIGGER integration_reject_vote BEFORE INSERT ON votes FOR EACH ROW BEGIN IF NEW.user_id=${a.member.id} AND NEW.matchup_id=${br.matches[0]} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Integration rollback failure'; END IF; END`);
      try {
        const result=await http(path,{cookie:a.owner.cookie,method:'PUT',body:{revision:loaded.body.revision,ballots:[{userId:a.owner.id,selectedEntryId:br.entries[0]},{userId:a.member.id,selectedEntryId:br.entries[0]}],tieBreakEntryId:null}});
        assert.equal(result.status,500);
        const [[row]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE matchup_id=?',[br.matches[0]]);assert.equal(Number(row.total),0);
      } finally {await db.pool.query('DROP TRIGGER integration_reject_vote');}
    });
    await db.pool.query('CREATE TABLE integration_winner_writes (matchup_id BIGINT UNSIGNED NOT NULL,winner_entry_id BIGINT UNSIGNED NOT NULL)');
    await db.pool.query(`CREATE TRIGGER integration_audit_winner AFTER UPDATE ON matchups FOR EACH ROW BEGIN
      IF NEW.winner_entry_id IS NOT NULL THEN INSERT INTO integration_winner_writes (matchup_id,winner_entry_id) VALUES (NEW.matchup_id,NEW.winner_entry_id); END IF; END`);
    await t.test('simultaneous HTTP participant votes persist once and parallel refreshes advance winners once',async()=>{
      const br=await bracket(a);
      const results=await Promise.all([vote(br,a.owner,0),vote(br,a.member,0),vote(br,a.owner,1),vote(br,a.member,1)]);
      assert.deepEqual(results.map(r=>r.status),[200,200,200,200]);
      const reads=await Promise.all(Array.from({length:4},()=>http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})));assert.ok(reads.every(r=>r.status===200));
      const [rows]=await db.pool.execute('SELECT matchup_id,winner_entry_id,song_a_entry_id,song_b_entry_id FROM matchups WHERE bracket_id=? ORDER BY matchup_id',[br.id]);
      assert.equal(rows[0].winner_entry_id,br.entries[0]);assert.equal(rows[1].winner_entry_id,br.entries[2]);assert.equal(rows[2].song_a_entry_id,br.entries[0]);assert.equal(rows[2].song_b_entry_id,br.entries[2]);assert.equal(rows[2].winner_entry_id,null);
      const [[count]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE bracket_id=?',[br.id]);assert.equal(Number(count.total),4);
      const [before]=await db.pool.execute('SELECT * FROM matchups WHERE bracket_id=? ORDER BY matchup_id',[br.id]);
      await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});
      const [after]=await db.pool.execute('SELECT * FROM matchups WHERE bracket_id=? ORDER BY matchup_id',[br.id]);assert.deepEqual(after,before);
      const [writes]=await db.pool.execute('SELECT matchup_id,COUNT(*) AS total FROM integration_winner_writes WHERE matchup_id IN (?,?) GROUP BY matchup_id ORDER BY matchup_id',[br.matches[0],br.matches[1]]);
      assert.equal(writes.length,2);assert.ok(writes.every(row=>Number(row.total)===1));
    });
    await t.test('two HTTP manual advancement requests cannot apply the same week transition twice',async()=>{
      const br=await bracket(a);
      // Keep both matchups tied so the transaction also records one random tiebreak per matchup.
      for(let i=0;i<2;i++)for(const [user,entry] of [[a.owner,br.entries[i*2]],[a.member,br.entries[i*2+1]]])await db.pool.execute('INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at) VALUES (?,?,?,?,NOW())',[br.id,br.matches[i],user.id,entry]);
      const path=`/api/admin/brackets/${br.id}/advance-week`,body={weekId:br.weeks[0],nextClosesAt:null};
      const results=await Promise.all([http(path,{cookie:a.owner.cookie,method:'POST',body}),http(path,{cookie:a.owner.cookie,method:'POST',body})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const [winners]=await db.pool.execute('SELECT winner_entry_id,random_tiebreaker_vote_entry_id FROM matchups WHERE bracket_id=? AND week_id=?',[br.id,br.weeks[0]]);
      assert.ok(winners.every(row=>row.winner_entry_id!=null && row.winner_entry_id===row.random_tiebreaker_vote_entry_id));
      const [before]=await db.pool.execute('SELECT * FROM matchups WHERE bracket_id=? ORDER BY matchup_id',[br.id]);
      assert.equal((await http(path,{cookie:a.owner.cookie,method:'POST',body})).status,409);
      const [after]=await db.pool.execute('SELECT * FROM matchups WHERE bracket_id=? ORDER BY matchup_id',[br.id]);assert.deepEqual(after,before);
      const [writes]=await db.pool.execute('SELECT matchup_id,COUNT(*) AS total FROM integration_winner_writes WHERE matchup_id IN (?,?) GROUP BY matchup_id ORDER BY matchup_id',[br.matches[0],br.matches[1]]);
      assert.equal(writes.length,2);assert.ok(writes.every(row=>Number(row.total)===1));
    });
  } finally {
    try { await app.close(); }
    finally { await db.dispose(); }
  }
});
