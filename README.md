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
- Current version: see `package.json` (currently `1.2.1`)
- Release target: GitHub Releases at `RoglMarcel/insider-whale-terminal`
- Local folder: `C:\Users\8marc\Desktop\Insider`
- Source repo: `RoglMarcel/insider-whale-web` — this is the whole codebase AND
  the hosted site. `RoglMarcel/insider-whale-terminal` holds desktop releases
  only (no source), which is why the auto-updater points there.
- Releases are built locally (`npm run dist:win`) and uploaded to GitHub
  Releases; pushing to `main` is what redeploys the website.

- **v1.2.2** (Current) — line-by-line audit of the scoring model and the pipeline
  - **Test suite where there was none.** Vitest + 288 tests: every pure function,
    every threshold from *both* sides, and the invariants the model only ever
    claimed in comments (score finite and in `[0,100]` for any input, no `NaN`
    anywhere, every multiplier exactly `1.0` when neutral, scoring pure and
    deterministic, options score `< 2×` the best print, monotone in each factor).
    Plus a golden file of 15 fixed aggregates so any model change becomes visible.
  - **CI quality gate.** `scrape.yml` was the only workflow — no typecheck, no
    test, no scoring check anywhere before deploy. New `ci.yml` runs typecheck,
    tests, `verify:scoring` and both builds on every push and PR.
  - **`npm run typecheck` now actually covers `scripts/` and `tests/`** (~5000
    previously unchecked lines, including `verify-scoring.ts` and
    `analyze-score.ts`). It surfaced 18 real type errors, all fixed.
  - **Scoring correctness.** `NaN` could reach `finalScore` (and then read as
    `LOW`); `scoreTicker` mutated its input and was **not idempotent** — a trade
    with 1 share and a $5M value scored 57.1 on the first call and 0 on the
    second, which is exactly what the shadow-config path does; the context
    multipliers **inverted** on a net-negative leg sum (a 0.85 track record scored
    73.1 where a 0.20 record scored… higher, 73.1 vs 69.2); `perInsiderValue`
    divided by *all* insiders while the cluster counted only the last 30 days, so
    two extra genuine old buys *lowered* the score 39.4 → 31.7. All fixed, with a
    measured blast radius of **1 of 689 live signals** and no tier change.
  - **The "the score is inverted" finding is largely a measurement artifact.**
    55% of the labeled 10-day rows had no scoring content at all (a ticker that
    entered only because one member of Congress bought it), they are mega-cap
    heavy and occupy the whole low end of the score range, and observations are
    strongly clustered by ticker (ρ ≈ 0.45–0.77). Partitioning the sample and
    correcting for the effective sample size turns `IC(10d) = −0.079, t = −3.00`
    into `t = −1.95`, and restricting to real signals turns `IC(20d) = −0.149,
    t = −4.51` into `IC = −0.015, t = −0.20`. What remains is honest and weaker:
    within real signals the score does **not** rank, and the insider universe
    trailed SPY by ~1.7% over 20 days in this regime. See
    `tmp/audit/MONOTONICITY.md`.
  - **Garbage tickers no longer become signals.** `-` (carrying a $6M trade),
    `NVDAEARNINGS` (a $5.4M "call" scoring 17.3), `3.MONTHMATURE`, `GLASFUNDS`,
    `TE1`, plus Finviz's doubled-first-letter symbols (`BBRK-A`, `DDGICA`,
    `GGLIBA`, `LLILAK`, `FFCNCA`). Shared shape validation + share-class
    canonicalization; the Finviz repair now reads the quote link positionally
    instead of by cell text, which is why it kept missing exactly those symbols.
  - **A missing transaction-type column no longer means "open-market buy".**
  - **Data-quality monitor.** Per source and run: rows, unparseable tickers and
    dates, missing values, unknown types, missing roles — persisted, warned about
    above 20%, and shown as an "unusable" column in Source Health. A source whose
    column moves used to look perfectly healthy by row count.
  - **`npm run analyze:score` ran nowhere locally** (hard-coded `node` against an
    Electron-ABI build). It now picks the runtime that can load the native module.
  - **The breakdown UI told three lies:** it showed `raw / maxPossibleRaw` next to
    the score as if normalization were linear (6% displayed where the score was
    61.8), it printed the *legacy* flat politician bonuses (+45/+25/+20) for a
    model that applies gated soft multipliers (×1.25/×1.18/×1.15), and it never
    showed the options timing multiplier at all.
  - Full audit under `tmp/audit/` (inventory, dataflow, formula-by-formula math,
    factor plausibility, monotonicity hypotheses, engineering findings, report).
- **v1.2.1**
  - **German / English UI.** Language switch in the header, where the light/dark
    toggle used to be (the app is dark-only now). 320 keys in `src/lib/i18n.ts`;
    `en` is the source of truth and `de` is typed as `Record<TKey, string>`, so a
    missing German key is a compile error rather than a silent English fallback.
    Startup language comes from `localStorage`, else the browser locale.
    Domain terms deliberately stay English — "Conviction" is the scoring model's
    own term and German "Überzeugung" means a personal belief, which reads wrong
    for a computed rating; same for the HIGH/WATCH tier names and "Track Record".
  - **News tab hidden on the web build.** It is fed by the desktop X scraper, so
    the hosted build never had rows for it. Still present in the desktop app.
  - **Quiver name/title parsing fixed.** Quiver now renders the name and the job
    title as two sibling nodes with no separator, so `textContent` yielded
    `"Genner Gareth NevilleChief Executive Officer"` and the old split-on-last-dash
    never fired. The same insider then appeared twice in the track-record panel —
    once clean, once glued and without a history link. Split is now anchored on
    the title vocabulary (not a lowercase→uppercase transition, which would wreck
    "McDonald"), and `normalizeInsiderName` learned the full C-suite titles so
    glued rows dedupe against clean ones. Rows already stored stay wrong until
    re-scraped; dedup collapses them regardless.
  - **Fair-value feature removed.** Both providers (AlphaSpread, ValueInvesting.io)
    are gone: UI section, scrapers, login entries, `valuation_cache`, IPC and the
    pre-warm phase — 639 lines. `getValuationMultiplier` is deliberately KEPT in
    `electron/scoring.ts` as a dormant seam: with no source, `upsidePct` is always
    undefined and it returns a neutral 1.0, and it is one of the twelve components
    `backtest-components.ts` tracks. Side effect: confidence loses its 5-point
    valuation term, so the practical ceiling is 95, not 100.
- **v1.2.0**
  - **Desktop → web auto-publish.** A scrape in the desktop app now pushes its own
    signals into `data/insider-tracker.db` and lets CI redeploy — previously the
    two apps owned separate SQLite files and a desktop scrape was a dead end.
    Snapshots via SQLite's online-backup API rather than copying the file, because
    the app runs in WAL mode and a plain copy silently yields stale rows. The
    commit is pathspec-limited to the DB so an unattended push can never sweep in
    unrelated staged work, and marked `[desktop-publish]`.
  - **CI fast path.** The workflow greps that marker and skips its own scrape,
    Chromium install and outcome labeling, publishing straight from the pushed DB
    via `npm run publish:data`. Measured: **2.0 min vs 5–6.7 min**, and the
    desktop's login-gated options flow reaches the site intact instead of being
    overwritten by a weaker cloud scrape.
  - **Insider trades are persisted (`insider_trades`).** Every source is a "latest
    filings" feed, so before this a trade existed only while its source page still
    listed it. A real $1M PFE CEO buy dropped out of its own signal on day 7 and
    the score fell to 0.0 — while the 90-day `insider_flow` panel still showed its
    dollars, contradicting itself. Aggregates now build from a trailing 30-day
    window (the same window `getClusterMultiplier` counts over), seeded once from
    signal history so the first run isn't scored against an empty table.
  - **OpenInsider window 7 → 14 days.** `cnt=500` is the binding ceiling, not `fd`:
    measured 2026-08-21, fd=7 → 184 rows, fd=14 → 422, fd=21 → 500 (capped, silently
    truncating the oldest filings). With persistence the window is only redundancy
    margin, and a guard warns if the cap is ever hit.
  - **Silent zero-row scrapes now fail loudly.** OpenInsider swallowed page errors
    into an empty array, which logged as a healthy run and zeroed every signal it
    was carrying — 3 of 11 CI runs, all in the same 14:37 UTC slot, none flagged.
    It throws now, and source health gained a `flapping` state for sources that
    return zero intermittently; the consecutive-runs rule could never see those.
  - **CEOWatcher source (`instagram.com/ceowatcher`).** Caption-only — the post
    media is never fetched. Parses both formats (numbered digest with names,
    shares and prices; single-alert with role and a rounded total). Captions carry
    no transaction date, so rows are reconciled against authoritative ones by
    ticker + insider over a ±10-day window instead of an exact-date dedup key —
    otherwise the same Form 4 would double-count. Off by default in CI.
  - **Score breakdown separates "no data" from "bad data".** With zero
    scoring-eligible trades the insider factors now render `—` instead of `0 / 10`
    and `× 0.00`, which read as a verdict on the ticker. Undated signals also stop
    collecting a full freshness multiplier — missing data used to outscore present
    data.
- **v1.1.17**
  - Closed the remaining mobile gaps: 0 tap targets under 44px, 0 text under 12px,
    welcome-modal fix, shared swipe-to-dismiss hook.
- **v1.1.16**
  - Phase 4+5: dropped a 5.3MB unused intro video, lazy-loaded Recharts, added a
    PWA manifest, fixed mobile chart axes.
- **v1.1.15**
  - Phase 3: mobile dashboard (2×2 stat grid, filter sheet, card typography),
    detail sheet, tables rendered as cards.
- **v1.1.14**
  - Mobile shell: bottom tab bar, safe areas, touch targets; History view wired up
    on the web build.
- **v1.1.13**
  - **Labeled training data (`signal_outcomes`).** New table + `npm run label:outcomes`
    records, for every ripened signal, the realized 5/10/20-day SPY-relative alpha,
    with the score frozen at FIRST sighting so labels can't inherit hindsight. Wired
    into the CI run, so the dataset now grows by itself. Bootstrapped from the
    desktop pre-migration backup (3029 rows, 2026-07-10 → 08-14): **3,949 labeled
    outcomes** (5d n=1590, 10d n=1442, 20d n=917) — past the n≈780 needed to detect
    an IC of 0.10. Newest-first ordering keeps delisted tickers from eating the
    per-run budget.
  - **Honest measurability report.** The labeler prints how often each component
    actually *varies*: earnings timing 45%, insider rank 36%, freshness 35% →
    measurable; options 9.5%, cluster 8.1%, track record 3.8%, combo 1.7%,
    **VIX 0%, valuation 0%** → not measurable. The earlier "no alpha" verdict for
    those was largely *unmeasurable*, not *disproven*.
    - Note (v1.2.2 audit): these percentages measure how often a component
      *varies*, which is not the same as its share of the score's spread. Measured
      against `log(insiderRaw)` the variance shares are: dollar volume 60.0%,
      insider rank 18.3%, freshness 13.3%, cluster 7.9%, earnings timing 0.7%.
  - **`npm run analyze:score` — does a high score mean anything?** Spearman IC with
    SE/t-stat plus per-bucket alpha and hit rate. First result on real data: the
    score is **non-monotonic** — IC is significantly NEGATIVE at 10d (−0.079, t=−3.0)
    and 20d (−0.149, t=−4.5), driven by the 20–59 band underperforming (−2.6% to
    −3.5%), while 60+ looks strong (+2.5% to +9.8%) on samples far too small (n=2–15)
    to trust. Recalibrating on this would be overfitting; more data is the only fix.
    - **Correction (v1.2.2 audit):** this reading does not survive scrutiny. The
      sample mixed real signals with content-free rows, and the SE ignored that
      observations cluster by ticker. Corrected: `t(10d) = −1.95` (not −3.0), and
      restricted to real signals `IC(20d) = −0.015, t = −0.20` (not −0.149,
      −4.51). See `tmp/audit/MONOTONICITY.md`.
- **v1.1.12**
  - **GuruFocus disabled in `publish:web`.** It hard-fails every run on a Cloudflare
    challenge that never clears (headed retry included) — and the repeated attempts
    got the publishing machine's residential IP blocked outright ("Sorry, you have
    been blocked"). Skipped by policy; remove it from `SKIP` to re-enable.
    **Superseded (2026-08-31): the source was removed from the codebase entirely —
    the `SKIP` hook it refers to no longer exists.**
  - **Purged 33 corrupted tickers using the SEC registry as the oracle.** The earlier
    duplicate-proof purge couldn't clear leftovers like `AAAT` (which ranked 4th by
    score). Rule: doubled first letter **and** absent from `company_tickers.json`
    **and** the de-doubled form is registered. Real doubled-letter tickers were
    verified and spared: AAT, BBBY, CC, CCL, EEFT, QQQ, RRBI, VVV.
- **v1.1.11**
  - **Fix: stat cards described a different set than the grid.** The search box was
    Dashboard-local state applied *after* `stats` were computed from
    `filteredSignals`, so the header could read "308 signals · 12 on watch · 17
    options" while a search left 2 cards visible. `search` is now part of
    `SignalFilter` and handled inside `filterSignals`, so the cards, the grid and the
    stats are always the same set. Verified: search "am" → header 32 / 1 on watch /
    2 options, grid 32.
  - **Fix: politician combos didn't count as combos.** `POLITICIAN_INSIDER` /
    `_OPTIONS` / `MEGA_SIGNAL` render a COMBO badge on the card, but `stats.combos`
    and the `type=combo` filter checked only the classic `comboSignal` — so the
    header said "0 combos" while three cards showed one, and the Combo filter came
    back empty. New shared `isComboSignal()` in types is used by the filter and the
    stats. Verified on live data: combos 0 → 3 (MSFT, CEG, BRK.B).
- **v1.1.10**
  - **Options premium ladder now resolves above $2M (live scoring change).** The top
    rung was a flat 18 for *any* premium over $2M, so a $12.5M print scored exactly
    like a $7.4M one. On mega-caps that erased the size advantage and could flip a
    bull-dominated tape to "net bearish" — observed live on NVDA ($14.3M calls vs
    $11.8M puts scored −3 → "🐻 put-dominated"). New rungs: **>$10M → 26, >$5M → 22,
    >$2M → 18**; everything below $2M is unchanged. NVDA now scores **+5.3 (net
    bullish)**, matching the actual premium split.
  - **Ceilings can no longer drift.** `MAX_SINGLE_OPTION_POINTS` hardcoded the base
    18; it now derives from a shared `MAX_OPTION_BASE_POINTS` used by the ladder
    itself, so the breakdown progress bars stay in sync with the model.
    `MAX_POSSIBLE_RAW` (display reference only — it never divides a real score) moves
    2662 → 2855; `verify:scoring` updated accordingly. All scoring checks pass.
- **v1.1.9**
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
  - **Performance & Reliability**: sources scrape in a concurrency-3 pool, ticker meta (market cap/sector/earnings) cached 24h in SQLite, fetch timeouts + retry/backoff everywhere, scheduled-task DST self-healing, WAL checkpointing, and prepared-statement reuse.
- **v1.0.38**
  - **Calibrated Scoring Model**: Replaced linear normalization (`MAX_POSSIBLE_RAW`) with a saturating sigmoid curve (`SCORE_HALF_SATURATION ≈ 105`) mapped to a strong-but-plausible signal baseline (≈420 raw). This prevents insider-only signals from being compressed into single digits and resolves the issue where the `comboBonus` dominated the conviction level.
  - **Relative Buy Sizing**: Buy trade sizes are now evaluated relative to market cap when known, rather than absolute dollar volumes, for fairer scoring.
  - **Accurate Track-Record Metrics**: Fixed 3-month track record outcomes (now correctly using +90 days calendar returns rather than a 30-day proxy) and corrected the `accuracy6m` denominator to only count trades old enough to have a 180-day outcome.
  - **Backtesting Harness**: Added a backtest script (`npm run backtest`) to evaluate stored signals against realized S&P-relative returns.
  - **Robust Scheduling & API Fetches**: Awaits VIX quotes before starting scheduled scans, limits concurrent stockanalysis earnings checks (max 6), and pools Chromium instances for track-record crawls (max 2) to prevent CPU spikes.
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
scraper. Two real ways to get account-gated sources (options flow,
Finviz Elite, X…) into the site:

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
   X is easily rate-limited or banned — the account risk is the user’s.

### Keeping login-gated sources fresh (Variante B)

The cloud runs only 🟢 sources. To add options flow / X to
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
- Run scrapes.
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

electron/prices.ts
  The one place adjusted closes enter the codebase (Yahoo chart API + the
  plausibility screen). Shared by performance.ts, label-outcomes.ts and the
  testing portfolio.

electron/portfolio.ts
  Testing portfolio, I/O side: candidates, price-cache top-up, persistence.

src/lib/portfolio-rules.ts
  Testing portfolio, RULES side — pure and dependency-free, which is what makes
  "no look-ahead" and "deterministic" unit-testable (tests/portfolio.test.ts).

electron/auth.ts
  Platform login/session system. Stores encrypted Playwright storageState.

electron/scraper/index.ts
  Scrape orchestrator: source gating, merge, dedup, earnings, scoring, DB insert.

electron/scraper/browser.ts
  Playwright launch/context helpers, including authenticated storageState.

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
| Insider-Monitor | Daily Form 4 purchase digest (B/AB/S/AS codes) | Public |
| Quiver Quantitative | Near-real-time insider feed with names + titles | Public |
| CEOWatcher (Instagram) | Curated notable insider buys, parsed from post captions only | Public, off by default in CI |
| Barchart | Unusual options activity | Login unlocks source in Settings |
| MarketBeat Options Volume | Unusual call/put volume vs average (context only, no premium) | Public |
| OptionStrat | Options flow | Login required before scraping |
| InsiderFinance | Options flow | Login required before scraping |
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

Relevant implementation:

- `electron/auth.ts`
- `electron/scraper/browser.ts`
- `electron/scraper/index.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/Settings/PlatformLogins.tsx`

## Scoring Model

Implemented in `electron/scoring.ts`; the shared constants and pure helpers live
in `src/types/index.ts`. Both are dependency-free and fully unit-tested
(`npm test` — 288 tests including the invariants below).

### The formula, exactly as the code computes it

```text
insiderRaw =
  rankWeight                 // 1…10, from the insider's title
  * dollarVolumePoints       // 1…20; per-insider average over the LAST 30 DAYS,
                             //   market-cap-relative when the cap is known,
                             //   absolute dollar buckets when it is not
  * transactionTypeModifier  // 0…1, value-weighted over eligible trades
  * clusterMultiplier        // 1.0 / 1.5 / 2.0 / 3.0 for 1 / 2 / 3 / 4+ insiders
  * insiderEarningsMultiplier// 1.0…2.34
  * vixMultiplier            // smooth ramp 1.0 → 1.15 as VIX goes 20 → 35

optionsRaw =
  detailedOptionsScore       // signed: bullish minus bearish, geometric decay
  * optionsEarningsMultiplier// 1.0…2.0

legSum =
  insiderRaw * insiderFreshness + optionsRaw * optionsFreshness

coreCombined =
  legSum > 0
    ? legSum * trackRecordMultiplier * valuationMultiplier   // 0.85…1.2 · 0.9…1.15
    : legSum                        // context multipliers never amplify a
                                    // contra-signal (see "Monotonicity" below)

combined = coreCombined + politicianScore          // congressional leg, >= 0

norm     = 100 * max(combined, 0) / (max(combined, 0) + SCORE_HALF_SATURATION)

finalScore =                                       // LIVE model (v1.0.46+)
  clamp(norm >= CORROBORATION_GATE && softMult > 1 ? norm * softMult : norm, 0, 100)

legacyScore =                                      // shadow comparison only
  clamp(norm_legacy + flatComboBonus, 0, 100)
```

`softMult` is the corroboration multiplier — `1.20` for a classic
insider+options combo, `1.18` / `1.15` / `1.25` for the three politician-combo
tiers — and the tiers do **not** multiply with each other (`Math.max`, never a
product). `CORROBORATION_GATE` is `50`, i.e. a corroboration bonus applies only
once the signal already reads at WATCH on its own; below that the badge shows but
the score is untouched.

### Normalization

`combined` maps to 0–100 through a **saturating curve**:

```text
score = 100 · raw / (raw + SCORE_HALF_SATURATION),  SCORE_HALF_SATURATION = 105
```

anchored so a strong-but-plausible signal — a top-exec buy in a ~3-insider cluster
heading into earnings, ≈ 420 raw — lands exactly on the HIGH threshold
(`100·420/525 = 80`). Note the consequence: the curve only asymptotes toward 100,
so even the theoretical maximum of every factor at once (`MAX_POSSIBLE_RAW ≈
2855.04`) yields **96.45**, and a score of 100 is reachable only via the
corroboration multiplier and the final clamp.

The earlier `/ MAX_POSSIBLE_RAW` linear normalization divided by the product of
every factor's theoretical maximum — a combination that essentially never
co-occurs — which crushed real insider signals into single digits and let the flat
combo bonus decide the tier on its own. `MAX_POSSIBLE_RAW` is kept only as a
display reference.

### Invariants (enforced by `tests/invariants.test.ts`)

- `finalScore` is a finite number in `[0, 100]` for **every** input, including
  `NaN`, `Infinity`, empty aggregates and future-dated trades.
- No `NaN` or `Infinity` ever reaches the score or any breakdown field.
- Every multiplier returns exactly `1.0` on neutral input.
- Scoring is **pure**: it never mutates the aggregate, and two calls with the
  same input and the same clock return bit-identical results.
- The per-direction options score is strictly below `2 ×` the best single print.
- The score is monotone non-decreasing in track record, valuation, VIX, the
  number of buying insiders, buy size and bullish premium; monotone
  non-increasing in signal age; and adding a bearish print never raises it.

### Monotonicity caveats that are deliberate

- The corroboration gate is a **step**: at `norm = 49.9` the score is 49.9, at
  `50.0` it is 60.0. Monotone, but a 20% jump at the threshold.
- The options earnings multiplier amplifies **bearish** flow too — a
  put-dominated tape into earnings reads as more negative, not less.
- `getDollarVolumePoints` uses two different scales depending on whether the
  market cap is known. The same $5M CEO buy scores 14 points (score 57.1) with no
  cap and 1 point (score 8.7) on a $2T cap. Market-cap coverage is ~62%, and this
  factor carries ~60% of the variance of `log(insiderRaw)`, so a meaningful part
  of the score's spread reflects **data availability**. This is a known open
  issue, documented in `tmp/audit/MONOTONICITY.md` (H1); it has not been changed,
  because every candidate fix moves scores broadly and that is a product
  decision, not a cleanup.

### Conviction tiers

- `HIGH`: score >= 80
- `WATCH`: score >= 50
- `LOW`: score < 50

### What the calibration data does and does not say

`npm run label:outcomes` records realized SPY-relative alpha for ripened signals;
`npm run analyze:score` reports the Spearman IC. Read that report with three
things in mind, all of which it now prints itself:

1. Rows with **no scoring content** (no eligible insider trade and no options
   score — e.g. a ticker that entered only because one member of Congress bought
   it) are a different universe and are reported separately. They were 55% of the
   10-day sample and dominated the low end of the score range.
2. Observations are **not independent** — the same ticker recurs daily and the
   holding periods overlap (measured intra-cluster correlation ρ ≈ 0.45 at 10d,
   ρ ≈ 0.77 at 20d). The report derives an effective sample size and computes `t`
   from it; on the full sample this turns `t(10d) = −3.00` into `−1.95`.
3. All labeled outcomes come from a **single market regime** (2026-07 to 2026-08).
   The out-of-sample split is a time split *within* that regime — it shows
   stability, not generalization. An improvement measured on this data is not
   evidence of an edge.

### Major scoring factors

| Factor | Range | Variance share of `log(insiderRaw)` |
|---|---|---|
| Dollar volume (per insider, 30d) | 1–20 pts | 60.0% |
| Insider role rank | 1–10 | 18.3% |
| Freshness / time decay | 0.15–1.0 | 13.3% |
| Cluster buying | 1.0–3.0 | 7.9% |
| Earnings countdown (insider leg) | 1.0–2.34 | 0.7% |
| Transaction type weighting | 0–1.0 | 0.0% (acts as a filter) |
| Insider track record | 0.85–1.2 | −0.2% |
| VIX (ramp from 20, not a cliff at 25) | 1.0–1.15 | **0.0% — never active in the data so far** |
| Valuation | 0.9–1.15 | **0.0% — dormant, no provider wired** |
| Detailed options flow | signed | own leg |
| Congressional leg | additive, >= 0 | rarely non-zero |
| Corroboration multiplier | 1.0–1.25 | **never fired in 10,541 stored signals** |

The three "never active" rows are **not disproven** — they were never testable.
They are kept and instrumented rather than removed.

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
18. ~~Fair-value undervaluation folded into the score~~ — removed in v1.2.1; the
    multiplier remains in `scoring.ts` as a dormant seam (always 1.0).
19. Net-bearish options representation and insider sell/disposal awareness.
20. "Follow this signal" P&L, sector context, ticker-tagged news in the detail modal.
21. CSV export of the current signals, and score-surge (delta) desktop alerts.
22. **Testing portfolio (v1.4.0)** — a simulated $10,000 book of the strongest
    signals plotted against the S&P 500, with its own tab, an auditable rule set
    and an append-only equity curve. See "Testing Portfolio" below.

## Testing Portfolio

A simulated, rule-based book that "invests" $10,000 in the terminal's strongest
signals and plots itself against the S&P 500. Its own tab, both builds, en + de.

It is a **measuring instrument, not a product feature**. A flattering number
here is worth nothing; an honest negative one is worth a lot. Everything below
exists so a sceptic can check the arithmetic rather than trust the chart.

**The book opens on 2026-09-01** (`PORTFOLIO_INCEPTION`). Everything before that
date was a *backfill* — the rules replayed over signal history that had already
happened — and a backfill can only ever be a rehearsal: the entry threshold, the
barriers and the hold cap were all chosen while that history was on screen, so
it cannot also be the evidence for them. From inception the book only ever acts
on signals that arrived after the rules were fixed. A signal older than the
inception date is **dropped, not deferred**: buying a seven-week-old sighting on
opening day would price in a move the book never took part in, and it would land
on day one where it reads as alpha.

`inceptionDate` is part of the stored config rather than a constant, so moving
it invalidates the curve through the same check every other rule uses — a book
that opens on a different day is a different book. Set it to `null` to go back
to "as far back as the data reaches".

Full write-up, current figures and the parameter sweep: [`docs/portfolio/REPORT.md`](docs/portfolio/REPORT.md).
Where the **exit rules** come from — the insider-return literature, the settings
table and the holding-period curve: [`docs/portfolio/EXIT-STRATEGY.md`](docs/portfolio/EXIT-STRATEGY.md).

### The rules

| | |
|---|---|
| Starting capital | $10,000 |
| Entry | score ≥ **70** on first sighting, at that session's closing price |
| Position size | `clamp(3% × (1 + (score − 70) / 16), 2%, 6%)` of **current** equity — score 70 → 3.0%, 78 → 4.5%, 86+ → capped at 6%. A position that cannot be funded to the 2% floor is **rejected, not opened underweight** |
| Exits (first barrier wins) | **no take profit — the upside is never capped**, stop loss **−25%**, trailing **20%** below the highest close once **+25%** up, time stop **90 calendar days** |
| Priority when several break on one day | stop loss → trailing → take profit → time (the most pessimistic reading of a daily bar) |
| Limits | max 30 open positions · one position per ticker, no averaging up · 10-day lockout after a sale · $100 minimum ticket |
| Uninvested capital | held in **SPY** (`cashPolicy: 'spy'`) |
| Costs | $0 commission, **0.05% slippage per side** on every fill including the SPY cash leg |
| Benchmark | SPY buy & hold, same start day, same $10,000, same entry slippage |

Every parameter is a named constant in `src/types/index.ts` and editable at
runtime — open "Rules & assumptions" on the Portfolio tab and press *Edit rules*
(desktop only; the hosted build reads a curve it cannot recompute). Applying
triggers a full rebuild, and the parameter set is stored **with** the curve, so a
chart can never be labelled with values it was not computed from.

**Why 70 (v1.5.1), and why not by returns.** The old 74 was picked by hand, and
its stated justification ("the level at which the labeled outcomes still show a
clear alpha edge") does not survive `npm run analyze:score`. Restricted to rows
with scoring content and with cluster-robust errors, score→alpha is noise at
every horizon (5d IC +0.052 `t=1.89` · 20d −0.023 `t=−0.43`), and mean 10-day
alpha above 70 (6.69%, n=13) is indistinguishable from above 74 (6.44%, n=9).
**No threshold in this range can be justified by returns yet** — `portfolio:sweep`
prints the same warning, and its sign flips between adjacent rows.

So it is set on what the data does resolve: signal supply against the book's
capacity, via Little's Law `L = λW` over 2026-07-10 → 08-26.

| Threshold | λ (distinct tickers/wk) | L at the 90-day hold cap | of 20 slots |
|---|---|---|---|
| ≥ 66 | 2.38 | 30.6 | 153% ✗ |
| ≥ 68 | 1.79 | 23.0 | 115% ✗ |
| **≥ 70** | **1.34** | **17.2** | **86%** ✓ |
| ≥ 74 | 1.04 | 13.4 | 67% |

70 is the highest threshold that fills the book without over-subscribing it.
Over-subscribing is the worse error — signals past the capacity are silently
rejected, biasing the measurement the portfolio exists to make — while 74 parked
a third of the capacity in SPY permanently, so a third of the "result" was never
a test of the signals at all.

**Correction (v1.5.2):** the "of 20 slots" column compared demand against
`maxPositions`, and `maxPositions` was never what limited this book — see
"Why the sizing, not the cap" below. Read against the capacity that actually
existed, ≥ 70 was at 115%, not 86%. The threshold stays at 70 and the sizing was
fixed instead; nothing in the derivation depended on the cap being the limit,
only on the limit being ~20, which it now is.

### Why the sizing, not the cap (v1.5.2)

`maxPositions` and the position weights are the same constraint written twice,
and the tighter one wins. Cash parks in SPY, so the book is always fully
invested and can fund about `1 / mean(target weight)` positions before
`available()` runs dry. Past that point entries are rejected as
`skipped_no_cash` and the position cap never gets a say.

Measured against the 16 distinct tickers that have crossed 70 (scores 70.4 …
85.1), on 2026-09-01:

| base / min / max | mean target weight | positions the book can fund |
|---|---|---|
| 5% / 3% / 10% | 6.56% | **15.3** — shipped through v1.5.1 |
| **3% / 2% / 6%** | **3.93%** | **25.4** — now |

Demand, by the same Little's Law: λ over 2026-08-04 → 09-01 is **2.17** distinct
tickers/week (1.60 over the original 07-10 → 08-26 window — the rate rose), so
at the 90-day hold cap `L = 2.17 × 90/7 = 27.9` positions in steady state.

A book that could fund 15 against a demand of 28 had to reject roughly a third
of every signal it was built to measure — and reject them *exactly when several
arrive at once*, because that is when the funding is tightest. Signal clusters
are the correlated part of the sample, which is the one kind of loss a measuring
instrument cannot absorb. `maxPositions` 20 → 30 on its own changes nothing
(simulated: identical entries, identical rejections); the weights are the fix,
and the cap now sits just above `L` as a backstop.

The book is deliberately flatter than a conviction book would be. Within real
signals the score does **not** rank returns (5d IC +0.052 `t=1.89` · 20d −0.023
`t=−0.43`), so concentration buys variance without expected return — and the
v1.4.0 measurement was already dominated by one name, where a single trade
(GLSI, +$133.32) exceeded the entire lead over SPY (+$102.32). More, smaller,
and none rejected is what this book is for.

This changes what each trade contributes to the equity curve. It does **not**
change which signals are taken or how long they are held — those are the rules
under test, and they are untouched. `maxHoldDays` stays at 90 for the same
reason: shortening it would yield more closed trades by year end, but the
holding period is the rule being measured, and more `n` bought by changing the
treatment is a different experiment, not more power.

**The floor is now enforced on the funded size, not just the target.**
`positionSize` clamps the *target* to `minWeight`, but the fill is
`min(target, available)` and that clamp was checked against `minTicket` alone —
so a nearly full book could open a position at 1% of equity where the stated
floor was 3%, silently, and precisely during the signal clusters above. A
position that cannot be funded to the floor is now rejected and recorded;
`verify:portfolio` checks the invariant against the stored book. Rejecting costs
an observation, which is a real price for a measuring instrument and is why it is
paid explicitly: a rejection is a counted event, an underweight fill is a chart
that does not match its own rules card.

Two properties confirm the level rather than choosing it: 70 sits at p99.21 of
content-bearing signals (74 at p99.45) inside the *same* 60–79 bucket, which is
the best-performing bucket with n ≥ 30 at both 5 and 10 days — so this moves
within measured ground, not past it. And it makes the sizing ramp reachable:
`maxWeight` binds at `entryScore + scoreSpan`, which at 74 was 90, above the
all-time high score of 85.1, leaving the 10% cap as dead code.

This is a decision about statistical power, **not** a claim that 70-scored
signals beat 74-scored ones. Revisit at ~20 closed trades.

**Why not `CONVICTION_THRESHOLDS.high` (80):** only 3 ticker-days in the entire
stored history have ever reached 80. Reusing that constant builds a book that
essentially never trades.

**Why there is no take profit (v1.5.0):** individual stock returns are strongly
right-skewed, so the minority of positions that run far past any round number
carries more than the whole expected return — measured on our own labeled
outcomes, the top decile of signals accounts for 145–732% of total alpha, and the
rest nets negative. A +20% cap sold exactly those first while losers ran to the
full stop, which is the disposition effect written into a config constant. The
upside exit is the trailing stop, which cannot truncate a trend that is still
going. Sources and arithmetic: [`docs/portfolio/EXIT-STRATEGY.md`](docs/portfolio/EXIT-STRATEGY.md).

**Upgrading from v1.4.0:** the exit constants alone do not reach an installation
that has ever used *Edit rules*, because `app_settings.portfolio_config` is merged
over the defaults. A one-time migration resets exit values that still equal the
v1.4.0 defaults and keeps any you changed yourself; the curve then needs one
`npm run portfolio:sync` to be recomputed.

**Why cash sits in SPY:** at roughly half an entry per trading day the book is
mostly uninvested, and uninvested cash loses to a rising index by construction —
which would answer a question nobody asked. Holding the index instead makes the
portfolio "S&P 500 + signal overlay", so the gap to the benchmark is the
contribution of the signals and nothing else. The uninvested-cash variant is
still computed on every run (`equity_idle`) and can be switched on as a third
line in the chart.

### Assumptions, stated because they matter

- **Adjusted daily closes only.** Splits and dividends are inside them; a raw
  close turns a 2:1 split into a −50% day that every stop would act on. No
  intraday prices, no highs or lows — a stop filled at a low you could never
  have traded is fiction.
- **No look-ahead.** A position opens at the earliest close that was still
  *ahead* of the moment the signal became visible in the terminal
  (`signals.scraped_at`), never at the insider's trade date and never at the
  filing date. A sighting at or after 20:00 UTC prices at the *next* session.
- **Backfill is deliberately pessimistic.** Signals reconstructed from
  `signal_outcomes` carry a date but no time, so they are entered one session
  later than the date they carry. That can only cost return, never add it. Since
  the 2026-09-01 inception the live book contains no backfilled days at all, so
  the rule now only matters if `inceptionDate` is moved back.
- **Fractional shares** are allowed, so a $1,500 share price cannot distort the
  weighting.
- **No taxes, no withholding tax.** Adjusted prices contain gross dividends.
- **Trading days come from the data**, not from a holiday list: a date with no
  price is not a trading day. Entries and exits slide to the next session with a
  price, up to 5 calendar days; past that the series counts as gone.
- **Tickers without price data are reported, not dropped.** They appear in the
  UI under "not tradable" so survivorship bias is visible rather than silent.

### Limits of the claim

The stored signal history is about six weeks and produces a single-digit number
of entries at the default threshold. Every figure the tab prints rests on a
handful of trades. Treat it as a direction, not a result — and read the
"how sure is this" section of the report before quoting any of it.

Windows with less history than the window is long print `n/a · N days to go`
and their range button is disabled. There is no extrapolation anywhere.

### Commands

```bash
npm run portfolio:sync              # incremental: price cache + new days
npm run portfolio:sync -- --rebuild # wipe the simulation and recompute
npm run portfolio:sweep             # sensitivity across thresholds/barriers (read-only)
npm run verify:portfolio            # 20 audit checks against the real DB (read-only)
```

On the desktop app the sync runs automatically after every successful scrape
(fire-and-forget: a Yahoo timeout can never turn a good scrape into a failed
one). In CI it runs after `label:outcomes` and before `build:web`, guarded with
`|| echo` so it can never block a deploy, and publishes
`public/data/portfolio.json` for the hosted build to read.

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
- `insider_trades` — the pipeline's memory (v1.2.0). Aggregates build from a
  trailing 30-day window of this table, not from whatever the current scrape
  happened to return.
- `insider_flow` — same-company 90-day buy/sell totals + Form 144 notices.
- `politician_trades`, `filing_events`, `ticker_meta`, `live_news`
- `signal_outcomes` — labeled training data (see `npm run label:outcomes`).
- `price_history` — adjusted-close cache (ticker, date). Every price the
  testing portfolio uses is read from here, so a Yahoo outage cannot reshape a
  stored curve and a re-run costs one request per ticker per day. A ticker is
  always rewritten from a SINGLE fetch: adjusted closes are restated for the
  whole history after a split, and appending to old rows would weld a pre-split
  series onto a post-split one.
- `portfolio_equity` — one row per trading day. **Append-only**: a day that has
  been written is never rewritten, so a later price restatement cannot move a
  point somebody already looked at. Drift is counted and reported instead.
- `portfolio_positions`, `portfolio_events` — the simulated trades and the
  skip/miss log. A projection of the same deterministic run as the curve, so
  they are rewritten whole each time (except `suspect_price` events, which
  record what a price fetch rejected and no simulation could reproduce).

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
npm run verify:portfolio  # testing-portfolio audit (read-only)
npm run backtest      # replay stored signals vs realized S&P-relative returns
npm test              # 349 unit tests (pure modules only)
```

Notes:

- `verify:db` runs under Electron because `better-sqlite3` is built for Electron.
- `verify:scrape` needs network access and Playwright Chromium.
- `verify:portfolio` opens the DB read-only and checks the NAV identity on every
  day, that the curve has no gaps against SPY's own calendar, that the benchmark
  really is a plain buy & hold, that no ticker is held twice, that the cooldown
  holds, that every position was funded to at least `minWeight` of equity, and
  that re-simulating the stored window reproduces the stored curve.
- In restricted sandbox sessions, `npm run typecheck` may fail before TypeScript
  starts if Node is not allowed to resolve parent folders. That is an environment
  permission issue, not necessarily a code issue.

## Development Style

- Keep Playwright in Electron main only.
- Keep `src/types/index.ts` dependency-free.
- Do not drop/recreate live DB tables for migrations.
- Catch scraper failures per source.
- Keep README updated after meaningful architecture or release changes.
