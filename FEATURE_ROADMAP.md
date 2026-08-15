# Feature Roadmap — What Is Completely Missing

_Third pass, 2026-07-03 · Gap analysis only: nothing here re-reports known issues or tweaks existing features. Everything below does not exist in any form today._

Perspective: what a power user grinding through this terminal daily for six months would name, unprompted, as the holes.

---

### [DATA] — Sell-Side Intelligence (net insider flow + Form 144 early warning)

**What's missing:**
The entire pipeline is buy-only by construction: OpenInsider is queried with `xp=1&xs=0`, Finviz with `tc=1`, EDGAR keeps only code-P transactions. Sales arrive incidentally (Quiver rows, MarketBeat) and are shown as per-signal context — but there is no systematic sell-side collection, no per-ticker **net insider flow** (buys$ − sells$ over a window), and no ingestion of **Form 144** (notice of proposed sale — the *leading* indicator that a large insider sale is coming).

**Why it matters:**
This is the single biggest scoring blind spot. A CEO buying $500k while three other officers dump $20M nets a HIGH conviction score today with only a footnote. The insider literature is unambiguous that the buy/sell *ratio* carries the signal; a buy against heavy same-company selling is a fundamentally different event than a buy in a quiet tape.

**How to build it:**
(1) Add a sales feed: the OpenInsider screener already supports it — `screener?xs=1&xp=0&fd=7&cnt=500`, identical `tinytable` structure the parser handles; EDGAR's `mapOwnershipDocument` needs a sibling that aggregates code-S rows. (2) Store into a lightweight `insider_flow` table `(ticker, date, buy_value, sell_value)` maintained at scrape time. (3) Compute `netFlow90d` per ticker in `buildAggregates` and expose on `TickerAggregate`; surface as a signed chip on the signal card and a `⚠ heavy insider selling` note; after one backtest cycle, wire a multiplier (e.g. sell$ > 5× buy$ over 90d → ×0.8). (4) Form 144: EDGAR `getcurrent&type=144` Atom (same fetch pattern as `edgar.ts`), count-per-ticker into `insider_flow`. Complexity: ~2 days.

**Priority:** High

---

### [AUTOMATION] — Routine vs Opportunistic Insider Classification

**What's missing:**
Nothing distinguishes an insider who buys every March (10b5-1-adjacent habit, diversification, DRIP-like behavior) from one who has never bought before and suddenly writes a seven-figure check. The track-record system stores each insider's historical trade dates already — but never looks at their *calendar pattern*.

**Why it matters:**
This is the strongest research-backed free lunch available (Cohen, Malloy & Pomorski, *Decoding Inside Information*): routine insider trades carry ~zero alpha; opportunistic ones carry nearly all of it. The data to compute it is **already collected** — it's pure computation on `insider_track_records`.

**How to build it:**
In `fetchInsiderTrackRecord` (`electron/scraper/insiderHistory.ts`), before slicing `recentTrades`, classify: an insider with ≥3 purchases in prior years where ≥60% fall in the same calendar month = *routine*; a first-ever purchase or one breaking the pattern = *opportunistic*. Persist a `pattern TEXT` column on `insider_track_records` (existing migration pattern). Surface a badge in `InsiderAccuracyPanel`, and ship it display-only + shadow-scored first (see A/B framework below); target multiplier ≈ ×0.7 routine / ×1.15 opportunistic once backtested. Complexity: ~1 day.

**Priority:** High

---

### [INFRA] — Source Health Monitoring (silent-rot detector)

**What's missing:**
Every scraper fails soft (`.catch(() => [])`) by design — which means when a site redesign breaks a parser, the source silently returns 0 rows forever and nobody notices. `scrape_log.source_breakdown` already records per-source counts per run, but nothing reads it longitudinally. There is no alert, no trend, no "Finviz has returned 0 rows for 9 consecutive runs" anywhere.

**Why it matters:**
For an app whose entire value is scraped data, silent selector rot is the #1 operational risk. The audit found exactly this failure mode (dead stockanalysis regexes) had been shipping in production unnoticed — the *class* of failure remains undetected today.

**How to build it:**
After `finishScrapeLog` in the orchestrator: pull the last ~20 `source_breakdown` rows, compute a per-source rolling median, and flag any enabled source at <30% of its median for 3 consecutive runs. Fire one native notification ("⚠ GuruFocus may be broken — 0 rows for 3 runs") and persist a `health` flag rendered as a red dot in the History tab and Settings source list. All data already exists; this is ~3–4 hours in `electron/scraper/index.ts` + `database.ts`.

**Priority:** High

---

### [DATA] — Equity Stats Pack: Short Interest, Float, Average Dollar Volume

**What's missing:**
No short interest, no days-to-cover, no float, no liquidity measure is collected anywhere. The enrichment fetch already downloads the stockanalysis.com quote page — the companion `/statistics/` page carrying all of these is never touched.

**Why it matters:**
Three distinct wins from one fetch: (1) insider buying + high short interest is the classic squeeze setup and one of the most powerful combo contexts; (2) buy value **as % of float** is a sharper size measure than % of market cap; (3) average dollar volume answers the question the terminal currently ignores completely — *can this signal actually be traded?* A HIGH score on a $30M microcap trading $80k/day is decoration, not a signal.

**How to build it:**
Extend the enrichment phase: fetch `https://stockanalysis.com/stocks/{t}/statistics/` for cache-miss tickers (same comment-stripping regex technique proven for the quote page), parse Short Interest, % of Float, Shares Outstanding/Float, IPO date; add columns to the existing `ticker_meta` table (24h TTL already in place). Expose on `TickerAggregate`; render a "SI 18% · ADV $2.1M/d" chip; add an *illiquidity warning* on the card when ADV < $500k. Scoring integration (squeeze bonus) waits for backtest evidence. Complexity: ~1 day.

**Priority:** High

---

### [RISK] — Price Context at the Buy (drawdown from 52-week high)

**What's missing:**
Scoring is completely blind to *where in the price chart* the insider bought. A CEO buying 5% off the all-time high and one buying after a −70% collapse produce identical scores. No 52-week high/low, no drawdown, no post-earnings-gap context exists anywhere in the pipeline.

**Why it matters:**
Insider buys after significant declines historically carry the most alpha (buying their own panic), while buys near highs are more often momentum-chasing or optics. This is the cheapest high-value context add: one number per ticker, and the Yahoo adjusted-close plumbing to compute it already exists in three places.

**How to build it:**
During enrichment, reuse the `yahooAdjMap`-style fetch (bounded, cached in `ticker_meta` with the stats pack) to compute `pctFrom52wHigh` at the trade date. Display as a chip ("bought −42% off highs"); add breakdown note; propose a multiplier tier (≤−40% → ×1.1) gated behind the shadow-scoring framework. Complexity: ~half a day on top of the stats pack.

**Priority:** High

---

### [TERMINAL] — Custom Alert Rules Engine

**What's missing:**
Alerts are three hardcoded global events (threshold crossing, new combo, score surge). There is no way to say: "any insider buy on a watchlist ticker, regardless of score", "tell me when NVDA's score crosses 60", "any cluster ≥3 anywhere", "any new 13D". Watchlist membership has zero effect on notifications today.

**Why it matters:**
A daily user's mental model is per-name and per-setup, not one global threshold. The moment you watch a ticker, the question becomes "wake me on *anything* new here" — currently impossible.

**How to build it:**
New `alert_rules` table `(id, scope: ticker|watchlist|global, condition: score_gte|new_insider_buy|new_combo|cluster_gte|new_filing_event, threshold, enabled)`; evaluate in `triggerScrape` after `runScrape` by diffing the new session against the previous one (the diff plumbing for high/combo/surge already exists as a template); route through `notifications.ts`. UI: a small rules editor in Settings + a bell toggle on watchlist rows. Complexity: 1–2 days.

**Priority:** High

---

### [TERMINAL] — In-App Performance Dashboard (calibration visible to the user)

**What's missing:**
The backtest and component-alpha harnesses exist as CLI scripts producing Markdown — invisible inside the app. There is no view answering: "of the HIGH signals from the last 90 days, how many beat SPY? What's my hit rate by tier? Is the score actually calibrated?"

**Why it matters:**
Trust. A conviction score you can't audit against outcomes trains the user to ignore it. This converts the terminal from "signal firehose" to "system with a verifiable track record" — the thing a fund analyst checks before anything else.

**How to build it:**
Extract the outcome engine from `scripts/backtest.ts` into a shared module; run it monthly via the existing scheduler (or a "Recompute" button) in the background; persist the tier/bucket stats JSON into a `backtest_runs` table; render a Performance tab (Recharts is already a dependency) with tier win rates, average alpha at 10/20d, and the score-decile bar chart. Complexity: 2–3 days.

**Priority:** High

---

### [DATA] — 13D/13G Activist & Large-Holder Radar

**What's missing:**
Schedule 13D/13G filings (5%+ stake disclosures; 13D = activist intent) are not monitored at all, despite the EDGAR Atom pipeline being built and proven for Form 4.

**Why it matters:**
A new 13D is one of the highest-impact single filings that exists — average announcement-day moves are large, and an insider buy *plus* a fresh activist stake is an elite combo the terminal currently can't see.

**How to build it:**
Clone the `edgar.ts` discovery path with `type=SC+13D` (and `SC 13G`): parse issuer/ticker + filer from the Atom entries (no XML dive needed for v1 — filer name and type suffice). Store in a new `filing_events` table `(ticker, type, filer, date, url)`; badge signals ("⚡ new 13D: Starboard"), always-notify like combos, and feed the alert rules engine. Complexity: ~1 day.

**Priority:** High

---

### [INFRA] — Per-Signal Data Confidence Score

**What's missing:**
Every signal renders with identical certainty regardless of whether it's corroborated by four sources with full enrichment, or scraped once from a single aggregator with no market cap, no earnings date, no track record, and an estimated value. Field completeness and source corroboration are computed nowhere.

**Why it matters:**
Two 80-scores are not equal, and the user has no way to tell. Confidence-weighting is also the honest answer to running nine best-effort scrapers: the system *knows* how much it knows and should say so.

**How to build it:**
At scoring time, compute a 0–100 confidence from: distinct sources on the top trade (dedup already tracks this before collapsing — count group size), fields present (marketCap, earningsDate, sector, trackRecord, upsidePct), and whether values came from an authoritative source (EDGAR/OpenInsider) vs an estimate (Quiver). Store on the breakdown, render as a small badge (●●●○), and sort ties by confidence. No scoring impact initially. Complexity: ~1 day.

**Priority:** Medium

---

### [AUTOMATION] — Market Regime & Aggregate Insider Sentiment Gauge

**What's missing:**
Zero market-level context. The terminal doesn't know if it's a bull tape or a crash, and it never aggregates its own data: the buy/sell ratio across *all* insiders (a classic market-timing indicator that leads bottoms) is computable from what it scrapes but is never computed.

**Why it matters:**
The same signal means different things in different regimes — insider buying explodes at market bottoms and is far more predictive there. Header context ("Regime: risk-off · insider buy/sell ratio 2.4, 90th percentile") changes how every signal below it is read.

**How to build it:**
(1) Aggregate ratio: totals from the sell-side `insider_flow` table (dependency above), rolling 2-week ratio vs its own history percentile. (2) Regime: SPY vs 200DMA (yahooAdjMap exists) + cached VIX → `bull/neutral/risk-off` stored per scrape in `scrape_log`. Render a header widget; keep out of scoring until backtested. Complexity: ~1 day after sell-side lands.

**Priority:** Medium

---

### [TERMINAL] — Outbound Webhooks (Discord / Telegram / generic)

**What's missing:**
All alerting is Windows-native toast notifications on the machine running the app. Away from the desk, nothing reaches you. No webhook, no push, no email — despite scheduled headless scrapes running specifically while the user is away.

**Why it matters:**
The 9:30 AM scheduled scrape is exactly when the user is not at the PC. A HIGH combo fired into a toast on a locked desktop is a missed trade.

**How to build it:**
Settings fields for a Discord webhook URL and/or Telegram bot token + chat id; in `notifications.ts`, mirror each notification into a `fetch` POST (Discord embed / Telegram sendMessage), with the existing timeout/backoff helpers. Works headless. Complexity: 3–4 hours.

**Priority:** Medium

---

### [TERMINAL] — Paper Portfolio & Exposure Tracking

**What's missing:**
"Follow this signal" computes hypothetical per-ticker P&L, but there is no way to record "I actually entered at $23.40 on the 14th", no open-position list, no portfolio P&L vs SPY, no sector-concentration view ("you're 60% biotech").

**Why it matters:**
The terminal generates decisions but doesn't track them, so the feedback loop between signals and the user's real results lives in a spreadsheet somewhere. Exposure awareness (sector/size concentration) is the first thing a professional adds.

**How to build it:**
`positions` table `(ticker, entry_date, entry_price, size, exit_date?, exit_price?, note)`; "Track position" button in the signal modal; a Portfolio tab reusing `getSignalPerformance`'s Yahoo plumbing for marks, SPY-relative P&L, and a sector pie from stored signal sectors. Complexity: 2 days.

**Priority:** Medium

---

### [INFRA] — Shadow Scoring / A-B Framework (weights as data)

**What's missing:**
Scoring constants are hardcoded; every recalibration (like the freshness change) ships blind to production with no parallel comparison. There is no way to run a candidate scoring config alongside the live one and compare realized alpha after 30 days.

**Why it matters:**
The component backtest showed most factors are still evidence-free. The only safe way to iterate weights is shadow deployment — otherwise every tuning idea is an uncontrolled experiment on the live dashboard.

**How to build it:**
Extract multiplier tables/curve constants into a `ScoringConfig` object (defaults = current values); `scoreTicker(agg, config)` — pure refactor. Optional `shadowConfig` JSON in `app_settings`; when set, score twice and persist `shadow_score` on the signal row. A small report (extend the backtest script) compares live vs shadow IC on ripened rows. Complexity: 1–2 days, and it unblocks the routine/opportunistic, drawdown, and squeeze multipliers above.

**Priority:** Medium

---

### [DATA] — Analyst Ratings & Price-Target Changes

**What's missing:**
No analyst data of any kind: no upgrades/downgrades, no consensus price target, no target-vs-price gap. The valuation feature covers model-based fair value only.

**Why it matters:**
An insider buy that coincides with (or precedes) analyst upgrades is a different beast than one into a wall of downgrades; the target-gap is also a sanity cross-check on the DCF-based upside already shown.

**How to build it:**
MarketBeat's daily ratings page (`/ratings/`) is public and table-shaped — same `extractFirstTable` pattern as the two existing MarketBeat scrapers; store per-ticker events in `filing_events`-style table; consensus target parses off the stockanalysis statistics page already being fetched for the stats pack. Display chips only. Complexity: ~1 day.

**Priority:** Medium

---

### [RISK] — Dilution & Offering Risk Radar (S-3 shelf / recent 424B)

**What's missing:**
Nothing checks whether a company has a shelf registration on file or just priced an offering. Small-cap insider buys — the app's bread and butter — are exactly where surprise dilution destroys the setup.

**Why it matters:**
An insider buy weeks before an offering is sometimes optics ("supporting the price"); a HIGH signal with an active S-3 shelf deserves a visible warning. This is the risk flag most likely to save the user real money on microcaps.

**How to build it:**
Map ticker→CIK once via `https://www.sec.gov/files/company_tickers.json` (free, cached); for signal tickers, query EDGAR browse Atom (`action=getcompany&CIK=…&type=S-3` and `424B`) for filings in the last 12 months; cache verdict in `ticker_meta`; render "⚠ shelf on file (S-3, Mar 2026)". Complexity: 1–2 days.

**Priority:** Medium

---

### [TERMINAL] — Day-One Historical Backfill

**What's missing:**
A fresh install is empty until scrapes accumulate; there's no ingestion of the last 30–60 days of Form 4 history. (The EDGAR daily-index walker exists — but only inside the backtest script, feeding statistics, not the app.)

**How it matters:**
First-run experience and cold-start analytics: track records, cluster detection, and net-flow all work better with two months of history than with today's page-one.

**How to build it:**
Reuse the daily-index walker from `scripts/backtest-components.ts` as a one-time "Backfill 60 days" action (Settings button + first-run prompt) writing into a `historical_trades` table consumed by cluster/net-flow/track-record lookups — deliberately *not* into `signals` (those are point-in-time snapshots). Complexity: 1–2 days.

**Priority:** Medium

---

### [INFRA] — Offline Parser Fixtures (scraper regression tests)

**What's missing:**
No saved HTML fixtures, no offline parser tests. `verify:scrape` hits the live sites; every parser change is verified against whatever the sites happen to serve that minute, and CI-style regression detection is impossible.

**How to build it:**
Save one sanitized HTML snapshot per source into `tests/fixtures/`; a `verify:parsers` script feeds them through `mapInsiderTable`/`mapOptionsTable`/source-specific mappers and asserts row counts + one golden row each. Refresh fixtures deliberately, not implicitly. Complexity: ~half a day.

**Priority:** Medium

---

### [INFRA] — Pre-Migration Database Backup

**What's missing:**
`runMigrations` alters the live DB on every launch with no backup. One bad future migration (or disk hiccup mid-`VACUUM`) loses the watchlist, settings, track records, and all signal history irrecoverably.

**How to build it:**
In `initDatabase`, before `runMigrations`: copy `insider-tracker.db` to `backups/insider-tracker-{yyyymmdd}.db` (skip if today's exists), keep the last 5. ~1 hour.

**Priority:** Low

---

### [DATA] — Congressional Trading Feed

**What's missing:**
No politician-trade data. Quiver's congress-trading page is public and renders under Playwright exactly like the `/insiders/` page already scraped.

**Why it matters:**
A distinct, popular signal class; congress buys overlapping corporate-insider buys on the same ticker is a strong attention signal. Display-lane only — it should not enter the conviction score.

**How to build it:**
Clone `quiverquant.ts` against `/congresstrading/`; store as `filing_events` (`type: 'congress'`); render as chips + a News-tab section. Complexity: ~half a day.

**Priority:** Low

---

### [AUTOMATION] — Position Sizing Suggestion

**What's missing:**
No bridge from "score 84" to "how much?". No volatility measure is computed, and no sizing heuristic exists.

**How to build it:**
Compute 30d realized volatility from the (already fetched) adjusted closes; suggested size = target portfolio risk (settings, e.g. 50bps) ÷ per-name risk (2×σ_daily×price), capped by the ADV liquidity guard from the stats pack. Show as a line in the modal ("suggested: ≤1.8% NAV"). Depends on stats pack + portfolio tab to be meaningful. Complexity: ~1 day.

**Priority:** Low

---

## Priority List

1. **Sell-side intelligence (net insider flow + Form 144)** — the biggest scoring blind spot; a buy against $20M of same-company selling currently scores clean.
2. **Routine vs opportunistic insider classification** — research-backed alpha computed from data already collected.
3. **Source health monitoring** — the silent-selector-rot detector; protects everything else the app does.
4. **Equity stats pack (short interest / float / ADV)** — squeeze context, %-of-float sizing, and the "is this even tradeable?" guard, one cached fetch.
5. **Price context at the buy (52w drawdown)** — dip-buys vs high-chasing is the cheapest high-value context signal.
6. **Custom alert rules engine** — watchlists that actually wake you up; per-name and per-setup alerting.
7. **In-app performance dashboard** — makes the score auditable against realized outcomes; builds or destroys trust with data.
8. **13D/13G activist radar** — highest-impact single filing type, and the pipeline for it already exists for Form 4.
9. **Per-signal data confidence score** — two 80-scores are not equal; say how much the system actually knows.
10. **Shadow scoring / A-B framework** — the safe path for every future weight change, and the gate for items 2, 4, and 5 entering the score.

_Not ranked but cheap and worth doing early: webhooks (~3 hours, fixes the "alert fired into a locked desktop" problem) and the pre-migration DB backup (~1 hour, pure insurance)._
