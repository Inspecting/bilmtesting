# PROJECT_REPORT

## 1. Project overview

### What the site does
Bilm (`watchbilm.org`) is a movie/TV discovery and playback web app with:
- movie and TV browsing/search
- watch pages with multiple embed providers and fallback logic
- account auth and synced user data
- optional account-link sharing between users
- chat between users

### Main features
- Static frontend (multi-page app) served by Node (`server.mjs`)
- Same-origin API proxying from main site to backend workers (`/api/data`, `/api/chat`, `/api/tmdb`, `/api/anilist`, `/api/vidsrc/latest`)
- Cloud backup/sync (snapshot + list/sector sync)
- Account linking and shared feed
- Media metadata/cache worker
- Chat worker with per-user membership enforcement
- Supabase mirror queue for backup telemetry/events

### Main APIs/services used
- Cloudflare Workers (data-api, storage-api, chat-api)
- Cloudflare D1 / KV / R2
- Firebase Auth (ID token verification)
- Supabase mirror (service-role write path)
- TMDB / TVMaze / OMDb / AniList

### Frontend/backend/deployment setup
- Frontend + proxy server: `C:\Users\reidm\bilm`
- Data worker: `C:\Users\reidm\data-api`
- Storage/media worker: `C:\Users\reidm\storage-api`
- Chat worker: `C:\Users\reidm\chat-api`

### Important warnings/assumptions
- `C:\Users\reidm\chat-api` is not a standalone git repo in this workspace; it is currently under the user-home git root.
- Firebase client config values are public client config (not secrets).
- I could not verify Cloudflare/Firebase/Supabase dashboard-side ACL/policies directly from code.
- Viewer policy note: do not apply `sandbox` to movie/TV player iframes in this project; several providers fail to initialize when sandboxed.

---

## 2. Full file and folder map (important files)

### Main site/proxy (`C:\Users\reidm\bilm`)
- `server.mjs`
  - Purpose: static server + API proxy + ops/admin routes + mirror queue
  - Used by: `npm start`
  - Depends on: env vars, Node http/fs, upstream data/chat APIs
  - Type: backend/proxy/config-critical
  - Risky logic: auth token handling, CORS, static file serving, proxy forwarding, health/ops endpoints
- `index.html`
  - Purpose: root shell redirect/loading gate
  - Type: frontend entry
- `home/`, `movies/`, `tv/`, `search/`, `settings/`, `random/`, `shared/`
  - Purpose: frontend pages and shared client modules
  - Type: frontend
- `shared/auth.js`
  - Purpose: auth/session orchestration, sync calls, local state migration
  - Type: frontend auth/data client
  - Risky logic: user data sync, cloud calls, localStorage data handling
- `shared/admin.js`
  - Purpose: admin-email config fetch helper from `/api/admin/config`
  - Type: frontend utility
  - Risky logic: reads ops token from runtime/meta/storage
- `shared/embed-sandbox.js`
  - Purpose: iframe attribute helper for viewer compatibility
  - Type: frontend security utility
  - Risky logic: controls iframe permissions and explicitly removes sandbox for provider compatibility
- `shared/iframe-loader.js`
  - Purpose: resilient iframe loading/retry logic
  - Type: frontend runtime utility
  - Risky logic: iframe src swapping + fallback attribute application
- `movies/watch/viewer.js`, `tv/watch/viewer.js`
  - Purpose: playback page runtime and provider fallback
  - Type: frontend runtime

### Data API (`C:\Users\reidm\data-api`)
- `src/index.js`
  - Purpose: user snapshot/list/sector sync, account-link system, reset, health, admin import, supabase mirror writes
  - Type: backend worker/API/auth/storage
  - Depends on: D1/KV/R2, Firebase token verification, optional Supabase
- `migrations/*.sql`
  - Purpose: D1 schema for snapshots/sync/account links
  - Type: database
- `wrangler.jsonc`
  - Purpose: deploy/routes/bindings
  - Type: deployment config
- `test/index.spec.js`
  - Purpose: worker behavior/security/regression tests
  - Type: tests
- `.dev.vars.example`
  - Purpose: local env template
  - Type: env template

### Storage API (`C:\Users\reidm\storage-api`)
- `src/index.js`
  - Purpose: media provider proxy/cache/rate-limit worker
  - Type: backend worker/API/cache
- `migrations/*.sql`
  - Purpose: media cache D1 schema
  - Type: database
- `wrangler.jsonc`
  - Purpose: deploy/routes/bindings
  - Type: deployment config
- `test/index.spec.js`
  - Purpose: media cache/rate-limit route tests
  - Type: tests

### Chat API (`C:\Users\reidm\chat-api`)
- `src/index.js`
  - Purpose: conversation/message CRUD, delete/hide, read status, account reset, cleanup cron
  - Type: backend worker/API/auth
- `migrations/*.sql`
  - Purpose: chat D1 schema
  - Type: database
- `wrangler.jsonc`
  - Purpose: deploy/routes/bindings
  - Type: deployment config
- `test/index.spec.js`
  - Purpose: chat auth/permission/rate-limit tests
  - Type: tests

---

## 3. API map

### Main proxy (`bilm/server.mjs`)

- `GET/HEAD static paths`
  - Does: serves frontend files
  - Validation: decode + path normalization + strict allowlist
  - Auth: none
  - Security fixed: blocked sensitive/internal files from direct public access

- `GET/POST/PUT/PATCH/DELETE/HEAD /api/data*`
  - Does: forwards to Data API
  - Inputs: passthrough headers/body/query
  - Auth: forwards `Authorization`
  - Rate-limit: `data` bucket
  - Error handling: 400/413/504/502 safe responses

- `GET/POST/DELETE /api/chat*`
  - Does: forwards to Chat API
  - Inputs: passthrough headers/body/query
  - Auth: forwards `Authorization`
  - Rate-limit: `chat` bucket
  - Error handling: 400/413/504/502 safe responses

- `GET /api/tmdb/*`, `POST /api/anilist`, `GET /api/vidsrc/latest`
  - Does: upstream media proxy endpoints
  - Rate-limit: provider-specific
  - Validation: path/query/body sanitization

- `POST /api/health/check` (ops)
- `GET /api/admin/config` (ops)
- `GET /api/admin/mirror-status` (ops)
  - Auth: `x-bilm-ops-token` or bearer ops token
  - Security fixed: constant-time token compare, removed queue file path from response

### Data API (`data-api/src/index.js`)

- `GET /health|/healthz`
  - Does: health payload (+ optional supabase probe)
  - Auth: none

- `GET /?userId=<uid>[&meta=true]`
  - Does: read snapshot/meta
  - Auth: Firebase bearer token; subject must match `userId`
  - Rate-limit: `snapshotRead`

- `POST /`
  - Does: save snapshot
  - Inputs: `userId` + snapshot payload
  - Auth: Firebase bearer + ownership check
  - Rate-limit: `snapshotWrite`
  - Validation: JSON parse, payload extraction, credential-field sanitization, size limits

- `POST /sync/lists/push`, `GET /sync/lists/pull`
- `POST /sync/sectors/push`, `GET /sync/sectors/pull`, `POST /sync/sectors/bootstrap`
  - Auth: Firebase bearer + ownership check
  - Rate-limit: sync read/write buckets
  - Validation: sector/list keys, op limits, timestamps, payload/object checks

- Account links
  - `GET /links`
  - `GET /links/target-capabilities`
  - `POST /links/request`
  - `POST /links/respond`
  - `POST /links/scopes`
  - `POST /links/unlink`
  - `POST /links/chat-ready`
  - `GET /links/shared-feed`
  - Auth: Firebase bearer + ownership checks
  - Rate-limit: account-link read/mutation buckets
  - Validation: email/user/scope validation + conflict checks

- Account reset
  - `POST /account/reset`
  - Auth: Firebase bearer + ownership checks

- Admin routes
  - `POST /?import=true`
  - `POST /?bulk=true`
  - `POST /sync/sectors/purge`
  - Auth: `x-admin-token`

### Storage API (`storage-api/src/index.js`)

- `GET /media/tmdb/*`
- `GET /media/tvmaze/*`
- `GET /media/omdb`
- `POST /media/anilist`
  - Auth: none (public media endpoints)
  - Rate-limit: public per-client GET/POST buckets
  - Validation: provider-specific input normalization + cache key/TTL controls
  - Safe failure: upstream timeout/invalid payload handled; no internal stack exposed

### Chat API (`chat-api/src/index.js`)

- `GET /health|/healthz`
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages`
- `POST /conversations/:id/messages/delete`
- `POST /conversations/:id/read`
- `DELETE /conversations/:id`
- `POST /account/reset`
- Prefix support: `/api/chat/*` maps to same handlers

Auth and safety:
- Firebase bearer required for all non-health routes
- membership assertion prevents non-participants from reading/modifying conversations
- rate-limit buckets: global_ip, health_ip, auth_user, list_user, mutation_user, send_user, send_burst

---

## 4. Data flow

### Create/read/update/delete user data
- Create/update:
  - Frontend writes via `window.bilmAuth` functions to `/api/data` proxy
  - Data API validates auth + ownership + payload, writes to D1/KV, optionally mirrors to Supabase
- Read:
  - Frontend requests snapshot/sync pull via `/api/data`
  - Data API returns only user-scoped records after token subject check
- Delete/reset:
  - `POST /account/reset` in data-api and chat-api remove user-scoped records and link state

### Storage locations
- Primary user sync/snapshot: Cloudflare D1 (and KV fallback in code paths)
- Media cache: Cloudflare D1 + R2 for large payload bodies
- Optional mirror/backup event stream: Supabase REST table
- Chat: Cloudflare D1

### Ownership verification
- Data API: token subject must match requested `userId`
- Chat API: authenticated email must be a conversation participant
- Account-link flows: requester/target role checks + status transitions validated server-side

### Public vs private data
- Public-ish: media cache endpoints (rate-limited)
- Private: user snapshots/sync/account links/chat/reset/admin endpoints
- Admin-only: import/purge/ops routes with server-side token checks

---

## 5. Auth and permissions

### Login/auth
- Firebase client auth in frontend (`shared/auth.js`)
- Backend workers verify Firebase ID token (`jose` JWKS verification)

### Session/token checks
- `Authorization: Bearer <idToken>` required for private endpoints
- Token subject/email claims validated per endpoint contract

### User identity verification
- Data API: `sub === normalized userId`
- Chat API: validated auth context + conversation membership checks

### Admin permissions
- Main server ops endpoints require `BILM_OPS_TOKEN`
- Data admin import/purge routes require `BILM_ADMIN_TOKEN`

### Files enforcing permissions
- `C:\Users\reidm\bilm\server.mjs`
- `C:\Users\reidm\data-api\src\index.js`
- `C:\Users\reidm\chat-api\src\index.js`

### Remaining auth risk
- If ops/admin tokens are weak/reused/leaked outside code, privileged endpoints are exposed.

---

## 6. Environment variables and secrets

### Main site/proxy (`bilm`)
- `PORT` (private, required in deploy runtime)
- `BILM_OPS_TOKEN` (private, required for ops/admin routes)
- `BILM_ADMIN_EMAILS` (private-ish config)
- `CHAT_API_BASE` / `DATA_API_BASE` (private config)
- `CHAT_PROXY_ALLOW_AUTH_BYPASS` (private, should remain `false` in production)
- `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MIRROR_*` (private)
- `TMDB_API_KEY` (private)

### Data API
- `FIREBASE_PROJECT_ID` (public-ish config)
- `BILM_DISABLE_AUTH` (private deploy toggle)
- `BILM_AUTH_BYPASS_TOKEN` (private; now required if bypass is enabled)
- `BILM_ADMIN_TOKEN` (private)
- `SUPABASE_PROJECT_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_MIRROR_*` (private)
- `ACCOUNT_LINK_RATE_LIMIT_*`, `BILM_PRIVATE_RATE_LIMIT_*` (private optional tuning)

### Storage API
- `FIREBASE_PROJECT_ID`
- `BILM_DISABLE_AUTH`
- `BILM_AUTH_BYPASS_TOKEN`
- `TMDB_API_KEY`, `TMDB_READ_ACCESS_TOKEN`, `OMDB_API_KEY`
- `BILM_MEDIA_RATE_LIMIT_GET*`, `BILM_MEDIA_RATE_LIMIT_POST*`

### Chat API
- `FIREBASE_PROJECT_ID`
- `BILM_DISABLE_AUTH`
- `BILM_AUTH_BYPASS_TOKEN`
- `CHAT_RATE_LIMIT_*`
- `CHAT_DELETED_MESSAGE_RETENTION_DAYS`

### Where set
- Cloudflare worker env vars/secrets: Wrangler + dashboard (`wrangler secret put` for secrets)
- Main server env: hosting platform process env
- Local development: `.dev.vars` / `.env` templates

---

## 7. Security fixes completed

1. File: `C:\Users\reidm\bilm\server.mjs`
- Problem: static server could expose internal files (source/config/tests/env templates).
- Danger: critical information disclosure + attack-surface disclosure.
- Severity: **critical**
- Change: added strict static allowlist and blocked sensitive segments/files.
- Verify: direct requests like `/server.mjs`, `/.env.example`, `/supabase/mirror_schema.sql` now return 404.

2. File: `C:\Users\reidm\bilm\server.mjs`
- Problem: ops token compared with plain string equality.
- Danger: timing side-channel on token checks.
- Severity: **medium**
- Change: switched to timing-safe comparison.
- Verify: valid token still succeeds, invalid token still 403.

3. File: `C:\Users\reidm\bilm\server.mjs`
- Problem: mirror-status response exposed internal queue file path.
- Danger: internal path disclosure.
- Severity: **medium**
- Change: removed `queueFile` from response payload.
- Verify: `/api/admin/mirror-status` no longer includes filesystem path.

4. Files:
- `C:\Users\reidm\bilm\shared\embed-sandbox.js`
- `C:\Users\reidm\bilm\shared\iframe-loader.js`
- Problem: sandboxed player iframes were blocking provider playback across viewer pages.
- Danger: users could not reliably load streams.
- Severity: **high**
- Change: enforce no-sandbox iframe policy in viewer helper/loader and keep strict URL + permission attributes.
- Verify: player iframes load with sandbox removed and playback initializes across providers.

5. Files:
- `C:\Users\reidm\data-api\src\index.js`
- `C:\Users\reidm\storage-api\src\index.js`
- `C:\Users\reidm\chat-api\src\index.js`
- Problem: `BILM_DISABLE_AUTH=true` previously allowed broad bypass with weak truthy headers / missing header behavior.
- Danger: accidental production auth bypass.
- Severity: **critical**
- Change: bypass now requires both `BILM_DISABLE_AUTH=true` and a configured `BILM_AUTH_BYPASS_TOKEN`, with secure token compare.
- Verify: without token configured, bypass stays disabled; with matching header token, bypass works for explicit local test paths.

6. Files:
- `C:\Users\reidm\data-api\src\index.js`
- `C:\Users\reidm\storage-api\src\index.js`
- Problem: userId validation was length-only.
- Danger: malformed IDs entering storage/query paths.
- Severity: **medium**
- Change: tightened userId validation to strict alphanumeric UID shape.
- Verify: invalid format userId now returns 400.

7. File: `C:\Users\reidm\data-api\.dev.vars` (local non-tracked), `.dev.vars.example`
- Problem: real Supabase service-role key present in local dev vars.
- Danger: secret leakage if shared/snapshotted.
- Severity: **critical**
- Change: replaced with placeholder; documented bypass token requirement in templates.
- Verify: no real key remains in local template content.

8. Files:
- `C:\Users\reidm\data-api\wrangler.jsonc`
- `C:\Users\reidm\storage-api\wrangler.jsonc`
- `C:\Users\reidm\chat-api\wrangler.jsonc`
- Problem: bypass token variable not consistently represented.
- Danger: inconsistent deploy config and unsafe assumptions.
- Severity: **low**
- Change: added `BILM_AUTH_BYPASS_TOKEN` config placeholder consistently.
- Verify: all three wrangler configs include the variable.

---

## 8. Bug fixes completed

1. File: `C:\Users\reidm\bilm\server.mjs`
- Problem: static serving logic allowed unintended repo file access.
- Cause: broad root-based file serving with no public-path policy.
- Fix: allowlist + blocked sensitive roots/files.
- Test: Playwright smoke suite passed after patch.

2. Files:
- `C:\Users\reidm\bilm\shared\embed-sandbox.js`
- `C:\Users\reidm\bilm\shared\iframe-loader.js`
- Problem: sandbox application blocked real player startup in fallback/refresh flows.
- Cause: provider embeds require unsandboxed iframe execution paths.
- Fix: centralized no-sandbox behavior in both primary and fallback iframe set paths.
- Test: Playwright watch tests (server fallback/fullscreen/player menu tests) passed.

3. Files:
- `C:\Users\reidm\data-api\test\index.spec.js`
- `C:\Users\reidm\storage-api\test\index.spec.js`
- `C:\Users\reidm\chat-api\test\index.spec.js`
- Problem: test env setup did not include new bypass token contract.
- Cause: auth-bypass hardening changed behavior contract.
- Fix: test envs updated; bypass test sends token header.
- Test: all vitest suites passed.

---

## 9. Stability and future-proofing

- Static serving now has explicit boundary controls; future backend/config files are protected by default unless intentionally allowlisted.
- Auth bypass behavior is now explicit and opt-in with a secret token, preventing silent insecure deploys.
- User ID validation is stricter to reduce malformed input persistence and edge-case collisions.
- Iframe behavior is centralized and consistent between helper and fallback paths, with explicit no-sandbox policy.
- Wrangler variable contracts are now aligned across services for safer deployments.

Safe extension guidance:
- Add new public frontend routes by extending `STATIC_PUBLIC_ROOTS` / `STATIC_PUBLIC_ROOT_FILES` intentionally.
- Keep `BILM_DISABLE_AUTH` off in production; only use bypass with local-secret token.
- Add new API routes behind existing auth + ownership utility functions rather than ad-hoc checks.

---

## 10. Deployment notes

### Local run
- Main site: `cd C:\Users\reidm\bilm && npm start`
- Data API: `cd C:\Users\reidm\data-api && npm run dev`
- Storage API: `cd C:\Users\reidm\storage-api && npm run dev`
- Chat API: `cd C:\Users\reidm\chat-api && npm run dev`

### Build/test
- Main smoke: `cd C:\Users\reidm\bilm && npm run test:smoke`
- Worker tests: `npm test -- --run` in each API folder

### Deploy
- `wrangler deploy` per worker repo/folder
- Main server deploy with env vars set in hosting runtime

### Required Cloudflare/Firebase/Supabase settings
- Cloudflare:
  - Bindings for D1/KV/R2 must match `wrangler.jsonc`
  - Secrets (admin/ops/provider/supabase) must be set as secrets, not plain vars
- Firebase:
  - Project ID must match token audience/issuer checks
- Supabase:
  - Mirror table exists and service-role key rotated/kept private

### Required CORS/domain settings
- Keep allowed origins in sync with real frontend domains:
  - `C:\Users\reidm\bilm\server.mjs` (`CORS_ALLOWED_ORIGINS`)
  - `data-api/src/index.js`, `storage-api/src/index.js`, `chat-api/src/index.js` (`DEFAULT_ALLOWED_ORIGINS`)

### Common mistakes to avoid
- Enabling `BILM_DISABLE_AUTH` in production without intent
- Committing `.dev.vars`
- Adding new static/server files without checking static allowlist policy

---

## 11. Testing checklist (executed)

- Login: validated by API auth test suites
- Logout/session expiry handling: validated by chat/data tests around auth failures
- User data load/save: data-api tests pass
- Chat API: chat-api tests pass
- Storage API: storage-api tests pass
- Data API: data-api tests pass
- Movie/TV API fallback: Playwright smoke pass
- Error handling: worker tests + smoke pass
- Rate limits: worker tests include rate-limit assertions
- Permissions/ownership: worker tests include membership and user-scope checks
- UI behavior desktop/mobile: Playwright desktop+mobile runs passed
- Build/deploy readiness: syntax checks and route configs validated

Executed results:
- `data-api`: 42/42 tests passed
- `storage-api`: 4/4 tests passed
- `chat-api`: 12/12 tests passed
- `bilm` smoke: 71 passed, 1 skipped

---

## 12. Remaining risks and exact follow-ups

1. Dashboard-side controls not verifiable from code
- Risk: Cloudflare firewall/WAF/rate-limit rules may not match code assumptions.
- Action: verify Cloudflare dashboard per route, especially public media endpoints and ops endpoints.

2. Firebase/Supabase policy posture not verifiable from code alone
- Risk: backend mirror/storage policies could still be too broad.
- Action: verify Firebase project security settings and Supabase RLS/table permissions for mirror table.

3. Main CSP is permissive in script directives (`unsafe-inline`/`unsafe-eval`)
- Risk: reduced XSS hardening headroom.
- Action: migrate inline scripts to external modules and remove unsafe CSP directives incrementally.

4. `chat-api` workspace git hygiene
- Risk: chat-api is currently under home-root git context, increasing accidental commit scope.
- Action: move chat-api into its own repo or set explicit VCS boundaries.
