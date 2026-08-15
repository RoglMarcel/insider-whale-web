# Project Analysis

_Insider & Whale Terminal — deep code review_
_Reviewed against README vision (v1.0.37). This is an analysis-only document: nothing was changed._

---

## Architecture Overview

### How it fits the README vision

The README describes an Electron desktop app where **main owns everything dangerous/native** (Playwright scraping, SQLite, scoring, scheduling, notifications, auth sessions, auto-update) and the **renderer is UI-only**, talking through a typed `window.api` contextBridge. The code matches this faithfully and cleanly:

- `electron/preload.ts` exposes a single frozen `api` object via `contextBridge`. The renderer never imports Node/Playwright. `webPreferences` has `contextIsolation: true`, `nodeIntegration: false`. This is the correct, secure Electron posture.
- `electron/ipc-channels.ts` is a single source of truth for channel names, used by both preload and main.
- `src/types/index.ts` is genuinely dependency-free and shared by both processes (pure functions: `classifyTransaction`, `filterSignals`, freshness helpers, constants). Good discipline.
- `src/lib/ipc.ts` provides a `mockApi` fallback so the renderer survives running in a plain browser (Vite preview). Nice touch.

The data flow in practice:

```
runScrape() [electron/scraper/index.ts]
  → enabled+unlocked sources → per-source Playwright scrapers (insider + options)
  → dedup trades → buildAggregates (group by ticker)
  → enrich earnings (stockanalysis.com, then Finviz fallback)
  → scoreTicker() per aggregate [electron/scoring.ts]
  → insertSignals() [electron/database.ts]
  → broadcast app:signals-updated → Zustand store → Dashboard/Modal
```

### Architectural observations that conflict with the vision

1. **The "Whale" (options) half is structurally subordinate to the "Insider" half.** In `buildAggregates` ([electron/scraper/index.ts:149-188](electron/scraper/index.ts)), options are only attached to tickers that already have a scoring-eligible **insider buy**, and an aggregate is only kept if `agg.trades.some(isScoringEligible)`. A ticker with massive unusual options flow but no insider Form-4 buy is **silently discarded** — it never becomes a signal. For an app called "Insider & **Whale** Terminal" with three dedicated options sources (Barchart, OptionStrat, InsiderFinance) and an "options" type filter, this is a significant gap between the stated vision and the implementation. See _Calculation & Algorithm Review_ and _Feature Ideas_.

2. **Scores are append-only and never pruned.** `signals` grows unbounded; `getLatestSignals()` does a `GROUP BY ticker / MAX(id)` self-join over the entire history every time. Fine for weeks, a problem for a long-lived install. (See _Performance_.)

3. **Two parallel scheduling mechanisms** (in-process `node-cron` *and* Windows Task Scheduler) both exist for the same three market times. This is intentional (cron covers "app open", schtasks covers "app closed / missed while off"), but it's worth understanding the redundancy and its edge cases (below).

4. **Role-name normalization logic is copy-pasted in three places** (`electron/scoring.ts`, `electron/scraper/index.ts`, `src/components/Detail/SignalModal.tsx`) despite `src/types/index.ts` being the designated shared module. This violates the README's own "keep types shared" principle.

---

## Critical Bugs & Logic Errors

### 1. The track record "3-month" metrics are actually **30-day** metrics (mislabeled end-to-end)

**Where:** [electron/scraper/insiderHistory.ts:141-189](electron/scraper/insiderHistory.ts)

```ts
const price1mLater = getPriceNear(priceMap, tradeDate, 30);   // +30 calendar days
const price6mLater = getPriceNear(priceMap, tradeDate, 180);
const r3 = ((price1mLater - purchasePrice) / purchasePrice) * 100;  // labeled "3m"
...
return3m: ...,  accuracy3m: profitable3m / totalTrades,  avgReturn3m: ...
```

The function's own doc-comment says it uses "the 1-month column as the best-available proxy for 3-month outcomes," but it doesn't read OpenInsider's perf columns at all — it fetches Yahoo history and computes the price **30 days** after the trade, then stores/labels it as `return3m` / `accuracy3m` / `avgReturn3m`.

**Why it matters:** This isn't cosmetic. The value feeds `getTrackRecordMultiplier(bestAccuracy3m)` in scoring ([electron/scoring.ts:261-266](electron/scoring.ts)), and the UI shows it to the user as "% win rate over N trades (3mo)" and "avg 3m return" ([InsiderAccuracyPanel.tsx:96-122](src/components/Detail/InsiderAccuracyPanel.tsx), [SignalModal.tsx:308-309](src/components/Detail/SignalModal.tsx)). A 30-day window is far noisier than 3 months and materially changes both the displayed stat and the conviction multiplier. The `perf()` helper at [insiderHistory.ts:28-32](electron/scraper/insiderHistory.ts) (meant to parse the OpenInsider perf columns) is **dead code**.

**How to address:** Either (a) actually compute +90 days and rename consistently, or (b) honestly rename everything to "1-month / 30-day." Pick one and make label == computation.

### 2. `accuracy6m` uses the wrong denominator (systematically understated)

**Where:** [electron/scraper/insiderHistory.ts:164-188](electron/scraper/insiderHistory.ts)

```ts
const with3m = history.filter((h) => h.return3m != null);
const totalTrades = with3m.length;                              // trades with a 30-day outcome
const profitable6m = history.filter((h) => h.wasProfitable6m).length;  // numerator over the FULL history
...
accuracy6m: profitable6m / totalTrades,                          // mismatched num/denominator
```

`profitable6m` only counts trades old enough to have a 180-day outcome, but it's divided by `totalTrades`, which counts every trade with a 30-day outcome (a strictly larger set — any trade 30–180 days old is in the denominator but can never be in the numerator). So `accuracy6m` is biased downward for any insider with recent activity.

**How to address:** Compute a separate `with6m = history.filter(h => h.price6mLater != null)` and divide `profitable6m / with6m.length`.

### 3. `detectCombo` contains a no-op ternary (dead logic)

**Where:** [electron/scoring.ts:305-311](electron/scoring.ts)

```ts
const age = o.expiry ? null : null; // options are scraped live → treat as current
return age == null || age <= 7;
```

`o.expiry ? null : null` always evaluates to `null` regardless of `expiry`. The condition is always true. It's functionally harmless (the intent — "treat scraped options as current" — happens to be what you get), but it's clearly leftover/broken code that reads as if it does something. If the intent ever was to use option **age**, that intent is silently lost.

**How to address:** Replace with an explicit `const isRecent = true;` and a comment, or implement the real freshness check using `o.scrapedAt`.

### 4. Conviction scores are severely compressed — real insider signals almost always read "LOW"

This is the most important correctness/calibration finding. Full reasoning in _Calculation & Algorithm Review_, but in short: the normalization denominator `MAX_POSSIBLE_RAW ≈ 2126` is the product of every multiplier's theoretical maximum simultaneously — a combination that essentially never co-occurs. The result is that a clean CEO open-market buy of ~$600k scores **≈5/100**, and an insider-only signal cannot even reach WATCH (50) without 4+ insiders **and** >$5M **and** earnings within 5 days. In practice the conviction tier is decided almost entirely by the discrete `+30` combo bonus and by options flow, not by the rich insider model that was built. This makes the headline number misleading.

---

## Potential Issues & Edge Cases

### 5. Scheduled (headless) scrapes always score with **VIX = undefined**

**Where:** [electron/main.ts:520-540](electron/main.ts)

In the `--scheduled-scrape` branch, `startVixPolling()` kicks off an async fetch and then `triggerScrape()` runs **immediately**. `triggerScrape` reads `getCachedVix()?.value`, which is still `null` because the first VIX fetch hasn't resolved. So every background scrape runs with no VIX boost, while interactive scrapes (app has been open a while) get one. Two scrapes of the same data can therefore produce different scores depending on path.

**How to address:** `await fetchVix()` once before `triggerScrape()` in the scheduled branch.

### 6. Unbounded concurrency when fetching earnings for all candidates

**Where:** [electron/scraper/index.ts:394-404](electron/scraper/index.ts)

```ts
await Promise.all(aggregates.map(async (agg) => { ... fetch(stockanalysis.com/...) ... }));
```

If a scrape yields 80–150 candidate tickers, this fires 80–150 simultaneous HTTP requests to stockanalysis.com with no pooling. That invites rate-limiting/blocking (which then silently pushes everything to the slower Finviz fallback) and a burst of socket usage.

**How to address:** Add a small concurrency limit (e.g. 5–8 at a time).

### 7. Track-record fetch launches **one Chromium per insider, concurrently**

**Where:** [SignalModal.tsx:222-247](src/components/Detail/SignalModal.tsx) → `fetchTrackRecord` → [main.ts:125-164](electron/main.ts)

Opening a detail modal runs `Promise.all` over every unique insider, and `fetchTrackRecord` in main does `launchBrowser()` per call. A ticker with 4 fresh (uncached) insiders briefly spawns **4 headless Chromium instances at once**. The 7-day cache mitigates repeat opens, but the first open of a multi-insider ticker is heavy and can spike memory.

**How to address:** Share one browser/context across the insiders of a modal, or serialize with a concurrency cap.

### 8. Live-news scrape runs every 5 minutes, 24/7, launching a fresh browser each time

**Where:** [electron/scheduler.ts:166-171](electron/scheduler.ts) + [electron/scraper/twitter.ts](electron/scraper/twitter.ts)

A headless Chromium launch + x.com navigation **288×/day**, each potentially firing a native notification ([twitter.ts:66-81](electron/scraper/twitter.ts)). This is resource-heavy, a strong bot-detection trigger for X, and a notification-spam risk. There's also no overlap guard, so the startup "immediate" trigger can race the first cron tick.

**How to address:** Back off to 15–30 min, add a single-flight guard, and gate notifications more conservatively.

### 9. `init()` listener registration is not race-safe

**Where:** [src/store/useStore.ts:134-180](src/store/useStore.ts)

The `if (get().initialized) return` guard is checked, then several `await`s happen before `initialized: true` is set. Two near-simultaneous `init()` callers would both pass the guard and both register `onStatus` / `onSignalsUpdated` / `onOpenTicker` listeners, producing duplicate state updates. Currently it appears `init()` has a single call site, so it's latent — but it's fragile. Set a synchronous `initialized = true` (or an in-flight flag) before the first `await`.

### 10. `signalTradeMs` / week-filter timezone subtlety (mostly handled, worth a test)

`filterSignals` ([src/types/index.ts:492-520](src/types/index.ts)) carefully treats `YYYY-MM-DD` as **local** midnight to avoid dropping same-day trades — good. But `scrapedAt` (used as the fallback) is a full ISO string parsed with `Date.parse`, while `tradeDate` is date-only/local. Mixing local-midnight and instant semantics in one comparison against calendar cutoffs can produce off-by-one inclusion at day boundaries. Worth a unit test around midnight ET.

### 11. `updateEarnings` rewrites earnings on **every** historical row of a ticker

**Where:** [electron/database.ts:657-670](electron/database.ts) — `UPDATE signals SET ... WHERE ticker = ?` (no date filter). Historical signal snapshots get their earnings overwritten with today's value, which corrupts the time-series meaning of old rows (e.g. the Watchlist score-trend chart). Scope to the latest row or the current session.

### 12. `getMostRecentSessionSignals` relies on exact-string `scraped_at` equality

**Where:** [electron/database.ts:370-379](electron/database.ts). It selects rows where `scraped_at = MAX(scraped_at)`. This works only because the orchestrator stamps every signal in a batch with one identical ISO string ([index.ts:447](electron/scraper/index.ts)). It's correct today but brittle — any future per-signal timestamping silently breaks "new HIGH/combo" detection. A session id column would be safer.

---

## Calculation & Algorithm Review

### 13. The normalization denominator makes the score non-representative (deep dive)

**Where:** [electron/scoring.ts:20-43, 391-401](electron/scoring.ts)

```
MAX_INSIDER_RAW = 10(rank) × 20($vol) × 1.0(type) × 3.0(cluster) × 2.34(timing) × 1.15(vix) = 1614.6
MAX_OPTIONS_RAW = 78.624 × 2.0 = 157.248
MAX_POSSIBLE_RAW = (1614.6 + 157.248) × 1.2(track) × 1.0(fresh) ≈ 2126.22
finalScore = clamp((combined / 2126.22) × 100 + comboBonus, 0, 100)
```

The denominator multiplies together the maximum of **every independent factor at once**. Worked examples (insider-only, no combo, no options):

| Scenario | insiderRaw | normalized score | tier |
|---|---|---|---|
| CEO, $600k, 1 insider, no earnings, normal VIX | 10×10×1×1×1×1 = 100 | **4.7** | LOW |
| CEO, $1M, 2 insiders, earnings ~25d | 10×14×1×1.5×1.3×1 = 273 | **12.8** | LOW |
| CEO, $5M, 4 insiders, earnings ≤5d + finance | 10×20×1×3×2.34×1 = 1404 | **66** | WATCH |
| …plus VIX>25 and strong track record | 1404×1.15×1.2 = 1938 | **91** | HIGH |

So HIGH is reachable (consistent with the project memory note), but **only at near-maximal everything**, and a genuinely strong, ordinary insider buy lands in single digits. The continuous score is compressed against the bottom of the range, and the discrete `+30` combo bonus dominates tier assignment. The conviction tiers (`HIGH≥80`, `WATCH≥50`) therefore mostly reflect "did a combo/options event happen" rather than insider quality.

**Why it matters:** The whole point of the scoring model — rank, dollar volume, cluster, timing, track record — barely moves the needle for the insider-only case that is the app's primary data source (OpenInsider). Users will see almost everything as "LOW."

**How to address (options, pick one):**
- Normalize against a **realistic** reference (e.g. the 90th-percentile observed `combined`, or a hand-picked "strong signal" baseline ≈ a few hundred), not the product of all maxima.
- Use a **log / sigmoid** transform so the meaningful range (roughly 50–1500 raw) spreads across 0–100.
- Re-derive `MAX_POSSIBLE_RAW` from a "strong but plausible" co-occurrence rather than the theoretical ceiling.

### 14. Options scoring only counts the single strongest bull and single strongest bear

**Where:** [electron/scoring.ts:239-251](electron/scoring.ts). `scoreOptionsDetailed` takes `max` of bullish and `max` of bearish and subtracts. Ten bullish sweeps score the same as one. That's a defensible simplification, but combined with the compressed normalization it means even a huge multi-sweep day adds little. Also note the asymmetry: **bullish** is counted for any `sentiment === 'bullish'` regardless of type, but **bearish** requires `type === 'put' && sentiment === 'bearish'` — a *bearish call* (e.g. sold calls) is counted as neither, and a *bullish put* (sold puts) is counted as bullish. Intentional-ish, but undocumented and easy to get wrong.

### 15. OTM% is computed from a calls-only formula; puts rely on `Math.abs` to mask the sign error

**Where:** [optionsMap.ts:141-143](electron/scraper/optionsMap.ts), [scoring.ts:226-230](electron/scoring.ts). `otmPercent = ((strike − underlying)/underlying)×100` is the call convention; for a put this yields the "wrong" sign, and the type comment even says "for calls (signed)." `scoreOneOption` then uses `Math.abs(otmPercent)`, so the **magnitude** is fine for scoring, but the stored/displayed `otmPercent` is misleading for puts (a 10%-ITM put and 10%-OTM put look identical after abs). Fine for scoring weight; wrong for any UI that shows the signed number.

### 16. DTE = 0 when a DTE column exists but the cell is blank

**Where:** [optionsMap.ts:135-139](electron/scraper/optionsMap.ts). `dte = idx.dte >= 0 ? Math.round(parseMoney(cell(...))) : undefined`. `parseMoney('')` returns `0`, which is a valid number, so the expiry-based fallback (`dte == null || NaN`) doesn't fire, and `scoreOneOption` treats `dte 0 < 21` as a near-term ×1.5 boost. A blank DTE cell thus silently earns the short-dated bonus. Guard with `> 0` or fall back to expiry when the cell is empty.

### 17. `classifyTransaction` vs `isBuyTrade` disagree on SEC code `A`

**Where:** [src/types/index.ts:382-399](src/types/index.ts) treats code `A` (award/grant) as `modifier 0` (excluded), while [scoring.ts:57-61](electron/scoring.ts) `isBuyTrade` treats `startsWith('A')` as a **buy**. They'd classify the same trade oppositely. `isBuyTrade` is only used by a verify script today, so impact is low, but it's a latent trap if it's ever wired into the orchestrator.

### 18. `parseMoney` magnitude-suffix heuristic can misfire on stray letters

**Where:** [electron/scraper/util.ts:8-31](electron/scraper/util.ts). It strips everything except `[0-9.kmbKMB]` and treats a trailing k/m/b as ×1e3/1e6/1e9. A cell like `"1,000 mln"` → `"1000m"` → `1,000,000,000`. Real feeds rarely produce this, but a column-misalignment (very possible with fuzzy header matching) feeding text into a money cell could yield wildly wrong dollar volumes that then dominate scoring. Consider anchoring the suffix to the actual end of the numeric token.

### 19. `getInsiderTimingMultiplier` double-counts the finance bonus into `MAX_INSIDER_TIMING`

The constant `MAX_INSIDER_TIMING = 1.8 × 1.3 = 2.34` correctly captures earnings≤5d × finance. This is consistent — just noting it's the one place the maxima are honest. No bug; included for completeness.

---

## Performance & Optimization

- **Unbounded `signals` table + repeated self-join.** `getLatestSignals()` ([database.ts:333-346](electron/database.ts)) groups the entire history every call, and it's called on every scrape, every broadcast, and inside the 72-hour options merge. Add a retention/prune job (e.g. keep N sessions or 90 days) and/or a `is_latest` flag updated on insert.
- **Earnings fan-out** (finding 6) and **per-insider browser launches** (finding 7) are the two biggest runtime costs.
- **`authStatus()` re-reads and decrypts every session file on each call** ([auth.ts:80-102](electron/auth.ts)), and `sourceUnlocked` calls it per source per scrape; `loadMergedStorageState` calls `isLoggedIn` (a `loadState`) then `loadState` again per platform. Cache decrypted state in memory and invalidate on save/logout.
- **Two VIX cadences** (main polls every 15 min, renderer re-reads cache every 5 min) — harmless but redundant; the renderer could just react to a push.
- **`withTimeout` doesn't cancel the underlying promise** ([index.ts:69-71](electron/scraper/index.ts)); a hung scraper keeps running in the background after the fallback resolves. Acceptable, but on a 75s timeout × many sources it can leave orphaned pages alive until browser close.
- **`getFilteredSignals` IPC path is effectively dead.** The real UI filters client-side via `filterSignals` in `useSignals`; the `signals:getFiltered` channel + `getFilteredSignals` only run in tests/mock. Either delete it or use it (it would let you avoid shipping all signals to the renderer).

---

## Code Quality & Maintainability

- **Triplicated `normalizeName`/`norm`** (scoring.ts, scraper/index.ts, SignalModal.tsx) — identical role-stripping. Move to `src/types/index.ts` and import everywhere. Divergence here would silently break cluster dedup vs. modal dedup.
- **Two `app.on('before-quit')` handlers** ([main.ts:492-494 and 570-576](electron/main.ts)) — one only sets `isQuitting`, the other does cleanup. Merge them.
- **`'app:setTheme'` is a raw string channel** ([main.ts:465](electron/main.ts), [preload.ts:101](electron/preload.ts)) while every other channel goes through `IPC`. Add it to `ipc-channels.ts`.
- **Dead code:** `perf()` in insiderHistory.ts (finding 1); `execAsync` is created in scheduler.ts ([line 7](electron/scheduler.ts)) but only `execFileAsync` is used; `exec` imported in main.ts but only `execFile` used.
- **Duplicated `parseStockAnalysisEarnings` logic** exists both in `main.ts:179-196` and inline in `scraper/index.ts:209-236`. Extract once.
- **`showSingle` notification always says "HIGH CONVICTION"** ([notifications.ts:31](electron/notifications.ts)) but `notifyForSignals` fires at the configurable `notificationThreshold`, which can be < 80 — a WATCH-tier signal could get a "HIGH CONVICTION" toast. Label from the actual conviction level.
- **Magic numbers** scattered through scoring (the `78.6`, `2.34`, `30`, `1.15`, thresholds). Most are centralized, but the breakdown UI hardcodes `/ 2.34` and `/ 78.6` ([ScoreBreakdown.tsx:38,44](src/components/Detail/ScoreBreakdown.tsx)) — these will drift from the constants if the model is retuned. Export the maxima and reuse.
- **`BIG_PLAYERS` is a hand-maintained static set** ([types/index.ts:727-758](src/types/index.ts)) that will rot (e.g. it still lists `PXD`/`FANG`-era tickers; acquired/renamed names linger). Consider deriving "big player" from market cap or a maintained list, or at least dating it.
- **README/behavior drift:** README says valuation logins are "optional"/"strongly recommended" and `LOGIN_PLATFORMS` marks both `gating: 'optional'`, but `fetchValuation` hard-returns "Login required" for both providers when not logged in ([valuation.ts:238-258](electron/scraper/valuation.ts)). Pick one story.

---

## Security Concerns

1. **Auto-update signature verification is disabled.** [main.ts:265-268](electron/main.ts) overrides `verifyUpdateCodeSignature` to always resolve `null`, and the app pulls and installs updates from GitHub Releases. This is the highest-impact item: anyone who can serve a malicious `latest.yml` + installer to the updater (compromised release, account takeover, or a MITM if any non-pinned path exists) gets **silent remote code execution** on every client. It's an understandable shortcut for an unsigned hobby build, but it should be called out loudly and ideally replaced with real code signing before any wider distribution.
2. **`safeStorage` plaintext fallback.** [auth.ts:28-38](electron/auth.ts) writes session cookies as `RAW:`+plaintext JSON when OS encryption is unavailable. On Windows DPAPI is normally available, but the fallback means a misconfigured environment silently stores live authenticated session cookies (which are password-equivalent) in cleartext under `userData/sessions`. At minimum warn the user; ideally refuse to persist.
3. **`setWindowOpenHandler` opens any scraped `http(s)` URL externally** ([main.ts:84-87](electron/main.ts)). The URLs come from scraped pages (insider rows, tweets). It's user-initiated and only `http(s)`, so risk is low, but there's no allow-listing of expected domains. Worth a sanity check before `shell.openExternal`.
4. **PowerShell string interpolation in the scheduler.** [scheduler.ts:123-131](electron/scheduler.ts) interpolates `exePath` into a `-Command` script string. `exePath` is `app.getPath('exe')` (trusted), so this isn't exploitable today, but it's a command-injection-shaped pattern; prefer passing the path as a parameter/arg rather than string-building PS.
5. **`--no-sandbox` on every Chromium launch** ([browser.ts:72-82](electron/scraper/browser.ts), [auth.ts:131-134](electron/auth.ts)). Common for scraping reliability, but it removes the renderer sandbox for pages you don't control. Note as accepted risk.
6. **TradingView iframe is not `sandbox`-attributed** ([SignalModal.tsx:49-53](src/components/Detail/SignalModal.tsx)). CSP `frame-src` restricts the origin (good), but adding a `sandbox` attribute would harden it further.

The overall Electron hardening (contextIsolation, no nodeIntegration, tight CSP in `index.html`, no `unsafe-eval`) is genuinely good — items 1 and 2 are the ones that matter.

---

## Feature & Improvement Ideas

1. **First-class options-only ("whale") signals.** Let `buildAggregates` emit aggregates for tickers with strong options flow and no insider buy, scored on the options path alone. This closes the biggest vision gap (the app's namesake) and makes the existing "options" type filter meaningful. Combo then becomes the intersection of two independently-surfaced signal types rather than the only way options matter.
2. **Recalibrate scoring to a realistic curve** (finding 13). Even a simple change — normalize against a tuned baseline and/or apply a log transform — would make the dashboard's tiers reflect insider quality instead of mostly "combo or not."
3. **Backtesting harness.** You already fetch post-trade Yahoo prices for track records; generalize it: replay historical signals and measure realized forward return per score bucket. That both validates the model and gives you a data-driven `MAX_POSSIBLE_RAW` / threshold calibration.
4. **Persist insider track records as a join, not a per-modal scrape.** Pre-warm the cache during the scrape (you already have `insiderUrl` on OpenInsider rows) so the modal opens instantly and scoring's `bestAccuracy3m` is populated at scrape time rather than "best cached so far."
5. **Score history / alerting on score deltas.** You store every session; surface "ticker X jumped from 12 → 71" as its own notification class. More actionable than absolute thresholds given the compression issue.
6. **Data-source health panel.** The scrape log already records per-source counts; a small "source freshness/health" view (last success, rows, error) would make silent scraper breakage (very likely given fragile selectors) visible.
7. **Configurable retention + DB size indicator** to address the unbounded `signals` growth, surfaced in Settings next to "Clear database."
8. **Unit tests around the parsers and filters.** `parseMoney`, `parseLocalizedPrice`, `parseFinvizEarnings`, `classifyTransaction`, and `filterSignals` are pure and high-risk; a handful of table-driven tests would catch the DTE-0, money-suffix, and timezone edge cases above. (`verify-scoring.ts` already proves the maxima — extend that pattern.)

---

## Summary — Top priorities, ranked

1. **Fix the "3-month" track-record mislabel (finding 1).** It's wrong, it's user-facing, and it feeds the score. Decide 30-day vs 90-day and make label == math. _(Critical, low effort.)_
2. **Recalibrate the conviction score (findings 4 & 13).** The current normalization compresses real insider signals into single digits and lets the `+30` combo bonus dominate. This undermines the product's core promise. _(Critical, medium effort.)_
3. **Surface options-only "whale" signals (finding 1 in Architecture / Feature idea 1).** Today the "Whale" half can only ever decorate an insider buy. _(High, medium effort.)_
4. **Re-enable update signature verification / code-sign (security 1).** Silent RCE vector on all clients. _(High, medium effort — needs a cert.)_
5. **Fix `accuracy6m` denominator (finding 2)** and the **`detectCombo` no-op ternary (finding 3).** _(Medium, trivial.)_
6. **`await` VIX before scheduled scrapes (finding 5)** so background and manual scores agree. _(Medium, trivial.)_
7. **Throttle/limit the fan-outs:** earnings concurrency (6), per-insider browser launches (7), and the every-5-min Twitter scrape (8). _(Medium, low effort, real resource impact.)_
8. **Scope `updateEarnings` to the latest row (finding 11)** so historical score-trends aren't retroactively rewritten. _(Medium, trivial.)_
9. **De-duplicate `normalizeName` and add parser unit tests.** Cheap insurance against silent regressions in the messiest part of the system. _(Medium, low effort.)_
10. **Plan `signals` retention/pruning (Performance).** Not urgent, but it's the one thing that quietly degrades a long-lived install. _(Low now, rising over time.)_

_Honest overall read: the engineering scaffolding (Electron security model, IPC typing, migrations, scraper resilience, auth/session handling) is solid and well above hobby-project norms. The weak spots are concentrated in the **quantitative core** — the scoring calibration and the track-record math — which is exactly the part the product sells. Those are where the next round of effort will pay off most._
