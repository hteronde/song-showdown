import {randomUUID} from 'node:crypto';
import {deliverEmail,passwordEmailConfigured} from './password-reset.mjs';
import {priorSessionsReadySql} from './session-progression.mjs';
import {readyRoundSql} from './round-randomization.mjs';

export function sessionEmail(row,appUrl) {
  if(row.eventType==='winner') {
    const historyLink=new URL(`/history/${row.bracketId}`,appUrl).href;
    return {to:row.email,subject:`${row.title}: We have a winner!`,
      text:`The winner of ${row.title} is “${row.winnerTitle}” by ${row.winnerArtist}!\n\nThank you for participating in this bracket and making The Song Showdown part of your time with friends and family. We hope you enjoyed the matchups!\n\nView the completed bracket and its results on the history page:\n${historyLink}`};
  }
  const session=`Session ${row.weekNumber} (${row.roundName})`;
  const link=new URL(`/brackets/${row.bracketId}`,appUrl).href;
  const deadline=row.closesAt ? new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:'America/Chicago'}).format(new Date(row.closesAt)) : null;
  // Finale Date is a calendar date, not an instant; keep it on the selected day.
  const finaleDate=row.finaleDate ? new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeZone:'UTC'}).format(new Date(`${row.finaleDate}T12:00:00Z`)) : null;
  const lastOnlineEnd=row.eventType==='end' && Boolean(Number(row.isLastOnlineSession));
  const closing=lastOnlineEnd
    ? `${session} has ended. Voting for this session is now closed. This was the last session held online; the remaining matchups will take place at the finale.\n\n${finaleDate ? `The finale is scheduled for ${finaleDate}.` : 'The finale date has not been set yet. Please check the bracket page for updates.'} We hope to see you there!`
    : `${session} has ended. Voting for this session is now closed. Open the bracket to follow the results and see the next session.`;
  const text=row.eventType==='start'
    ? `${session} begins now!\n\n${deadline ? `You have until ${deadline} (Central time / America/Chicago) to vote.` : 'This session has no fixed deadline. It closes once every participating member has voted on every matchup. Please cast your votes.'}`
    : closing;
  return {to:row.email,subject:lastOnlineEnd ? 'Our final online week has come to an end!' : `${row.title}: ${session} ${row.eventType==='start'?'begins now':'has ended'}`,
    text:`${row.title}\nTheme: ${row.artist}\n\n${text}\n\nOpen the bracket:\n${link}`};
}

const finaleRound="COALESCE(b.finale_start_round,(SELECT f.start_round_number FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id))";

const joins=`FROM bracket_weeks w JOIN brackets b ON b.bracket_id=w.bracket_id
  JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id
  JOIN bracket_members bm ON bm.bracket_id=b.bracket_id AND bm.family_id=b.family_id
  JOIN users u ON u.user_id=bm.user_id AND u.family_id=bm.family_id
  JOIN session_email_settings settings ON settings.settings_id=1`;
const eligible=`b.automatic_emails_disabled=FALSE AND bm.invitation_status='accepted' AND bm.non_finale_participant=TRUE
  AND b.status<>'draft' AND b.start_at<=NOW(6) AND b.paused_at IS NULL
  AND w.opens_at IS NOT NULL AND w.opens_at<=NOW(6)
  AND (b.finale_start_round IS NULL OR r.round_number<b.finale_start_round)
  AND NOT EXISTS (SELECT 1 FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id AND r.round_number>=f.start_round_number)
  AND ${priorSessionsReadySql('b','w')} AND ${readyRoundSql('b','r')}
  AND EXISTS (SELECT 1 FROM matchups m WHERE m.bracket_id=b.bracket_id AND m.week_id=w.week_id)
  AND NOT EXISTS (SELECT 1 FROM matchups m JOIN matchups feeder ON feeder.bracket_id=m.bracket_id AND feeder.next_matchup_id=m.matchup_id WHERE m.week_id=w.week_id AND feeder.winner_entry_id IS NULL)`;
// Completion announcements include every accepted member, including finale-only participants.
const championship=`SELECT m.winner_entry_id FROM matchups m
  JOIN bracket_rounds cr ON cr.bracket_id=m.bracket_id
  JOIN bracket_weeks cw ON cw.week_id=m.week_id AND cw.round_id=cr.round_id
  WHERE m.bracket_id=b.bracket_id AND m.week_id=w.week_id AND m.next_matchup_id IS NULL
    AND cr.round_number=(SELECT MAX(round_number) FROM bracket_rounds WHERE bracket_id=b.bracket_id)
  ORDER BY m.matchup_id LIMIT 1`;
const eligibleFor=type=>type==='winner'
  ? `b.automatic_emails_disabled=FALSE AND bm.invitation_status='accepted'
     AND b.status='complete' AND b.completed_at IS NOT NULL AND (${championship}) IS NOT NULL`
  : eligible;
const due=type=>type==='winner'
  ? 'b.completed_at>=GREATEST(settings.winner_enabled_at,COALESCE(b.automatic_emails_enabled_at,settings.winner_enabled_at)) AND b.completed_at<=NOW(6)'
  : type==='start'
  ? `b.status='active' AND b.completed_at IS NULL AND w.opens_at>=GREATEST(settings.enabled_at,COALESCE(b.automatic_emails_enabled_at,settings.enabled_at)) AND (w.closes_at IS NULL OR w.closes_at>NOW(6))
     AND NOT EXISTS (SELECT 1 FROM bracket_finale_sessions f WHERE f.bracket_id=b.bracket_id)
     AND EXISTS (SELECT 1 FROM matchups m WHERE m.week_id=w.week_id AND m.winner_entry_id IS NULL)`
  : 'w.closes_at>=GREATEST(settings.enabled_at,COALESCE(b.automatic_emails_enabled_at,settings.enabled_at)) AND w.closes_at<=NOW(6)';

export async function processSessionEmails(pool,{env=process.env,deliver=deliverEmail}={}) {
  const summary={sent:0,failed:0};
  if(env.SESSION_EMAILS_ENABLED==='false' || (env.SESSION_EMAILS_ENABLED!=='true' && env.NODE_ENV!=='production') || !passwordEmailConfigured(env))return summary;
  // INSERT IGNORE plus a conditional lease makes overlapping workers safe.
  for(const type of ['end','start','winner']) await pool.execute(`INSERT IGNORE INTO session_email_deliveries (delivery_id,bracket_id,week_id,user_id,event_type)
    SELECT UUID(),b.bracket_id,w.week_id,u.user_id,? ${joins} WHERE ${eligibleFor(type)} AND ${due(type)}`,[type]);
  await pool.execute(`UPDATE session_email_deliveries d
    JOIN bracket_weeks w ON w.week_id=d.week_id AND w.bracket_id=d.bracket_id
    JOIN brackets b ON b.bracket_id=d.bracket_id
    LEFT JOIN bracket_members bm ON bm.bracket_id=d.bracket_id AND bm.user_id=d.user_id
    SET d.delivery_status='skipped'
    WHERE d.delivery_status='pending' AND (b.automatic_emails_disabled=TRUE
      OR (d.event_type='start' AND w.opens_at<b.automatic_emails_enabled_at)
      OR (d.event_type='end' AND w.closes_at<b.automatic_emails_enabled_at) OR bm.user_id IS NULL OR bm.invitation_status<>'accepted' OR (d.event_type<>'winner' AND bm.non_finale_participant=FALSE)
      OR (d.event_type='winner' AND b.completed_at<b.automatic_emails_enabled_at)
      OR (d.event_type='start' AND w.closes_at<=NOW(6)))`);
  const [pending]=await pool.execute(`SELECT delivery_id AS id,event_type AS eventType FROM session_email_deliveries
    WHERE (delivery_status='pending' AND (attempt_at IS NULL OR attempt_at<DATE_SUB(NOW(6),INTERVAL 1 MINUTE)))
       OR (delivery_status='sending' AND attempt_at<DATE_SUB(NOW(6),INTERVAL 10 MINUTE))
    ORDER BY created_at,event_type LIMIT 50`);
  for(const job of pending) {
    const token=randomUUID();
    const [claimed]=await pool.execute(`UPDATE session_email_deliveries SET delivery_status='sending',lease_token=?,attempt_at=NOW(6),attempts=attempts+1
      WHERE delivery_id=? AND ((delivery_status='pending' AND (attempt_at IS NULL OR attempt_at<DATE_SUB(NOW(6),INTERVAL 1 MINUTE)))
      OR (delivery_status='sending' AND attempt_at<DATE_SUB(NOW(6),INTERVAL 10 MINUTE)))`,[token,job.id]);
    if(!claimed.affectedRows)continue;
    try {
      const [rows]=await pool.execute(`SELECT b.bracket_id AS bracketId,b.title,b.artist,w.week_number AS weekNumber,r.name AS roundName,w.closes_at AS closesAt,u.email,d.payload,
        DATE_FORMAT(b.finale_at,'%Y-%m-%d') AS finaleDate,
        (SELECT s.title FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id WHERE bs.bracket_id=b.bracket_id AND bs.bracket_song_id=(${championship})) AS winnerTitle,
        (SELECT s.artist FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id WHERE bs.bracket_id=b.bracket_id AND bs.bracket_song_id=(${championship})) AS winnerArtist,
        (${finaleRound} IS NOT NULL AND w.week_number=(
          SELECT MAX(lastWeek.week_number) FROM bracket_weeks lastWeek
          JOIN bracket_rounds lastRound ON lastRound.bracket_id=lastWeek.bracket_id AND lastRound.round_id=lastWeek.round_id
          WHERE lastWeek.bracket_id=b.bracket_id AND lastRound.round_number<${finaleRound}
        )) AS isLastOnlineSession
        ${joins} JOIN session_email_deliveries d ON d.bracket_id=b.bracket_id AND d.week_id=w.week_id AND d.user_id=u.user_id
        WHERE d.delivery_id=? AND ${eligibleFor(job.eventType)} AND ${due(job.eventType)}`,[job.id]);
      if(!rows.length) {
        // Pause/reschedule/withdrawal must not produce an obsolete email. Keep
        // undelivered work pending so a resumed or rescheduled session can qualify.
        await pool.execute("UPDATE session_email_deliveries SET delivery_status='pending',lease_token=NULL WHERE delivery_id=? AND lease_token=?",[job.id,token]);
        continue;
      }
      const row=rows[0];
      const message=sessionEmail({...row,eventType:job.eventType},env.APP_URL);
      // Freeze a payload during retries for the provider's idempotency contract.
      const stored=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
      if(stored && ['to','subject','text'].some(key=>stored[key]!==message[key])) {
        // A deadline/email changed after an attempt: do not send stale content.
        await pool.execute("UPDATE session_email_deliveries SET delivery_status='skipped',lease_token=NULL WHERE delivery_id=? AND lease_token=?",[job.id,token]);
        continue;
      }
      await pool.execute('UPDATE session_email_deliveries SET payload=? WHERE delivery_id=? AND lease_token=?',[JSON.stringify(message),job.id,token]);
      await deliver(message,{env,idempotencyKey:`session-${job.id}`});
      await pool.execute("UPDATE session_email_deliveries SET delivery_status='sent',sent_at=NOW(6),lease_token=NULL WHERE delivery_id=? AND lease_token=?",[job.id,token]);
      summary.sent++;
    } catch {
      await pool.execute("UPDATE session_email_deliveries SET delivery_status='pending',lease_token=NULL WHERE delivery_id=? AND lease_token=?",[job.id,token]);
      summary.failed++;
      console.error('Session email delivery failed; it will be retried.');
    }
  }
  return summary;
}
