# Component Alpha Analysis

_Period: 2023-07-25 → 2026-03-17 · n = 88 observations (deduplicated: 116 ripe raw → 110 per ticker-day → 110 after the 5-day same-ticker gap) · benchmark: SPY (adjusted closes)_

Data: 0 observations from the local signals DB, 88 synthesized from SEC EDGAR Form 4 filings.
Horizons: 5/10/20-day forward alpha vs SPY. Headline IC = Spearman(component, 10d alpha).
Verdict thresholds (fixed before analysis): IC ≥ 0.05 meaningful, ≥ 0.1 strong; p < 0.05; walk-forward 70/30 chronological split; min 30 observations per component.

## Summary Rankings

| Rank | Component | n | IC (in-sample) | IC (out-of-sample) | p-value (top vs bottom, 10d) | Verdict |
|---|---|---|---|---|---|---|
| 1 | Freshness / time decay | 88 | 0.132 | 0.342 | 0.021 | Drives alpha |
| 2 | Insider rank weighting | 88 | 0.161 | 0.073 | 0.171 ⚠ insufficient evidence | Neutral |
| 3 | Buy sizing (dollar-volume points) | 88 | 0.272 | -0.011 | 0.090 ⚠ insufficient evidence | Noise (collapses out-of-sample) |
| 4 | Cluster detection | 0 | — | — | — | Insufficient data |
| 5 | Transaction-type weighting | 88 | — | — | — | Insufficient variation |
| 6 | Earnings timing multiplier (insider leg) | 0 | — | — | — | Insufficient data |
| 7 | Options scoring (net detailed score) | 0 | — | — | — | Insufficient data |
| 8 | Options sentiment (C/P direction) | 0 | — | — | — | Insufficient data |
| 9 | Combo detection bonus | 0 | — | — | — | Insufficient data |
| 10 | VIX boost | 0 | — | — | — | Insufficient data |
| 11 | Insider track record (shrunk win rate) | 0 | — | — | — | Insufficient data |
| 12 | Valuation multiplier | 0 | — | — | — | Insufficient data |

## Component Details

### Insider rank weighting

_Source: breakdown.rankWeight (DB) / getRankWeight(role) (EDGAR)_ · n = 88

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 22 | -2.37% | -2.00% | 2.55% |
| Q2 | 22 | 0.84% | 0.70% | -0.27% |
| Q3 | 22 | 0.03% | 1.22% | 3.31% |
| Q4 | 22 | 3.81% | 4.79% | 6.16% |

- Spearman: 5d: ρ=0.260 (p=0.015) · 10d: ρ=0.140 (p=0.194) · 20d: ρ=0.045 (p=0.675)
- IC in-sample: **0.161** (n=61) · IC out-of-sample: **0.073** (n=27)
- Top-vs-bottom spread (10d): 6.79pp, t=1.41, p=0.171 — **insufficient evidence**
- **Verdict: Neutral**

### Buy sizing (dollar-volume points)

_Source: breakdown.dollarVolumePoints (DB) / getDollarVolumePoints(value) (EDGAR; absolute buckets — market cap was not persisted historically)_ · n = 88

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 22 | -1.79% | -3.81% | -2.44% |
| Q2 | 22 | 2.34% | 1.89% | 5.73% |
| Q3 | 22 | 0.39% | 1.51% | 1.49% |
| Q4 | 22 | 1.36% | 5.11% | 6.97% |

- Spearman: 5d: ρ=0.069 (p=0.521) · 10d: ρ=0.199 (p=0.063) · 20d: ρ=0.124 (p=0.250)
- IC in-sample: **0.272** (n=61) · IC out-of-sample: **-0.011** (n=27)
- Top-vs-bottom spread (10d): 8.91pp, t=1.76, p=0.090 — **insufficient evidence**
- **Verdict: Noise (collapses out-of-sample)**

### Cluster detection

_Source: breakdown.clusterMultiplier (DB only)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Transaction-type weighting

_Source: breakdown.typeModifier (DB) / classifyTransaction(type).modifier (EDGAR)_ · n = 88

**Insufficient variation** — no usable cross-sectional variation (2 distinct value(s), minority n=1 < 8).

### Earnings timing multiplier (insider leg)

_Source: breakdown.timingMultiplier (DB only)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Options scoring (net detailed score)

_Source: breakdown.optionsScore (DB only)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Options sentiment (C/P direction)

_Source: bullish premium share of options_activity JSON (DB only; 0..1)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Combo detection bonus

_Source: breakdown.comboBonus (DB only; 0 or 30)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Freshness / time decay

_Source: breakdown.freshnessMultiplier (DB) / filing-lag decay (EDGAR)_ · n = 88

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 22 | -2.84% | -4.21% | -1.56% |
| Q2 | 22 | 4.24% | 6.44% | 8.32% |
| Q3 | 22 | 0.80% | 0.86% | 4.62% |
| Q4 | 22 | 0.09% | 1.61% | 0.38% |

- Spearman: 5d: ρ=0.123 (p=0.255) · 10d: ρ=0.186 (p=0.082) · 20d: ρ=-0.010 (p=0.927)
- IC in-sample: **0.132** (n=61) · IC out-of-sample: **0.342** (n=27)
- Top-vs-bottom spread (10d): 5.83pp, t=2.41, p=0.021
- **Verdict: Drives alpha**

### VIX boost

_Source: breakdown.vixMultiplier (DB only)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Insider track record (shrunk win rate)

_Source: breakdown.trackRecordMultiplier (DB only)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

### Valuation multiplier

_Source: parsed from breakdown.notes ("(×1.15)" etc.; DB only — the multiplier itself is not persisted)_ · n = 0

**Insufficient data** — n=0 < 30 independent observations.

## Removal Test (composite with vs without each component)

_skipped — only 0 fully-populated DB observations (< 30)._

## Recommended Weight Adjustments

Mechanically derived from the verdicts via the mapping fixed before the run (no post-hoc tuning):

- **Freshness / time decay** — **Increase weight** (getFreshnessMultiplier — src/types/index.ts): decay faster (exp rate −0.115 → −0.155).
- **Insider rank weighting** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Buy sizing (dollar-volume points)** — **Reduce influence** (getDollarVolumePoints — electron/scoring.ts): flatten the buckets (20 → 14, 14 → 11, 10 → 9). In-sample edge did not survive out-of-sample.
- **Cluster detection** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **Transaction-type weighting** — No change — no usable cross-sectional variation (2 distinct value(s), minority n=1 < 8). Revisit once more history accumulates.
- **Earnings timing multiplier (insider leg)** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **Options scoring (net detailed score)** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **Options sentiment (C/P direction)** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **Combo detection bonus** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **VIX boost** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **Insider track record (shrunk win rate)** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.
- **Valuation multiplier** — No change — n=0 < 30 independent observations. Revisit once more history accumulates.

## Methodology & Caveats

- Loaded 605 raw signal rows from C:\Users\8marc\AppData\Roaming\insider-whale-terminal\insider-tracker.db.
- EDGAR: sampled 48 weekdays (46 with an index) over the last 1095 days, fetched 1472 Form 4 filings → 116 open-market purchases. Cluster/options/VIX/track-record/valuation are not derivable from a sampled EDGAR slice and are left unset.
- Deduplication (F31 fix): 116 ripe raw → 110 per ticker-day → 110 after the 5-day same-ticker gap; observations newer than 27 days are excluded so every observation has a complete 20-day outcome.
- Prices: Yahoo adjusted closes ONLY (raw closes are never used — F15). 22 observations were dropped for missing price windows; 19 ticker(s) had no usable adjusted series: AWH, TGAN, NRGX, TFFP, EVBG, FOMC, CTCX, KSM, NANX, LGF, AE, BIGZ, MIO, DFCO, LAZY, ENX, NBY, EVM, SNV.
- Entry = first trading close on/after the decision date; exits = first trading close on/after entry + horizon.
- The valuation multiplier is recovered from breakdown notes (it is not persisted as a field); it was 1.0 for nearly all historical rows because valuation pre-warm is login-gated.
- The reconstruction uses options-leg freshness = 1.0 (options were scraped live; the per-leg age is not persisted).
- Historical `dollarVolumePoints` reflect absolute buckets: market cap was not populated in production before the F1 fix, and it is not persisted per signal.
- EDGAR-derived observations cover insider-side components only; cluster detection is not measurable on a sampled EDGAR slice.
- Multiple-hypothesis caveat: 12 components at p < 0.05 imply ≈ 0.6 false positives by chance; treat single-component significance accordingly and re-run as more history accrues.

_Generated 2026-07-03T13:15:08.886Z by scripts/backtest-components.ts (read-only; no DB writes)._
