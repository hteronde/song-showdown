import {saveAutomaticEmailSetting} from './bracket-email-settings.mjs';
import {sendBracketEmail} from './bracket-email.mjs';
import { processSessionEmails } from './session-emails.mjs';
import { sendInvitationStatusEmails } from './invitation-status-email.mjs';
import { isolateBracketSong } from './bracket-song-ownership.mjs';
import { saveBracketRoles } from './bracket-roles.mjs';
import { getBracketInvitation, respondToInvitation, listBracketInvitations, sendBracketInvitations } from './bracket-invitations.mjs';
import { originAllowed } from './hosting-config.mjs';
import { serveStaticSite } from './static-site.mjs';
import { createAuthRateLimiter, readAuthInput } from './auth-abuse.mjs';
import { authorizeBracketRequest, authorizeBracket } from './bracket-access.mjs';
import { getSongOrderLocks } from './song-order-locks.mjs';
import { requestPasswordReset, completePasswordReset, deliverPasswordReset, passwordEmailConfigured } from './password-reset.mjs';
import {adminPageRequest} from './admin-pages.mjs';
import {saveBracketParticipants} from './bracket-participants.mjs';
import {getSessionPlaylists,saveSessionPlaylists,getSessionPlaylistMatchups,updateBracketSessionPlaylists} from './session-playlists.mjs';
import { readJson } from './request-json.mjs';
import {duplicateBracket} from './duplicate-bracket.mjs';
import {getManagedSessions,saveManagedSessions,applySubmittedSessionSchedule} from './session-management.mjs';
import {closeFullyVotedWeeks,finalizeClosedMatchups,openNextUntimedWeeks,priorSessionsReadySql,getAdvanceWeekPlan,advanceWeek} from './session-progression.mjs';
import { saveBracketDraft, saveDraftSessionSettings, restoreBracketDraft, parseDraftSettings } from './bracket-drafts.mjs';
import { parseSeedingSize, validateAssignedSeeds, seededOrder } from './bracket-seeding.mjs';
import { saveParticipantEmails } from './participant-emails.mjs';
import { parseFinalePlan, awaitingFinaleSql } from './finale-plan.mjs';
import { shuffled, randomizationModes, randomizeReadyRounds, readyRoundSql } from './round-randomization.mjs';
import { applyBallotPrivacy } from './ballot-privacy.mjs';
import { getBracketAlbums, resolveSongAlbums, saveBracketAlbum, removeBracketAlbum } from './bracket-albums.mjs';
import { canPreserveBracketStructure, applyLiveBracketEdit } from './live-bracket-edit.mjs';
import { memberMatchupView } from './member-bracket-view.mjs';
import { loadAdminBallots, saveAdminBallots, getBallotEditingRound, roundAllowsBallotEditing, correctedWinner } from './admin-ballots.mjs';
import { setBracketPaused, getResumeSchedule, resumeWithSchedule } from './bracket-pause.mjs';
import { tiebreakerOptions, validateSeedTiebreaker } from './tiebreaker.mjs';
import { saveBracketSongs } from './bracket-song-save.mjs';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { assignSongSeeds } from './song-seeds.mjs';
import { parseVoteInput } from './vote-input.mjs';
import { verifyPassword } from './passwords.mjs';

// The caller owns the pool and listener. Importing this module opens no connections or timers.
export function createApiServer({ pool, authRateLimiter = createAuthRateLimiter(), hosting = {}, sendInvitations = sendBracketInvitations, sendCustomEmail = sendBracketEmail, sendStatusNotifications = sendInvitationStatusEmails, sendSessionNotifications = processSessionEmails }) {
const sessionCookie = 'song_showdown_session';
const sessionLifetimeSeconds = 14 * 24 * 60 * 60;
const effectiveBracketStatus = `CASE
  WHEN b.status = 'complete' OR b.completed_at IS NOT NULL THEN 'complete'
  WHEN b.status = 'draft' THEN 'draft'
  WHEN b.start_at IS NOT NULL AND b.start_at <= NOW() THEN 'active'
  WHEN b.start_at IS NOT NULL AND b.start_at > NOW() THEN 'draft'
  ELSE b.status
END`;

function sendJson(response, status, data, origin = 'http://localhost:4200', extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    ...extraHeaders
  });
  response.end(JSON.stringify(data));
}

function cookieValue(request, name) {
  const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function passwordSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${sessionCookie}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function findAuthenticatedUser(request) {
  const token = cookieValue(request, sessionCookie);
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT u.user_id AS userId, u.display_name AS displayName, u.email, u.user_role, EXISTS (SELECT 1 FROM bracket_members cm WHERE cm.user_id=u.user_id AND cm.family_id=u.family_id AND cm.bracket_role='commissioner' AND cm.invitation_status='accepted') AS canManageBrackets
     FROM auth_sessions s JOIN users u ON u.user_id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [hashSessionToken(token)]
  );
  return rows[0] || null;
}

async function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await pool.execute(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY))',
    [hashSessionToken(token), userId]
  );
  return token;
}

function publicUser(user) {
  return { userId: user.userId, displayName: user.displayName, email: user.email, user_role: user.user_role, canManageBrackets: user.user_role==='super' || !!Number(user.canManageBrackets) };
}


let closedWeekFinalization = null;
let closedWeekTimer;
let notificationRun=null;
async function runProgressionTick() {
  // Keep the schedule moving even while a provider is slow or retrying emails.
  await finalizeClosedWeeks();
  if(notificationRun)return notificationRun;
  notificationRun=(async()=>{
    try {await sendSessionNotifications(pool);}
    catch(error) {console.error('Session notifications unavailable. Check the session-email migration and email configuration.',error.code || '');}
  })().finally(()=>{notificationRun=null;});
  return notificationRun;
}
async function finalizeClosedWeeks() {
  if (closedWeekFinalization) return closedWeekFinalization;
  closedWeekFinalization = (async () => {
    let connection;
    let finalizedCount = 0;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      await closeFullyVotedWeeks(connection);
      finalizedCount = await finalizeClosedMatchups(connection);
      await openNextUntimedWeeks(connection);
      await connection.commit();
      if (finalizedCount) console.log(`Recorded ${finalizedCount} winner(s) from closed voting weeks.`);
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch { /* The connection may not have started a transaction. */ }
      }
      console.error('Closed-week winner calculation failed:', error.message);
    } finally {
      connection?.release();
      closedWeekFinalization = null;
    }
  })();
  return closedWeekFinalization;
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (!originAllowed(origin, hosting)) {
    sendJson(response, 403, { error: 'This website origin is not allowed.' }, 'null');
    return;
  }
  const send = (status, data, extraHeaders = {}) => sendJson(response, status, data, origin || 'http://localhost:4200', extraHeaders);

  if (request.method === 'OPTIONS') {
    send(204, {});
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (hosting.staticDirectory && url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
    try { await serveStaticSite(request, response, url.pathname, hosting.staticDirectory); }
    catch (error) {
      console.error('Website asset request failed:', error.message);
      if (!response.headersSent) {response.writeHead(500, {'Content-Type':'text/plain'});response.end('Could not load the website.');}
      else response.destroy();
    }
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/health') {
    try {
      await pool.query('SELECT 1');
      send(200, { ok: true });
    } catch (error) {
      console.error('Database health check failed:', error.message);
      send(503, { error: 'The MySQL server is unavailable. Check that MAMP is running and the .env settings are correct.' });
    }
    return;
  }

  if (url.pathname.startsWith('/api/auth/')) {
    try {
      authRateLimiter.checkRequest(request, url.pathname);
      if (request.method === 'GET' && url.pathname === '/api/auth/session') {
        const user = await findAuthenticatedUser(request);
        send(200, { authenticated: Boolean(user), user: user ? publicUser(user) : null });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
        const input = await readAuthInput(request, url.pathname, authRateLimiter);
        const username = typeof input.username === 'string' ? input.username.trim() : '';
        if (!username || username.length > 254) { send(400, { error: 'Enter your account email address.' }); return; }
        if (process.env.NODE_ENV === 'production' && !passwordEmailConfigured()) {
          send(503, { error: 'Password recovery is temporarily unavailable. Contact your administrator.' }); return;
        }
        await requestPasswordReset(pool, username, async delivery => {
          try { await deliverPasswordReset(delivery); }
          catch { console.error('Password reset delivery failed. Check email configuration.'); }
        });
        send(200, { message: 'If an account matches that email, a reset link has been sent.' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/reset-password') {
        const input = await readAuthInput(request, url.pathname, authRateLimiter);
        await completePasswordReset(pool, typeof input.token === 'string' ? input.token : '', typeof input.password === 'string' ? input.password : '');
        send(200, { reset: true }, { 'Set-Cookie': clearSessionCookie() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        const input = await readAuthInput(request, url.pathname, authRateLimiter);
        const username = typeof input.username === 'string' ? input.username.trim() : '';
        const password = typeof input.password === 'string' ? input.password : '';
        const [rows] = await pool.execute(
          `SELECT user_id AS userId, display_name AS displayName, email, \`user_role\` AS user_role, password_hash AS passwordHash, EXISTS (SELECT 1 FROM bracket_members cm WHERE cm.user_id=u.user_id AND cm.family_id=u.family_id AND cm.bracket_role='commissioner' AND cm.invitation_status='accepted') AS canManageBrackets
           FROM users u WHERE family_id IS NOT NULL AND LOWER(email) = LOWER(?) LIMIT 1`,
          [username]
        );
        const user = rows[0];
        if (!user) { send(401, { error: 'Username or password is incorrect.' }); return; }
        if (!user.passwordHash) { send(409, { error: 'This account needs a password. Request an email link with “Forgot password?” to create one.' }); return; }
        if (!await verifyPassword(password, user.passwordHash)) { send(401, { error: 'Username or password is incorrect.' }); return; }
        const token = await startSession(user.userId);
        send(200, { authenticated: true, user: publicUser(user) }, { 'Set-Cookie': passwordSessionCookie(token) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/setup-password') {
        const input = await readAuthInput(request, url.pathname, authRateLimiter);
        // Initial setup uses the same emailed, expiring, single-use proof as recovery.
        // Email + password alone can never claim an account or establish a session.
        await completePasswordReset(pool, typeof input.token === 'string' ? input.token : '', typeof input.password === 'string' ? input.password : '');
        send(200, { reset: true }, { 'Set-Cookie': clearSessionCookie() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        const token = cookieValue(request, sessionCookie);
        if (token) await pool.execute('UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [hashSessionToken(token)]);
        send(200, { loggedOut: true }, { 'Set-Cookie': clearSessionCookie() });
        return;
      }

      send(404, { error: 'Authentication route not found.' });
    } catch (error) {
      if (error.status) send(error.status, { error: error.message }, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
      else {
        console.error('Authentication request failed:', error.message);
        send(500, { error: 'Could not process the authentication request.' });
      }
    }
    return;
  }

  let authenticatedUser = null;
  if (url.pathname.startsWith('/api/')) {
    try { authenticatedUser = await findAuthenticatedUser(request); }
    catch (error) {
      console.error('Session lookup failed:', error.message);
      send(500, { error: 'Could not verify the login session. Check the database migration.' });
      return;
    }
    if (!authenticatedUser) { send(401, { error: 'Please log in to continue.' }); return; }
    const adminOnlyPaths = ['/api/family-members', '/api/songs', '/api/playlists', '/api/playlist-options'];
    if (adminOnlyPaths.some(path => url.pathname === path || url.pathname.startsWith(`${path}/`))
      && authenticatedUser.user_role !== 'super') {
      send(403, { error: 'Only an admin can access the Manage section.' });
      return;
    }
  }

  if (authenticatedUser?.user_role !== 'super' && url.pathname.startsWith('/api/admin/brackets')) {
    const scoped = /^\/api\/admin\/brackets\/\d+(?:\/|$)/.test(url.pathname);
    const list = request.method === 'GET' && url.pathname === '/api/admin/brackets';
    const roster = request.method === 'GET' && url.pathname === '/api/admin/brackets/participants' && url.searchParams.has('bracketId');
    if ((!scoped && !list && !roster) || request.method === 'DELETE' && /^\/api\/admin\/brackets\/\d+$/.test(url.pathname) || /\/duplicate$/.test(url.pathname)) {
      send(403,{error:'Only a super user can create, duplicate, or delete brackets and manage family accounts.'}); return;
    }
  }

  const invitationRoute = url.pathname.match(/^\/api\/brackets\/(\d+)\/invitation$/);
  if (invitationRoute && ['GET','POST'].includes(request.method)) {
    let connection;
    try {
      const id = Number(invitationRoute[1]);
      if (request.method === 'GET') send(200, await getBracketInvitation(pool,id,authenticatedUser.userId));
      else {
        const input = await readJson(request);
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const result = await respondToInvitation(connection,id,authenticatedUser.userId,input.response);
        await connection.commit(); send(200,result);
      }
    } catch(error) {
      if(connection) await connection.rollback();
      send(error.status || 500,{error:error.status ? error.message : 'Could not process invitation.'});
    } finally { connection?.release(); }
    return;
  }

  let bracketAccess = null;
  if (authenticatedUser) {
    try { bracketAccess = await authorizeBracketRequest(pool, authenticatedUser.userId, request.method, url.pathname); }
    catch (error) {
      if (!error.status) console.error('Bracket authorization failed:', error.message);
      send(error.status || 500, { error: error.status ? error.message : 'Could not check bracket access.' });
      return;
    }
  }

  if(/^\/api\/(?:family-members|songs|playlists)(?:\/\d+)?$/.test(url.pathname)||url.pathname==='/api/playlist-options') {
    let connection;
    try{
      const [[owner]]=await pool.execute('SELECT family_id FROM users WHERE user_id=?',[authenticatedUser.userId]);
      if(!owner?.family_id){send(403,{error:'Your account is not connected to a family.'});return;}
      const requestedFamily=url.searchParams.get('familyId');if(requestedFamily&&Number(requestedFamily)!==Number(owner.family_id)){send(403,{error:'This family is not available to your account.'});return;}
      const input=['POST','PUT'].includes(request.method)?await readJson(request):{};
      connection=await pool.getConnection();await connection.beginTransaction();
      if(url.pathname.startsWith('/api/family-members') && request.method!=='GET')await connection.execute('SELECT family_id FROM families WHERE family_id=? FOR UPDATE',[owner.family_id]);
      const result=await adminPageRequest(connection,{path:url.pathname,method:request.method,input,familyId:Number(owner.family_id),userId:authenticatedUser.userId});await connection.commit();send(request.method==='POST'?201:200,result);
    }catch(error){if(connection)await connection.rollback();send(error.status||400,{error:error.code==='ER_DUP_ENTRY'?'That record already exists.':error.message});}
    finally{connection?.release();}return;
  }

  if (url.pathname.startsWith('/api/admin/brackets')) {
    try {
      const familyId = Number((await pool.execute('SELECT family_id FROM users WHERE user_id = ?', [authenticatedUser.userId]))[0][0]?.family_id);
      if (!familyId) { send(400, { error: 'Your account is not connected to a family.' }); return; }
      const emailSettingsRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/automatic-emails$/);
      if (emailSettingsRoute && request.method==='PUT') {
        const input=await readJson(request);
        if(typeof input.automaticEmailsDisabled!=='boolean'){send(400,{error:'Choose whether to disable automatic emails.'});return;}
        await saveAutomaticEmailSetting(pool,Number(emailSettingsRoute[1]),input.automaticEmailsDisabled);
        send(200,{automaticEmailsDisabled:input.automaticEmailsDisabled});return;
      }
      const emailRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/email$/);
      if (emailRoute && request.method==='POST') {
        try { send(200,await sendCustomEmail(pool,Number(emailRoute[1]),await readJson(request))); }
        catch(error) {send(error.status||500,{error:error.status?error.message:'Could not send the bracket email.'});}
        return;
      }
      const inviteAdminRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/invitations$/);
      if (inviteAdminRoute && ['GET','POST'].includes(request.method)) {
        const id=Number(inviteAdminRoute[1]);
        const delivery=request.method==='POST' ? await sendInvitations(pool,id) : undefined;
        send(200,{participants:await listBracketInvitations(pool,id),delivery});return;
      }
      const participantsRoute=url.pathname.match(/^\/api\/admin\/brackets(?:\/(\d+))?\/participants$/);
      if(participantsRoute && request.method==='PUT') {
        const input=await readJson(request),connection=await pool.getConnection();
        let result;
        try {
          await connection.beginTransaction();
          result=await saveBracketParticipants(connection,{bracketId:Number(participantsRoute[1])||null,familyId,userId:authenticatedUser.userId,input,canAssignRoles:authenticatedUser.user_role==='super'});
          await connection.commit();
        } catch(error) {await connection.rollback();send(error.status||400,{error:error.code==='ER_DUP_ENTRY'?'That email is already in use.':error.message});return;}
        finally {connection.release();}
        const {statusNotifications=[],...saved}=result;
        let statusEmails;
        try {statusEmails=await sendStatusNotifications(statusNotifications);}
        catch {statusEmails={sent:0,failed:statusNotifications.length};console.error('Invitation status notification failed.');}
        let invitations;
        try {invitations=await sendInvitations(pool,result.bracketId);}
        catch {invitations={sent:0,failed:1};}
        send(200,{...saved,invitations,statusEmails});return;
      }
      const albumRoute=url.pathname.match(/^\/api\/admin\/brackets(?:\/(\d+))?\/albums(?:\/(\d+))?$/);
      if(albumRoute && request.method==='DELETE' && albumRoute[1] && albumRoute[2]) {
        const connection=await pool.getConnection();
        try{await connection.beginTransaction();const result=await removeBracketAlbum(connection,{bracketId:Number(albumRoute[1]),albumId:Number(albumRoute[2]),familyId});await connection.commit();send(200,result);}
        catch(error){await connection.rollback();send(error.status||500,{error:error.status?error.message:'Could not remove album.'});}
        finally{connection.release();}return;
      }
      if(albumRoute && ['POST','PUT'].includes(request.method)) {
        const input=await readJson(request),connection=await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result=await saveBracketAlbum(connection,{bracketId:Number(albumRoute[1])||null,albumId:Number(albumRoute[2])||null,familyId,userId:authenticatedUser.userId,input});
          await connection.commit();send(200,result);
        } catch(error) {await connection.rollback();send(error.status||500,{error:error.status?error.message:'Could not save album.'});}
        finally {connection.release();}
        return;
      }
      const ballotEditorRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/matchups\/(\d+)\/ballots$/);
      if(ballotEditorRoute && ['GET','PUT'].includes(request.method)) {
        const bracketId=Number(ballotEditorRoute[1]),matchupId=Number(ballotEditorRoute[2]);
        const input=request.method==='PUT'?await readJson(request):null;
        const connection=await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result=request.method==='PUT'?await saveAdminBallots(connection,bracketId,matchupId,familyId,input):await loadAdminBallots(connection,bracketId,matchupId,familyId);
          await connection.commit(); send(200,result);
        } catch(error) { await connection.rollback(); send(error.status||500,{error:error.status?error.message:'Could not save matchup ballots.',requiresReset:!!error.requiresReset}); if(!error.status) console.error('Admin ballot edit failed:',error.message); }
        finally {connection.release();}
        return;
      }
      const pauseRoute = url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/(pause|resume)$/);
      if(request.method==='GET' && pauseRoute?.[2]==='resume') {
        try { send(200,await getResumeSchedule(pool,Number(pauseRoute[1]),familyId)); }
        catch(error) { send(error.status||500,{error:error.message}); }
        return;
      }
      if (request.method === 'POST' && pauseRoute) {
        // Pause has no payload; only scheduled resume needs JSON.
        const input=pauseRoute[2]==='resume' ? await readJson(request) : {};
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result = pauseRoute[2]==='resume' && input.sessions !== undefined
            ? await resumeWithSchedule(connection,Number(pauseRoute[1]),familyId,input)
            : await setBracketPaused(connection,Number(pauseRoute[1]),familyId,pauseRoute[2] === 'pause');
          await connection.commit(); send(200,result);
        } catch (error) { await connection.rollback(); send(error.status || 500,{error:error.message}); }
        finally { connection.release(); }
        return;
      }
      const songsRoute = url.pathname.match(/^\/api\/admin\/brackets(?:\/(\d+))?\/songs$/);
      if (request.method === 'PUT' && songsRoute) {
        const input = await readJson(request);
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result = await saveBracketSongs(connection, { bracketId: Number(songsRoute[1]) || null, familyId, userId: authenticatedUser.userId, input });
          await connection.commit(); send(200, result);
        } catch (error) { await connection.rollback(); send(error.status || 400, { error: error.message, requiresReset:!!error.requiresReset }); }
        finally { connection.release(); }
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/admin/brackets/participants/emails') {
        const input = await readJson(request);
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const result = await saveParticipantEmails(connection, familyId, input);
          await connection.commit(); send(200, result);
        } catch (error) {
          await connection.rollback();
          send(error.code === 'ER_DUP_ENTRY' ? 409 : error.status || 400, {error:error.code === 'ER_DUP_ENTRY' ? 'That email address is already used by another user. Each user needs a unique email address.' : error.message});
        } finally {connection.release();}
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/brackets/participants') {
        if(authenticatedUser.user_role!=='super') await authorizeBracket(pool,authenticatedUser.userId,Number(url.searchParams.get('bracketId')),{manageOnly:true});
        const [members] = await pool.execute('SELECT user_id AS userId,display_name AS displayName,email FROM users WHERE family_id=? ORDER BY display_name',[familyId]);
        send(200,{members}); return;
      }
      const duplicateRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/duplicate$/);
      if(duplicateRoute && request.method==='POST') {
        const input=await readJson(request),connection=await pool.getConnection();
        try{await connection.beginTransaction();const result=await duplicateBracket(connection,{bracketId:Number(duplicateRoute[1]),familyId,userId:authenticatedUser.userId,input});await connection.commit();send(201,result);}
        catch(error){await connection.rollback();send(error.status||400,{error:error.message});}
        finally{connection.release();}return;
      }
      const draftSessionRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/session-settings$/);
      if(draftSessionRoute && request.method==='PUT') {
        const input=await readJson(request),connection=await pool.getConnection();
        try{await connection.beginTransaction();const result=await saveDraftSessionSettings(connection,{bracketId:Number(draftSessionRoute[1]),familyId,userId:authenticatedUser.userId,input});await connection.commit();send(200,result);}
        catch(error){await connection.rollback();send(error.status||400,{error:error.message});}
        finally{connection.release();}return;
      }
      const sessionPlaylistsRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/session-playlists$/);
      if(sessionPlaylistsRoute && request.method==='PUT') {
        const input=await readJson(request),connection=await pool.getConnection();
        try {await connection.beginTransaction();const result=await updateBracketSessionPlaylists(connection,Number(sessionPlaylistsRoute[1]),familyId,input.sessionPlaylists);await connection.commit();send(200,result);}
        catch(error){await connection.rollback();send(error.status||500,{error:error.status?error.message:'Could not save session playlists.'});}
        finally{connection.release();}return;
      }
      const sessionsRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/sessions$/);
      if(sessionsRoute && ['GET','PUT'].includes(request.method)) {
        const bracketId=Number(sessionsRoute[1]);
        if(request.method==='GET'){try{const data=await getManagedSessions(pool,bracketId,familyId);const matchups=await getSessionPlaylistMatchups(pool,bracketId);send(200,{...data,sessions:data.sessions.map(session=>({...session,matchups:matchups.filter(match=>match.weekNumber===session.weekNumber)}))});}catch(error){send(error.status||400,{error:error.message});}return;}
        const input=await readJson(request),connection=await pool.getConnection();
        try{await connection.beginTransaction();const result=await saveManagedSessions(connection,bracketId,familyId,input);await connection.commit();send(200,result);}
        catch(error){await connection.rollback();send(error.status||400,{error:error.message});}
        finally{connection.release();}return;
      }
      const advanceRoute=url.pathname.match(/^\/api\/admin\/brackets\/(\d+)\/advance-week$/);
      if(advanceRoute && ['GET','POST'].includes(request.method)) {
        const bracketId=Number(advanceRoute[1]);
        if(request.method==='GET') {try{send(200,await getAdvanceWeekPlan(pool,bracketId,familyId));}catch(error){send(error.status||400,{error:error.message});}return;}
        const input=await readJson(request),connection=await pool.getConnection();
        try {await connection.beginTransaction();const result=await advanceWeek(connection,bracketId,familyId,input);await connection.commit();send(200,result);}
        catch(error){await connection.rollback();send(error.status||400,{error:error.message});}
        finally{connection.release();}return;
      }
      const draftRoute = url.pathname.match(/^\/api\/admin\/brackets(?:\/(\d+))?\/draft$/);
      if(draftRoute && ['POST','PUT'].includes(request.method)) {
        const input=await readJson(request),connection=await pool.getConnection();
        try {
          await connection.beginTransaction();
          if (authenticatedUser.user_role!=='super') await saveBracketRoles(connection,Number(draftRoute[1]),input.participantIds??[],input.participantRoles,false);
          const result=await saveBracketDraft(connection,{bracketId:draftRoute[1]?Number(draftRoute[1]):null,familyId,userId:authenticatedUser.userId,input});
          await connection.commit();send(draftRoute[1]?200:201,result);
        } catch(error){await connection.rollback();send(error.status||400,{error:error.message});}
        finally{connection.release();}
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/brackets') {
        const [rows] = await pool.execute(
          `SELECT b.bracket_id AS bracketId,b.title,b.artist,b.logo_url AS logoUrl,b.draft_settings AS draftSettings,${effectiveBracketStatus} AS status,b.start_at AS startAt,b.paused_at AS pausedAt,
                  b.songs_per_session AS songsPerSession,b.session_duration_minutes AS sessionDurationMinutes,b.tiebreaker_option AS tiebreakerOption,b.automatic_emails_disabled AS automaticEmailsDisabled,b.anonymous,b.seeding_size AS seedingSize,b.randomization_mode AS randomizationMode,DATE_FORMAT(b.finale_at,'%Y-%m-%d') AS finaleAt,b.finale_start_round AS finaleStartRound,
                  COUNT(DISTINCT bs.bracket_song_id) AS songCount
           FROM brackets b LEFT JOIN bracket_songs bs ON bs.bracket_id=b.bracket_id
           WHERE b.family_id=? AND (?='super' OR EXISTS (SELECT 1 FROM bracket_members cm WHERE cm.bracket_id=b.bracket_id AND cm.user_id=? AND cm.bracket_role='commissioner' AND cm.invitation_status='accepted')) GROUP BY b.bracket_id ORDER BY b.created_at DESC`, [familyId,authenticatedUser.user_role,authenticatedUser.userId]);
        send(200, { brackets: rows.map(({draftSettings,...row})=>({...row,songCount:row.status==='draft' ? parseDraftSettings(draftSettings).songCount??row.songCount : row.songCount})) }); return;
      }
      if (request.method === 'GET' && /^\/api\/admin\/brackets\/\d+$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/').at(-1));
        const [rows] = await pool.execute(
          `SELECT b.bracket_id AS bracketId,b.title,b.artist,b.logo_url AS logoUrl,b.draft_settings AS draftSettings,${effectiveBracketStatus} AS status,b.start_at AS startAt,b.paused_at AS pausedAt,
                  b.songs_per_session AS songsPerSession,b.session_duration_minutes AS sessionDurationMinutes,b.tiebreaker_option AS tiebreakerOption,b.automatic_emails_disabled AS automaticEmailsDisabled,b.anonymous,b.seeding_size AS seedingSize,b.randomization_mode AS randomizationMode,DATE_FORMAT(b.finale_at,'%Y-%m-%d') AS finaleAt,b.finale_start_round AS finaleStartRound
           FROM brackets b WHERE b.bracket_id=? AND b.family_id=?`, [id,familyId]);
        if (!rows.length) { send(404, { error:'Bracket not found.' }); return; }
        const [[songs],[members],[rounds]] = await Promise.all([
          pool.execute('SELECT bs.bracket_song_id AS bracketSongId,bs.position,bs.bracket_album_id AS albumId,bs.seed_number AS seed,bs.assigned_seed AS assignedSeed,s.title,s.category,COALESCE(ba.title,s.album) AS album,CASE WHEN ba.bracket_album_id IS NOT NULL THEN ba.year ELSE s.year END AS year,s.youtube_url AS youtubeUrl,s.spotify_url AS spotifyUrl,CASE WHEN ba.bracket_album_id IS NOT NULL THEN ba.album_cover_url ELSE s.album_cover_url END AS albumCoverUrl FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id LEFT JOIN bracket_albums ba ON ba.bracket_id=bs.bracket_id AND ba.bracket_album_id=bs.bracket_album_id WHERE bs.bracket_id=? ORDER BY bs.position,bs.bracket_song_id',[id]),
          pool.execute('SELECT user_id AS userId,bracket_role FROM bracket_members WHERE bracket_id=? ORDER BY user_id',[id]),
          pool.execute('SELECT MAX(round_number) AS roundCount FROM bracket_rounds WHERE bracket_id=?',[id])
        ]);
        const lockedSongIds=await getSongOrderLocks(pool,id);
        const restored=restoreBracketDraft(rows[0],songs.map(song=>({...song,reorderLocked:lockedSongIds.has(Number(song.bracketSongId))})));
        send(200, { bracket: { ...rows[0], automaticEmailsDisabled:!!rows[0].automaticEmailsDisabled, ...restored.settings, albums:await getBracketAlbums(pool,id), sessionPlaylists:restored.settings.sessionPlaylists??await getSessionPlaylists(pool,id), songCount:restored.settings.songCount??(rounds[0].roundCount ? 2 ** Number(rounds[0].roundCount) : Math.max(16,2 ** Math.ceil(Math.log2(songs.length || 1)))), songs:restored.songs.map(song=>({...song,category:song.category??'',album:song.album??'',youtubeUrl:song.youtubeUrl??'',spotifyUrl:song.spotifyUrl??'',albumCoverUrl:song.albumCoverUrl??''})), songList:songs.map(song=>song.title).join('\n'), canAssignRoles:authenticatedUser.user_role==='super', participantRoles:restored.settings.participantRoles??Object.fromEntries(members.map(member=>[member.userId,member.bracket_role])), participantIds:restored.settings.participantIds??members.map(member=>Number(member.userId)) } }); return;
      }
      if (['POST','PUT'].includes(request.method) && (url.pathname === '/api/admin/brackets' || /^\/api\/admin\/brackets\/\d+$/.test(url.pathname))) {
        const input = await readJson(request), isUpdate = request.method === 'PUT';
        const logoUrl = input.logoUrl == null ? null : typeof input.logoUrl === 'string' ? input.logoUrl.trim() || null : false;
        if (logoUrl === false || (logoUrl && (logoUrl.length > 2048 || !/^https?:\/\/[^\s]+$/i.test(logoUrl)))) {send(400,{error:'Enter a valid HTTP or HTTPS logo URL.'});return;}
        const tiebreakerOption = input.tiebreakerOption ?? 'admin_pick';
        const randomizationMode=input.randomizationMode ?? null;
        if(randomizationMode!==null && !randomizationModes.includes(randomizationMode)) {send(400,{error:'Choose a valid song randomization option.'});return;}
        if(input.automaticEmailsDisabled!==undefined && typeof input.automaticEmailsDisabled!=='boolean'){send(400,{error:'Choose whether to disable automatic emails.'});return;}
        const anonymous=input.anonymous ?? null;
        if(anonymous!==null && typeof anonymous!=='boolean') {send(400,{error:'Anonymous must be true or false.'});return;}
        if (!tiebreakerOptions.includes(tiebreakerOption)) { send(400, { error: 'Choose a valid tiebreaker option.' }); return; }
        let id = isUpdate ? Number(url.pathname.split('/').at(-1)) : null;
        if(id && input.songs) input.songs=await resolveSongAlbums(pool,id,input.songs);
        const allowedCounts = [4,8,16,32,64,128], count=Number(input.songCount), sessionSize=Number(input.songsPerSession), duration=input.sessionDurationMinutes===null?null:Number(input.sessionDurationMinutes);
        const finalePlan=parseFinalePlan(input,count,input.startAt);
        let seedingSize;
        try { seedingSize = input.seedingSize === undefined ? undefined : parseSeedingSize(input.seedingSize,count); } catch(error) {send(400,{error:error.message});return;}
        const songDetails = Array.isArray(input.songs) ? input.songs : null;
        if (songDetails && songDetails.some(song => !song || typeof song.title !== 'string' || !song.title.trim() || song.title.length > 200 || ['category','album','youtubeUrl','spotifyUrl','albumCoverUrl'].some(key => song[key] != null && typeof song[key] !== 'string') || (song.category?.length ?? 0) > 255 || (song.album?.length ?? 0) > 200 || (song.year != null && (!Number.isInteger(song.year) || song.year < 1 || song.year > 9999)) || ['youtubeUrl','spotifyUrl','albumCoverUrl'].some(key => song[key] && (song[key].length > 2048 || !/^https?:\/\/[^\s]+$/i.test(song[key]))))) {
          send(400, { error: 'Enter valid song details, a year from 1 to 9999, and HTTP or HTTPS song links.' }); return;
        }
        const titles = songDetails ? songDetails.map(song => song.title.trim()) : typeof input.songList === 'string' ? input.songList.split(/\r?\n/).map(s=>s.trim()).filter(Boolean) : [];
        let seeds,seedError;
        try { seeds = assignSongSeeds(songDetails ?? titles.map(() => ({}))); }
        catch (error) { if(!id){send(400,{error:error.message});return;}seedError=error; }
        const participants = Array.isArray(input.participantIds) ? [...new Set(input.participantIds.map(Number))] : [];
        if (!String(input.title||'').trim() || !String(input.artist||'').trim() || !allowedCounts.includes(count) || titles.length!==count || new Set(titles.map(s=>s.toLocaleLowerCase())).size!==count || ![2,4,8].includes(sessionSize) || (duration!==null && (!Number.isInteger(duration) || duration<1)) || !participants.length || !input.startAt) {
          send(400,{error:'Fill in the title, artist, start date, session settings, participants, and exactly the selected number of unique songs.'}); return;
        }
        const connection=await pool.getConnection();
        try {
          await connection.beginTransaction();
          const existingSongIds=new Map();
          let sessionPlaylists=input.sessionPlaylists;
          if (id) {
            const [exists]=await connection.execute('SELECT * FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[id,familyId]);
            if (!exists.length) { await connection.rollback(); send(404,{error:'Bracket not found.'}); return; }
            if(input.sessionSchedule!==undefined) {
              const current=await getManagedSessions(connection,id,familyId,true);
              if(current.sessions.length && input.sessionScheduleRevision!==current.revision) {await connection.rollback();send(409,{error:'Session dates or results changed while this form was open. Close and reopen the bracket form before saving.'});return;}
            }
            sessionPlaylists ??= await getSessionPlaylists(connection,id);
            const [existingEntries]=await connection.execute('SELECT bs.bracket_song_id,bs.song_id,bs.seed_number,bs.assigned_seed,s.title FROM bracket_songs bs JOIN songs s ON s.song_id=bs.song_id WHERE bs.bracket_id=? ORDER BY bs.position,bs.bracket_song_id',[id]);
            for(const entry of existingEntries)existingSongIds.set(Number(entry.bracket_song_id),Number(entry.song_id));
            seedingSize ??= input.seedingSize === null ? null : exists[0].seeding_size;
            try {validateSeedTiebreaker(tiebreakerOption,seedingSize);validateAssignedSeeds(songDetails??[],seedingSize,count);}catch(error){await connection.rollback();send(400,{error:error.message});return;}
            const liveInput={...input,seedingSize,...(finalePlan??{}),titles,participantIds:participants,tiebreakerOption,anonymous:anonymous??!!exists[0].anonymous,randomizationMode:randomizationMode??exists[0].randomization_mode,sessionDurationMinutes:duration};
            const unchangedLegacySeeds=songDetails?.every(song=>{const entry=existingEntries.find(entry=>Number(entry.bracket_song_id)===song.bracketSongId);return entry && (song.seed==null || Number(song.seed)===Number(entry.seed_number));});
            if(canPreserveBracketStructure(exists[0],existingEntries,liveInput)) {
              if(unchangedLegacySeeds)seeds=existingEntries.map(entry=>Number(entry.seed_number));
              else if(seedError)throw seedError;
              await applyLiveBracketEdit(connection,exists[0],existingEntries,liveInput,seeds);
              await saveAutomaticEmailSetting(connection,id,input.automaticEmailsDisabled);
              if (input.logoUrl !== undefined) await connection.execute('UPDATE brackets SET logo_url=? WHERE bracket_id=?',[logoUrl,id]);
              await connection.execute("UPDATE brackets SET status=CASE WHEN status='draft' THEN 'active' ELSE status END,draft_settings=NULL WHERE bracket_id=?",[id]);
              await applySubmittedSessionSchedule(connection,id,familyId,input.sessionSchedule);
              await saveSessionPlaylists(connection,id,sessionPlaylists);
              await saveBracketRoles(connection,id,participants,input.participantRoles,authenticatedUser.user_role==='super');
              await connection.commit(); const invitations=await sendInvitations(pool,id); send(200,{bracketId:id,saved:true,historyPreserved:true,invitations}); return;
            }
            if(seedError){if(unchangedLegacySeeds)seeds=assignSongSeeds(titles.map(()=>({})));else throw seedError;}
            const [activity]=await connection.execute('SELECT (SELECT COUNT(*) FROM votes WHERE bracket_id=?) + (SELECT COUNT(*) FROM bracket_finale_sessions WHERE bracket_id=?) + (SELECT COUNT(*) FROM matchups WHERE bracket_id=? AND winner_entry_id IS NOT NULL) AS total',[id,id,id]);
            if (Number(activity[0].total)>0 && input.resetHistory!==true) { await connection.rollback(); send(409,{requiresReset:true,error:'Changing the start date, matchup grouping, randomization option, seeding, or tournament field requires rebuilding the bracket. This will clear all recorded votes, results, and Finale Mode progress. Other settings can be changed while preserving voting history.'}); return; }
            if (input.resetHistory===true) {
              await connection.execute('DELETE FROM votes WHERE bracket_id=?',[id]);
              await connection.execute('DELETE FROM bracket_finale_sessions WHERE bracket_id=?',[id]);
              await connection.execute('UPDATE brackets SET completed_at=NULL,paused_at=NULL WHERE bracket_id=?',[id]);
            }
            await connection.execute('UPDATE matchups SET next_matchup_id=NULL,next_slot=NULL WHERE bracket_id=?',[id]);
            await connection.execute('DELETE FROM matchups WHERE bracket_id=?',[id]);
            await connection.execute('DELETE FROM bracket_playlists WHERE bracket_id=? AND week_id IS NOT NULL',[id]);
            await connection.execute('DELETE FROM bracket_weeks WHERE bracket_id=?',[id]);
            await connection.execute('DELETE FROM bracket_rounds WHERE bracket_id=?',[id]);
            await connection.execute('DELETE FROM bracket_songs WHERE bracket_id=?',[id]);
            // Preserve invitation responses when rebuilding tournament structure.
            await connection.execute('UPDATE brackets SET paused_at=NULL,status=\'active\',title=?,artist=?,start_at=?,songs_per_session=?,session_duration_minutes=?,tiebreaker_option=?,anonymous=?,randomization_mode=? WHERE bracket_id=?',[String(input.title).trim(),String(input.artist).trim(),new Date(input.startAt),sessionSize,duration,tiebreakerOption,anonymous??!!exists[0].anonymous,randomizationMode??exists[0].randomization_mode,id]);
          } else {
            seedingSize ??= null;
            try {validateSeedTiebreaker(tiebreakerOption,seedingSize);validateAssignedSeeds(songDetails??[],seedingSize,count);}catch(error){await connection.rollback();send(400,{error:error.message});return;}
            const [res]=await connection.execute("INSERT INTO brackets (family_id,created_by_user_id,title,artist,start_at,songs_per_session,session_duration_minutes,tiebreaker_option,anonymous,randomization_mode,status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')",[familyId,authenticatedUser.userId,String(input.title).trim(),String(input.artist).trim(),new Date(input.startAt),sessionSize,duration,tiebreakerOption,anonymous??false,randomizationMode??'none']);
            id=res.insertId;
          }
          await saveAutomaticEmailSetting(connection,id,input.automaticEmailsDisabled);
          await connection.execute('UPDATE brackets SET seeding_size=?,draft_settings=NULL WHERE bracket_id=?',[seedingSize??null,id]);
          if (input.logoUrl !== undefined) await connection.execute('UPDATE brackets SET logo_url=? WHERE bracket_id=?',[logoUrl,id]);
          if(finalePlan!==undefined) await connection.execute('UPDATE brackets SET finale_at=?,finale_start_round=? WHERE bracket_id=?',[finalePlan.finaleAt,finalePlan.finaleStartRound,id]);
          const [memberRows]=await connection.execute(`SELECT user_id FROM users WHERE family_id=? AND user_id IN (${participants.map(()=>'?').join(',')})`,[familyId,...participants]);
          if (memberRows.length!==participants.length) { await connection.rollback(); send(400,{error:'One or more participants are not members of your family.'}); return; }
          await connection.execute(`DELETE FROM bracket_members WHERE bracket_id=? AND user_id NOT IN (${participants.map(()=>'?').join(',')})`,[id,...participants]);
          for (const userId of participants) await connection.execute("INSERT IGNORE INTO bracket_members (bracket_id,family_id,user_id,finale_participant,non_finale_participant,invitation_status) VALUES (?,?,?,TRUE,TRUE,'pending')",[id,familyId,userId]);
          const entries=[];
          for (let i=0;i<titles.length;i++) {
            const details = songDetails?.[i];
            const previousSongId=existingSongIds.get(Number(details?.bracketSongId));
            let songs=previousSongId?[{song_id:previousSongId}]:(await connection.execute('SELECT song_id FROM songs WHERE artist=? AND title=? LIMIT 1',[String(input.artist).trim(),titles[i]]))[0];
            const metadata = details ? [details.album?.trim() || null, details.year ?? null, details.category?.trim() || null, details.youtubeUrl?.trim() || null, details.spotifyUrl?.trim() || null, details.albumCoverUrl?.trim() || null] : [null,null,null,null,null,null];
            if (!songs.length) {
              const [res]=await connection.execute('INSERT INTO songs (artist,title,album,year,category,youtube_url,spotify_url,album_cover_url) VALUES (?,?,?,?,?,?,?,?)',[String(input.artist).trim(),titles[i],...metadata]); songs=[{song_id:res.insertId}];
            } else if (details) {
              songs[0].song_id=await isolateBracketSong(connection,id,songs[0].song_id);
              await connection.execute('UPDATE songs SET album=COALESCE(?,album),year=COALESCE(?,year),category=COALESCE(?,category),youtube_url=COALESCE(?,youtube_url),spotify_url=COALESCE(?,spotify_url),album_cover_url=COALESCE(?,album_cover_url) WHERE song_id=?',[...metadata,songs[0].song_id]);
            }
            const region=Math.floor(i/16)+1, seed=seeds[i];
            const [res]=await connection.execute('INSERT INTO bracket_songs (bracket_id,region_number,song_id,seed_number,bracket_album_id,assigned_seed,position) VALUES (?,?,?,?,?,?,?)',[id,region,songs[0].song_id,seed,details?.albumId??null,seedingSize?details?.assignedSeed??null:null,i+1]); entries.push(Number(res.insertId));
          }
          const [[randomSettings]]=await connection.execute('SELECT randomization_mode AS mode,finale_at AS finaleAt,finale_start_round AS finaleStartRound FROM brackets WHERE bracket_id=?',[id]);
          const rankByEntry=new Map(entries.map((entry,i)=>[entry,songDetails?.[i]?.assignedSeed]));
          const tournamentEntries=seedingSize ? seededOrder(entries,entry=>rankByEntry.get(entry),randomSettings.mode!=='none') : randomSettings.mode==='none'?entries:shuffled(entries);
          const roundCount=Math.log2(count), roundIds=[], roundMatchups=[];
          for(let r=0;r<roundCount;r++) {
            const label=count/(2**r), name=label===2?'Championship':label===4?'Final Four':label===8?'Elite 8':label===16?'Sweet 16':`Round of ${label}`;
            const [round]=await connection.execute('INSERT INTO bracket_rounds (bracket_id,round_number,name) VALUES (?,?,?)',[id,r+1,name]); roundIds.push(Number(round.insertId));
            const matchups=[];
            const size=count/(2**(r+1));
            for(let m=0;m<size;m++) {
              const a=r===0?tournamentEntries[m*2]:roundMatchups[r-1][m*2].anchor;
              const b=r===0?tournamentEntries[m*2+1]:roundMatchups[r-1][m*2+1].anchor;
              matchups.push({a,b,anchor:a});
            }
            roundMatchups.push(matchups);
          }
          let current=new Date(input.startAt), weekNo=0, matchIdsByRound=[];
          for(let r=0;r<roundCount;r++) {
            const ids=[];
            for(let offset=0;offset<roundMatchups[r].length;offset+=sessionSize) {
              const opens=duration===null&&weekNo>0?null:new Date(current), closes=duration===null?null:new Date(current.getTime()+duration*60000); weekNo++;
              const [w]=await connection.execute('INSERT INTO bracket_weeks (bracket_id,round_id,week_number,opens_at,closes_at) VALUES (?,?,?,?,?)',[id,roundIds[r],weekNo,opens,closes]);
              for(let j=offset;j<Math.min(offset+sessionSize,roundMatchups[r].length);j++) {
                const [m]=await connection.execute('INSERT INTO matchups (bracket_id,week_id,matchup_number,song_a_entry_id,song_b_entry_id) VALUES (?,?,?,?,?)',[id,w.insertId,j+1,roundMatchups[r][j].a,roundMatchups[r][j].b]); ids.push(Number(m.insertId));
              }
              current=closes;
            }
            matchIdsByRound.push(ids);
          }
          for(let r=0;r<roundCount-1;r++) for(let i=0;i<matchIdsByRound[r].length;i++) await connection.execute('UPDATE matchups SET next_matchup_id=?,next_slot=? WHERE matchup_id=?',[matchIdsByRound[r+1][Math.floor(i/2)],i%2===0?'A':'B',matchIdsByRound[r][i]]);
          if(randomSettings.mode!=='none') await connection.execute('UPDATE bracket_rounds SET randomized_at=NOW(6) WHERE bracket_id=? AND round_number=1',[id]);
          await applySubmittedSessionSchedule(connection,id,familyId,input.sessionSchedule);
              await saveSessionPlaylists(connection,id,sessionPlaylists);
          await saveBracketRoles(connection,id,participants,input.participantRoles,authenticatedUser.user_role==='super');
              await connection.commit(); const invitations=await sendInvitations(pool,id); send(isUpdate?200:201,{bracketId:id,saved:true,invitations}); return;
        } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
      }
      if (request.method==='DELETE' && /^\/api\/admin\/brackets\/\d+$/.test(url.pathname)) {
        const id=Number(url.pathname.split('/').at(-1));
        const connection=await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [rows]=await connection.execute('SELECT bracket_id FROM brackets WHERE bracket_id=? AND family_id=? FOR UPDATE',[id,familyId]);
          if (!rows.length) { await connection.rollback(); send(404,{error:'Bracket not found.'}); return; }
          // Capture only this bracket's catalog songs, locking them before unlinking.
          const [ownedSongs]=await connection.execute('SELECT s.song_id FROM songs s JOIN bracket_songs bs ON bs.song_id=s.song_id WHERE bs.bracket_id=? ORDER BY s.song_id FOR UPDATE',[id]);
          // Remove dependent records inside the same transaction as the bracket.
          await connection.execute('DELETE FROM votes WHERE bracket_id=?',[id]);
          await connection.execute('DELETE FROM bracket_finale_sessions WHERE bracket_id=?',[id]);
          await connection.execute('UPDATE matchups SET next_matchup_id=NULL,next_slot=NULL WHERE bracket_id=?',[id]);
          for(const table of ['matchups','bracket_playlists','bracket_weeks','bracket_rounds','bracket_songs','bracket_albums','bracket_members']) await connection.execute(`DELETE FROM ${table} WHERE bracket_id=?`,[id]);
          for(const song of ownedSongs) await connection.execute('DELETE FROM songs WHERE song_id=? AND NOT EXISTS (SELECT 1 FROM bracket_songs bs WHERE bs.song_id=songs.song_id)',[song.song_id]);
          await connection.execute('DELETE FROM brackets WHERE bracket_id=?',[id]); await connection.commit(); send(200,{deleted:true}); return;
        } catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
      }
    } catch(error) {
      if(error.status) { send(error.status,{error:error.message}); return; }
      console.error('Bracket management failed:',error.message);
      send(500,{error:'Could not save bracket changes. Check the API log and database schema.'});
      return;
    }
    send(404,{error:'Bracket management route not found.'}); return;
  }

  if (request.method === 'GET' && url.pathname === '/api/my/brackets') {
    try {
      const [brackets] = await pool.execute(
        `SELECT b.bracket_id AS bracketId,b.title,b.artist,CASE WHEN bm.invitation_status='accepted' THEN b.logo_url ELSE NULL END AS logoUrl,b.start_at AS startAt,bm.invitation_status AS invitationStatus,bm.bracket_role,
                CASE WHEN b.start_at > NOW() THEN 'upcoming' ELSE 'active' END AS navigationStatus
         FROM brackets b
         JOIN bracket_members bm ON bm.bracket_id=b.bracket_id
         WHERE bm.user_id=?
           AND (bm.non_finale_participant=TRUE OR bm.finale_participant=TRUE)
           AND b.status<>'draft'
           AND (bm.invitation_status<>'declined' OR (b.start_at>NOW() AND b.status<>'complete' AND b.completed_at IS NULL))
           AND (${effectiveBracketStatus}='active' OR (b.start_at>NOW() AND b.status<>'complete' AND b.completed_at IS NULL) OR bm.invitation_status='pending')
         ORDER BY b.start_at DESC,b.created_at DESC`,[authenticatedUser.userId]);
      send(200,{brackets});
    } catch(error) {
      console.error('Bracket navigation request failed:',error.message);
      send(500,{error:'Could not load your brackets.'});
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/brackets') {
    try {
      const [users] = await pool.execute('SELECT family_id AS familyId FROM users WHERE user_id=?',[authenticatedUser.userId]);
      const familyId = Number(users[0]?.familyId);
      const requestedFamilyId = Number(url.searchParams.get('familyId') || familyId);
      if (!familyId || requestedFamilyId !== familyId) { send(403,{error:'This bracket family is not available to your account.'}); return; }
      const [brackets] = await pool.execute(
        `SELECT b.bracket_id AS bracketId,b.title,b.artist,b.logo_url AS logoUrl,b.bracket_year AS bracketYear,${effectiveBracketStatus} AS status,
                f.name AS familyName,
                (SELECT COUNT(*) FROM bracket_songs bs WHERE bs.bracket_id=b.bracket_id) AS songCount,
                (SELECT COUNT(*) FROM bracket_rounds r WHERE r.bracket_id=b.bracket_id) AS roundCount
         FROM brackets b JOIN families f ON f.family_id=b.family_id
         WHERE b.family_id=? AND (?='super' OR (b.status<>'draft' AND EXISTS (SELECT 1 FROM bracket_members bm WHERE bm.bracket_id=b.bracket_id AND bm.user_id=? AND bm.invitation_status='accepted'))) ORDER BY b.created_at DESC,b.bracket_id DESC`,[familyId,authenticatedUser.user_role,authenticatedUser.userId]);
      send(200,{brackets});
    } catch(error) {
      console.error('Bracket list request failed:',error.message);
      send(500,{error:'Could not load bracket history from MySQL.'});
    }
    return;
  }

  const voteMatch = url.pathname.match(/^\/api\/matchups\/(\d+)\/votes$/);
  if (request.method === 'POST' && voteMatch) {
    const matchupId = Number(voteMatch[1]);
    if (!Number.isSafeInteger(matchupId) || matchupId < 1) {
      send(400, { error: 'Matchup ID must be a positive integer.' });
      return;
    }

    let input;
    try {
      input = parseVoteInput(await readJson(request));
    } catch (error) {
      send(error.status || 400, { error: error.message });
      return;
    }
    if (input.error) {
      send(400, { error: input.error });
      return;
    }
    if (input.value.userId !== authenticatedUser.userId) {
      send(403, { error: 'You can only submit your own vote.' });
      return;
    }

    await finalizeClosedWeeks();

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [matchupRows] = await connection.execute(
        `SELECT m.matchup_id AS matchupId, m.bracket_id AS bracketId,
                m.song_a_entry_id AS songAEntryId, m.song_b_entry_id AS songBEntryId,
                ${effectiveBracketStatus} AS bracketStatus, f.family_id AS familyId,
                fs.status AS finaleModeStatus,b.paused_at AS pausedAt,r.round_number AS roundNumber,b.finale_start_round AS finaleStartRound,${awaitingFinaleSql('b')} AS awaitingFinale,${readyRoundSql('b','r')} AS roundReady,
                (w.opens_at <= NOW(6) AND (w.closes_at IS NULL OR w.closes_at > NOW(6)) AND ${priorSessionsReadySql('b','w')}) AS votingOpen
         FROM matchups m
         JOIN brackets b ON b.bracket_id = m.bracket_id
         JOIN families f ON f.family_id = b.family_id
         JOIN bracket_weeks w ON w.week_id = m.week_id AND w.bracket_id = m.bracket_id
         JOIN bracket_rounds r ON r.bracket_id=m.bracket_id AND r.round_id=w.round_id
         LEFT JOIN bracket_finale_sessions fs ON fs.bracket_id=b.bracket_id
         WHERE m.matchup_id = ?
         FOR UPDATE`,
        [matchupId]
      );
      if (matchupRows.length === 0) {
        await connection.rollback();
        send(404, { error: 'Matchup not found.' });
        return;
      }
      const matchup = matchupRows[0];
      if(matchup.awaitingFinale || (matchup.finaleStartRound!=null && Number(matchup.roundNumber)>=Number(matchup.finaleStartRound))) {await connection.rollback();send(409,{error:'Online voting has ended for these rounds. We’ll see you at the finale! The admin will record in-person votes.'});return;}
      if(!matchup.roundReady) {await connection.rollback();send(409,{error:'Voting opens after every winner in the previous round is known and this round has been randomized.'});return;}
      if (matchup.pausedAt) { await connection.rollback(); send(409,{error:'This bracket is on hold. Voting will resume when the admin resumes the bracket.'}); return; }
      if (matchup.finaleModeStatus != null) {
        await connection.rollback();
        send(409, { error: 'Online voting is disabled in Finale Mode. Votes are counted in person and recorded by the admin.' });
        return;
      }
      if (Number(input.value.selectedEntryId) !== Number(matchup.songAEntryId)
          && Number(input.value.selectedEntryId) !== Number(matchup.songBEntryId)) {
        await connection.rollback();
        send(400, { error: 'selectedEntryId must identify one of this matchup’s songs.' });
        return;
      }

      const [members] = await connection.execute(
        'SELECT 1 FROM bracket_members WHERE bracket_id = ? AND user_id = ? AND non_finale_participant = TRUE AND invitation_status=\'accepted\'',
        [matchup.bracketId, authenticatedUser.userId]
      );
      if (members.length === 0) {
        await connection.rollback();
        send(403, { error: 'This user is not a member of the bracket family.' });
        return;
      }
      if (matchup.bracketStatus !== 'active' || !Boolean(matchup.votingOpen)) {
        await connection.rollback();
        send(409, { error: 'Voting is closed for this matchup.' });
        return;
      }

      const [result] = await connection.execute(
        `INSERT INTO votes (bracket_id, matchup_id, user_id, selected_entry_id, comment, submitted_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           selected_entry_id = VALUES(selected_entry_id),
           comment = VALUES(comment),
           submitted_at = NOW()`,
        [matchup.bracketId, matchupId, authenticatedUser.userId, input.value.selectedEntryId, input.value.comment]
      );
      await connection.commit();
      send(200, { matchupId, userId: authenticatedUser.userId, selectedEntryId: input.value.selectedEntryId, saved: true, changed: result.affectedRows === 2 });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Vote submission failed:', error.message);
      send(500, { error: 'Could not save this vote. Check the server log and database setup.' });
    } finally {
      connection?.release();
    }
    return;
  }

  const votingBracketMatch = url.pathname.match(/^\/api\/brackets\/(\d+)\/voting$/);
  if (request.method === 'GET' && votingBracketMatch) {
    const bracketId = Number(votingBracketMatch[1]);
    try {
      await finalizeClosedWeeks();
      const [bracketRows] = await pool.execute(
        `SELECT b.bracket_id AS bracketId,b.title,b.artist,b.logo_url AS logoUrl,b.bracket_year AS bracketYear,b.session_duration_minutes AS sessionDurationMinutes,
                b.start_at AS startAt,(b.start_at > NOW() AND b.status <> 'complete' AND b.completed_at IS NULL) AS isUpcoming,
                ${effectiveBracketStatus} AS status,b.paused_at AS pausedAt,b.automatic_emails_disabled AS automaticEmailsDisabled,b.anonymous,b.seeding_size AS seedingSize,b.randomization_mode AS randomizationMode,DATE_FORMAT(b.finale_at,'%Y-%m-%d') AS finaleAt,b.finale_start_round AS finaleStartRound,${awaitingFinaleSql('b')} AS awaitingFinale,
                (SELECT status FROM bracket_finale_sessions WHERE bracket_id=b.bracket_id) AS finaleStatus,
                (SELECT start_round_number FROM bracket_finale_sessions WHERE bracket_id=b.bracket_id) AS finaleSessionStartRound,
                (SELECT COUNT(*) FROM bracket_songs bs WHERE bs.bracket_id=b.bracket_id) AS songCount
         FROM brackets b WHERE b.bracket_id=?`, [bracketId]);
      if (!bracketRows.length) { send(404, { error: 'Bracket not found.' }); return; }

      if (!bracketAccess?.canManage) {
        const [members] = await pool.execute(
          'SELECT 1 FROM bracket_members WHERE bracket_id=? AND user_id=? AND (non_finale_participant=TRUE OR finale_participant=TRUE) AND invitation_status=\'accepted\'',
          [bracketId, authenticatedUser.userId]);
        if (!members.length) { send(403, { error: 'You are not a participant in this bracket.' }); return; }
      }

      if (bracketRows[0].isUpcoming) {
        send(200, { bracket: bracketRows[0], isUpcoming: true, weeks: [], playlists: [],
          finaleModeActive: false, awaitingFinale: false, canViewBallots: false,
          currentWeekNumber: null, canManage:!!bracketAccess?.canManage, isCommissioner:!!Number(bracketAccess?.isCommissioner), ballotEditingRound: null });
        return;
      }

      const [votingMembers]=await pool.execute(
        'SELECT 1 FROM bracket_members WHERE bracket_id=? AND user_id=? AND non_finale_participant=TRUE AND invitation_status=\'accepted\'',
        [bracketId,authenticatedUser.userId]);
      const canParticipateOnline=votingMembers.length>0;

      bracketRows[0].finaleStartRound ??= bracketRows[0].finaleSessionStartRound;
      const finaleModeActive = ['active','paused'].includes(bracketRows[0].finaleStatus);
      const awaitingFinale=!!bracketRows[0].awaitingFinale;
      const revealAllSongs=finaleModeActive || awaitingFinale || bracketRows[0].status==='complete';
      const [rows] = await pool.execute(
        `SELECT w.week_number AS weekNumber,w.opens_at AS opensAt,w.closes_at AS closesAt,
                (w.opens_at<=COALESCE(b.paused_at,NOW(6)) AND (w.closes_at IS NULL OR w.closes_at>COALESCE(b.paused_at,NOW(6))) AND ${priorSessionsReadySql('b','w')}) AS isCurrent,
                ${readyRoundSql('b','r')} AS isReady,
                (b.randomization_mode='each_round' AND r.round_number>1 AND r.randomized_at IS NULL) AS isDrawPending,
                (feederA.matchup_id IS NOT NULL AND feederA.winner_entry_id IS NULL) AS songAPending,
                (feederB.matchup_id IS NOT NULL AND feederB.winner_entry_id IS NULL) AS songBPending,
                (w.closes_at<=COALESCE(b.paused_at,NOW(6))) AS isClosed,
                (w.opens_at IS NULL OR w.opens_at>COALESCE(b.paused_at,NOW(6)) OR NOT ${priorSessionsReadySql('b','w')}) AS isUpcoming,
                CASE WHEN b.randomization_mode='each_round' AND r.round_number>1 AND r.randomized_at IS NULL THEN 'TBD' WHEN feederA.matchup_id IS NOT NULL AND feederA.winner_entry_id IS NULL
                  THEN CONCAT('Winner of week ',feederWeekA.week_number,', matchup ',feederA.matchup_number) ELSE sa.title END AS bracketSongATitle,
                CASE WHEN b.randomization_mode='each_round' AND r.round_number>1 AND r.randomized_at IS NULL THEN 'TBD' WHEN feederB.matchup_id IS NOT NULL AND feederB.winner_entry_id IS NULL
                  THEN CONCAT('Winner of week ',feederWeekB.week_number,', matchup ',feederB.matchup_number) ELSE sb.title END AS bracketSongBTitle,
                r.round_number AS roundNumber,r.name AS roundName,
                m.matchup_id AS matchupId,m.matchup_number AS matchupNumber,m.next_matchup_id AS nextMatchupId,
                a.bracket_song_id AS songAEntryId,CASE WHEN b.seeding_size IS NOT NULL THEN a.assigned_seed ELSE a.seed_number END AS songASeed,sa.title AS songATitle,
                COALESCE(albumA.title,sa.album) AS songAAlbum,CASE WHEN albumA.bracket_album_id IS NOT NULL THEN albumA.year ELSE sa.year END AS songAYear,sa.youtube_url AS songAYoutubeUrl,sa.spotify_url AS songASpotifyUrl,CASE WHEN albumA.bracket_album_id IS NOT NULL THEN albumA.album_cover_url ELSE sa.album_cover_url END AS songAAlbumCoverUrl,
                c.bracket_song_id AS songBEntryId,CASE WHEN b.seeding_size IS NOT NULL THEN c.assigned_seed ELSE c.seed_number END AS songBSeed,sb.title AS songBTitle,
                COALESCE(albumB.title,sb.album) AS songBAlbum,CASE WHEN albumB.bracket_album_id IS NOT NULL THEN albumB.year ELSE sb.year END AS songBYear,sb.youtube_url AS songBYoutubeUrl,sb.spotify_url AS songBSpotifyUrl,CASE WHEN albumB.bracket_album_id IS NOT NULL THEN albumB.album_cover_url ELSE sb.album_cover_url END AS songBAlbumCoverUrl,
                m.winner_entry_id AS winnerEntryId,m.random_tiebreaker_vote_entry_id AS randomTiebreakerVoteEntryId,m.admin_tiebreaker_entry_id AS adminTieBreakEntryId,reported.votes_a AS reportedVoteCountA,reported.votes_b AS reportedVoteCountB,sw.title AS winnerTitle,
                ownVote.selected_entry_id AS selectedEntryId,ownVote.comment
         FROM bracket_weeks w
         JOIN brackets b ON b.bracket_id=w.bracket_id
         JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id
         JOIN matchups m ON m.bracket_id=w.bracket_id AND m.week_id=w.week_id
         LEFT JOIN matchup_reported_totals reported ON reported.bracket_id=m.bracket_id AND reported.matchup_id=m.matchup_id
         JOIN bracket_songs a ON a.bracket_id=m.bracket_id AND a.bracket_song_id=m.song_a_entry_id
         JOIN songs sa ON sa.song_id=a.song_id
         LEFT JOIN bracket_albums albumA ON albumA.bracket_id=a.bracket_id AND albumA.bracket_album_id=a.bracket_album_id
         JOIN bracket_songs c ON c.bracket_id=m.bracket_id AND c.bracket_song_id=m.song_b_entry_id
         JOIN songs sb ON sb.song_id=c.song_id
         LEFT JOIN bracket_albums albumB ON albumB.bracket_id=c.bracket_id AND albumB.bracket_album_id=c.bracket_album_id
         LEFT JOIN matchups feederA ON feederA.bracket_id=m.bracket_id AND feederA.next_matchup_id=m.matchup_id AND feederA.next_slot='A'
         LEFT JOIN bracket_weeks feederWeekA ON feederWeekA.week_id=feederA.week_id AND feederWeekA.bracket_id=m.bracket_id
         LEFT JOIN matchups feederB ON feederB.bracket_id=m.bracket_id AND feederB.next_matchup_id=m.matchup_id AND feederB.next_slot='B'
         LEFT JOIN bracket_weeks feederWeekB ON feederWeekB.week_id=feederB.week_id AND feederWeekB.bracket_id=m.bracket_id
         LEFT JOIN bracket_songs winning ON winning.bracket_id=m.bracket_id AND winning.bracket_song_id=m.winner_entry_id
         LEFT JOIN songs sw ON sw.song_id=winning.song_id
         LEFT JOIN votes ownVote ON ownVote.bracket_id=m.bracket_id AND ownVote.matchup_id=m.matchup_id
              AND ownVote.user_id=? AND ownVote.submitted_at IS NOT NULL
         WHERE w.bracket_id=?
         ORDER BY w.week_number,m.matchup_number`, [authenticatedUser.userId, bracketId]);

      const [ballotRows] = await pool.execute(
        `SELECT v.matchup_id AS matchupId,u.display_name AS displayName,v.selected_entry_id AS selectedEntryId
         FROM votes v
         JOIN users u ON u.user_id=v.user_id
         JOIN matchups m ON m.bracket_id=v.bracket_id AND m.matchup_id=v.matchup_id
         JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id
         JOIN brackets b ON b.bracket_id=w.bracket_id
         WHERE v.bracket_id=? AND v.submitted_at IS NOT NULL AND (w.closes_at<=COALESCE(b.paused_at,NOW(6)) OR
           (m.winner_entry_id IS NOT NULL AND EXISTS (SELECT 1 FROM bracket_finale_sessions fs JOIN bracket_rounds fr ON fr.bracket_id=fs.bracket_id AND fr.round_id=w.round_id WHERE fs.bracket_id=m.bracket_id AND fr.round_number>=fs.start_round_number)))
         ORDER BY v.matchup_id,u.display_name`, [bracketId]);
      const ballotsByMatchup = new Map();
      for (const ballot of ballotRows) {
        const ballots = ballotsByMatchup.get(Number(ballot.matchupId)) ?? [];
        ballots.push({ displayName: ballot.displayName, selectedEntryId: Number(ballot.selectedEntryId) });
        ballotsByMatchup.set(Number(ballot.matchupId), ballots);
      }

      const revealedEntries=new Set(rows.filter(row=>Number(row.roundNumber)===1&&(revealAllSongs||!row.isUpcoming)).flatMap(row=>[Number(row.songAEntryId),Number(row.songBEntryId)]));
      const weeksByNumber = new Map();
      for (const row of rows) {
        const weekNumber = Number(row.weekNumber);
        if (!weeksByNumber.has(weekNumber)) {
          weeksByNumber.set(weekNumber, {
            weekNumber,
            roundNumber: Number(row.roundNumber),
            roundName: row.roundName,
            opensAt: row.opensAt,
            closesAt: row.closesAt,
            isCurrent: Boolean(row.isCurrent),
            isReady: Boolean(row.isReady),
            isClosed: Boolean(row.isClosed),
            isUpcoming: Boolean(row.isUpcoming),
            matchups: []
          });
        }
        weeksByNumber.get(weekNumber).matchups.push(memberMatchupView({
          matchupId: Number(row.matchupId),
          matchupNumber: Number(row.matchupNumber),
          nextMatchupId:row.nextMatchupId==null?null:Number(row.nextMatchupId),
          drawPending:!!row.isDrawPending,
          roundNumber: Number(row.roundNumber),
          reportedVoteCountA:row.reportedVoteCountA==null?null:Number(row.reportedVoteCountA),
          reportedVoteCountB:row.reportedVoteCountB==null?null:Number(row.reportedVoteCountB),
          bracketSongATitle: row.bracketSongATitle,
          bracketSongBTitle: row.bracketSongBTitle,
          songA: { entryId: Number(row.songAEntryId), title: row.songATitle, album: row.songAAlbum, year: row.songAYear, seed: Number(row.songASeed), youtubeUrl: row.songAYoutubeUrl, spotifyUrl: row.songASpotifyUrl, albumCoverUrl: row.songAAlbumCoverUrl },
          songB: { entryId: Number(row.songBEntryId), title: row.songBTitle, album: row.songBAlbum, year: row.songBYear, seed: Number(row.songBSeed), youtubeUrl: row.songBYoutubeUrl, spotifyUrl: row.songBSpotifyUrl, albumCoverUrl: row.songBAlbumCoverUrl },
          winnerEntryId: row.winnerEntryId === null ? null : Number(row.winnerEntryId),
          randomTiebreakerVoteEntryId: row.winnerEntryId != null && row.randomTiebreakerVoteEntryId != null ? Number(row.randomTiebreakerVoteEntryId) : null,
          winnerTitle: row.winnerTitle,
          selectedEntryId: row.selectedEntryId === null ? null : Number(row.selectedEntryId),
          comment: row.comment,
          ballots: [...(ballotsByMatchup.get(Number(row.matchupId)) ?? []), ...(row.winnerEntryId != null && row.randomTiebreakerVoteEntryId != null ? [{ displayName: row.adminTieBreakEntryId != null ? 'Admin tiebreaker' : 'Tiebreaker vote', selectedEntryId: Number(row.randomTiebreakerVoteEntryId) }] : [])]
        },{isAdmin:!!bracketAccess?.canManage,roundNumber:Number(row.roundNumber),isUpcoming:revealAllSongs ? false : !!row.isUpcoming,revealedEntries,songAPending:!!row.isDrawPending||!!row.songAPending,songBPending:!!row.isDrawPending||!!row.songBPending}));
      }
      const weeks = [...weeksByNumber.values()];
      if (bracketRows[0].finaleStatus != null) {
        for (const week of weeks) if (week.roundNumber >= Number(bracketRows[0].finaleSessionStartRound)) week.isClosed = week.matchups.length>0 && week.matchups.every(match=>match.winnerEntryId!=null);
      }
      if(bracketRows[0].finaleStartRound!=null) {
        for(const week of weeks) if(week.roundNumber>=Number(bracketRows[0].finaleStartRound)) {
          week.isCurrent=false;
          week.isUpcoming=!week.matchups.every(match=>match.winnerEntryId!=null);
          week.isClosed=week.matchups.length>0 && week.matchups.every(match=>match.winnerEntryId!=null);
        }
      }
      const canViewBallots=!bracketRows[0].anonymous || !!bracketAccess?.canManage;
      for(const week of weeks) week.matchups=week.matchups.map(match=>applyBallotPrivacy(match,!!bracketRows[0].anonymous,!!bracketAccess?.canManage,authenticatedUser.userId));
      const activeWeek = weeks.find(week => week.isCurrent);
      const assignedPlaylists=await getSessionPlaylists(pool,bracketId);
      const playlists=assignedPlaylists.filter(playlist=>weeks.some(week=>week.weekNumber===playlist.weekNumber && (!!bracketAccess?.canManage||week.isCurrent||week.isClosed||((finaleModeActive||awaitingFinale)&&week.roundNumber>=Number(bracketRows[0].finaleStartRound??bracketRows[0].finaleSessionStartRound??999)))));
      send(200, { playlists, canParticipateOnline, bracket: {...bracketRows[0],finaleStartRound:bracketRows[0].finaleStartRound??bracketRows[0].finaleSessionStartRound}, finaleModeActive, awaitingFinale, canViewBallots, currentWeekNumber: activeWeek?.weekNumber ?? null, weeks, canManage:!!bracketAccess?.canManage, isCommissioner:!!Number(bracketAccess?.isCommissioner), ballotEditingRound:!!bracketAccess?.canManage ? await getBallotEditingRound(pool,bracketId) : null });
    } catch (error) {
      console.error('Weekly bracket request failed:', error.message);
      send(500, { error: 'Could not load current bracket matchups.' });
    }
    return;
  }

  const bracketMatch = url.pathname.match(/^\/api\/brackets\/(\d+)$/);
  const startFinaleMatch = url.pathname.match(/^\/api\/brackets\/(\d+)\/finale$/);
  const finaleVotesMatch = url.pathname.match(/^\/api\/brackets\/(\d+)\/finale\/votes$/);
  const finaleOptionsMatch = url.pathname.match(/^\/api\/brackets\/(\d+)\/finale-options$/);
  if (request.method === 'POST' && finaleVotesMatch) {
    if (!bracketAccess?.canManage) { send(403, { error: 'Only an admin can record finale ballots.' }); return; }
    const bracketId = Number(finaleVotesMatch[1]);
    let connection;
    try {
      const input = await readJson(request);
      const matchupId = Number(input.matchupId);
      const ballots = Array.isArray(input.ballots) ? input.ballots : [];
      const tieBreakEntryId = ['random','seed','seed_low'].includes(input.tieBreakEntryId) ? input.tieBreakEntryId : input.tieBreakEntryId == null ? null : Number(input.tieBreakEntryId);
      if (!Number.isSafeInteger(matchupId) || matchupId < 1 || !ballots.length) {
        send(400, { error: 'Choose a matchup and enter every finale participant’s vote.' }); return;
      }
      const submittedIds = ballots.map(ballot => Number(ballot.userId));
      const selections = ballots.map(ballot => Number(ballot.selectedEntryId));
      if (submittedIds.some(id => !Number.isSafeInteger(id) || id < 1)
          || selections.some(id => !Number.isSafeInteger(id) || id < 1)
          || new Set(submittedIds).size !== submittedIds.length) {
        send(400, { error: 'Every finale ballot needs one participant and one song.' }); return;
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();
      await authorizeBracket(connection,authenticatedUser.userId,bracketId,{manageOnly:true});
      const [sessions] = await connection.execute(
        "SELECT f.start_round_number AS startRoundNumber,f.status,b.paused_at AS pausedAt,(b.start_at<=NOW(6) AND b.status<>'draft') AS hasStarted FROM bracket_finale_sessions f JOIN brackets b ON b.bracket_id=f.bracket_id WHERE f.bracket_id=? FOR UPDATE",
        [bracketId]);
      if (!sessions.length || sessions[0].status !== 'active') {
        await connection.rollback(); send(409, { error: 'Finale Mode is not active for this bracket.' }); return;
      }
      if (!sessions[0].hasStarted) { await connection.rollback(); send(409,{error:'Voting opens at the scheduled bracket start time.'}); return; }
      if (sessions[0].pausedAt) { await connection.rollback(); send(409,{error:'This bracket is on hold. Resume it before recording votes.'}); return; }
      const [matchups] = await connection.execute(
        `SELECT m.matchup_id AS matchupId,m.song_a_entry_id AS songAEntryId,m.song_b_entry_id AS songBEntryId,
                m.winner_entry_id AS winnerEntryId,m.random_tiebreaker_vote_entry_id AS randomVote,m.next_matchup_id AS nextMatchupId,m.next_slot AS nextSlot,
                (SELECT CASE WHEN br.seeding_size IS NOT NULL THEN assigned_seed ELSE seed_number END FROM bracket_songs WHERE bracket_song_id=m.song_a_entry_id) AS songASeed,
                (SELECT CASE WHEN br.seeding_size IS NOT NULL THEN assigned_seed ELSE seed_number END FROM bracket_songs WHERE bracket_song_id=m.song_b_entry_id) AS songBSeed,
                r.round_number AS roundNumber,br.seeding_size AS seedingSize,
                ${readyRoundSql('br','r')} AS roundReady,
                (SELECT MAX(last_round.round_number) FROM bracket_rounds last_round WHERE last_round.bracket_id=m.bracket_id) AS finalRoundNumber
         FROM matchups m JOIN brackets br ON br.bracket_id=m.bracket_id JOIN bracket_weeks w ON w.bracket_id=m.bracket_id AND w.week_id=m.week_id
         JOIN bracket_rounds r ON r.bracket_id=w.bracket_id AND r.round_id=w.round_id
         WHERE m.bracket_id=? AND m.matchup_id=? FOR UPDATE`, [bracketId, matchupId]);
      if (!matchups.length) { await connection.rollback(); send(404, { error: 'Matchup not found.' }); return; }
      const matchup = matchups[0];
      if(!matchup.roundReady) {await connection.rollback();send(409,{error:'Finish the previous round before recording votes for this randomized round.'});return;}
      if (!roundAllowsBallotEditing(Number(matchup.roundNumber),await getBallotEditingRound(connection,bracketId))) { await connection.rollback(); send(409,{error:'Only the current round and the immediately previous round can be edited. Older rounds are locked.'}); return; }
      if (Number(matchup.roundNumber) < Number(sessions[0].startRoundNumber)) {
        await connection.rollback(); send(409, { error: 'This matchup is before the selected finale starting round.' }); return;
      }
      if (selections.some(id => id !== Number(matchup.songAEntryId) && id !== Number(matchup.songBEntryId))) {
        await connection.rollback(); send(400, { error: 'Each ballot must select one of this matchup’s songs.' }); return;
      }
      if (['seed','seed_low'].includes(tieBreakEntryId) && !matchup.seedingSize) {await connection.rollback();send(400,{error:'Select Use Seeds before choosing a seed tiebreaker.'});return;}
      if (tieBreakEntryId !== null && !['random','seed','seed_low'].includes(tieBreakEntryId) && tieBreakEntryId !== Number(matchup.songAEntryId) && tieBreakEntryId !== Number(matchup.songBEntryId)) {
        await connection.rollback(); send(400, { error: 'The tie-break song must be part of this matchup.' }); return;
      }

      const [participants] = await connection.execute(
        'SELECT user_id AS userId FROM bracket_members WHERE bracket_id=? AND finale_participant=TRUE AND invitation_status=\'accepted\' FOR UPDATE',
        [bracketId]);
      const expectedIds = participants.map(person => Number(person.userId));
      if (expectedIds.length !== submittedIds.length || expectedIds.some(id => !submittedIds.includes(id))) {
        await connection.rollback(); send(400, { error: 'A ballot has an invalid participant or song.' }); return;
      }

      for (let index = 0; index < ballots.length; index++) {
        await connection.execute(
          `INSERT INTO votes (bracket_id,matchup_id,user_id,selected_entry_id,submitted_at)
           VALUES (?,?,?,?,NOW())
           ON DUPLICATE KEY UPDATE selected_entry_id=VALUES(selected_entry_id),submitted_at=NOW()`,
          [bracketId, matchupId, submittedIds[index], selections[index]]);
      }

      const votesForA = selections.filter(id => id === Number(matchup.songAEntryId)).length;
      const votesForB = selections.filter(id => id === Number(matchup.songBEntryId)).length;
      const tied = votesForA === votesForB;
      // The finale dropdown supports a manual song choice or a recorded random draw.
      const resolution = correctedWinner({...matchup,inFinale:true},ballots.map(ballot=>({...ballot,selectedEntryId:Number(ballot.selectedEntryId)})),tieBreakEntryId);
      const winnerEntryId = resolution.winner;
      if (!winnerEntryId) {
        await connection.commit();
        send(200, { tied: true, winnerEntryId: null, voteCount: votesForA, participantCount: participants.length, allVotesRecorded: true });
        return;
      }

      if (matchup.nextMatchupId) {
        const [nextRows] = await connection.execute('SELECT winner_entry_id FROM matchups WHERE matchup_id=? FOR UPDATE', [matchup.nextMatchupId]);
        if (nextRows[0]?.winner_entry_id != null) {
          await connection.rollback(); send(409, { error: 'The next matchup already has a winner, so this ballot can no longer be changed.' }); return;
        }
      }
      await connection.execute('UPDATE matchups SET winner_entry_id=?,random_tiebreaker_vote_entry_id=? WHERE bracket_id=? AND matchup_id=?', [winnerEntryId, resolution.randomVote, bracketId, matchupId]);
      if (matchup.nextMatchupId && matchup.nextSlot === 'A') {
        await connection.execute('UPDATE matchups SET song_a_entry_id=? WHERE bracket_id=? AND matchup_id=?', [winnerEntryId, bracketId, matchup.nextMatchupId]);
      } else if (matchup.nextMatchupId && matchup.nextSlot === 'B') {
        await connection.execute('UPDATE matchups SET song_b_entry_id=? WHERE bracket_id=? AND matchup_id=?', [winnerEntryId, bracketId, matchup.nextMatchupId]);
      } else if (Number(matchup.roundNumber) === Number(matchup.finalRoundNumber)) {
        await connection.execute("UPDATE brackets SET status='complete',completed_at=NOW(6) WHERE bracket_id=?", [bracketId]);
        await connection.execute("UPDATE bracket_finale_sessions SET status='complete',completed_at=NOW(6) WHERE bracket_id=?", [bracketId]);
      }
      await randomizeReadyRounds(connection,bracketId);
      await connection.commit();
      send(200, { tied: false, winnerEntryId, voteCount: Math.max(votesForA, votesForB) + (resolution.randomVote ? 1 : 0), participantCount: participants.length, allVotesRecorded: true });
    } catch (error) {
      if (connection) { try { await connection.rollback(); } catch { /* The transaction may already be closed. */ } }
      if (error.status) { send(error.status, { error: error.message }); return; }
      console.error('Saving finale ballots failed:', error.message);
      send(500, { error: 'Could not save finale ballots.' });
    } finally { connection?.release(); }
    return;
  }

  if (request.method === 'POST' && startFinaleMatch) {
    if (!bracketAccess?.canManage) { send(403, { error: 'Only an admin can enter finale mode.' }); return; }
    const bracketId = Number(startFinaleMatch[1]);
    try {
      const input = await readJson(request);
      const startRoundNumber = Number(input.startRoundNumber);
      const participantIds = Array.isArray(input.participantIds) ? [...new Set(input.participantIds.map(Number))] : [];
      if (!Number.isSafeInteger(startRoundNumber) || startRoundNumber < 1 || !participantIds.length || participantIds.some(id => !Number.isSafeInteger(id) || id < 1)) {
        send(400, { error: 'Choose a starting round and at least one finale participant.' }); return;
      }

      const [[brackets], [users]] = await Promise.all([
        pool.execute('SELECT family_id AS familyId FROM brackets WHERE bracket_id=?', [bracketId]),
        pool.execute('SELECT family_id AS familyId FROM users WHERE user_id=?', [authenticatedUser.userId])
      ]);
      if (!brackets.length || Number(brackets[0].familyId) !== Number(users[0]?.familyId)) {
        send(404, { error: 'Bracket not found.' }); return;
      }
      const [rounds] = await pool.execute('SELECT round_id FROM bracket_rounds WHERE bracket_id=? AND round_number=?', [bracketId, startRoundNumber]);
      if (!rounds.length) { send(400, { error: 'The selected round does not exist in this bracket.' }); return; }
      const [members] = await pool.execute(
        `SELECT user_id FROM bracket_members WHERE bracket_id=? AND family_id=? AND invitation_status='accepted' AND user_id IN (${participantIds.map(() => '?').join(',')})`,
        [bracketId, brackets[0].familyId, ...participantIds]);
      if (members.length !== participantIds.length) { send(400, { error: 'Every finale participant must already belong to this bracket.' }); return; }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [[timing]]=await connection.execute("SELECT (start_at<=NOW(6) AND status<>'draft') AS hasStarted FROM brackets WHERE bracket_id=? FOR UPDATE",[bracketId]);
        if (!timing?.hasStarted) throw Object.assign(new Error('Finale Mode cannot start before the scheduled bracket start time.'),{status:409});
        await connection.execute(
          `UPDATE bracket_members SET finale_participant=CASE WHEN user_id IN (${participantIds.map(() => '?').join(',')}) THEN TRUE ELSE FALSE END
           WHERE bracket_id=? AND family_id=?`,
          [...participantIds, bracketId, brackets[0].familyId]);
        await connection.execute(
          `INSERT INTO bracket_finale_sessions (bracket_id,started_by_user_id,start_round_number,status,started_at,completed_at)
           VALUES (?,?,?,'active',NOW(),NULL)
           ON DUPLICATE KEY UPDATE started_by_user_id=VALUES(started_by_user_id),start_round_number=VALUES(start_round_number),
             status='active',started_at=NOW(),completed_at=NULL`,
          [bracketId, authenticatedUser.userId, startRoundNumber]);
        await connection.commit();
        send(200, { started: true, bracketId, startRoundNumber, participantCount: participantIds.length });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    } catch (error) {
      if (error.status) { send(error.status, { error: error.message }); return; }
      console.error('Starting finale mode failed:', error.message);
      send(500, { error: 'Could not start finale mode.' });
    }
    return;
  }

  if (request.method === 'GET' && finaleOptionsMatch) {
    const bracketId = Number(finaleOptionsMatch[1]);
    try {
      const [[brackets], [rounds], [participants], [sessions]] = await Promise.all([
        pool.execute('SELECT bracket_id FROM brackets WHERE bracket_id=?', [bracketId]),
        pool.execute('SELECT round_number AS roundNumber,name FROM bracket_rounds WHERE bracket_id=? ORDER BY round_number', [bracketId]),
        pool.execute(
          `SELECT bm.user_id AS userId,u.display_name AS displayName,
                  COUNT(v.vote_id) AS voteCount,bm.finale_participant AS selectedByDefault
           FROM bracket_members bm JOIN users u ON u.user_id=bm.user_id
           LEFT JOIN votes v ON v.bracket_id=bm.bracket_id AND v.user_id=bm.user_id AND v.submitted_at IS NOT NULL
           WHERE bm.bracket_id=? AND bm.invitation_status='accepted' GROUP BY bm.user_id,u.display_name,bm.finale_participant
           ORDER BY u.display_name`, [bracketId]),
        pool.execute('SELECT start_round_number AS startRoundNumber,status FROM bracket_finale_sessions WHERE bracket_id=?', [bracketId])
      ]);
      if (!brackets.length) { send(404, { error: 'Bracket not found.' }); return; }
      send(200, { rounds, participants, session: sessions[0] ?? null });
    } catch (error) {
      console.error('Finale options request failed:', error.message);
      send(500, { error: 'Could not load finale options.' });
    }
    return;
  }

  if (request.method !== 'GET' || !bracketMatch) {
    send(404, { error: 'API route not found.' });
    return;
  }

  const bracketId = Number(bracketMatch[1]);
  try {
    const [bracketRows] = await pool.execute(
      `SELECT b.bracket_id AS bracketId, b.title, b.artist,b.logo_url AS logoUrl,
              b.bracket_year AS bracketYear, ${effectiveBracketStatus} AS status,b.automatic_emails_disabled AS automaticEmailsDisabled,b.anonymous,b.seeding_size AS seedingSize,b.randomization_mode AS randomizationMode,DATE_FORMAT(b.finale_at,'%Y-%m-%d') AS finaleAt,b.finale_start_round AS finaleStartRound,
              f.name AS familyName,
              (SELECT COUNT(*) FROM bracket_songs bs WHERE bs.bracket_id = b.bracket_id) AS songCount
       FROM brackets b
       JOIN families f ON f.family_id = b.family_id
       WHERE b.bracket_id = ?`,
      [bracketId]
    );
    if (bracketRows.length === 0) {
      send(404, { error: 'Bracket not found.' });
      return;
    }

    // Members use the voting endpoint for unfinished brackets, where song reveals are enforced.
    if (!bracketAccess?.canManage && bracketRows[0].status !== 'complete') {
      send(200,{bracket:bracketRows[0],songs:[],rounds:[],playlists:[],participants:[],champion:null,finaleSession:null,canManage:!!bracketAccess?.canManage, isCommissioner:!!Number(bracketAccess?.isCommissioner), ballotEditingRound:null});
      return;
    }
    const [roundRows] = await pool.execute(
      `SELECT r.round_id AS roundId, r.round_number AS roundNumber, r.name AS roundName,
              w.week_number AS weekNumber, m.matchup_id AS matchupId,m.next_matchup_id AS nextMatchupId,
              m.matchup_number AS matchupNumber,
              a.bracket_song_id AS songAEntryId, a.region_number AS songARegion,
              CASE WHEN historyBracket.seeding_size IS NOT NULL THEN a.assigned_seed ELSE a.seed_number END AS songASeed, sa.title AS songATitle,
              COALESCE(albumA.title,sa.album) AS songAAlbum,CASE WHEN albumA.bracket_album_id IS NOT NULL THEN albumA.year ELSE sa.year END AS songAYear,CASE WHEN albumA.bracket_album_id IS NOT NULL THEN albumA.album_cover_url ELSE sa.album_cover_url END AS songAAlbumCoverUrl,
              b.bracket_song_id AS songBEntryId, b.region_number AS songBRegion,
              CASE WHEN historyBracket.seeding_size IS NOT NULL THEN b.assigned_seed ELSE b.seed_number END AS songBSeed, sb.title AS songBTitle,
              COALESCE(albumB.title,sb.album) AS songBAlbum,CASE WHEN albumB.bracket_album_id IS NOT NULL THEN albumB.year ELSE sb.year END AS songBYear,CASE WHEN albumB.bracket_album_id IS NOT NULL THEN albumB.album_cover_url ELSE sb.album_cover_url END AS songBAlbumCoverUrl,
              m.winner_entry_id AS winnerEntryId,m.random_tiebreaker_vote_entry_id AS randomTiebreakerVoteEntryId,m.admin_tiebreaker_entry_id AS adminTieBreakEntryId,reported.votes_a AS reportedVoteCountA,reported.votes_b AS reportedVoteCountB,
              sw.title AS winnerTitle,COALESCE(winningAlbum.title,sw.album) AS winnerAlbum,CASE WHEN winningAlbum.bracket_album_id IS NOT NULL THEN winningAlbum.album_cover_url ELSE sw.album_cover_url END AS winnerAlbumCoverUrl,
              CASE WHEN winningAlbum.bracket_album_id IS NOT NULL THEN winningAlbum.year ELSE sw.year END AS winnerYear
       FROM bracket_rounds r
       JOIN brackets historyBracket ON historyBracket.bracket_id=r.bracket_id
       LEFT JOIN bracket_weeks w
         ON w.bracket_id = r.bracket_id AND w.round_id = r.round_id
       LEFT JOIN matchups m ON m.bracket_id = r.bracket_id AND m.week_id = w.week_id
       LEFT JOIN matchup_reported_totals reported ON reported.bracket_id=m.bracket_id AND reported.matchup_id=m.matchup_id
       LEFT JOIN matchups feeder_a ON feeder_a.bracket_id=m.bracket_id AND feeder_a.next_matchup_id=m.matchup_id AND feeder_a.next_slot='A'
       LEFT JOIN matchups feeder_b ON feeder_b.bracket_id=m.bracket_id AND feeder_b.next_matchup_id=m.matchup_id AND feeder_b.next_slot='B'
       LEFT JOIN bracket_songs a ON a.bracket_id = m.bracket_id
         AND a.bracket_song_id = CASE WHEN feeder_a.matchup_id IS NOT NULL AND feeder_a.winner_entry_id IS NULL THEN NULL ELSE m.song_a_entry_id END
       LEFT JOIN songs sa ON sa.song_id = a.song_id
       LEFT JOIN bracket_albums albumA ON albumA.bracket_id=a.bracket_id AND albumA.bracket_album_id=a.bracket_album_id
       LEFT JOIN bracket_songs b ON b.bracket_id = m.bracket_id
         AND b.bracket_song_id = CASE WHEN feeder_b.matchup_id IS NOT NULL AND feeder_b.winner_entry_id IS NULL THEN NULL ELSE m.song_b_entry_id END
       LEFT JOIN songs sb ON sb.song_id = b.song_id
       LEFT JOIN bracket_albums albumB ON albumB.bracket_id=b.bracket_id AND albumB.bracket_album_id=b.bracket_album_id
       LEFT JOIN bracket_songs winning_entry
         ON winning_entry.bracket_id = m.bracket_id AND winning_entry.bracket_song_id = m.winner_entry_id
       LEFT JOIN songs sw ON sw.song_id = winning_entry.song_id
       LEFT JOIN bracket_albums winningAlbum ON winningAlbum.bracket_id=winning_entry.bracket_id AND winningAlbum.bracket_album_id=winning_entry.bracket_album_id
       WHERE r.bracket_id = ?
       ORDER BY r.round_number, w.week_number, m.matchup_number`,
      [bracketId]
    );

    const [songRows] = await pool.execute(
      `SELECT s.title
       FROM bracket_songs bs
       JOIN songs s ON s.song_id = bs.song_id
       WHERE bs.bracket_id = ?
       ORDER BY bs.position, bs.bracket_song_id`,
      [bracketId]
    );

    const [[participantRows], [playlistRows], [sessionRows], [ballotRows]] = await Promise.all([
      pool.execute(
        `SELECT bm.user_id AS userId,u.display_name AS displayName,
                bm.finale_participant AS finaleParticipant,bm.non_finale_participant AS nonFinaleParticipant
         FROM bracket_members bm JOIN users u ON u.user_id=bm.user_id
         WHERE bm.bracket_id=? AND bm.invitation_status='accepted' ORDER BY u.display_name`, [bracketId]),
      pool.execute(
        `SELECT p.playlist_id AS playlistId,p.playlist_name AS playlistName,p.playlist_url AS playlistUrl,w.week_number AS weekNumber
         FROM bracket_playlists p LEFT JOIN bracket_weeks w ON w.bracket_id=p.bracket_id AND w.week_id=p.week_id
         WHERE p.bracket_id=? ORDER BY w.week_number,p.playlist_id`, [bracketId]),
      pool.execute('SELECT start_round_number AS startRoundNumber,status FROM bracket_finale_sessions WHERE bracket_id=?', [bracketId]),
      pool.execute('SELECT v.matchup_id AS matchupId,v.user_id AS userId,u.display_name AS displayName,v.selected_entry_id AS selectedEntryId FROM votes v JOIN users u ON u.user_id=v.user_id WHERE v.bracket_id=? AND v.submitted_at IS NOT NULL ORDER BY u.display_name,u.user_id', [bracketId])
    ]);
    const ballotsByMatchup = new Map();
    for (const ballot of ballotRows) {
      const matchupBallots = ballotsByMatchup.get(Number(ballot.matchupId)) ?? [];
      matchupBallots.push({ userId: Number(ballot.userId), displayName: ballot.displayName, selectedEntryId: Number(ballot.selectedEntryId) });
      ballotsByMatchup.set(Number(ballot.matchupId), matchupBallots);
    }

    const roundsById = new Map();
    for (const row of roundRows) {
      if (!roundsById.has(row.roundId)) {
        roundsById.set(row.roundId, {
          roundId: row.roundId,
          roundNumber: row.roundNumber,
          name: row.roundName,
          matchups: []
        });
      }
      if (row.matchupId !== null) {
        roundsById.get(row.roundId).matchups.push({
          matchupId: row.matchupId,
          nextMatchupId: row.nextMatchupId == null ? null : Number(row.nextMatchupId),
          weekNumber: row.weekNumber,
          matchupNumber: row.matchupNumber,
          songA: row.songAEntryId === null ? null : {
            entryId: row.songAEntryId,
            title: row.songATitle,
            album: row.songAAlbum,
            albumCoverUrl: row.songAAlbumCoverUrl,
            year: row.songAYear,
            region: row.songARegion,
            seed: row.songASeed
          },
          songB: row.songBEntryId === null ? null : {
            entryId: row.songBEntryId,
            title: row.songBTitle,
            album: row.songBAlbum,
            albumCoverUrl: row.songBAlbumCoverUrl,
            year: row.songBYear,
            region: row.songBRegion,
            seed: row.songBSeed
          },
          winnerEntryId: row.winnerEntryId,
          reportedVoteCountA:row.reportedVoteCountA==null?null:Number(row.reportedVoteCountA),
          reportedVoteCountB:row.reportedVoteCountB==null?null:Number(row.reportedVoteCountB),
          randomTiebreakerVoteEntryId: row.winnerEntryId != null && row.randomTiebreakerVoteEntryId != null ? Number(row.randomTiebreakerVoteEntryId) : null,
          ballots: [...(ballotsByMatchup.get(Number(row.matchupId)) ?? []), ...(row.winnerEntryId != null && row.randomTiebreakerVoteEntryId != null ? [{ userId: null, displayName: row.adminTieBreakEntryId != null ? 'Admin tiebreaker' : 'Tiebreaker vote', selectedEntryId: Number(row.randomTiebreakerVoteEntryId) }] : [])],
          winner: row.winnerTitle === null ? null : {
            title: row.winnerTitle,
            album: row.winnerAlbum,
            albumCoverUrl: row.winnerAlbumCoverUrl,
            year: row.winnerYear
          }
        });
      }
    }

    const rounds = [...roundsById.values()].sort((a, b) => a.roundNumber - b.roundNumber);
    const canViewBallots=!bracketRows[0].anonymous || !!bracketAccess?.canManage;
    for(const round of rounds) round.matchups=round.matchups.map(match=>applyBallotPrivacy(match,!!bracketRows[0].anonymous,!!bracketAccess?.canManage,authenticatedUser.userId));
    const championship = rounds.at(-1)?.matchups[0];
    send(200, {
      bracket: bracketRows[0],
      canViewBallots,
      canManage:!!bracketAccess?.canManage, isCommissioner:!!Number(bracketAccess?.isCommissioner), ballotEditingRound:!!bracketAccess?.canManage ? await getBallotEditingRound(pool,bracketId) : null,
      songs: songRows.map(row => row.title),
      champion: championship?.winner ?? null,
      playlists: playlistRows,
      participants: participantRows,
      finaleSession: sessionRows[0] ?? null,
      rounds
    });
  } catch (error) {
    console.error('Bracket request failed:', error.message);
    send(500, { error: 'Could not load bracket data from MySQL. Check the server log and database setup.' });
  }
});


  return {
    server,
    startProgression() {
      if (closedWeekTimer) return;
      void runProgressionTick();
      closedWeekTimer = setInterval(() => { void runProgressionTick(); }, 15_000);
    },
    async close() {
      if (closedWeekTimer) clearInterval(closedWeekTimer);
      closedWeekTimer = undefined;
      await new Promise((resolve, reject) => server.close(error => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }));
      if (closedWeekFinalization) await closedWeekFinalization;
      if (notificationRun) await notificationRun;
    }
  };
}
