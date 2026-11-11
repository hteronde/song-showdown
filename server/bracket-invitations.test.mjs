import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationEmail, getBracketInvitation, respondToInvitation, sendBracketInvitations } from './bracket-invitations.mjs';

test('invitation email includes theme, zoned start date and website link, without matchup data',()=>{
 const message=invitationEmail({bracketId:42,title:'Winter music',artist:'Songs about snow',startAt:'2027-01-05T18:00:00Z',email:'test@example.com'},'https://thesongshowdown.com');
 assert.match(message.text,/Songs about snow/);assert.match(message.text,/January 5, 2027/);
 assert.match(message.text,/America\/Chicago/);assert.match(message.text,/https:\/\/thesongshowdown.com\/brackets\/42/);
 assert.match(message.text,/accept or decline/);assert.equal(message.to,'test@example.com');
});

test('pending invitation response projects only safe metadata',async()=>{
 const c={async execute(){return [[{bracketId:1,title:'Title',artist:'Theme',startAt:'2027-01-01',status:'active',user_role:'viewer',invitationStatus:'pending',songs:['Secret']}]];}};
 const data=await getBracketInvitation(c,1,2);
 assert.deepEqual(Object.keys(data).sort(),['artist','bracketId','canAccess','invitationStatus','startAt','title'].sort());
 assert.equal(data.canAccess,false);
});

test('missing and draft invitations are unavailable to members',async()=>{
 for(const row of [undefined,{user_role:'viewer',status:'draft',invitationStatus:'pending'},{user_role:'viewer',status:'active',invitationStatus:null}]) {
  await assert.rejects(getBracketInvitation({async execute(){return [row?[row]:[]];}},1,2),{status:404});
 }
});

test('responses validate selection, reject removed invitations, and cannot reverse a decision',async()=>{
 const writes=[];
 const db=status=>({async execute(sql,args){if(sql.startsWith('SELECT bracket_id'))return [[{status:'active'}]];if(sql.startsWith('SELECT bm.'))return [status?[{status}]:[]];writes.push(args);return [{affectedRows:1}];}});
 await assert.rejects(respondToInvitation(db('pending'),1,2,'maybe'),{status:400});
 await assert.rejects(respondToInvitation(db(null),1,2,'accepted'),{status:404});
 await assert.rejects(respondToInvitation(db('declined'),1,2,'accepted'),{status:409});
 await respondToInvitation(db('accepted'),1,2,'accepted');assert.equal(writes.length,0);
 await respondToInvitation(db('pending'),1,2,'accepted');assert.deepEqual(writes,[['accepted',1,2]]);
});

test('delivery reports partial failure and only sends successfully claimed invitations',async()=>{
 const writes=[],delivered=[];
 const rows=[1,2,3].map(userId=>({userId,bracketId:9,title:'Bracket',artist:'Theme',startAt:'2027-01-01T18:00:00Z',email:`${userId}@example.com`}));
 const pool={async execute(sql,args){
  if(sql.startsWith('SELECT'))return [rows];
  writes.push({sql,args});
  return [{affectedRows:sql.includes("invitation_delivery='sending',")&&args[1]===3?0:1}];
 }};
 const result=await sendBracketInvitations(pool,9,{env:{APP_URL:'https://thesongshowdown.com',RESEND_API_KEY:'fake',EMAIL_FROM:'sender@example.com'},deliver:async message=>{delivered.push(message.to);if(message.to==='2@example.com')throw Error('provider rejected');}});
 assert.deepEqual(result,{sent:1,failed:1});assert.deepEqual(delivered,['1@example.com','2@example.com']);
 assert.ok(writes.some(x=>x.sql.includes("invitation_delivery='failed'")&&x.args[1]===2));
 assert.ok(writes.some(x=>x.sql.includes('invitation_sent_at=NOW(6)')&&x.args[1]===1));
});
