# Song Showdown

A family song tournament application built with Angular, a Node API, and MySQL. Database-backed brackets support participant voting, administration, tournament progression, Finale Mode, and recorded history. The default home page welcomes members to The Song Showdown.

## Implemented capabilities

The following table describes code paths present in the project. It does not establish that every flow works correctly at runtime; verification depends on the database schema, configuration, and tests performed.

| Area | Implemented behavior | Main source |
| --- | --- | --- |
| Authentication | Database sessions, login/logout, scrypt password hashes, single-use setup/recovery tokens, session revocation, and abuse controls | `server/api-server.mjs`, `server/passwords.mjs`, `server/password-reset.mjs`, `server/auth-abuse.mjs` |
| Voting | Angular submits and updates participant votes through a transactional MySQL endpoint | `src/app/brackets/feature/active-bracket-page.component.ts`, `src/app/brackets/data-access/active-bracket-api.service.ts`, `server/api-server.mjs` |
| Bracket administration | Creation, drafts, duplication, participant assignment, songs, albums, schedules, and playlists | `src/app/brackets/feature/`, `server/bracket-drafts.mjs`, `server/duplicate-bracket.mjs`, `server/session-management.mjs` |
| Tournament rules | Seeding, randomization, tie resolution, winner advancement, and finale workflows | `server/bracket-seeding.mjs`, `server/round-randomization.mjs`, `server/tiebreaker.mjs`, `server/admin-ballots.mjs`, `server/session-progression.mjs` |
| Operational behavior | Pause/resume, timed and untimed sessions, manual week advancement, and periodic server progression | `server/bracket-pause.mjs`, `server/session-progression.mjs`, `server/api-server.mjs` |
| Privacy and authorization | Anonymous-ballot filtering, users' own saved votes, unrevealed-song projection, and family/participant access checks | `server/ballot-privacy.mjs`, `server/member-bracket-view.mjs`, `server/bracket-access.mjs` |

## Database-backed pages and remaining demo behavior

- `/brackets/:bracketId` loads a database-backed bracket, submits votes to the API, and polls for updates. Saved votes are separate from unsaved local edits.
- `/history` and `/history/:bracketId` display database records; `/manage/*` provides administration.
- `/home`, the default route after a normal login, displays the welcome page. The old `/brackets` home address redirects to `/home`. Signing in from a bracket invitation preserves the requested bracket URL.
- `AppComponent.copyInvite()` copies a link containing the fixed sample code `FLEETWOOD-2025`. There is no implemented invitation/join flow behind this control. This sample link is separate from the single-use password setup/recovery links.

Manual Radiohead testing has covered the main participant, voting, advancement, anonymous-voting, administration, finale, and completion flows. This is limited test evidence, not a blanket runtime guarantee. Simultaneous participant submission was not verified in that manual test. Automated tests cover individual rules and regression cases; the optional MySQL security integration test has a narrower family-authorization and token-lifecycle scope.

## Angular page layout

- `src/app/app.component.ts` and `app.component.html` hold the shared navigation and page shell.
- `src/app/home/feature/` holds the welcome page.
- `src/app/brackets/feature/` holds database-backed bracket voting and bracket management; `brackets/data-access/` holds their API services and models.
- `src/app/history/feature/` holds the bracket history page; `history/data-access/` holds its API service and bracket models.
- `src/app/family-members/feature/` holds family member management; `family-members/data-access/` holds its API service and models.
- `src/app/songs/feature/` holds song catalog management; `songs/data-access/` holds its API service and models.
- `src/app/brackets/state/` holds settings validation, song/seed editing rules, participant drafts, and voting drafts/request versions. These modules do not depend on Angular rendering or dialogs.
- `src/app/brackets/feature/session-schedule.ts` owns schedule calculations, date-input conversion, duration conversion, and session payload construction.
- Page components coordinate API calls, navigation, and dialogs. Each page has a separate `.component.css`; the active and History pages share bracket connector styles in `brackets/ui/bracket-connectors.css`.
- `server/bracket-editor-state.test.mjs` tests the extracted frontend rules in Node; `server/active-bracket-load.test.mjs` exercises component request ordering and saved-vote/draft behavior with deferred requests.
- `src/app/shared/data-access/api-client.ts` owns frontend fetch requests, error normalization, timeouts, cancellation, and session-expiry notifications.
- `src/main.ts` only bootstraps the Angular application.

## Run locally

Install a supported Node.js version (22.22.3 or later in the 22.x line, or 24.15.0 or later in the 24.x line), then run:

```sh
npm install
npm start
```

Open the local URL printed by Angular CLI. Run `npm run build` to create a production build in `dist/song-showdown`.

Log in with the email stored on your family account as the username. If the account has no password yet, choose “First time? Request a password link” and follow the emailed link; passwords must be at least 12 characters. Email and a new password alone cannot claim an account. Passwords are stored as scrypt hashes. A successful login creates a 14-day HttpOnly session cookie; use **Log out** to revoke it. For existing databases, run `database/migrate_auth_sessions.sql` once before starting the API.

## Connect the application to MAMP MySQL

1. Copy `.env.example` to `.env` and enter the MySQL password used by your Workbench `mydb` connection. The defaults use MAMP's MySQL port `8889` and database `music_bracket`. A new database uses `database/schema.sql`; an existing database needs the migrations appropriate to its current schema. Seed scripts contain optional sample/history data and are separate from schema setup.
2. Start MySQL in MAMP.
3. In one Terminal tab, run `npm run start:api`.
4. In another Terminal tab, run `npm start` and open the Angular URL.

To add the completed Cake bracket to the database, run `database/seed_cake_bracket_history.sql` in MySQL Workbench. It adds the 16-song bracket and its 15 recorded matchups to the Morgan family history.

For existing databases, run `database/migrate_bracket_finale.sql` once before using Finale Mode. Open a bracket in History and choose “Run finale mode” to select the starting round and participants. Earlier rounds stay recorded; votes and winners from the selected round onward are cleared. Matchups unlock round by round, and the admin records each participant's choice. The ballot editor defaults to the bracket's configured tiebreaker, and the admin can select a different method when needed. A tied vote without a usable tiebreaker remains unresolved. Finale Mode can be paused and resumed without clearing progress; `database/migrate_bracket_finale_pause.sql` adds that support to databases that already have the initial Finale Mode migration.

Run `database/migrate_bracket_member_finale_flag.sql` once to add `bracket_members.finale_participant`. Run `database/migrate_bracket_member_non_finale_flag.sql` once to add `bracket_members.non_finale_participant`, which controls eligibility in the earlier rounds. These flags are independent; changing them leaves general bracket membership intact.

The browser calls the local Node API; the API reads MySQL. Database credentials stay in the ignored `.env` file and are never sent to Angular. The History page reports database values as stored, including missing winners or vote totals.

## API endpoints

- `GET /api/health` checks that MySQL is reachable.
- `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/setup-password`, and `POST /api/auth/logout` manage login sessions. Password setup requires an expiring, single-use email token in `{token,password}` and does not automatically sign in. `/setup-password` and `/reset-password` both consume the same verified token flow.
- `GET /api/my/brackets` returns the signed-in participant's active and upcoming bracket links.
- `GET /api/brackets/:bracketId/voting` returns the participant bracket view, including session state, saved selections, and privacy-filtered matchups.
- `GET /api/brackets` lists brackets for the signed-in user's family; an optional `familyId` must match that family.
- `/api/admin/brackets` and its subroutes provide bracket creation/editing, drafts, duplication, participants, songs, albums, schedules, playlists, pause/resume, manual advancement, and ballot correction.
- `GET /api/brackets/:bracketId` returns bracket metadata, songs, playlists, rounds, matchups, and the recorded champion.
- `GET /api/brackets/:bracketId/finale-options`, `POST /api/brackets/:bracketId/finale`, `POST /api/brackets/:bracketId/finale/participants`, and `POST /api/brackets/:bracketId/finale/votes` support Finale Mode. The API derives the user from the login session, enforces family and participant access before bracket reads, and requires a super user in the same family or an accepted bracket commissioner for finale modifications. Client-supplied admin IDs do not grant access. Ballot submissions advance a winner after every selected participant has voted.
- `bracket_members` links general participants to individual brackets, so participation can differ from one bracket to another. The `non_finale_participant` and `finale_participant` flags control eligibility in earlier rounds and the finale independently. The database ensures each user belongs to that bracket's family.
- `GET /api/family-members?familyId=1`, `POST /api/family-members`, `PUT /api/family-members/:userId`, and `DELETE /api/family-members/:userId?familyId=1` manage users assigned to the authenticated super user's family; any requested family ID must match that family. A user's family and family role are stored directly on `users`; removing a member unlinks them and their bracket participation while retaining their account and votes.
- `GET /api/songs`, `POST /api/songs`, `PUT /api/songs/:songId`, and `DELETE /api/songs/:songId` manage the shared song catalog. MySQL prevents deleting a song already linked to a bracket.
- `GET /api/playlist-options` returns brackets and weeks available for playlist assignment. `GET /api/playlists`, `POST /api/playlists`, `PUT /api/playlists/:playlistId`, and `DELETE /api/playlists/:playlistId` manage bracket and week playlist links.
- `POST /api/matchups/:matchupId/votes` submits or updates one user's vote while the bracket is active and its week is open. The JSON body is `{ "userId": 1, "selectedEntryId": 42, "comment": "Optional note" }`. The selected entry must be one of the matchup's two songs, and the user must be a participant in that specific bracket. Re-submitting replaces that user's vote for the matchup.

For an existing database, run `database/migrate_bracket_members.sql` once to add bracket-specific participation, then run `database/migrate_single_family.sql` once to move family assignment and role onto `users` and remove `family_members`. The latter assumes each existing user belongs to at most one family.

Run `database/migrate_vote_bracket_id.sql` once on an existing database to add `votes.bracket_id`, backfill it from each matchup, and enforce that the vote and matchup belong to the same bracket. New API votes and Led Zeppelin vote seed scripts write the bracket ID directly.

If your database already has `users.member_role`, run `database/migrate_user_role.sql` once to rename it to `users.role` without changing its values. This is a historical migration prerequisite; the subsequent role migration below renames `role` to `user_role`. Fresh databases already use `user_role`.

If your database has the old `songs.songwriter` column, run `database/migrate_song_category.sql` once to rename it to `category` while preserving its values. New databases use `category` directly; run `database/add_song_metadata.sql` only when upgrading a database that does not yet have song metadata.

Run `database/migrate_song_platform_links.sql` once on an existing database to add optional shared YouTube and Spotify URLs to catalog songs. Manage those links from the Songs page; they are reused whenever a catalog song appears in a bracket.

Run `database/seed_beatles_youtube_links.sql` after that migration to add verified official Beatles YouTube links to existing Beatles catalog rows. It preserves any YouTube links already present and does not change Spotify links. The two “Abbey Road Medley” entries are left blank because no exact-title official-channel tracks were found.

Run `database/migrate_bracket_playlists.sql` once on an existing database to add `bracket_playlists`. Manage playlist names and Spotify URLs from the Playlists page in the Manage menu. Choose “Entire bracket” for a bracket-wide playlist or a week for a weekly playlist. The bracket history detail page displays the playlist links; it does not embed Spotify.

The voting endpoint requires an authenticated session cookie, an active bracket, an open voting session, and eligible participant membership. The JSON `userId` must match the signed-in user; it does not choose whose identity to use. Completed brackets do not accept participant votes.

The API binds to `127.0.0.1` for local development. Authentication, persistence, advancement, and privacy code are implemented locally; public hosting and its operational configuration remain separate work. Email delivery is configurable but requires an actual sending service. The home page displays a welcome message; voting takes place on database-backed bracket pages.

Run automated rule, input-validation, security, and regression tests with `npm run test:api`. The optional MySQL security test is skipped unless explicitly enabled as described below. Passing these tests does not establish that every browser or deployment workflow has been verified.

## Password recovery

Run `database/migrate_password_reset.sql` once for an existing database, then restart the API. Choose **Forgot password?** on the login screen and enter the account email. In local development, copy the reset link from the API terminal. Links expire after 30 minutes, can only be used once, and are stored as hashes. Requests are limited to one per account per minute. Resetting a password revokes all existing sessions; sign in again afterward.

For production email delivery through Resend, verify your sending domain and set `RESEND_API_KEY`, `EMAIL_FROM` (for example `Song Showdown <noreply@mail.thesongshowdown.com>`), and `APP_URL=https://thesongshowdown.com` on the server. Use a sending-only API key restricted to your domain. Both first-time password setup and password recovery use this delivery path; the account must already belong to a family. Resend takes precedence when its key is configured and requires `EMAIL_FROM`. Keep credentials out of source control and disable email click tracking for reset links.

The existing webhook adapter remains supported when no Resend key is configured: set `PASSWORD_RESET_EMAIL_WEBHOOK` to an endpoint that sends email from JSON fields `to`, `subject`, and `text`; `PASSWORD_RESET_EMAIL_SECRET` supplies an optional Bearer credential. Production requires a configured provider and an HTTPS `APP_URL`, and never logs reset links. Unknown emails receive the same confirmation as existing accounts. Provider failures are logged generically without secrets; check the provider dashboard for delivery status. After deployment, test both setup and recovery with existing family accounts, verify receipt and the public link domain, and confirm the link cannot be reused.

## Account setup and bracket access

Initial passwords and password recovery both require a 30-minute, single-use email token, stored only as a hash. Run `database/migrate_password_reset.sql` on existing databases if not already applied. Configure email delivery as described above; without it, local development prints links only to the operator’s terminal. Existing initialized accounts continue to use normal login.

Create the first owner through the operator-only CLI with database access, after creating the family:

```sh
node --env-file-if-exists=.env scripts/bootstrap-owner.mjs FAMILY_ID owner@example.com "Owner name"
```

The command refuses to replace an owner or reuse an existing email. It creates an uninitialized owner and prints a private setup link for the operator to deliver to the intended owner. There is no public owner registration endpoint. Do not run it for a family that already has an owner; use verified email recovery instead.

All bracket ID routes (including history, voting, finale options, finale writes, and admin subroutes) pass through shared authorization. Owners are limited to their own family; members must belong to the same family and participate in the bracket. Matchup voting resolves its bracket before applying the same check. Missing or inaccessible brackets return 404 without returning bracket details.

Run security unit regressions with `npm run test:api`. To run the MySQL security integration check:

```sh
SECURITY_DB_TESTS=1 node --env-file-if-exists=.env --test server/security.integration.test.mjs
```

This check creates two test families inside a transaction, uses connection-local token storage, and rolls back all test records. It checks family isolation, initial password setup, token expiry, and token replay.

## Authentication abuse controls

Authentication JSON bodies are limited to 8 KB; usernames to 254 characters; passwords to 1,024 UTF-8 bytes (at least 12 characters for setup/recovery); and reset tokens to exactly 43 URL-safe characters. Login accepts existing passwords of at least one character within the byte limit.

Limits apply to attempts, including successful ones:

| Scope | Limit |
| --- | --- |
| All authentication routes per socket client address | 120 per minute |
| Login per client address | 30 per 15 minutes |
| Login per normalized account email, across clients | 10 per 15 minutes |
| Reset-link requests per client address | 10 per 15 minutes |
| Reset-link requests per normalized email | 5 per 15 minutes, plus the database's one-minute cooldown |
| Password setup/reset completion per client address, shared across both routes | 20 per 15 minutes |
| Password setup/reset completion per token, shared across both routes | 5 per 15 minutes |

Throttled requests return HTTP 429 with `Retry-After`. Limiter storage is capped at 10,000 entries and fails closed with HTTP 503 if full. All password hashing and verification share two concurrent work slots, with HTTP 503 and `Retry-After` rather than an unbounded job queue when busy. Reset completion locks and validates a live, unused token before hashing; any hashing failure rolls back without consuming the token.

These controls are process-local and reset when the API restarts. Multiple API instances need a shared limiter or equivalent enforcement at the gateway. Client identity uses the socket address; untrusted `X-Forwarded-For` headers are ignored. With a reverse proxy, clients share that proxy's address unless a trusted-proxy configuration and gateway limits are supplied.

## Frontend API requests

All frontend API calls use the shared `apiRequest` client. Requests include session cookies, use JSON headers, and have a 15-second default timeout covering response-body reading as well as fetching. The client accepts a caller's `AbortSignal`; route/detail/dialog reads cancel on replacement or teardown. Session changes cancel protected work across features.

`ApiError` distinguishes HTTP errors, unavailable connections, timeouts, cancellations, and invalid server responses. HTTP status, `Retry-After`, and error details such as `requiresReset` remain available to workflows. Cancelled reads are not displayed as failures. The client does not automatically retry writes; aborting a browser request does not undo a change already committed by the server.

A protected HTTP 401 expires the current frontend session once, clears the signed-in shell and sidebar, stops its polling, and prompts for login while preserving the requested route. A normal signed-out session check does not trigger an expiry alert. Bad credentials on the public login endpoint and HTTP 403 permission failures do not expire a session. Old requests cannot expire a newer login.

## Bracket rendering profile

Run `npm run profile:bracket` for the reproducible source-execution baseline. See [the baseline report](docs/bracket-rendering-profile.md) for measured getter/geometry-read counts, illustrative Node timings, and the browser trace still needed before optimizing. This harness uses synthetic DOM geometry and does not measure actual browser layout, paint, or frame rate.

## HTTP and disposable MySQL integration tests

```sh
npm run test:integration
```

This opt-in suite starts the same API handler used locally, on an automatically assigned loopback port, against a randomly named `song_showdown_test_*` database. It creates the schema directly from `database/schema.sql`, including its triggers. The background progression timer is not started; the normal HTTP request paths still run progression where applicable.

Connection settings use `.env`'s `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD`, with optional `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, and `TEST_DB_PASSWORD` overrides. The test account must be permitted to create and drop test databases and create triggers. The suite intentionally ignores `DB_NAME`: it never applies test fixtures to the application database or drops a caller-specified database. It drops only the schema it successfully created, on ordinary completion or test failure. If the process is forcibly terminated, the generated test database may remain.

The suite exercises:

- Real HTTP login/session cookies, logout, email-only setup rejection, reset-token expiry and single use.
- Two-family isolation for bracket history, voting, finale options, finale writes, and management access.
- Vote submission, refreshed saved selections, replacement of an existing vote, identity checks, and anonymous-ballot filtering.
- Actual MySQL foreign keys, winner constraints and vote-validation triggers.
- Transaction rollback when a test-only trigger rejects the second ballot after the first write has succeeded.
- Simultaneous participant votes, parallel progression requests, and competing manual week advancements. A test-only database audit checks that each first-round winner is written exactly once.

These are API/database tests, not browser end-to-end tests. They do not establish that every UI workflow or arbitrary concurrent workload is correct. The separate optional `SECURITY_DB_TESTS` suite remains available. `npm run test:api` runs the unit/regression suite and skips both opt-in MySQL suites unless explicitly enabled.

`server/index.mjs` now owns production pool configuration, listening and process shutdown. `server/api-server.mjs` exports `createApiServer` without opening a pool, listener or timer on import, allowing the integration suite to inject its disposable pool. The route handler still contains substantial SQL/domain orchestration; this test seam is not a complete backend module split. The schema loader is test-only and does not replace a versioned migration runner for existing databases.

## Bracket invitations

Before deploying invitation support to an existing database, run `database/migrate_bracket_invitations.sql` once **in the application schema** (both local and Railway `music_bracket`). Back up the production database first. Do not rerun `schema.sql` on existing data. The migration preserves existing memberships as accepted; all new memberships created by the application start pending. Fresh databases include the columns in `schema.sql`.

Publishing a bracket or adding participants to a published bracket sends each newly selected participant an email using the configured Resend sender (or legacy webhook). Saving drafts does not send email. Invitations include only title, theme, start date/time labeled America/Chicago, and the `/brackets/:id` link under `APP_URL`. The form stores newly entered start times as an absolute instant; the invitation page displays them in the recipient's local time.

Recipients sign in with their existing family account, or request a first-time password link, then Accept or Decline on the bracket page. The invitation is tied to the authenticated user, not a forwarded email link. Before acceptance, the API withholds songs, playlists, matchup schedules, results, and bracket history. Pending/declined participants cannot vote or count toward untimed all-voted progression or finale ballots. Owners retain administrative visibility. Responses are final; an admin can remove and re-add a participant to issue a new pending invitation.

Edit Bracket shows response and email-delivery states. Manage Participants saves removals immediately (including removing everyone), revokes access, and preserves recorded votes/results. Re-adding a removed participant requires acceptance again. Rebuilding a bracket preserves existing participants' responses. Failed or unsent emails can be retried with **Send unsent / retry failed invitations**; successful emails are not resent by ordinary edits. Failures have a one-minute retry cooldown; interrupted sending attempts can be retried after a ten-minute lease. Delivery is attempted after committing bracket changes, so a delivery failure does not undo a saved bracket. A provider success followed by a process crash before recording success can result in a duplicate invitation on retry, but never grants access without acceptance.

Test with a small published bracket and member account: verify email content, pending/declined privacy (including direct History/API URLs), acceptance, voting, removal, and re-invitation. Existing participants are grandfathered and will not receive retroactive invitations. `npm run test:integration` covers these access rules with a disposable database and a fake mail sender; no real invitation email is sent by that suite.

### User and bracket roles

Existing installations must run `database/migrate_user_and_bracket_roles.sql` once, after the invitation migration. Back up MySQL, stop the old API, run this migration against `music_bracket`, then start/deploy the updated API. This renames `users.role` to `users.user_role`, converts `owner` to `super` and `member` to `viewer`, and adds `bracket_members.bracket_role`. Fresh installs use the updated schema directly and must not run the migration.

`super` retains family administration; `viewer` has no global management rights. Super users assign Member or Commissioner from Edit bracket → Participants. A commissioner must accept their invitation before gaining editing rights for that bracket. Members can vote and see permitted bracket content, but cannot edit bracket settings. Only super users can assign roles, change accounts, or create/duplicate/delete brackets. Bracket roles belong to `bracket_members`, since each participant can have a different role in each bracket. Existing super-user memberships migrate to commissioner; all other memberships default to member.
