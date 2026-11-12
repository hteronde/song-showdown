import {sendBracketEmail} from './bracket-email.mjs';
import { processSessionEmails } from './session-emails.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { schemaStatements, disposableMysql } from './test-support/disposable-mysql.mjs';
import { createApiServer } from './api-server.mjs';
import { sendBracketInvitations } from './bracket-invitations.mjs';
import { hashPassword, verifyPassword } from './passwords.mjs';

const enabled = process.env.HTTP_DB_TESTS === '1';
test('HTTP + disposable MySQL integration', {skip: !enabled, timeout: 120000}, async t => {
  const db = await disposableMysql();
  const customEmails=[];
  const statusNotifications=[];
  let failStatusNotification=false;
  const app = createApiServer({pool: db.pool, sendCustomEmail:(pool,id,input)=>sendBracketEmail(pool,id,input,{env:{APP_URL:'https://example.com',RESEND_API_KEY:'test-only',EMAIL_FROM:'test@example.com'},pause:async()=>{},deliver:async message=>{customEmails.push(message);}}), sendInvitations: async () => ({sent:0,failed:0}),sendStatusNotifications:async changes=>{
    if(failStatusNotification)throw new Error('Test email provider failure');
    for(const change of changes) {
      const [[member]]=await db.pool.execute('SELECT bm.invitation_status FROM bracket_members bm JOIN users u ON u.user_id=bm.user_id WHERE bm.bracket_id=? AND u.email=?',[change.bracketId,change.email]);
      assert.equal(member.invitation_status,change.status,'Notification must follow database commit');
      statusNotifications.push(change);
    }
    return {sent:changes.length,failed:0};
  }});
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
      for(const user_role of ['super','viewer']) {
        const email=`${user_role}-${i}@integration.example`;
        const [user]=await db.pool.execute('INSERT INTO users (family_id,email,display_name,user_role,password_hash) VALUES (?,?,?,?,?)',[familyId,email,`${user_role} ${i}`,user_role,passwordHash]);
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

    await t.test('custom bracket email is scoped to managers and accepted participants',async()=>{
      const family=families[0], other=families[1], br=await bracket(family);
      const path=`/api/admin/brackets/${br.id}/email`;
      const body={subject:'Bracket news',body:'Hello\nEveryone',requestId:'12345678-1234-1234-1234-123456789abc'};
      assert.notEqual((await http(path,{method:'POST',cookie:family.member.cookie,body})).status,200);
      assert.notEqual((await http(path,{method:'POST',cookie:other.owner.cookie,body})).status,200);
      assert.equal(customEmails.length,0);
      await db.pool.execute('UPDATE bracket_members SET non_finale_participant=FALSE,finale_participant=FALSE WHERE bracket_id=? AND user_id=?',[br.id,family.owner.id]);
      const allRoles=await http(path,{method:'POST',cookie:family.owner.cookie,body});
      assert.equal(allRoles.status,200);assert.deepEqual(allRoles.body,{sent:2,failed:0});
      assert.deepEqual(customEmails.map(message=>message.to).sort(),[family.owner.email,family.member.email].sort());
      customEmails.length=0;
      await db.pool.execute("UPDATE bracket_members SET invitation_status='declined' WHERE bracket_id=? AND user_id=?",[br.id,family.member.id]);
      const sent=await http(path,{method:'POST',cookie:family.owner.cookie,body});
      assert.equal(sent.status,200);assert.deepEqual(sent.body,{sent:1,failed:0});
      assert.equal(customEmails[0].to,family.owner.email);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='accepted',bracket_role='commissioner' WHERE bracket_id=? AND user_id=?",[br.id,family.member.id]);
      const commissioner=await http(path,{method:'POST',cookie:family.member.cookie,body});
      assert.equal(commissioner.status,200);assert.equal(commissioner.body.sent,2);
      assert.deepEqual(customEmails.slice(-2).map(message=>message.to).sort(),[family.owner.email,family.member.email].sort());
      assert.equal((await http(path,{method:'POST',cookie:family.owner.cookie,body:{...body,subject:''}})).status,400);
      await db.pool.execute("UPDATE bracket_members SET bracket_role='member' WHERE bracket_id=?",[br.id]);
    });
    await t.test('commissioner permissions are scoped, accepted, and revocable; roles remain super-managed',async()=>{
      const br=await bracket(a),other=await bracket(a),foreign=await bracket(b);
      const path=`/api/admin/brackets/${br.id}`;
      const members=[a.owner.id,a.member.id];
      const assign=(role)=>http(`${path}/participants`,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:members,participantRoles:{[a.member.id]:role}}});
      assert.equal((await assign('commissioner')).status,200);
      assert.equal((await http(path,{cookie:a.member.cookie})).body.bracket.participantRoles[a.member.id],'commissioner');
      assert.equal((await http(`${path}/pause`,{cookie:a.member.cookie,method:'POST',body:{}})).status,200);
      assert.equal((await http(`${path}/resume`,{cookie:a.member.cookie,method:'POST',body:{}})).status,200);
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).body.canManage,true);
      const list=await http('/api/admin/brackets',{cookie:a.member.cookie});
      assert.deepEqual(list.body.brackets.map(row=>row.bracketId),[br.id]);
      for(const id of [other.id,foreign.id])assert.equal((await http(`/api/admin/brackets/${id}`,{cookie:a.member.cookie})).status,404);
      assert.equal((await http('/api/family-members',{cookie:a.member.cookie})).status,403);
      assert.equal((await http('/api/admin/brackets',{cookie:a.member.cookie,method:'POST',body:{}})).status,403);
      assert.equal((await http(`${path}/participants`,{cookie:a.member.cookie,method:'PUT',body:{participantIds:members,participantRoles:{[a.owner.id]:'commissioner'}}})).status,403);
      assert.equal((await assign('super')).status,400);
      // Shared songs are isolated when a commissioner edits only their bracket.
      const [[source]]=await db.pool.execute('SELECT song_id FROM bracket_songs WHERE bracket_song_id=?',[br.entries[0]]);
      await db.pool.execute('UPDATE bracket_songs SET song_id=? WHERE bracket_song_id=?',[source.song_id,other.entries[0]]);
      const detail=(await http(path,{cookie:a.member.cookie})).body.bracket;
      const edited=await http(`${path}/songs`,{cookie:a.member.cookie,method:'PUT',body:{songs:detail.songs.map((song,i)=>({...song,title:i===0?'Commissioner edit':song.title}))}});
      assert.equal(edited.status,200,JSON.stringify(edited.body));
      const [[original]]=await db.pool.execute('SELECT title FROM songs WHERE song_id=?',[source.song_id]);
      assert.notEqual(original.title,'Commissioner edit');
      await db.pool.execute("UPDATE bracket_members SET invitation_status='pending' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      assert.equal((await http(path,{cookie:a.member.cookie})).status,404);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='accepted' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      assert.equal((await assign('member')).status,200);
      assert.equal((await http(path,{cookie:a.member.cookie})).status,404);
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).body.canManage,false);
      assert.equal((await vote(br,a.member)).status,200);
    });

    await t.test('accepting a commissioner invitation never opens voting before the scheduled start',async()=>{
      const br=await bracket(a);
      await db.pool.execute("UPDATE brackets SET start_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE bracket_id=?",[br.id]);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='pending' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      await db.pool.execute("UPDATE bracket_members SET bracket_role='commissioner' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      const [[before]]=await db.pool.execute('SELECT start_at FROM brackets WHERE bracket_id=?',[br.id]);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie,method:'POST',body:{response:'accepted'}})).status,200);
      const [[after]]=await db.pool.execute('SELECT start_at FROM brackets WHERE bracket_id=?',[br.id]);
      assert.equal(after.start_at.getTime(),before.start_at.getTime());
      const navigation=await http('/api/my/brackets',{cookie:a.member.cookie});
      const link=navigation.body.brackets.find(row=>row.bracketId===br.id);
      assert.ok(link);assert.equal(link.navigationStatus,'upcoming');assert.equal(link.invitationStatus,'accepted');
      await db.pool.execute("UPDATE bracket_weeks SET opens_at=DATE_SUB(NOW(),INTERVAL 2 MINUTE),closes_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE week_id=?",[br.weeks[0]]);
      const view=await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});
      assert.equal(view.status,200);assert.equal(view.body.isUpcoming,true);assert.deepEqual(view.body.weeks,[]);
      const [[results]]=await db.pool.execute('SELECT COUNT(*) AS total FROM matchups WHERE bracket_id=? AND winner_entry_id IS NOT NULL',[br.id]);assert.equal(Number(results.total),0);
      await db.pool.execute('UPDATE bracket_weeks SET closes_at=NULL WHERE week_id=?',[br.weeks[0]]);
      const ballotPath=`/api/admin/brackets/${br.id}/matchups/${br.matches[0]}/ballots`;
      const editor=await http(ballotPath,{cookie:a.member.cookie});
      assert.equal(editor.status,200);assert.equal(editor.body.canEdit,false);
      assert.equal((await http(ballotPath,{cookie:a.member.cookie,method:'PUT',body:{revision:editor.body.revision,ballots:[{userId:a.member.id,selectedEntryId:br.entries[0]}]}})).status,409);
      assert.equal((await http(`/api/admin/brackets/${br.id}/advance-week`,{cookie:a.member.cookie})).status,409);
      assert.equal((await http(`/api/brackets/${br.id}/finale`,{cookie:a.member.cookie,method:'POST',body:{startRoundNumber:1,participantIds:[a.member.id]}})).status,409);
      // Even stale session timestamps in the past must not bypass the bracket start.
      assert.equal((await vote(br,a.member)).status,409);
      const [[count]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE bracket_id=?',[br.id]);assert.equal(Number(count.total),0);
      await db.pool.execute("UPDATE brackets SET start_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE bracket_id=?",[br.id]);
      await db.pool.execute("UPDATE bracket_weeks SET opens_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE week_id=?",[br.weeks[0]]);
      assert.equal((await vote(br,a.member)).status,409);
      await db.pool.execute("UPDATE bracket_weeks SET opens_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE week_id=?",[br.weeks[0]]);
      assert.equal((await vote(br,a.member)).status,200);
      const startedNavigation=await http('/api/my/brackets',{cookie:a.member.cookie});
      assert.equal(startedNavigation.body.brackets.find(row=>row.bracketId===br.id).navigationStatus,'active');
    });

    await t.test('invitations gate all bracket details until acceptance and removal revokes access',async()=>{
      const br=await bracket(a);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='pending' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      const invite=await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie});
      assert.equal(invite.status,200);assert.equal(invite.body.canAccess,false);
      assert.deepEqual(Object.keys(invite.body).sort(),['bracketId','title','artist','startAt','invitationStatus','canAccess'].sort());
      for(const suffix of ['', '/voting','/finale-options'])assert.equal((await http(`/api/brackets/${br.id}${suffix}`,{cookie:a.member.cookie})).status,404);
      assert.equal((await vote(br,a.member)).status,404);
      const history=await http('/api/brackets',{cookie:a.member.cookie});
      assert.ok(!history.body.brackets.some(row=>row.bracketId===br.id));
      const navigation=await http('/api/my/brackets',{cookie:a.member.cookie});
      assert.equal(navigation.body.brackets.find(row=>row.bracketId===br.id).invitationStatus,'pending');
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:b.member.cookie})).status,404);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:b.member.cookie,method:'POST',body:{response:'accepted'}})).status,404);
      assert.equal((await http(`/api/admin/brackets/${br.id}/invitations`,{cookie:a.member.cookie})).status,404);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie,method:'POST',body:{response:'accepted',userId:a.owner.id}})).status,200);
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).status,200);
      assert.equal((await vote(br,a.member)).status,200);
      const removed=await http(`/api/admin/brackets/${br.id}/participants`,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:[a.owner.id]}});
      assert.equal(removed.status,200);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie})).status,404);
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).status,404);
      assert.equal((await vote(br,a.member)).status,404);
      const [[votes]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE bracket_id=? AND user_id=?',[br.id,a.member.id]);assert.equal(Number(votes.total),1);
      assert.equal((await http(`/api/admin/brackets/${br.id}/participants`,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:[a.owner.id,a.member.id]}})).status,200);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie})).body.invitationStatus,'pending');
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).status,404);
    });

    await t.test('declining is idempotent, keeps details private, and cannot be reversed by replay',async()=>{
      const br=await bracket(a);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='pending' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      for(let i=0;i<2;i++)assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie,method:'POST',body:{response:'declined'}})).status,200);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie,method:'POST',body:{response:'accepted'}})).status,409);
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).status,404);
      assert.ok(!(await http('/api/my/brackets',{cookie:a.member.cookie})).body.brackets.some(row=>row.bracketId===br.id));
      assert.equal((await http(`/api/admin/brackets/${br.id}/participants`,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:[]}})).status,200);
      const [[count]]=await db.pool.execute('SELECT COUNT(*) AS total FROM bracket_members WHERE bracket_id=?',[br.id]);assert.equal(Number(count.total),0);
    });

    await t.test('publishing creates pending invitations; email retry and concurrent response preserve consent',async()=>{
      const created=await http('/api/admin/brackets',{cookie:a.owner.cookie,method:'POST',body:{title:'Invitation test',artist:'Hidden songs',songCount:4,songList:'Secret A\nSecret B\nSecret C\nSecret D',participantIds:[a.owner.id,a.member.id],startAt:'2027-06-01T18:00:00Z',songsPerSession:2,sessionDurationMinutes:null,tiebreakerOption:'random'}});
      assert.equal(created.status,201,JSON.stringify(created.body));
      const id=created.body.bracketId;
      const [members]=await db.pool.execute('SELECT invitation_status FROM bracket_members WHERE bracket_id=?',[id]);
      assert.ok(members.every(row=>row.invitation_status==='pending'));
      const env={APP_URL:'https://thesongshowdown.com',RESEND_API_KEY:'test',EMAIL_FROM:'sender@example.com'};
      const delivered=[];
      const first=await sendBracketInvitations(db.pool,id,{env,deliver:async message=>{if(message.to===a.member.email)throw Error('Temporary provider failure');delivered.push(message.to);}});
      assert.deepEqual(first,{sent:1,failed:1});
      await db.pool.execute("UPDATE bracket_members SET invitation_attempt_at=DATE_SUB(NOW(),INTERVAL 2 MINUTE) WHERE bracket_id=? AND invitation_delivery='failed'",[id]);
      const retry=await sendBracketInvitations(db.pool,id,{env,deliver:async message=>{delivered.push(message.to);}});
      assert.deepEqual(retry,{sent:1,failed:0});
      assert.deepEqual(await sendBracketInvitations(db.pool,id,{env,deliver:async()=>assert.fail('must not resend')}),{sent:0,failed:0});
      assert.equal(delivered.length,2);
      const responses=await Promise.all(['accepted','declined'].map(response=>http(`/api/brackets/${id}/invitation`,{cookie:a.member.cookie,method:'POST',body:{response}})));
      assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
      const status=(await http(`/api/brackets/${id}/invitation`,{cookie:a.member.cookie})).body.invitationStatus;
      assert.ok(['accepted','declined'].includes(status));
      assert.equal((await http(`/api/admin/brackets/${id}/participants`,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:[a.owner.id,a.member.id]}})).status,200);
      assert.equal((await http(`/api/brackets/${id}/invitation`,{cookie:a.member.cookie})).body.invitationStatus,status);
    });

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
      assert.equal((await http(`/api/admin/brackets/${foreign.id}`,{cookie:b.member.cookie})).status,404);
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
      const [created]=await db.pool.execute("INSERT INTO users (family_id,email,display_name,user_role) VALUES (?,?,?,'viewer')",[a.id,email,'Initial user']);
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
    await t.test('duplicating excludes votes and invitations, including after selecting draft participants',async()=>{
      const source=await bracket(a);
      assert.equal((await vote(source,a.member)).status,200);
      const copied=await http(`/api/admin/brackets/${source.id}/duplicate`,{cookie:a.owner.cookie,method:'POST',body:{participantIds:[a.member.id],participantRoles:{[a.member.id]:'commissioner'}}});
      assert.equal(copied.status,201);assert.equal(copied.body.status,'draft');
      const id=copied.body.bracketId;
      const [[counts]]=await db.pool.execute('SELECT (SELECT COUNT(*) FROM votes WHERE bracket_id=?) AS votes,(SELECT COUNT(*) FROM bracket_members WHERE bracket_id=?) AS members,(SELECT COUNT(*) FROM matchups WHERE bracket_id=?) AS matchups',[id,id,id]);
      assert.deepEqual([Number(counts.votes),Number(counts.members),Number(counts.matchups)],[0,0,0]);
      assert.equal((await http(`/api/admin/brackets/${id}/participants`,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:[a.member.id]}})).status,200);
      const delivered=[];
      const sent=await sendBracketInvitations(db.pool,id,{deliver:async message=>delivered.push(message),env:{APP_URL:'https://thesongshowdown.com',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'}});
      assert.deepEqual(sent,{sent:0,failed:0});assert.equal(delivered.length,0);
      const [[original]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE bracket_id=?',[source.id]);assert.equal(Number(original.total),1);
    });

    await t.test('super can delete a voted active bracket and all its dependent records atomically',async()=>{
      const br=await bracket(a,{finale:true}),other=await bracket(a);
      await db.pool.execute('INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at) VALUES (?,?,?,?,NOW())',[br.id,br.matches[0],a.member.id,br.entries[0]]);
      await db.pool.execute('UPDATE matchups SET winner_entry_id=? WHERE matchup_id=?',[br.entries[0],br.matches[0]]);
      await db.pool.execute('INSERT INTO matchup_reported_totals (bracket_id,matchup_id,votes_a,votes_b) VALUES (?,?,1,0)',[br.id,br.matches[0]]);
      const [album]=await db.pool.execute("INSERT INTO bracket_albums (bracket_id,title) VALUES (?,'Delete test album')",[br.id]);
      await db.pool.execute('UPDATE bracket_songs SET bracket_album_id=? WHERE bracket_song_id=?',[album.insertId,br.entries[0]]);
      await db.pool.execute("INSERT INTO bracket_playlists (bracket_id,week_id,playlist_name,playlist_url) VALUES (?,?,'Delete test','https://example.com/playlist')",[br.id,br.weeks[0]]);
      await db.pool.execute("UPDATE bracket_members SET bracket_role='commissioner' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      const path=`/api/admin/brackets/${br.id}`;
      assert.equal((await http(path,{cookie:a.member.cookie,method:'DELETE'})).status,403);
      assert.equal((await http(path,{cookie:b.owner.cookie,method:'DELETE'})).status,404);
      const [[songsBefore]]=await db.pool.execute('SELECT COUNT(*) AS total FROM songs');
      const [[usersBefore]]=await db.pool.execute('SELECT COUNT(*) AS total FROM users');
      const result=await http(path,{cookie:a.owner.cookie,method:'DELETE'});assert.equal(result.status,200,JSON.stringify(result.body));
      for(const table of ['brackets','votes','matchup_reported_totals','matchups','bracket_finale_sessions','bracket_playlists','bracket_weeks','bracket_rounds','bracket_songs','bracket_albums','bracket_members']) {
        const [[row]]=await db.pool.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE bracket_id=?`,[br.id]);assert.equal(Number(row.total),0,table);
      }
      const [[songsAfter]]=await db.pool.execute('SELECT COUNT(*) AS total FROM songs');assert.equal(songsAfter.total,songsBefore.total);
      const [[usersAfter]]=await db.pool.execute('SELECT COUNT(*) AS total FROM users');assert.equal(usersAfter.total,usersBefore.total);
      assert.equal((await http(`/api/admin/brackets/${other.id}`,{cookie:a.owner.cookie})).status,200);
      assert.equal((await http(path,{cookie:a.owner.cookie,method:'DELETE'})).status,404);
    });
    await t.test('failed bracket deletion rolls back votes and tournament records',async()=>{
      const br=await bracket(a);
      assert.equal((await vote(br,a.member)).status,200);
      await db.pool.query(`CREATE TRIGGER integration_reject_delete BEFORE DELETE ON brackets FOR EACH ROW BEGIN IF OLD.bracket_id=${br.id} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Integration deletion failure'; END IF; END`);
      try {
        assert.equal((await http(`/api/admin/brackets/${br.id}`,{cookie:a.owner.cookie,method:'DELETE'})).status,500);
        const [[votes]]=await db.pool.execute('SELECT COUNT(*) AS total FROM votes WHERE bracket_id=?',[br.id]);assert.equal(Number(votes.total),1);
        const [[matches]]=await db.pool.execute('SELECT COUNT(*) AS total FROM matchups WHERE bracket_id=?',[br.id]);assert.equal(Number(matches.total),3);
        const [[link]]=await db.pool.execute('SELECT next_matchup_id FROM matchups WHERE matchup_id=?',[br.matches[0]]);assert.equal(Number(link.next_matchup_id),br.matches[2]);
        assert.equal((await http(`/api/admin/brackets/${br.id}`,{cookie:a.owner.cookie})).status,200);
      } finally { await db.pool.query('DROP TRIGGER integration_reject_delete'); }
    });

    await t.test('admin can restore a declined participant without bypassing start time or resending an invite',async()=>{
      const br=await bracket(a);
      await db.pool.execute("UPDATE brackets SET start_at=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE bracket_id=?",[br.id]);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='declined',invitation_delivery='sent',invitation_sent_at=NOW(),invitation_responded_at=DATE_SUB(NOW(),INTERVAL 1 HOUR) WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      const path=`/api/admin/brackets/${br.id}/participants`;
      const body={participantIds:[a.owner.id,a.member.id],invitationChanges:[{userId:a.member.id,previousStatus:'declined',status:'accepted'}]};
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).status,404);
      assert.equal((await http(path,{cookie:a.member.cookie,method:'PUT',body})).status,404);
      assert.equal((await http(path,{cookie:b.owner.cookie,method:'PUT',body})).status,404);
      assert.equal((await http(path,{cookie:a.owner.cookie,method:'PUT',body:{...body,invitationChanges:[{userId:b.member.id,previousStatus:'declined',status:'accepted'}]}})).status,400);
      const result=await http(path,{cookie:a.owner.cookie,method:'PUT',body});assert.equal(result.status,200,JSON.stringify(result.body));
      const invitation=(await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie})).body;
      assert.equal(invitation.invitationStatus,'accepted');assert.equal(invitation.canAccess,true);
      const view=await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});assert.equal(view.status,200);assert.equal(view.body.isUpcoming,true);
      assert.equal((await vote(br,a.member)).status,409);
      const listed=(await http('/api/my/brackets',{cookie:a.member.cookie})).body.brackets.find(row=>row.bracketId===br.id);assert.equal(listed.navigationStatus,'upcoming');
      const [[member]]=await db.pool.execute('SELECT invitation_delivery,invitation_sent_at,invitation_responded_at,bracket_role FROM bracket_members WHERE bracket_id=? AND user_id=?',[br.id,a.member.id]);
      assert.equal(member.bracket_role,'member');assert.equal(member.invitation_delivery,'sent');assert.ok(member.invitation_sent_at);assert.ok(member.invitation_responded_at);
      let emails=0;assert.deepEqual(await sendBracketInvitations(db.pool,br.id,{deliver:async()=>emails++}),{sent:0,failed:0});assert.equal(emails,0);
      const email='commissioner-status@integration.example';
      const [actor]=await db.pool.execute("INSERT INTO users (family_id,email,display_name,user_role,password_hash) VALUES (?,?,'Commissioner','viewer',?)",[a.id,email,passwordHash]);
      await db.pool.execute("INSERT INTO bracket_members (bracket_id,family_id,user_id,bracket_role,invitation_status) VALUES (?,?,?,'commissioner','accepted')",[br.id,a.id,actor.insertId]);
      const login=await http('/api/auth/login',{method:'POST',body:{username:email,password}});assert.equal(login.status,200);
      const commissionerBody={participantIds:[a.owner.id,a.member.id,Number(actor.insertId)],invitationChanges:[{userId:a.member.id,previousStatus:'accepted',status:'declined'}]};
      assert.equal((await http(path,{cookie:login.cookie,method:'PUT',body:commissionerBody})).status,200);
      assert.equal((await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie})).status,404);
      assert.ok(!(await http('/api/my/brackets',{cookie:a.member.cookie})).body.brackets.some(row=>row.bracketId===br.id));
      assert.equal((await http(path,{cookie:login.cookie,method:'PUT',body:{...commissionerBody,invitationChanges:body.invitationChanges}})).status,200);
      assert.equal((await http(`/api/brackets/${br.id}/invitation`,{cookie:a.member.cookie})).body.invitationStatus,'accepted');
      assert.equal((await http(path,{cookie:login.cookie,method:'PUT',body:{...commissionerBody,invitationChanges:[{userId:a.member.id,previousStatus:'accepted',status:'invalid'}]}})).status,400);
      // Stale edits must not override a fresh invitation or accept someone just added.
      await db.pool.execute("UPDATE bracket_members SET invitation_status='pending' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      assert.equal((await http(path,{cookie:a.owner.cookie,method:'PUT',body})).status,409);
      await db.pool.execute('DELETE FROM bracket_members WHERE bracket_id=? AND user_id=?',[br.id,a.member.id]);
      assert.equal((await http(path,{cookie:a.owner.cookie,method:'PUT',body})).status,409);
      const [[missing]]=await db.pool.execute('SELECT COUNT(*) AS total FROM bracket_members WHERE bracket_id=? AND user_id=?',[br.id,a.member.id]);assert.equal(Number(missing.total),0);
    });

    await t.test('status emails follow committed changes only and mail failure leaves the status saved',async()=>{
      const br=await bracket(a);
      const path=`/api/admin/brackets/${br.id}/participants`;
      const update=(previousStatus,status)=>http(path,{cookie:a.owner.cookie,method:'PUT',body:{participantIds:[a.owner.id,a.member.id],invitationChanges:[{userId:a.member.id,previousStatus,status}]}});
      const start=statusNotifications.length;
      let result=await update('accepted','declined');assert.equal(result.status,200);assert.deepEqual(result.body.statusEmails,{sent:1,failed:0});
      assert.equal(statusNotifications.length,start+1);assert.equal(statusNotifications.at(-1).email,a.member.email);assert.equal(statusNotifications.at(-1).status,'declined');
      result=await update('declined','accepted');assert.equal(result.status,200);assert.equal(statusNotifications.at(-1).status,'accepted');
      result=await update('accepted','accepted');assert.equal(result.status,200);assert.deepEqual(result.body.statusEmails,{sent:0,failed:0});assert.equal(statusNotifications.length,start+2);
      result=await update('declined','accepted');assert.equal(result.status,409);assert.equal(statusNotifications.length,start+2);
      failStatusNotification=true;
      try {
        result=await update('accepted','declined');assert.equal(result.status,200);assert.deepEqual(result.body.statusEmails,{sent:0,failed:1});
        const [[saved]]=await db.pool.execute('SELECT invitation_status FROM bracket_members WHERE bracket_id=? AND user_id=?',[br.id,a.member.id]);assert.equal(saved.invitation_status,'declined');
      }finally{failStatusNotification=false;}
      assert.equal(statusNotifications.length,start+2);
    });

    await t.test('session notifications respect timing, consent, retries, and concurrent workers',async()=>{
      const br=await bracket(a);
      const env={NODE_ENV:'production',APP_URL:'https://thesongshowdown.com',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'};
      const messages=[];
      const deliver=async(message,options)=>{messages.push({message,key:options.idempotencyKey});};
      await db.pool.execute('UPDATE session_email_settings SET enabled_at=NOW(6) WHERE settings_id=1');
      await db.pool.execute("UPDATE brackets SET start_at=DATE_ADD(NOW(6),INTERVAL 1 HOUR) WHERE bracket_id=?",[br.id]);
      await db.pool.execute('UPDATE bracket_weeks SET opens_at=NOW(6),closes_at=DATE_ADD(NOW(6),INTERVAL 2 HOUR) WHERE week_id=?',[br.weeks[0]]);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,0);
      await db.pool.execute('UPDATE brackets SET start_at=NOW(6),paused_at=NOW(6) WHERE bracket_id=?',[br.id]);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,0);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='declined' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      await db.pool.execute('UPDATE brackets SET paused_at=NULL WHERE bracket_id=?',[br.id]);
      await Promise.all([processSessionEmails(db.pool,{env,deliver}),processSessionEmails(db.pool,{env,deliver})]);
      assert.equal(messages.length,1);assert.equal(messages[0].message.to,a.owner.email);assert.match(messages[0].message.text,/You have until/);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,0);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='pending' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,0);
      await db.pool.execute("UPDATE bracket_members SET invitation_status='accepted' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      const keys=[];
      const failed=await processSessionEmails(db.pool,{env,deliver:async(message,options)=>{keys.push(options.idempotencyKey);throw Error('Test mail outage');}});
      assert.equal(failed.failed,1);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,0,'retry cooldown');
      await db.pool.execute("UPDATE session_email_deliveries SET attempt_at=DATE_SUB(NOW(6),INTERVAL 2 MINUTE) WHERE bracket_id=? AND delivery_status='pending'",[br.id]);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,1);assert.equal(messages.at(-1).key,keys[0]);
      await db.pool.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE week_id=?',[br.weeks[0]]);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,2);assert.ok(messages.slice(-2).every(m=>m.message.subject.includes('has ended')));
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,0);
      // A new untimed session opens only after every feeder winner is known.
      await db.pool.execute('UPDATE matchups SET winner_entry_id=song_a_entry_id WHERE bracket_id=? AND week_id=?',[br.id,br.weeks[0]]);
      await db.pool.execute('UPDATE bracket_weeks SET opens_at=NOW(6),closes_at=NULL WHERE week_id=?',[br.weeks[1]]);
      assert.equal((await processSessionEmails(db.pool,{env,deliver})).sent,2);assert.ok(messages.slice(-2).every(m=>m.message.text.includes('no fixed deadline')));
      // Deleting the bracket removes its delivery records along with the sessions.
      assert.equal((await http(`/api/admin/brackets/${br.id}`,{cookie:a.owner.cookie,method:'DELETE'})).status,200);
      const [[count]]=await db.pool.execute('SELECT COUNT(*) AS total FROM session_email_deliveries WHERE bracket_id=?',[br.id]);assert.equal(Number(count.total),0);
    });

    await t.test('automatic email preference survives draft, publishing, and live edits',async()=>{
      const draft=await http('/api/admin/brackets/draft',{cookie:a.owner.cookie,method:'POST',body:{title:'Email preference',artist:'Test',automaticEmailsDisabled:true}});
      assert.equal(draft.status,201);
      const id=draft.body.bracketId,path=`/api/admin/brackets/${id}`;
      assert.equal((await http(path,{cookie:a.owner.cookie})).body.bracket.automaticEmailsDisabled,true);
      const published=await http(path,{cookie:a.owner.cookie,method:'PUT',body:{title:'Email preference',artist:'Test',songCount:4,songList:'Mail A\nMail B\nMail C\nMail D',participantIds:[a.owner.id,a.member.id],startAt:new Date(Date.now()-3600000).toISOString(),songsPerSession:2,sessionDurationMinutes:null,tiebreakerOption:'random',automaticEmailsDisabled:true}});
      assert.equal(published.status,200);
      const stored=(await http(path,{cookie:a.owner.cookie})).body.bracket;
      assert.equal(stored.automaticEmailsDisabled,true);
      const edited=await http(path,{cookie:a.owner.cookie,method:'PUT',body:{...stored,anonymous:!!stored.anonymous,automaticEmailsDisabled:false}});
      assert.equal(edited.status,200);
      assert.equal((await http(path,{cookie:a.owner.cookie})).body.bracket.automaticEmailsDisabled,false);
    });

    await t.test('automatic email setting is scoped and suppresses starts, ends, retries, and catch-up mail',async()=>{
      const br=await bracket(a), path=`/api/admin/brackets/${br.id}/automatic-emails`;
      const toggle=(cookie,disabled)=>http(path,{cookie,method:'PUT',body:{automaticEmailsDisabled:disabled}});
      assert.notEqual((await toggle(a.member.cookie,true)).status,200);
      assert.notEqual((await toggle(b.owner.cookie,true)).status,200);
      assert.equal((await toggle(a.owner.cookie,'true')).status,400);
      await db.pool.execute("UPDATE bracket_members SET bracket_role='commissioner' WHERE bracket_id=? AND user_id=?",[br.id,a.member.id]);
      assert.equal((await toggle(a.member.cookie,true)).status,200);
      const page=await http(`/api/brackets/${br.id}/voting`,{cookie:a.member.cookie});
      assert.equal(page.body.isCommissioner,true);assert.equal(Number(page.body.bracket.automaticEmailsDisabled),1);
      const env={NODE_ENV:'production',APP_URL:'https://example.com',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'};
      const messages=[];const deliver=async m=>{if(m.text.includes(`/brackets/${br.id}`))messages.push(m);};
      await db.pool.execute('UPDATE session_email_settings SET enabled_at=NOW(6) WHERE settings_id=1');
      await db.pool.execute('UPDATE bracket_weeks SET opens_at=NOW(6),closes_at=DATE_ADD(NOW(6),INTERVAL 1 HOUR) WHERE week_id=?',[br.weeks[0]]);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,0);
      await db.pool.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE week_id=?',[br.weeks[0]]);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,0);
      assert.equal((await toggle(a.member.cookie,false)).status,200);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,0,'no catch-up after enabling');
      await db.pool.execute('UPDATE bracket_weeks SET opens_at=NOW(6),closes_at=DATE_ADD(NOW(6),INTERVAL 1 HOUR) WHERE week_id=?',[br.weeks[0]]);
      await processSessionEmails(db.pool,{env,deliver:async m=>{if(m.text.includes(`/brackets/${br.id}`))throw Error('Test failure');}});
      assert.equal((await toggle(a.owner.cookie,true)).status,200);
      await db.pool.execute("UPDATE session_email_deliveries SET attempt_at=DATE_SUB(NOW(6),INTERVAL 2 MINUTE) WHERE bracket_id=?",[br.id]);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,0,'queued retries are suppressed');
      await toggle(a.owner.cookie,false);
      await db.pool.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE week_id=?',[br.weeks[0]]);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,2,'future ends resume');
      await db.pool.execute("UPDATE bracket_members SET bracket_role='member' WHERE bracket_id=?",[br.id]);
    });

    await t.test('only the last of multiple online sessions announces the finale date',async()=>{
      const br=await bracket(a);
      const env={NODE_ENV:'production',APP_URL:'https://thesongshowdown.com',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'};
      const messages=[];const deliver=async message=>{if(message.text.includes(`/brackets/${br.id}`))messages.push(message);};
      await db.pool.execute('UPDATE session_email_settings SET enabled_at=NOW(6) WHERE settings_id=1');
      await db.pool.execute("UPDATE brackets SET finale_start_round=2,finale_at='2026-11-20' WHERE bracket_id=?",[br.id]);
      await db.pool.execute('UPDATE bracket_weeks SET week_number=3 WHERE week_id=?',[br.weeks[1]]);
      const [[first]]=await db.pool.execute('SELECT round_id FROM bracket_weeks WHERE week_id=?',[br.weeks[0]]);
      const [lastOnline]=await db.pool.execute('INSERT INTO bracket_weeks (bracket_id,round_id,week_number,opens_at) VALUES (?,?,2,DATE_SUB(NOW(6),INTERVAL 2 MINUTE))',[br.id,first.round_id]);
      await db.pool.execute('UPDATE matchups SET week_id=? WHERE matchup_id=?',[lastOnline.insertId,br.matches[1]]);
      await db.pool.execute('UPDATE bracket_weeks SET opens_at=DATE_SUB(NOW(6),INTERVAL 2 MINUTE),closes_at=NOW(6) WHERE week_id=?',[br.weeks[0]]);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,2);assert.ok(messages.every(m=>!m.text.includes('last session held online')));
      await db.pool.execute('UPDATE matchups SET winner_entry_id=song_a_entry_id WHERE matchup_id=?',[br.matches[0]]);
      await db.pool.execute('UPDATE bracket_weeks SET closes_at=NOW(6) WHERE week_id=?',[lastOnline.insertId]);
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,4);
      assert.ok(messages.slice(-2).every(m=>m.text.includes('last session held online') && m.text.includes('Friday, November 20, 2026') && m.text.includes('We hope to see you there!')));
      await processSessionEmails(db.pool,{env,deliver});assert.equal(messages.length,4,'no repeated finale announcement');
    });

    await t.test('legacy role migration preserves accounts and assigns bracket role defaults',async()=>{
      await db.pool.query("ALTER TABLE users MODIFY user_role ENUM('super','viewer','owner','member') NULL");
      await db.pool.query("UPDATE users SET user_role=CASE user_role WHEN 'super' THEN 'owner' WHEN 'viewer' THEN 'member' ELSE user_role END");
      await db.pool.query("ALTER TABLE users CHANGE user_role role ENUM('owner','member') NULL");
      await db.pool.query('ALTER TABLE bracket_members DROP COLUMN bracket_role');
      const sql=await readFile(new URL('../database/migrate_user_and_bracket_roles.sql',import.meta.url),'utf8');
      for(const statement of schemaStatements(sql))await db.pool.query(statement);
      const [users]=await db.pool.query('SELECT user_id,user_role FROM users WHERE user_id IN (?,?)',[a.owner.id,a.member.id]);
      assert.equal(users.find(u=>u.user_id===a.owner.id).user_role,'super');
      assert.equal(users.find(u=>u.user_id===a.member.id).user_role,'viewer');
      const [roles]=await db.pool.query('SELECT bm.bracket_role,u.user_role FROM bracket_members bm JOIN users u ON u.user_id=bm.user_id');
      assert.ok(roles.length>0);assert.ok(roles.every(r=>r.bracket_role===(r.user_role==='super'?'commissioner':'member')));
      assert.equal((await http('/api/auth/session',{cookie:a.owner.cookie})).body.user.user_role,'super');
    });
  } finally {
    try { await app.close(); }
    finally { await db.dispose(); }
  }
});
