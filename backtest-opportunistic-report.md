# Routine vs Opportunistic Insider Classification — Backtest

_Period: — → — · 0 observations (0 opportunistic / 0 routine) · benchmark: SPY (adjusted closes)_

## Hypothesis

Cohen, Malloy & Pomorski (*Decoding Inside Information*, Journal of Finance 2012) show that insider trades are not homogeneous: insiders who trade on a **predictable calendar schedule** ("routine" traders) earn essentially no abnormal returns, while insiders who **deviate from their established pattern** ("opportunistic" traders) earn large, persistent alpha — a long-short routine-vs-opportunistic portfolio produced ~82 bps/month in their sample. This backtest tests whether the app's calendar-pattern classifier (`classifyInsiderPattern`) reproduces that separation: do trades tagged **opportunistic** carry significantly more forward alpha vs SPY than trades tagged **routine**, out-of-sample?

## Results Summary

| Group | n (20d) | 5d α | 10d α | 20d α | 60d α | Win% (20d) | Sharpe (20d) | p (opp−rout, 20d) |
|---|---|---|---|---|---|---|---|---|
| Opportunistic | 0 | +0.0% | +0.0% | +0.0% | +0.0% | 0% | 0.00 | 1.000 |
| Routine | 0 | +0.0% | +0.0% | +0.0% | +0.0% | 0% | 0.00 | — |

Per-horizon detail (mean / median / win% / Sharpe / n, and the opportunistic−routine Welch t-test):

| Horizon | Opp mean | Opp med | Opp win% | Rout mean | Rout med | Rout win% | Δ mean | t | p |
|---|---|---|---|---|---|---|---|---|---|
| 5d | +0.0% (n=0) | +0.0% | 0% | +0.0% (n=0) | +0.0% | 0% | +0.0% | 0.00 | n<20 |
| 10d | +0.0% (n=0) | +0.0% | 0% | +0.0% (n=0) | +0.0% | 0% | +0.0% | 0.00 | n<20 |
| 20d | +0.0% (n=0) | +0.0% | 0% | +0.0% (n=0) | +0.0% | 0% | +0.0% | 0.00 | n<20 |
| 60d | +0.0% (n=0) | +0.0% | 0% | +0.0% (n=0) | +0.0% | 0% | +0.0% | 0.00 | n<20 |

⚠ = p ≥ 0.05 (insufficient evidence). "n<20" = below the minimum group size for a conclusion.

### Spearman IC — opportunistic indicator vs forward alpha

The classifier emits a **discrete label**, not a confidence score, so there is nothing continuous to rank. The IC below therefore uses the **binary opportunistic indicator** (1 = opportunistic, 0 = routine) — a rank-biserial correlation between the tag and realized alpha. A positive IC means opportunistic trades rank above routine trades on forward return.

| Horizon | IC (binary) | p | n |
|---|---|---|---|
| 5d | — | 1.000 | 0 |
| 10d | — | 1.000 | 0 |
| 20d | — | 1.000 | 0 |
| 60d | — | 1.000 | 0 |

## In-Sample vs Out-of-Sample

70 / 30 chronological split at — — in-sample n=0, out-of-sample n=0. Headline horizon: 20d.

| Split | Opp n | Opp mean α | Rout n | Rout mean α | Δ mean | t | p |
|---|---|---|---|---|---|---|---|
| In-sample | 0 | — | 0 | — | — | — | n<8 |
| Out-of-sample | 0 | — | 0 | — | — | — | n<8 |

## Sub-Hypothesis Results

Each cell requires n ≥ 20; otherwise it is reported as insufficient and no conclusion is drawn.

### 1. Opportunistic C-suite vs opportunistic director (20d α)

- Insufficient data (C-suite n=0, director n=0; need ≥ 20 each).

### 2. Opportunistic near earnings vs opportunistic with no near catalyst (20d α)

- Insufficient data (near-earnings n=0, no-catalyst n=0; need ≥ 20 each). Earnings proximity is joined from stored signals by (ticker, trade date) and is sparse for historical track-record trades.

### 3. Effect across market-cap buckets (20d α, opportunistic − routine)

- No market-cap data available for these tickers (ticker_meta empty for the classified names). Skipped.

## Verdict

**Insufficient data — no conclusion.** At the 20-day horizon there are 0 opportunistic and 0 routine observations with realized outcomes (need ≥ 20 each). The classifier only labels an insider once their full OpenInsider history has been fetched (on detail-modal open or scrape pre-warm), and only trades old enough to have ripened contribute here, so the sample builds slowly.

## Recommended Action

**Do not change scoring weights yet.** The routine/opportunistic flag remains display-only, as designed. Re-run this backtest in ~4–8 weeks once more insiders have been classified and their trades have ripened (target ≥ 20 per group). If/when validated, promote a pattern multiplier through the shadow-scoring (A/B) framework before it ever touches the live score.

## Methodology & Caveats

- Loaded 0 classified insider record(s) from C:\Users\8marc\AppData\Roaming\insider-whale-terminal\insider-tracker.db.
- Observations: 0 raw trades → 0 per insider-ticker-day → 0 after the 5-day same-pair gap. 0 dropped for missing/short price windows.
- 0 ticker(s) had no usable Yahoo adjusted series.
- Forward alpha = stock adjusted-close return − SPY adjusted-close return over the same window. Entry = first trading close on/after the trade date; exit = first trading close on/after entry + horizon.
- Pattern label is at the INSIDER level (`classifyInsiderPattern` over the full purchase history); every ripe recent trade of that insider inherits it. Role (C-suite/director) is likewise the insider-level `insider_role`, bucketed via `getRankWeight`.
- Earnings proximity is a best-effort read-only join from stored `signals` by (ticker, trade date); market cap from `ticker_meta`. Both are sparse for historical trades and drive the "insufficient data" fallbacks above.
- Read-only: this script never writes to the database or modifies any scraper. No data snooping — every test above was defined before the run.

_Generated 2026-07-04T10:46:27.502Z by scripts/backtest-opportunistic.ts._
