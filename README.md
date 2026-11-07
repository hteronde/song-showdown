# Song Showdown

A responsive Angular family song bracket. The History page loads brackets, songs, rounds, matchups, and recorded winners from the MySQL database through a small Node API. The Fleetwood Mac voting screen remains a local prototype.

## Angular page layout

- `src/app/app.component.ts` and `app.component.html` hold the shared navigation and page shell.
- `src/app/home/feature/` holds the Fleetwood Mac voting page; `home/data-access/` holds its demo models.
- `src/app/history/feature/` holds the bracket history page; `history/data-access/` holds its API service and bracket models.
- `src/app/family-members/feature/` holds family member management; `family-members/data-access/` holds its API service and models.
- `src/app/songs/feature/` holds song catalog management; `songs/data-access/` holds its API service and models.
- `src/main.ts` only bootstraps the Angular application.

## Run locally

Install a supported Node.js version (22.22.3 or later in the 22.x line, or 24.15.0 or later in the 24.x line), then run:

```sh
npm install
npm start
```

Open the local URL printed by Angular CLI. Run `npm run build` to create a production build in `dist/song-showdown`.

Log in with the email stored on your family account as the username. If the account has no password yet, choose “First time? Request a password link” and follow the emailed link; passwords must be at least 12 characters. Email and a new password alone cannot claim an account. Passwords are stored as scrypt hashes. A successful login creates a 14-day HttpOnly session cookie; use **Log out** to revoke it. For existing databases, run `database/migrate_auth_sessions.sql` once before starting the API.

## Connect the Beatles history to MAMP MySQL

1. Copy `.env.example` to `.env` and enter the MySQL password used by your Workbench `mydb` connection. The defaults use MAMP's MySQL port `8889` and database `music_bracket`.
2. Start MySQL in MAMP.
3. In one Terminal tab, run `npm run start:api`.
4. In another Terminal tab, run `npm start` and open the Angular URL.

To add the completed Cake bracket to the database, run `database/seed_cake_bracket_history.sql` in MySQL Workbench. It adds the 16-song bracket and its 15 recorded matchups to the Morgan family history.

For existing databases, run `database/migrate_bracket_finale.sql` once before using Finale Mode. Open a bracket in History and choose “Run finale mode” to select the starting round and participants. Earlier rounds stay recorded; votes and winners from the selected round onward are cleared. Matchups unlock round by round, and the admin records each participant's choice. A tied vote needs an explicit tie-break selection before a winner advances. Finale Mode can be paused and resumed without clearing progress; `database/migrate_bracket_finale_pause.sql` adds that support to databases that already have the initial Finale Mode migration.

Run `database/migrate_bracket_member_finale_flag.sql` once to add `bracket_members.finale_participant`. Run `database/migrate_bracket_member_non_finale_flag.sql` once to add `bracket_members.non_finale_participant`, which controls eligibility in the earlier rounds. These flags are independent; changing them leaves general bracket membership intact.

The browser calls the local Node API; the API reads MySQL. Database credentials stay in the ignored `.env` file and are never sent to Angular. The History page reports database values as stored, including missing winners or vote totals.

## API endpoints

- `GET /api/health` checks that MySQL is reachable.
- `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/setup-password`, and `POST /api/auth/logout` manage login sessions. Password setup requires an expiring, single-use email token in `{token,password}` and does not automatically sign in. `/setup-password` and `/reset-password` both consume the same verified token flow.
- `GET /api/brackets?familyId=1` returns the Morgan family's history entries.
- `GET /api/brackets/:bracketId` returns bracket metadata, songs, playlists, rounds, matchups, and the recorded champion.
- `GET /api/brackets/:bracketId/finale-options`, `POST /api/brackets/:bracketId/finale`, `POST /api/brackets/:bracketId/finale/participants`, and `POST /api/brackets/:bracketId/finale/votes` support Finale Mode. The API derives the user from the login session, enforces family and participant access before bracket reads, and requires an owner in the same family for finale modifications. Client-supplied admin IDs do not grant access. Ballot submissions advance a winner after every selected participant has voted.
- `bracket_members` links general participants to individual brackets, so participation can differ from one bracket to another. The `non_finale_participant` and `finale_participant` flags control eligibility in earlier rounds and the finale independently. The database ensures each user belongs to that bracket's family.
- `GET /api/family-members?familyId=1`, `POST /api/family-members`, `PUT /api/family-members/:userId`, and `DELETE /api/family-members/:userId?familyId=1` manage users assigned to the Morgan family. A user's family and family role are stored directly on `users`; removing a member unlinks them and their bracket participation while retaining their account and votes.
- `GET /api/songs`, `POST /api/songs`, `PUT /api/songs/:songId`, and `DELETE /api/songs/:songId` manage the shared song catalog. MySQL prevents deleting a song already linked to a bracket.
- `GET /api/playlist-options` returns brackets and weeks available for playlist assignment. `GET /api/playlists`, `POST /api/playlists`, `PUT /api/playlists/:playlistId`, and `DELETE /api/playlists/:playlistId` manage bracket and week playlist links.
- `POST /api/matchups/:matchupId/votes` submits or updates one user's vote while the bracket is active and its week is open. The JSON body is `{ "userId": 1, "selectedEntryId": 42, "comment": "Optional note" }`. The selected entry must be one of the matchup's two songs, and the user must be a participant in that specific bracket. Re-submitting replaces that user's vote for the matchup.

For an existing database, run `database/migrate_bracket_members.sql` once to add bracket-specific participation, then run `database/migrate_single_family.sql` once to move family assignment and role onto `users` and remove `family_members`. The latter assumes each existing user belongs to at most one family.

Run `database/migrate_vote_bracket_id.sql` once on an existing database to add `votes.bracket_id`, backfill it from each matchup, and enforce that the vote and matchup belong to the same bracket. New API votes and Led Zeppelin vote seed scripts write the bracket ID directly.

If your database already has `users.member_role`, run `database/migrate_user_role.sql` once to rename it to `users.role` without changing its values. Fresh databases and the `migrate_single_family.sql` migration use `role` directly.

If your database has the old `songs.songwriter` column, run `database/migrate_song_category.sql` once to rename it to `category` while preserving its values. New databases use `category` directly; run `database/add_song_metadata.sql` only when upgrading a database that does not yet have song metadata.

Run `database/migrate_song_platform_links.sql` once on an existing database to add optional shared YouTube and Spotify URLs to catalog songs. Manage those links from the Songs page; they are reused whenever a catalog song appears in a bracket.

Run `database/seed_beatles_youtube_links.sql` after that migration to add verified official Beatles YouTube links to existing Beatles catalog rows. It preserves any YouTube links already present and does not change Spotify links. The two “Abbey Road Medley” entries are left blank because no exact-title official-channel tracks were found.

Run `database/migrate_bracket_playlists.sql` once on an existing database to add `bracket_playlists`. Manage playlist names and Spotify URLs from the Playlists page in the Manage menu. Choose “Entire bracket” for a bracket-wide playlist or a week for a weekly playlist. The bracket history detail page displays the playlist links; it does not embed Spotify.

Votes can be exercised with `curl` after configuring an active bracket, open week, bracket participation, and IDs in MySQL:

```sh
curl -X POST http://127.0.0.1:3000/api/matchups/1/votes \
  -H 'Content-Type: application/json' \
  -d '{"userId":1,"selectedEntryId":42,"comment":"Great chorus"}'
```

The local API requires a valid login session for bracket, vote, and management endpoints. It binds to loopback for local development; a public deployment still needs HTTPS, rate limiting, account recovery, and additional authorization rules. The Angular voting screen still saves its demo votes in local storage and does not call the database vote endpoint. The seeded Beatles bracket is completed history, so it cannot accept votes.

Run the API input validation tests with `npm run test:api`.

## Current prototype boundaries

- Login and logout use database accounts; bracket voting remains a local demo.
- Votes are stored in this browser's local storage. Other family members and devices do not share data yet.
- The database vote endpoint is implemented, but the voting screen is not connected to it.
- Results use sample family votes to demonstrate the reveal screen. Voting closes and round advancement are not connected to a clock or server.
- The invite control copies a link with a sample bracket code; there is no join flow yet.

The Beatles and Cake history brackets read from MySQL. Voting and the active bracket still use demo data; shared authentication, persistent voting, and automated advancement remain future work.

## Password recovery

Run `database/migrate_password_reset.sql` once for an existing database, then restart the API. Choose **Forgot password?** on the login screen and enter the account email. In local development, copy the reset link from the API terminal. Links expire after 30 minutes, can only be used once, and are stored as hashes. Requests are limited to one per account per minute. Resetting a password revokes all existing sessions; sign in again afterward.

For email delivery, configure `APP_URL` and `PASSWORD_RESET_EMAIL_WEBHOOK` in `.env`. The webhook must send an email from the JSON fields `to`, `subject`, and `text`; `PASSWORD_RESET_EMAIL_SECRET` supplies an optional Bearer credential. Production requires the webhook and application URL and never logs reset links. Unknown emails receive the same confirmation as existing accounts.

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
