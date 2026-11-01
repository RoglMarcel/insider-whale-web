# Simulation integrity and exit decision — 2026-11-01

> Subsequent owner decision: apply 15% / 10% with next-close execution to the signal books and add a strict >80 comparison. See [four-portfolio rollout](FOUR-PORTFOLIO-DECISION-2026-11-01.md). This report preserves the initial research and repair decision below.

**Decision:** complete the verified integrity/replay repairs and retain legacy default exit thresholds. Provide versioned alternatives and delayed execution for research. This evidence does not establish optimized parameters, perfect alerts, or exits as the sole cause of losses.

## Evidence and reproduction

Baseline: `6c5bc2352ede2f4550a471ecdd0e5512877ae176`. Read every Math, Studies and Trading note, the investigation and calculations, and all four screenshots. Inspected engine, price pipeline, persisted configuration/migrations, archive, both portfolios, UI and desktop/shared/Python publication. No repository AGENTS.md exists. The installed database was opened only for a consistent read-only backup. All writable integrations used isolated fixtures; no production migration, sync, scrape, deployment or broker execution was performed.

| Frozen input | SHA-256 |
|---|---|
| Investigation JSON | `e247834a4b86b942617c50e9e1f30adb7acf44564ec269bfaa9410f47635da07` |
| Full replay inputs | `955670a0d7d3cded0e2f186f0e1968356494eb3b83129c4504dfcea7fcf5b1f9` |
| Candidate pool | `6e44d91f80085501fda90884402153e507e5ec7921bacbb8cb089a07388753d0` |
| Prices and benchmark | `86b7cf8cf35c3c15d2aae9b212296c1d6b4a14a11bca6e1e9be7e2f679ed6880` |

The replay ends October 30, 2026, using 66 archived/recovered candidate observations and cached adjusted closes. All 14 fixed-entry statuses reproduce: five closure dates/reasons/returns and nine open positions. This verifies calculations against stored data, not market-price truth.

## Confirmed defects and strategy choices

* **Cache invalidation:** rejection of an incoming observation did not remove its previously cached usable counterpart. All 24 ALP rejection dates remain in the frozen cache. Its current numeric series is smooth; the original rejected provider response/anchor is unavailable. This confirms inconsistent quality state, not that every ALP price is wrong.
* **Anchoring:** after rejection, the previous accepted anchor remained unchanged, allowing repeated rejection of a valid new price level. Magnitude alone cannot distinguish bad data, adjustment problems and genuine extreme moves.
* **Replay coherence:** settled equity could survive while positions/events were replaced by a fresh replay. The read model could calculate barriers with draft settings while returning stored settings, and use fresh cache marks beside an old equity run.
* **Timing:** date-only observations do not establish pre-close availability. Current provisional prices could enter history. Same-close decisions/fills assume execution can be arranged before the final close is known.
* **Labels/dependence:** the five-slot comparison consumes the same candidates. The former Insider-only name did not implement an independent insider filter; overlapping trades are dependent evidence.
* **Policy, not a failed comparison:** take-profit is disabled. A +25% arm with a 20% drawdown uses `H × 0.8`, approximately breakeven at activation. BMRA's +32.95% closing excursion/+2.29% exit and ALP's +22.96% excursion without activation reproduce. PRTS and the main GPUS entry had no positive closing excursion to harvest. Closing-price execution can overshoot the nominal stop; filling every crossing at the threshold would invent improved results.

Screenshot differences remain unresolved: PRTS shows $6.90/-25.96% versus $6.926535/-25.64% locally; GME marks $24.23 versus $23.95; SNES shows $1.08/+28.51% versus $1.02/+21.37%. SNES is armed in the screenshot and unarmed in the local path. Originating build/device/price vintage is unknown; these snapshots must not be combined into one alleged missed exit.

## Engineering behavior and migration

1. Add immutable `price_vintages`: raw adjusted observations, provider symbol/currency/exchange/instrument metadata, corporate-action payload, retrieval time, screen version, issues and review evidence. Review time is recorded separately; a review never makes an old provider observation freshly fetched. `price_history` becomes the active projection of one whole response per ticker. A successful refresh replaces it completely, including an empty quarantine. Transport failure preserves old observations without making them fresh. Previous vintages and the initial legacy cache remain recoverable evidence.
2. Compare adjacent observations. An unexplained move above 60% quarantines the whole response rather than omitting a potentially genuine crash as an ordinary missing session. A coherent corrected response recovers automatically. A genuine extreme move can be released with a reviewer and independent evidence. Later refreshes reuse review only for identical flagged transitions and provider identity; changed event prices/adjustment scales or additional extreme moves need fresh evidence. Returns are never clipped.
3. Exclude legacy tickers with unresolved rejection events from usable reads until refreshed/reviewed. Other old caches carry `legacy-unverified` provenance and are forced to refresh on sync. Rows outside the newer requested window stay in old immutable vintages rather than being spliced into a new adjustment scale. Reject known symbol/currency/instrument mismatches. Never substitute raw closes for adjusted closes.
4. Carry whole vintages through desktop delivery, shared-history and Python imports. Reproject the newest complete vintage after legacy row merges, including empty quarantines. Older/legacy imports cannot resurrect rejected dates. Node projection verifies hashes and validity; transport retains its existing checksums. Equal retrieval times use a deterministic hash tie-break.
5. **Curve builder 6** archives the previous whole book and replaces equity, positions, events, comparison, frozen marks, entry volatility, pending exits and metadata in one transaction. Original backtest decision/purchase/closure evidence retains its immutable semantics; changed outcomes are separate replay evidence. An incomplete benchmark preserves the previous result. Future-inception reset archives the former book first.
6. Publish engine version, run/config/input hashes, price basis, execution mode and vintage IDs for both books. Vintages participate in run identity even when numeric prices are unchanged. JSON publication uses temporary-file/rename replacement. Stored settings and frozen marks drive displayed calculations; stale quotes retain actual dates. Optional sigma distances use the entry volatility estimate, with fixed fallback disclosed.
7. Defer date-only sightings to the following calendar day, then resolve to an observed session; reject invalid calendar dates. Exclude future/uncompleted benchmark sessions. Known observation timestamps retain existing entry-auction semantics. No intraday fills are fabricated.

**No default parameter migration:** configuration version stays 3; omitted/null `profitFloor` disables the floor and omitted `exitExecution` means legacy `same_close`. Existing custom choices survive. New configurations hash separately. The UI calls the five-slot book **Concentrated signals**, retaining its stored experiment ID for compatibility. Restatement labels now refer to changes from an archived replay.

## Exit alternatives and results

Six locked presets live in `src/lib/exit-policies.ts`. An optional floor raises the activated trailing trigger to at least entry × (1 + floor), never guaranteeing that return. Precedence remains stop → trailing → target → time. `next_close` queues the first completed-close decision and fills at the next available session close with adverse slippage. Missing quotes delay execution; the queued reason is persisted/displayed. Final-day decisions stay open until a later quote exists.

### Fixed original entries and shares — attribution only

| Policy | Fixed-share P&L through Oct 30 | Closed |
|---|---:|---:|
| Legacy 25/20 | -$731.84 | 5 |
| Trail 25/10 | -$622.97 | 6 |
| Trail 15/10 | -$187.06 | 7 |
| Target 25 with legacy trail | -$493.06 | 6 |
| Floor 10 after 25 | -$687.65 | 5 |
| Trail 30/15 | -$696.49 | 6 |

These reproduce all six earlier diagnostics. A 50% realization at the first +25% close, with a legacy trailing remainder, gives **-$612.45**. Exit costs apply to realized portions; open portions are marked without an invented liquidation cost. This partial policy is a fixed-entry diagnostic only: production/archive partial-position accounting and full capital reuse are not implemented or claimed. The unsold remainder retains further upside exposure.

### Capital-constrained main-book replay

Identical frozen 66 candidates, $10,000 capital, 20 slots, score-based 3–10% funding, $100 minimum, ten-calendar-day cooldown, 90-day hold and 5 bps adverse slippage on every fill including SPY cash legs. Proceeds fund later eligible entries, one holding per ticker, no averaging up. Unallocated funds park in SPY. Open holdings and the benchmark are marked without fictitious liquidation costs. SPY starts on the same session with the same capital and entry costs. Volume/participation capacity is unsupported by the frozen data.

| Policy | Same-close ending equity | Next-available-close ending equity |
|---|---:|---:|
| Legacy 25/20 | $9,279.23 | $9,264.11 |
| Trail 25/10 | $9,382.25 | $9,327.85 |
| Trail 15/10 | $9,807.00 | $9,805.36 |
| Target 25 | $9,489.92 | $9,478.48 |
| Floor 10 after 25 | $9,326.75 | $9,330.78 |
| Trail 30/15 | $9,298.42 | $9,333.62 |

SPY is **$9,882.37**. All main-book alternatives remain negative and behind SPY. Trail 15/10 has seven closed/seven open under same-close and six closed/eight open with delayed execution; changed realized win-rate denominators do not establish improvement. At **50 bps per side**, its delayed equity is **$9,652.53**, versus **$9,138.92** for the legacy delayed book. These assumptions still do not estimate actual microcap spreads/impact.

The JSON discloses all **48** full replays: six policies × two execution modes × two costs × two allocations. The concentrated comparison uses five slots, 20% targets and idle cash, with the identical candidate pool for attribution. Its same-close legacy equity is $8,992.45 and 15/10 is $9,889.75. These are correlated allocations, not independent validation. Repeating the frozen replay is byte-identical.

The saved main equity is **$9,282.55**, $3.32 above the complete frozen replay. The first ten entries match exactly; PRHI's immutable candidate archive records **74.4**, versus **76.1** in the saved position, changing later allocations. The existing book also reports 18 restated days. Preserve both observations; this difference is not explained by an exit change.

Excluding unresolved ALP observations gives **$9,430.40**, four closed/nine open. This is **missing-data/exclusion sensitivity**, not evidence of profit improvement: removing a losing observation changes opportunity and allocation. The verified engineering before/after is that quarantined prices cannot remain usable and active curve/holdings now share one run.

## Research correction and recommendation

The [Zhao v2 primary record](https://arxiv.org/abs/2602.06198v2), checked directly, supersedes v1 and withdraws momentum/classifier-superiority claims. Later drift is imprecise and its first-day-skipping portfolio lacks significant alpha. This weakens the old justification without establishing that this system has no useful signal. The original exit document is retained with a correction notice. A terminal-payoff cap is not a first-passage profit-taking backtest; lifetime return skew cannot select these event exits. No fixed closure count establishes statistical power. [Bailey et al.](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) supports caution about backtest selection, not these particular parameters. [FINRA](https://www.finra.org/investors/insights/stop-orders-factors-consider-during-volatile-markets) explains why trigger prices cannot guarantee execution prices.

Recommend prospective shadow evaluation of the disclosed 15/10 and floor alternatives with confirmed identity/actions and realistic costs. Retain defaults until an untouched chronological evaluation supports a change. Same-close remains a labeled legacy assumption; next-close is the more conservative executable research scenario. This selected short sample cannot establish an out-of-sample optimum or a confidence interval warranting production selection.

## Verification

* `npm ci --ignore-scripts`, `npm rebuild better-sqlite3`: locked dependencies and Node-native fixture runtime installed; lockfile unchanged.
* `npm run typecheck`: both renderer and Node projects passed.
* `npm test -- --reporter=dot`: baseline 629; final 637 tests, including cache recovery/review, unknown-time entry, activation/floor/overshoot/precedence, peaks, deterministic delayed exits, stored settings/marks and existing invariant/golden checks.
* `npm run verify:simulation`, `npm run verify:backtest`: real SQLite restart, legacy/shared import, quarantine/correction, archived prior replay, original evidence, source pruning, config persistence, coherent components and JSON provenance passed.
* `python -m unittest discover -s tests/persistence -v`: 21 passed, including Python quarantine/recovery. `../check-env/Scripts/python.exe -m unittest discover -s tests/scrapling -v`: 5 passed with the pinned Scrapling requirement in a workspace-only environment.
* `npm run verify:scoring`: all scoring checks passed; weights unchanged.
* CI's esbuild bundles and native desktop-publication, experiment, trade-revision, track-cache and shared-history integrations passed. Desktop delivery includes an actual quarantined vintage through local Git packaging and Python reconstruction; no external publication.
* `npm run build`, `npm run build:web`: passed; existing CJS/chunk warnings remain.
* Host Node 20 lacks `node:sqlite`; reran using `npx -y node@22 --test tests/access/*.test.mjs`: **26 passed**. Fixed a Windows test URL conversion with `fileURLToPath`.
* `node tests/ui/backtest-ui.cjs`, `node tests/ui/web-ui.cjs`, `node tests/ui/access-ui.cjs`: local production-build checks passed across 320–1440 px and empty/error states. `node tests/ui/simulation-ui.cjs`: English/German, 390/1280 px, geometry/presets/floor validation/delayed execution/submission/overflow passed. The focused check caught native input step offsets rejecting valid defaults; corrected before completion.

Initial sandbox file-rename/browser and missing-runtime/fixture failures were resolved and rerun, not counted as successes. Isolated Windows integrations required execution outside the restricted sandbox. Browser/Python installations remain in the workspace. These are engineering checks, not predictive strategy validation.

## Limits and recovery

Independent ALP issuer/security/action confirmation and the original provider response remain missing. Symbol/currency/exchange checks cannot prove stable issuer identity or prevent all reused-symbol errors. Adjusted-price vintages cannot reconstruct original tradable shares, distribution cashflows or historical provider truth. Review may delay genuine extreme events; exclusion can bias performance. Forensic price/run evidence grows over time; automatic pruning is intentionally absent.

Candidate archives include recovered executed entries and may omit missed opportunities after rolling sources expire. PRHI score, entry-clock and screenshot-source uncertainty prevent exact historical attribution. Missing/delisted quotes, calendar coverage, fractional liquidity, fees/taxes and intraday execution remain limitations. Original databases, screenshots and decision evidence were preserved; no private database or credentials are in the patch.

Bundle `scripts/research-simulation.ts` with esbuild (`--bundle --platform=node --format=cjs --external:better-sqlite3`); pass investigation JSON, read-only SQLite backup and output JSON paths. It writes only the explicit output, with hashes and every trial. Do not replace frozen prices with a new download.

To release an extreme move, independently confirm instrument/basis/actions and back up the working DB. Bundle `scripts/review-price-vintage.ts` with the same options; pass explicit DB path, latest vintage ID, reviewer and evidence text/URL. Stale IDs and identity/currency/invalid-observation errors are refused. The tool appends a reviewed vintage, preserving rejection evidence. Later sync produces a separate replay rather than rewriting original decisions.
