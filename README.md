# Insider & Whale Terminal

Desktop app for insider-trade and unusual-options signal tracking.

It is an Electron + React + Vite + TypeScript app. Electron main owns scraping,
scoring, SQLite, scheduling, native notifications, auto-updates, and authenticated
browser sessions. The React renderer is UI-only and talks to main through the
typed `window.api` bridge.

This README is intentionally detailed. Keep it updated so the next AI can pick up
the project without rediscovering the same context.

## Current Product State

- Product name: `Insider & Whale Terminal`
- npm package: `insider-whale-terminal`
- Current version: see `package.json` (currently `1.1.2`)
- Release target: GitHub Releases at `RoglMarcel/insider-whale-terminal`
- Local folder: `C:\Users\8marc\Desktop\Insider`
- Important: this local folder is currently not a git repository. Releases are
  built locally and uploaded to GitHub Releases.

- **v1.1.9** (Current)
  - **Company names for options-only ("whale") tickers.** Those aggregates are built
    purely from options scrapers, which report no company name — so cards showed `—`
    and the detail modal fell back to a chart placeholder. Names now come from the
    SEC's `company_tickers.json` (already fetched for the CIK map, so no extra
    request): 10,940 entries incl. share-class aliases (SEC writes `BRK-B`, the
    scrapers normalize to `BRK.B`). Verified: NVDA → NVIDIA CORP, AMZN → AMAZON COM INC.
  - **Fix: "AMZN Asset Chart" leaked into the full detail view.** In `SignalModal`,
    `!chartOnly && signal?.companyName || \`${ticker} Asset Chart\`` binds as
    `(… && …) || …`, so a missing company name always fell through to the chart-only
    placeholder. Placeholder is now used only in chart-only mode.
- **v1.1.8**
  - **Web publishes the ACTIVE UNION, not just the current run.** The cloud run only
    scrapes 🟢 sources, so publishing `result.signals` alone dropped every ticker the
    desktop had published from login-gated sources — and with the insider leg gone,
    their COMBOs vanished (live site showed 0 combos while the DB held 3). Both
    runners now write `getLatestSignals()` (newest signal per ticker inside the
    4-day active window — the same rule the desktop dashboard uses), so desktop
    tickers stay visible and expire on their own. Measured on a CI-equivalent run:
    `scraped 275 → published 308`, +33 tickers, MSFT/CEG/BRK.B combos preserved.
    `meta.json` now carries both `signalsFound` and `publishedSignals`.
  - **Fix: Finviz ticker parsing (pre-existing data-corruption bug).** Finviz renders
    a logo chip inside the ticker cell whose fallback letter is part of `textContent`,
    so every ticker came through with a doubled first letter (`PPAL` for PAL, `IINTC`
    for INTC) — 88 of 355 signals were junk, and it polluted the desktop app too.
    `scrapeFinviz` now takes the ticker from the row's authoritative quote link
    (`…?t=PAL`), keyed by cell text. Verified live: 200 rows, 0 malformed.
  - **Purged 47 provably-duplicate rows** from the history DB (same insider+date+value
    under both the doubled and the correct ticker). Real doubled-letter tickers
    (QQQ, BBW, BBX, VVV, AAT, CCL…) were explicitly preserved; a pattern-only purge
    would have deleted them. Remaining unprovable leftovers expire within 4 days.
- **v1.1.7**
  - **Fix: `publish:web` skipped every login-gated source.** The script set userData
    *after* `app.whenReady()` (and defaulted to Electron's dev folder), but Windows
    `safeStorage` decrypts with an AES key stored in `<userData>/Local State` — so all
    9 saved sessions failed to decrypt, read as "logged out", and the 6 gated sources
    were silently dropped from the run (absent from `sourceBreakdown`, no error).
    userData is now set **before** ready and defaults to `Roaming/insider-whale-terminal`.
    Added a pre-flight that prints sessions-that-decrypt + unlocked sources, and warns
    loudly on the wrong-folder case. Measured: 263 signals / 0 options / 0 combos →
    **355 signals / 17 with options / 1 combo** (barchart 50, finviz 200, optionstrat 17,
    insiderfinance 10). GuruFocus still hard-fails on Cloudflare even headed (known 🔴).
- **v1.1.6**
  - **Desktop-as-publisher (Variante B).** New `npm run publish:web` (runs under
    Electron for real `safeStorage` + logged-in sessions) does the FULL scrape with
    your account-gated sources, writes the shared `data/insider-tracker.db` + JSON,
    and — with `--push` — commits + pushes so Actions redeploys. The login-gated
    OPTIONS flow then rides the next ~72h of cloud 🟢 runs via the existing 72h
    options merge (lights up COMBO/HIGH). Safe by default (no push without `--push`);
    `USERDATA_DIR` overrides where saved sessions are read from.
  - **Scheduler wakes the PC (Variante 2).** `syncTaskScheduler` adds `-WakeToRun`
    so the weekday scheduled scrape fires from standby (PC must be asleep, not off,
    and on power). Applies after the next desktop rebuild. See "Keeping login-gated
    sources fresh" below to also publish those wake-runs to the web.
- **v1.1.5**
  - **Web Settings pruned.** On the web build the sections that control the
    (nonexistent) local scraper/scorer are removed, not just annotated: Auto-Refresh
    Schedule, Notifications threshold, Filters, Data Sources, Shadow Scoring, Alert
    Rules, and the Data card (Headless toggle / Clear history). A read-only "Cloud
    scrape schedule" note replaces the schedule; Platform Logins (honest) stays.
  - **Meaningful notifications.** HIGH/combo are unreachable without options flow, so
    ntfy would never fire. The runner now also emits `newNotable` (new WATCH-tier
    entrants scoring ≥ 65 vs the previous run) and `scoreSurges`; the ntfy step
    notifies on the union. Needs history (v1.1.4) to detect "new".
- **v1.1.4**
  - **Web de-clutter (#1).** On the web build (`isWeb`) the controls that only work
    in the desktop shell are hidden/relabeled: header **Refresh** and dashboard
    **Export CSV** are hidden; **Platform Logins** explains why web login is inert
    and points to the two real paths; a note on the **Settings** page clarifies the
    schedule/source toggles don’t drive the cloud scraper. Detail modal padding/height
    tuned for phones.
  - **History persistence (#3).** The SQLite DB is now committed back to the repo
    (`data/insider-tracker.db`, un-ignored) after each successful deploy
    (`[skip ci]` guards the loop; `contents: write` + `fetch-depth: 0`). Each run
    opens the prior DB, so track-records / score-trend / “new signal” detection
    accumulate. Trade-off: the repo grows by one binary DB blob per run.
  - **Phone push via ntfy (#2).** If the repo secret `NTFY_TOPIC` is set, the run
    curls new HIGH/combo tickers to `ntfy.sh/<topic>` (subscribe in the free ntfy
    Android app). No-op when unset.
  - **Login-gated sources in CI (the login answer).** The runner reads the optional
    `SCRAPE_SESSIONS` secret (JSON map of `platformKey → Playwright storageState`),
    writes each to the session file `auth.ts` already reads (`RAW:` plaintext), and
    auto-enables those scraper sources — reusing the existing auth path unchanged.
    See “Login-gated sources on the web build” below. Caveats: sessions expire, and
    one datacenter IP scraping X/GuruFocus is easily blocked.
- **v1.1.3**
  - **Mobile-usable web layout.** The fixed `w-60` sidebar becomes an off-canvas
    drawer below `lg` (hamburger in the header, backdrop, closes on nav/backdrop
    tap); it stays a static column on `lg+` (desktop unchanged, verified). Header
    padding/title scale down on small screens and no longer overlap; `main` uses
    full width (`px-4 lg:px-8`). Signal grid already reflowed 1→2→3 cols.
  - **Web build de-clutter.** The Electron-only "Preview mode — scraping & local
    database disabled" banner is hidden on the web target (`isWeb`), and the 5 MB
    intro video is skipped on the web build (heavy + 10s delay on mobile data).
    New exported `isWeb` flag in `src/lib/ipc.ts`.
  - **CI: auto-deploy on push.** `scrape.yml` now also triggers on push to `main`
    (paths-ignore `**/*.md`), so UI/code changes rebuild + redeploy without a
    manual "Run workflow".
- **v1.1.2**
  - **Web / mobile target (scrape-to-static), additive & non-breaking.** New headless
    runner `scripts/scrape-web.ts` runs the same `runScrape` orchestrator on plain
    Node (esbuild aliases `electron` → `scripts/electron-stub.ts`; only `auth.ts`
    touches Electron in that graph), writing `public/data/{signals,meta}.json`. A
    GitHub Actions workflow (`.github/workflows/scrape.yml`) scrapes a conservative
    🟢 source set (edgar/openinsider/insidermonitor/secform4 + always-on
    congress/sellside/activist side-pipelines) a few times/day, builds the web UI,
    and deploys it to GitHub Pages — no server, no cost, usable on a phone via the
    browser. New `npm run scrape:web` / `build:web` / `dev:web`.
  - **Renderer API seam formalized.** `mockApi` extracted to `src/lib/mockApi.ts`;
    new read-only `src/lib/webApi.ts` (reads the static JSON, per-device watchlist in
    `localStorage`); `src/lib/ipc.ts` now selects `window.api` (Electron) / `webApi`
    (Pages build, `VITE_TARGET==='web'`) / `mockApi` (plain browser). Desktop build
    path is unchanged. Web build via `vite.config.web.ts` (no electron plugin).
  - Note: v1.1.2 publishes only the LATEST scrape (ephemeral CI DB) — cross-run
    history / track-records / login+Cloudflare sources are intentionally deferred.
- **v1.1.1**
  - **Auto-Scrape Task Scheduler Fix:** Restored robust background scheduled scrapes when the primary app is open by checking command-line arguments in the single-instance lock handler and running the task in-process.
  - **Background Intro Playback Fallback:** Added a hard fallback timer to ensure the intro video overlay fades out within 11 seconds even if paused/throttled when the app starts in a background or minimized window.
  - **Sidebar Brand Polishing:** Removed the 4-point star icon next to the "Insider & Whale Terminal" title in the sidebar for a cleaner layout.
- **v1.0.47**
  - **Fix scrape breakdown all-zeros regression:** removed shadowed `mainSourceCounts` local that discarded per-source row counts (scrapers still worked; UI showed 0 alerts for all 12 core sources).
- **v1.0.46**
  - **Scoring discipline:** combo/politician flat bonuses → soft multipliers (×1.15–1.25) gated at WATCH; lone politician prints badge-only; legacy flat score always stored as `shadow_score` for A/B. Per-source timeout/error ≠ empty success. Backtest entry = max(trade, filing, first-seen). Confidence sort on Alerts. Authoritative $ volume never overwritten by Quiver estimates.
- **v1.0.45**
  - **Data correctness:** sanitize insane insider share×price×value combos (FINS-style $quadrillion glitch); dashboard total volume ignores polluted rows; Role/Price/Volume on cards derive from trade rows when aggregate fields are empty.
- **v1.0.44**
  - **Congressional pipeline restored:** multi-layer congress chain (Capitol BFF → Playwright → Quiver HTML embed → House/Senate watcher dumps); side pipelines (`capitoltrades`, `sellside`, `activist`) in scrape session breakdown + source health; hard failures no longer silent (`-1` sentinel + errors).
- **v1.0.43**
  - **UX fixes:** scrape progress counter clears after finish; notification bell opens HIGH-signal popover; Live News scrolls instead of squeezing; Source Health panel compacted; pre-migration SQLite backups (keep last 5).
- **v1.0.42**
  - **Bugfix pass (20 findings):** Twitter single-flight flag no longer sticks on launch failure; performance dashboard keeps newest observations; MEGA/combo bonus display no longer double-counts; COMBO/MEGA thresholds and null-date handling aligned; politician combos notify; UTC price-date walks; drawdown-at-trade-date; Barchart sentiment from direction fields; unknown transaction types excluded from scoring; notification seed from active signals; Capitol Trades pagination; sell-side 90d lookback; assorted small hardening.
- **v1.0.41**
  - **Congressional Trading — a first-class signal source.** New Capitol Trades scraper (JSON API, 90-day lookback, paginated, rate-limited with backoff) plus a Senate Stock Watcher fallback, persisted in a new `politician_trades` table (STOCK Act disclosures: chamber, party, committee, amount midpoint, trade + disclosure dates, days-to-disclose). Politician buys/sells now feed the conviction score via `getPoliticianScore` (amount × committee relevance × freshness, buy-cluster multiplier, sell contra-signal, late-disclosure penalty) and surface politician-only tickers on their own.
  - **Combo tier hierarchy.** New `detectPoliticianCombo` adds three tiers on top of the classic insider+options COMBO: `POLITICIAN_INSIDER` (+25, purple), `POLITICIAN_OPTIONS` (+20, blue), and `MEGA_SIGNAL` (+45, red — congressional + insider + options aligned; replaces the regular +30 so there's no double-count).
  - **Full politician UI.** 🏛️ politician-count badge and tier badges on signal cards, an unmissable pulsing red MEGA_SIGNAL banner above the card, a dedicated "Politician Activity" section in the score-breakdown modal (per-member rows with party colours, buy/sell, amount, relative age, and late-disclosure flags, plus score-contribution and combo-tier rows), and congressional cross-referencing in the live news feed.
- **v1.0.40**
  - **Sell-Side Intelligence**: the buy-only pipeline now also collects insider SALES (OpenInsider sales screener) and SEC Form 144 proposed-sale notices into a new `insider_flow` table; signals surface 90-day same-company net flow ("heavy insider selling" / Form 144 warnings). Display/notes only until backtested.
  - **Routine vs Opportunistic Classifier**: `classifyInsiderPattern` (Cohen–Malloy–Pomorski) tags each insider from their calendar history — 🎯 first-ever buys vs 🔁 scheduled buyers — shown in the track-record panel. Dedicated validation harness `npm run backtest:opportunistic`.
  - **Source Health Monitoring**: reads `scrape_log` longitudinally (rolling median, 2+ consecutive zero-row runs) and alerts when a scraper silently breaks — recover-re-arm so it fires once per breakage.
  - **Equity Stats Pack + Price Context**: short % of float, float, average dollar volume, and drawdown from the 52-week high (adjusted closes) cached 24h in `ticker_meta`; squeeze / thin-liquidity / deep-drawdown notes on signals.
  - **Custom Alert Rules Engine**: per-ticker / watchlist / global rules (score-crosses, new insider buy, new combo, cluster-reaches-N) evaluated crossing-style after each scrape, managed in Settings.
  - **In-App Performance Dashboard**: replays stored signals against realized 10/20-day SPY-relative alpha by conviction tier and score bucket (History tab), making the score auditable from inside the app.
  - **13D/13G Activist Radar**: EDGAR Atom feeds → new `filing_events` table; 5%+ stake disclosures badge matching signals and notify like combos.
  - **Data Confidence Score**: per-signal 0–100 (field completeness + cross-source corroboration + authoritative sourcing) shown as ●●●○ in the score breakdown.
  - **Shadow Scoring (A/B) Framework**: `ScoringConfig` knobs let a candidate weighting be scored alongside the live model (persisted `shadow_score`) so changes are validated on realized alpha before promotion — managed in Settings.
- **v1.0.39**
  - **Full Audit Fix Pass (48 findings, `CODEBASE_AUDIT.md`)**: repaired the dead stockanalysis.com market-cap/sector regexes (relative buy sizing was inert in production), year-less Finviz dates parsing as 2001, abbreviated OpenInsider titles ("Dir"/"Pres"/"COB"/"GC") scoring as weight 1, the combo bonus firing on bearish flow, InsiderFinance puts reading as bullish calls, bear-spread sentiment inversion, cross-source insider-name dedup (order-insensitive normalization), and ~40 further scoring/scraping/robustness fixes.
  - **New Data Sources**: SEC EDGAR Form 4 (authoritative, structured XML with exact roles and the 10b5-1 checkbox), Insider-Monitor daily purchase digest, Quiver Quantitative live insider feed (names + titles), and MarketBeat unusual call/put options volume (public, no login). OpenInsider now uses the 500-row purchases screener; Barchart parses its core-api JSON with a shadow-DOM fallback; VIX comes from CBOE's official endpoint with Yahoo fallback.
  - **Component Backtest Harness**: `npm run backtest:components` isolates all 12 scoring components against 5/10/20-day SPY-relative alpha (Spearman IC, 70/30 walk-forward, Welch t-tests, EDGAR-augmented history) and writes `backtest-components-report.md`.
  - **Evidence-Based Recalibration**: freshness decay floor deepened 0.2 → 0.15 (only component with confirmed out-of-sample alpha, IC(oos)=0.342, p=0.021); smooth exponential freshness decay and a smooth track-record multiplier curve replace step cliffs; options score now rewards repeated whale prints via a decayed sum.
  - **Performance & Reliability**: sources scrape in a concurrency-3 pool, ticker meta (market cap/sector/earnings) cached 24h in SQLite, valuation cache persisted across restarts, fetch timeouts + retry/backoff everywhere, scheduled-task DST self-healing, WAL checkpointing, and prepared-statement reuse.
- **v1.0.38**
  - **Calibrated Scoring Model**: Replaced linear normalization (`MAX_POSSIBLE_RAW`) with a saturating sigmoid curve (`SCORE_HALF_SATURATION ≈ 105`) mapped to a strong-but-plausible signal baseline (≈420 raw). This prevents insider-only signals from being compressed into single digits and resolves the issue where the `comboBonus` dominated the conviction level.
  - **Relative Buy Sizing**: Buy trade sizes are now evaluated relative to market cap when known, rather than absolute dollar volumes, for fairer scoring.
  - **Accurate Track-Record Metrics**: Fixed 3-month track record outcomes (now correctly using +90 days calendar returns rather than a 30-day proxy) and corrected the `accuracy6m` denominator to only count trades old enough to have a 180-day outcome.
  - **Backtesting Harness**: Added a backtest script (`npm run backtest`) to evaluate stored signals against realized S&P-relative returns.
  - **Robust Scheduling & API Fetches**: Awaits VIX quotes before starting scheduled scans, limits concurrent stockanalysis earnings checks (max 6), and pools Chromium instances for track-record/valuation crawls (max 2) to prevent CPU spikes.
  - **Algorithm & Parse Hardening**: Standardized name normalization using a shared `normalizeInsiderName` in `types`. Excluded SEC transaction code `A` (grant/award) from buy trade classification. Fixed options sentiment asymmetries, short-dated bonus on empty DTE cells, and option-age evaluation logic.
  - **Data Retention & Performance**: Added daily SQLite data retention/pruning (`pruneOldData` with 365-day cutoff) and cached decrypted auth states to speed up Playwright scraping session lookups.
- **v1.0.37**
  - **Dynamic Chart-Only Modal Mode**: Clicks on ticker badges in the **Live News Feed** tab now always open a clean chart-only modal (only displaying the live candlestick chart with quote details, drawing tools, and standard header elements, bypassing all insider trading details, conviction score gauges, score breakdown tables, and options flows even if active signals exist in the local SQLite database).
  - Clicks on ticker cards from **Alerts (Dashboard)**, Watchlist, or History tabs continue to load the full conviction detail modal.
  - Skips database query execution and local store signal matching when the modal is opened in chart-only mode for instant modal rendering without load-time lag.
- **v1.0.36**
  - **TradingView Charts Integration**: Clicking any ticker in the Live News Feed opens a detail modal with a live TradingView advanced charting widget matching the light/dark terminal theme.
  - **CSP Frame Allowances**: Updated Content Security Policy (CSP) inside `index.html` to allow secure rendering of TradingView chart frames (`s.tradingview.com` / `www.tradingview.com`).
  - **Starting Animation Resizing**: Scaled down the full-screen intro video to `max-w-[50%] max-h-[50%]` and centered it perfectly on a black backdrop.
  - **Gold Shiny News Feed Ticker Badges**: Styled ticker button spans in the news feed with a solid gold border (`#FFC107`), gold text, transparent yellow background, and an active gold glowing drop shadow.
  - **Native Titlebar Restoration & Theme Syncing**: Restored standard window frame controls (minimize, maximize, close) and added a dynamic IPC bridge (`app:setTheme`) to automatically sync the native titlebar background color with the terminal theme.
  - **Sidebar & Header Reorganization**: Renamed "Dashboard" tab to **Alerts**, reordered tabs to Alerts -> Live News -> Watchlist -> History -> Settings, and fixed the double header layout bug on the news tab.
- **v1.0.35**
  - Fixed Twitter scraper navigation timeout by changing `waitUntil: 'networkidle'` to `waitUntil: 'domcontentloaded'`. This prevents the scraper from hanging and failing to parse any tweets due to Twitter's continuous background telemetry streams.
- **v1.0.34**
  - Fixed background scrape process hang by switching from `app.quit()` to `app.exit(0)`/`app.exit(1)` when running headlessly via `--scheduled-scrape`. This ensures the process and all subprocess resources are completely terminated.
- **v1.0.33**
  - Updated the Live News Feed to strictly filter and display tweets/posts that are at most 12 hours old based on their publication timestamp.
  - Removed the hard limit of 50 tweets, allowing all posts within the 12-hour window to be shown.
- **v1.0.32**
  - Consolidated the separate schedule entries into a single multi-trigger task (`InsiderWhaleTerminal_DailyScrape`) using native PowerShell.
  - Enabled the `-StartWhenAvailable` (Run as soon as possible after a scheduled start is missed) configuration. Windows Task Scheduler will automatically run the missed scrape once when the PC turns back on.
  - Cleaned up the `⚡ Test Task Scheduler` button from the sidebar layout.
- **v1.0.31**
  - Fixed Windows Task Scheduler path parser bugs by migrating from shell-based `exec` to direct `execFile` API calls.
  - Implemented 72-hour temporal options activity merging from database history to prevent signal score decay.
  - Added a `⚡ Test Task Scheduler` button in the sidebar to verify one-off background automation.
- **v1.0.30**
  - Integrated automated background scraping using Windows Task Scheduler (`schtasks`) to run crawls at Market Open (9:30 AM ET), Midday (12:00 PM ET), and Market Close (4:00 PM ET) on weekdays.
  - Skips window rendering when launching with `--scheduled-scrape` to run entirely headless, automatically closing after scrape completion.
- **v1.0.20**
  - Added "Big Player" badge and filter to highlight prominent companies like Take-Two, Lululemon, Salesforce, and other highly capitalized stocks.
  - Redesigned the UI to a dark, professional broker terminal style with dark charcoal/pitch black panels and rich accent states.
- **v1.0.11**
  - Resolved parsing/scraping issues on SECForm4, MarketBeat, GuruFocus, OptionStrat, InsiderFinance, and Barchart.
  - Implemented custom CSS Grid row-and-cell parsing for InsiderFinance options flow.
  - Added support for strategy columns, parsing Strike, Type, and Sentiment when separate columns are absent.
  - Enhanced name normalization with role-stripping (Director, Officer, CEO, CFO, etc.) for correct insider count deduplication.
  - Fixed infinite "Loading..." states on insider track records by immediately resolving missing URLs/failed lookups.
  - Prevented overlapping popovers in the Insider table by tracking open tooltips by unique row indexes.
  - Polished the visual interface with Apple-inspired SF Pro typography, precise sub-pixel borders, inset glass edge reflections (chamfered highlight), and clean, perfectly-aligned table views.
  - Added SQLite column `error` and migration for `insider_track_records` to persist and display post-trade performance errors.
  - Fixed options scrapers displaying "0 alerts" in Scrape Sessions by updating the breakdown to count raw scraped alerts per source rather than filtered signal counts.
  - Added table wait selector to `optionstrat.ts` to make its loading logic robust under slower network conditions.
- **v1.0.8**
  - Added a search bar in the Dashboard to search signals by ticker, company name, or insider name.
  - Made insider trades in the detail modal clickable, opening the trade alert's source page in the default system browser.
- **v1.0.7**
  - Fixed a bug where Scrape Results Breakdown in History view showed 0 alerts for all sources.
  - Normalized scrape source keys in the breakdown log database and matched them case-insensitively in the frontend.
- **v1.0.6**
  - Moved the **Score Trend** history chart from the History tab to the Watchlist tab.
  - Refined the score trend ticker selector to only show/allow watchlisted/favorited tickers.
- **v1.0.5**
  - Added click-to-expand details accordion to Scrape Sessions in the History tab.
  - Displays a detailed breakdown of how many alerts/signals were found from each individual website/source in that session.
- **v1.0.4**
  - Integrated **Platform Logins** in the Settings panel.
  - Disabled toggles for lockable data sources (OptionStrat, InsiderFinance, Barchart, GuruFocus, MarketBeat) unless logged in.
  - Added valuation scraper gating (ValueInvesting.io and AlphaSpread) to avoid hitting limits unless logged in.
  - Fixed a critical browser context bug in `createContext` where Playwright session `storageState` (cookies) was ignored.
- **v1.0.3**
  - Added interactive update notifications panel in the UI.
- **v1.0.2**
  - Initial release with rebranding to "Insider & Whale Terminal" and Chrome star icon.

Distribution is handled by `electron-builder`. The app also uses
`electron-updater`, so installed clients can receive updates from GitHub Releases.
When publishing a new release, upload both the installer and `latest.yml`.

## Web / mobile build (GitHub Pages, "scrape-to-static")

The same React renderer is also shipped as a **free hosted website** so the app is
usable on a phone with no server and no cost. A GitHub Actions workflow
(`.github/workflows/scrape.yml`) runs the real `runScrape` orchestrator headlessly
on Node (esbuild aliases `electron` → `scripts/electron-stub.ts`), writes
`public/data/{signals,meta}.json`, builds the web bundle (`vite.config.web.ts`,
`VITE_TARGET=web`), and deploys it to GitHub Pages. The renderer picks its data
source in `src/lib/ipc.ts` (`window.api` / `webApi` / `mockApi`).

- Live site: `https://<owner>.github.io/insider-whale-web/`
- Local dev: `npm run dev:web` · one-off scrape: `npm run scrape:web` · build: `npm run build:web`
- History accumulates in the committed `data/insider-tracker.db`.

### Login-gated sources on the web build

A static site can only *display* data — logging in there can’t reach the cloud
scraper. Two real ways to get account-gated sources (options flow, GuruFocus,
Finviz Elite, X, valuation…) into the site:

1. **Desktop-as-publisher** — run the desktop app (it already logs in per user,
   residential IP, encrypted sessions) and have it publish its scraped output to
   the web repo. Best reliability / lowest ban risk.
2. **CI session secret** — set the repo secret **`SCRAPE_SESSIONS`** to a JSON map
   of `platformKey → Playwright storageState`, e.g.
   `{ "barchart": { "cookies": [...], "origins": [...] } }`. The runner writes each
   to `<userData>/sessions/<key>.session` (`RAW:` plaintext) so `auth.ts` unlocks
   the source and injects the cookies. Get a `storageState` by logging in once in a
   Playwright/Chromium session and saving `context.storageState()`.
   Caveats: cookies expire (re-paste periodically); one datacenter IP scraping
   X/GuruFocus is easily rate-limited or banned — the account risk is the user’s.

### Keeping login-gated sources fresh (Variante B)

The cloud runs only 🟢 sources. To add options flow / GuruFocus / X / valuation to
the site, publish from a machine that is logged in:

```bash
npm run publish:web           # scrape with your logins, write locally, print git cmds
npm run publish:web -- --push # ...and commit + push (Actions redeploys)
```

- Runs under Electron so it can decrypt your saved sessions. Check the log line
  `saved sessions found: N` — if `0`, set `USERDATA_DIR` to the desktop app's data
  folder (find it via the desktop app; the "userData path" gotcha applies).
- Options flow survives ~72h in subsequent cloud runs via the orchestrator's merge,
  so a weekend publish stays visible into midweek even with the PC off.

**Automate it (weekday nights, waking the PC from standby):** register a Windows
task that runs the publish and let `-WakeToRun` (v1.1.6) wake the PC. Requires the
PC asleep (not off), on power, wake-timers allowed, and cached git credentials:

```powershell
$repo = "C:\Users\8marc\Desktop\Insider"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$repo`" && npm run publish:web -- --push"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
$set     = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName "InsiderWhaleTerminal_Publish" -Action $action -Trigger $trigger -Settings $set -Force
```

### Phone notifications (ntfy)

Set the repo secret **`NTFY_TOPIC`** to any hard-to-guess string and subscribe to
that topic in the free **ntfy** Android app. Each run pushes new / surging tickers
there. Unset = no notifications.

## Safety Note

This is a personal research tool. Scraped data is best-effort and may be missing,
blocked, delayed, or wrong. Nothing in the app is investment advice.

## Tech Stack

| Area | Stack |
| --- | --- |
| Desktop shell | Electron 31 |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Recharts, Zustand |
| Database | better-sqlite3, local SQLite, WAL mode |
| Scraping | Playwright Chromium, main process only |
| Scheduling | node-cron & Windows Task Scheduler (powershell) |
| Notifications | Electron native Notification API |
| Updates | electron-updater + electron-builder GitHub publish config |

## Architecture

```text
Renderer UI
  -> window.api (preload contextBridge)
  -> Electron main IPC handlers
  -> scraper/index.ts orchestrator
  -> Playwright scrapers
  -> scoring.ts
  -> database.ts
  -> broadcast app:signals-updated
  -> Zustand store
  -> Dashboard / Detail modal
```

Main process responsibilities:

- Open and manage the app window.
- Register all IPC handlers.
- Run scrapes and valuation fetches.
- Store and migrate SQLite data.
- Run scoring.
- Poll VIX.
- Schedule refreshes.
- Send native notifications.
- Check for GitHub release updates.
- Store authenticated scraping sessions.

Renderer responsibilities:

- Dashboard, Watchlist, History, Settings, detail modal.
- Local UI state via Zustand.
- Calls only `window.api`; never imports Playwright or Node-only modules.

## Key Files

```text
electron/main.ts
  App lifecycle, IPC handlers, updater, DB init, scrape trigger.

electron/preload.ts
  Typed contextBridge API exposed as window.api.

electron/ipc-channels.ts
  Single source of truth for IPC names.

electron/database.ts
  SQLite schema, migrations, all queries.

electron/scoring.ts
  Full conviction score model.

electron/auth.ts
  Platform login/session system. Stores encrypted Playwright storageState.

electron/scraper/index.ts
  Scrape orchestrator: source gating, merge, dedup, earnings, scoring, DB insert.

electron/scraper/browser.ts
  Playwright launch/context helpers, including authenticated storageState.

electron/scraper/valuation.ts
  AlphaSpread + valueinvesting.io fair value fetches.

electron/scraper/insiderHistory.ts
  Insider track-record lazy fetch/cache support.

electron/scraper/insiderMap.ts
  Form 4 transaction role-to-rank and value-to-weight score mapping helpers.

electron/scraper/optionsMap.ts
  Unusual options flow sentiments, sweeps, sizes, and open interest classification.

electron/scraper/util.ts
  Playwright navigation helpers, selector waits, and page/content scrapers common utilities.

electron/scheduler.ts
  Cron scheduler and Windows Task Scheduler integration for automated headless scraping tasks.

electron/notifications.ts
  OS notification manager for high-conviction signals and combo alerts.

electron/vix.ts
  VIX volatility quotes fetcher (Yahoo Finance JSON API) and caching orchestrator.

src/types/index.ts
  Shared pure types, interface models, and constants used by both main and renderer.

src/store/useStore.ts
  Zustand store managing application views, theme modes, alerts filter, VIX quote cache, and the News Feed chartOnly detail modal states.

src/components/Settings/PlatformLogins.tsx
  Interactive logins manager panel for authenticated sessions.
```

## Data Sources

| Source | Purpose | Auth status |
| --- | --- | --- |
| OpenInsider | Primary Form 4 insider buys, trade/filing dates, insider URLs | Public |
| Finviz | Insider table + earnings date from quote pages | Login unlocks source in Settings |
| SECForm4 | Additional Form 4 data | Public/best-effort |
| MarketBeat | Insider summaries | Login unlocks source in Settings |
| GuruFocus | Insider/institutional summary | Login unlocks source in Settings |
| Insider-Monitor | Daily Form 4 purchase digest (B/AB/S/AS codes) | Public |
| Quiver Quantitative | Near-real-time insider feed with names + titles | Public |
| Barchart | Unusual options activity | Login unlocks source in Settings |
| MarketBeat Options Volume | Unusual call/put volume vs average (context only, no premium) | Public |
| OptionStrat | Options flow | Login required before scraping |
| InsiderFinance | Options flow | Login required before scraping |
| AlphaSpread | DCF/fair value | Login optional |
| valueinvesting.io | Intrinsic value estimate | Login strongly recommended |
| Yahoo Finance JSON | VIX and historical prices | Public |

Important OpenInsider note: use `latest-insider-purchases-25k`, not
`latest-cluster-buys`. The cluster page is a ticker summary and does not include
insider names/titles.

## Platform Logins

Settings now includes **Platform Logins**.

Goal: let the user log into platforms so scrapers work better and fair-value
fetches can read past free-view/account limits.

How it works:

1. User clicks **Log in** for a platform in Settings.
2. Electron opens a visible Playwright browser at that platform login page.
3. User signs in normally there.
4. User returns to Settings and clicks **Save session**.
5. The app stores only Playwright `storageState` (cookies/local storage), encrypted
   with Electron `safeStorage` when available.

No passwords are stored.

Session files live under:

```text
app.getPath("userData")/sessions/<platform>.session
```

Current platform policy lives in `LOGIN_PLATFORMS` in `src/types/index.ts`.

If a scraper source has a matching platform login (`sourceKey`), the Settings
data-source toggle is disabled until a saved session exists. This matches the
current product rule: if the platform supports account login, log in first, then
scrape it.

Public sources without a platform login remain available without login:
OpenInsider and SECForm4.

Valuation providers are slightly different because they are fetched on detail
modal open rather than via the main scrape-source toggles. Saved sessions for
ValueInvesting.io / AlphaSpread are still injected into valuation browser
contexts, which is what fixes the valueinvesting.io free-view-limit problem.

Relevant implementation:

- `electron/auth.ts`
- `electron/scraper/browser.ts`
- `electron/scraper/index.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/Settings/PlatformLogins.tsx`

## Scoring Model

Implemented in `electron/scoring.ts`.

High-level formula:

```text
insiderRaw =
  rankWeight
  * dollarVolumePoints      // avg buy per insider, normalized by market cap when known
  * transactionTypeModifier
  * clusterMultiplier
  * insiderEarningsMultiplier
  * vixMultiplier           // smooth ramp 1.0→1.15 as VIX goes 20→35

optionsRaw =
  detailedOptionsScore
  * optionsEarningsMultiplier

combined =
  (insiderRaw * insiderFreshness + optionsRaw * optionsFreshness)
  * trackRecordMultiplier   // shrunk, market-relative insider win rate (min sample)

finalScore =
  clamp(100 * combined / (combined + SCORE_HALF_SATURATION) + comboBonus, 0, 100)
```

Notes on realism (Tier-2 calibration):

- **Buy size is scored relative to market cap** (per-insider average, decorrelated
  from the cluster count) so a $5M buy reads as huge for a $200M company and noise
  for a $2T one. Falls back to absolute dollar buckets when cap is unknown.
- **Each component decays on its own clock** — the insider leg by the trade date,
  the options leg by its live scrape time — so a stale insider buy no longer
  discounts fresh options flow.
- **VIX** uses a smooth 20→35 ramp instead of a hard cliff at 25.
- **Track record** is the S&P-relative win rate (alpha), Bayesian-shrunk and gated
  by a minimum sample, pre-warmed during the scrape so it actually participates.

`combined` is mapped to 0–100 by a **saturating curve** (`SCORE_HALF_SATURATION ≈ 105`),
anchored so a strong-but-plausible signal (~420 raw) reads right at the HIGH
threshold and stronger signals spread toward 100 without hard clipping. The earlier
`/ MAX_POSSIBLE_RAW` linear normalization divided by the product of every factor's
theoretical maximum (≈2126) — a combination that essentially never co-occurs — which
crushed real insider signals into single digits and let the flat `comboBonus` decide
the tier on its own. `MAX_POSSIBLE_RAW` is now kept only as a display reference.

Conviction:

- `HIGH`: score >= 80
- `WATCH`: score >= 50
- `LOW`: score < 50

Major scoring factors:

- Insider role rank.
- Dollar volume.
- Transaction type weighting.
- Cluster buying.
- Earnings countdown.
- Detailed options flow.
- Combo signal bonus.
- Insider track record.
- Freshness/time decay.
- VIX boost when VIX > 25.

## Feature Summary

Implemented extension features:

1. Signal age + time decay.
2. Transaction type weighting.
3. Options-specific data and scoring.
4. Combo signal detection.
5. Earnings countdown from Finviz.
6. Insider track record.
7. Dashboard time/type/conviction filters.
8. VIX display and VIX scoring boost.
9. Insider accuracy panel in the detail modal.
10. Platform login/session system for authenticated scraping.
11. Big Players highlighting (gold badge) and custom dashboard filters.
12. Shell-independent background scraping via Windows Task Scheduler.
13. 72-hour sliding window temporal options merging to prevent score drop.

Model-realism + UX (Tier 2/3):

14. Market-cap-normalized buy size (per-insider, decorrelated from cluster count),
    per-component freshness decay, smooth VIX ramp, founder / 10%-owner weights.
15. Track records pre-warmed during the scrape; S&P-relative (alpha), split/dividend-
    adjusted, sample-gated + Bayesian-shrunk win rates.
16. Score backtest / calibration harness — `npm run backtest`.
17. Signal expiry (tickers unseen for >4 days drop off the dashboard).
18. Fair-value undervaluation folded into the score (cached + login-gated pre-warm).
19. Net-bearish options representation and insider sell/disposal awareness.
20. "Follow this signal" P&L, sector context, ticker-tagged news in the detail modal.
21. CSV export of the current signals, and score-surge (delta) desktop alerts.

## Database

SQLite file:

```text
app.getPath("userData")/insider-tracker.db
```

Tables:

- `signals`
- `watchlist`
- `scrape_log`
- `app_settings`
- `insider_track_records`

`database.ts` defines both:

- Full `CREATE TABLE IF NOT EXISTS` schema for fresh databases.
- `runMigrations()` for existing databases.

SQLite does not support `ALTER TABLE ADD COLUMN IF NOT EXISTS`, so migrations use
PRAGMA-based column checks. Keep that pattern.

## Known Gotchas

### "Refresh works but UI shows 0 signals"

Root cause seen before: live DB had the old schema. New inserts wrote columns such
as `trade_date` and `combo_signal`, SQLite threw `no such column`, and the signal
transaction rolled back.

Current protection:

- Fresh schema includes all extension columns.
- `runMigrations()` runs on app start.
- DB insert errors are surfaced in `ScrapeResult.errors`.

If it happens again, inspect the live DB schema and the real `userData` path.

### Default filter is This Week

Trade dates often lag filing/scrape dates by multiple days. A strict 48h
trade-date filter commonly looks empty even when fresh filings exist. The default
filter is therefore `week`.

### userData path changes by app name

Dev and packaged builds can use different AppData folders because app name /
product name differ. A rename can look like a fresh DB.

### valueinvesting.io fair-value limits

Without login, valueinvesting.io can start returning "not found" after a few free
views. Use Settings -> Platform Logins -> ValueInvesting.io, then save the session.

### Playwright packaging

Chromium must be available for scraping. `asarUnpack` covers Playwright/native
modules, but release packaging should still be tested on a clean machine.

## Build, Run, Release

```bash
npm install
npx playwright install chromium

npm run dev
npm run typecheck
npm run build
npm run dist
```

Release flow:

1. Bump `version` in `package.json`.
2. Run `npm run dist`.
3. Upload the generated installer and `latest.yml` from `release/` to a GitHub
   Release in `RoglMarcel/insider-whale-terminal`.
4. Installed apps pick up the update via `electron-updater`.

## Verification Commands

```bash
npm run typecheck
npm run verify:scoring
npm run verify:db
npm run verify:scrape
npm run backtest      # replay stored signals vs realized S&P-relative returns
```

Notes:

- `verify:db` runs under Electron because `better-sqlite3` is built for Electron.
- `verify:scrape` needs network access and Playwright Chromium.
- In restricted sandbox sessions, `npm run typecheck` may fail before TypeScript
  starts if Node is not allowed to resolve parent folders. That is an environment
  permission issue, not necessarily a code issue.

## Development Style

- Keep Playwright in Electron main only.
- Keep `src/types/index.ts` dependency-free.
- Do not drop/recreate live DB tables for migrations.
- Catch scraper failures per source.
- Keep README updated after meaningful architecture or release changes.
