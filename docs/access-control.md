# Terminal access control

The hosted terminal and owner dashboard run on a Cloudflare Worker with a persistent D1 database. GitHub Pages cannot run server authentication: its entry redirects to the Worker, while its existing scrape workflow continues publishing the market-data feed.

- Terminal: https://terminal.insiderwhale.workers.dev/
- Owner dashboard: https://terminal.insiderwhale.workers.dev/admin
- Worker and D1 binding: `wrangler.toml`; canonical origins: `access/deployment.json`.

## Owner workflow

Sign in to `/admin` using the separately configured owner password. Select **4 weeks**, **6 months**, **1 year**, **Lifetime**, or **Free trial**, choose 1–100 keys, optionally add a label, and generate. Copy/save the full keys immediately: the database stores only SHA-256 digests and masked hints, so full keys cannot be recovered later. The overview shows generated, ever used, active, unused, expired and revoked counts for each plan. Keys can be revoked immediately, including all existing sessions.

A generated key remains unused indefinitely. Its first successful use atomically sets its activation/expiry; entering it again never extends or resets its term. Free trial means exactly 72 hours from first use. Four weeks means 28 days. Six months and one year use UTC calendar arithmetic, clamping month ends/leap days. Lifetime keys have no license expiry. A key is device limited: it binds to the first two browsers that redeem it, identified by a random `iwt_device` cookie (HttpOnly, 400 days, renewed on every key entry; only its SHA-256 digest is stored). Any further device is rejected with 403. In the key register, **+1 device** raises one key's limit by one (sold as a paid extra; payment is handled outside the terminal) and **Reset** forgets the key's devices and signs them out without changing its term. A browser that clears its cookies counts as a new device. Browser sessions last at most 30 days and can be renewed by entering the same still-valid key. Admin sessions last eight hours.

Every protected `/data/*` request checks the server session, key revocation, and current expiry before handing off to the existing public, CORS-enabled market-data feed. Browser credentials are not forwarded to that origin. Open tabs recheck every 15 seconds, on focus, and at expiry. Expired access is rejected immediately by server time even if the page is closed or the browser clock is wrong. Expired/revoked session records are cleaned up opportunistically; key audit rows remain for accurate counts. A cleanup cron is not needed for enforcement.

## Secrets and security boundary

`ADMIN_PASSWORD_HASH` is a secret runtime environment variable, using PBKDF2-SHA256 with a random salt and 100,000 iterations (the hosted WebCrypto limit). The supplied password is not committed or included in client assets. Rotate it by replacing that environment variable and redeploying. Existing admin sessions expire within eight hours; invalidate them immediately with `DELETE FROM access_sessions WHERE role='admin'` when rotating after a compromise.

Session tokens are random, opaque, stored only as hashes, and sent in Secure, HttpOnly, SameSite=Strict cookies. The API validates mutation origins, limits request sizes, rate-limits login/activation attempts in D1, validates inputs, and does not log keys or passwords. A missing access service fails closed.

**Scope:** the hosted terminal is protected. This repository and its historical snapshots, releases, and legacy GitHub Pages JSON feed remain public. The key gate does not make previously public market data confidential. Moving or privatizing those sources is a separate migration; do not describe this as protection of all public GitHub artifacts.

## Build, validation and deployment

`npm run typecheck`, `npm test`, `npm run test:access` (Node 22.13+), and `npm run build:access`. The access integration tests exercise the real SQL schema through SQLite, including expiry boundaries, revocation, session persistence, first-use races, calendar boundaries, statistics, and brute-force limits.

`build:access` builds the existing React web terminal then bundles its shell assets and `access/worker.mjs` into `dist/server/index.js`. Data and secrets are excluded. The Worker allows only the existing market-data filenames and authorizes every feed handoff; the browser reads the authoritative public feed directly so scheduled updates stay current. The D1 schema is in `drizzle/`; append a migration for future changes. A deployment preserves the D1 key database. Ordinary React and CSS releases publish `terminal-shell.html` together with hashed `/assets/*` on GitHub Pages. The Worker serves that latest HTML and those assets from the pinned public origin. It never forwards cookies, license keys or authorization to Pages; all existing D1 checks on `/api/*` and `/data/*` remain server-side. A Pages outage falls back to the last bundled shell. The GitHub Pages shell is public; this does not change the already-public data feed.

**Deployment:** `npm run deploy:access` (with `CLOUDFLARE_API_TOKEN` set) builds the Worker, applies pending D1 migrations and deploys it. React/CSS releases reach the live host automatically through GitHub Pages; Worker/service changes need this command. To create the owner password verifier, run `node scripts/hash-admin-password.mjs` and store its output as the Worker secret `ADMIN_PASSWORD_HASH`. A custom domain is attached to the Worker in Cloudflare; then update `publicOrigin` in `access/deployment.json`.

After a successful Worker deployment, the existing GitHub scrape/publish workflow applies `scripts/prepare-pages-entry.mjs` so the original Pages address forwards visitors. Data freshness checks and scheduled scrapes continue using the existing feed URL.

Desktop Electron builds retain their existing behavior and do not require a web key.

`access-entry.yml` can publish a routing-only change immediately by restoring the last retained Pages artifact and replacing its entry page. It preserves all market data and does not wait for or cancel the scheduled analysis refresh. It fails closed if no retained Pages artifact exists.

Trial terms use the nullable `trial_days` cap added by migration 0001. Existing keys and session references are preserved; API responses and usage totals expose trials separately as `3days`. Do not roll the access service back to a version that predates trial support while trial keys exist.
