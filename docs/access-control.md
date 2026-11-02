# Terminal access control

The hosted terminal and owner dashboard run on a managed Worker with a persistent D1 database. GitHub Pages cannot run server authentication: its entry redirects to the managed host, while its existing scrape workflow continues publishing the market-data feed.

- Terminal: https://insider-whale-terminal-access.hazycake37.chatgpt.site/
- Owner dashboard: https://insider-whale-terminal-access.hazycake37.chatgpt.site/admin
- Host identity: `.openai/hosting.json`; canonical origins: `access/deployment.json`.

## Owner workflow

Sign in to `/admin` using the separately configured owner password. Select **4 weeks**, **6 months**, **1 year**, **Lifetime**, or **Free trial**, choose 1–100 keys, optionally add a label, and generate. Copy/save the full keys immediately: the database stores only SHA-256 digests and masked hints, so full keys cannot be recovered later. The overview shows generated, ever used, active, unused, expired and revoked counts for each plan. Keys can be revoked immediately, including all existing sessions.

A generated key remains unused indefinitely. Its first successful use atomically sets its activation/expiry; entering it again never extends or resets its term. Free trial means exactly 72 hours from first use. Four weeks means 28 days. Six months and one year use UTC calendar arithmetic, clamping month ends/leap days. Lifetime keys have no license expiry. A key can be used on multiple browsers; it is a bearer credential, not tied to an email or device. Browser sessions last at most 30 days and can be renewed by entering the same still-valid key. Admin sessions last eight hours.

Every protected `/data/*` request checks the server session, key revocation, and current expiry before handing off to the existing public, CORS-enabled market-data feed. Browser credentials are not forwarded to that origin. Open tabs recheck every 15 seconds, on focus, and at expiry. Expired access is rejected immediately by server time even if the page is closed or the browser clock is wrong. Expired/revoked session records are cleaned up opportunistically; key audit rows remain for accurate counts. A cleanup cron is not needed for enforcement.

## Secrets and security boundary

`ADMIN_PASSWORD_HASH` is a secret runtime environment variable, using PBKDF2-SHA256 with a random salt and 100,000 iterations (the hosted WebCrypto limit). The supplied password is not committed or included in client assets. Rotate it by replacing that environment variable and redeploying. Existing admin sessions expire within eight hours; invalidate them immediately with `DELETE FROM access_sessions WHERE role='admin'` when rotating after a compromise.

Session tokens are random, opaque, stored only as hashes, and sent in Secure, HttpOnly, SameSite=Strict cookies. The API validates mutation origins, limits request sizes, rate-limits login/activation attempts in D1, validates inputs, and does not log keys or passwords. A missing access service fails closed.

**Scope:** the managed terminal is protected. This repository and its historical snapshots, releases, and legacy GitHub Pages JSON feed remain public. The key gate does not make previously public market data confidential. Moving or privatizing those sources is a separate migration; do not describe this as protection of all public GitHub artifacts.

## Build, validation and deployment

`npm run typecheck`, `npm test`, `npm run test:access` (Node 22.13+), and `npm run build:access`. The access integration tests exercise the real SQL schema through SQLite, including expiry boundaries, revocation, session persistence, first-use races, calendar boundaries, statistics, and brute-force limits.

`build:access` builds the existing React web terminal then bundles its shell assets and `access/worker.mjs` into `dist/server/index.js`. Data and secrets are excluded. The Worker allows only the existing market-data filenames and authorizes every feed handoff; the browser reads the authoritative public feed directly so scheduled updates stay current. The D1 schema is in `drizzle/`; append a migration for future changes. Publish the archive through the Sites workflow with the persisted project ID and runtime secrets. A deployment preserves the D1 key database. Ordinary React and CSS releases now publish `terminal-shell.html` together with hashed `/assets/*` on GitHub Pages. The managed Sites worker serves that latest HTML and those assets from the pinned public origin. It never forwards cookies, license keys or authorization to Pages; all existing D1 checks on `/api/*` and `/data/*` remain server-side. A Pages outage falls back to the last bundled shell. The GitHub Pages shell is public; this does not change the already-public data feed.

**One-time Sites activation:** save and deploy an updated version of the existing managed Sites project with the latest `access/worker.mjs` via `npm run build:access`. Preserve the existing project ID, D1 binding, runtime secrets and production URL. A GitHub push alone cannot publish to Sites. After this one-time Sites deployment, ordinary React/CSS GitHub Pages releases appear on the live Sites host automatically; Worker/service changes still require a Sites deployment. Check which Sites project owns the live hostname before deploying because several `chatgpt.site` hosts may exist.

After a successful managed-host deployment, the existing GitHub scrape/publish workflow applies `scripts/prepare-pages-entry.mjs` so the original Pages address forwards visitors. Data freshness checks and scheduled scrapes continue using the existing feed URL.

Desktop Electron builds retain their existing behavior and do not require a web key.

`access-entry.yml` can publish a routing-only change immediately by restoring the last retained Pages artifact and replacing its entry page. It preserves all market data and does not wait for or cancel the scheduled analysis refresh. It fails closed if no retained Pages artifact exists.

Trial terms use the nullable `trial_days` cap added by migration 0001. Existing keys and session references are preserved; API responses and usage totals expose trials separately as `3days`. Do not roll the access service back to a version that predates trial support while trial keys exist.
