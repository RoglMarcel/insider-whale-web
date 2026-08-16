# Component Alpha Analysis

_Period: 2025-08-18 → 2026-07-19 · n = 421 observations (deduplicated: 1443 ripe raw → 1084 per ticker-day → 496 after the 5-day same-ticker gap) · benchmark: SPY (adjusted closes)_

Data: 388 observations from the local signals DB, 33 synthesized from SEC EDGAR Form 4 filings.
Horizons: 5/10/20-day forward alpha vs SPY. Headline IC = Spearman(component, 10d alpha).
Verdict thresholds (fixed before analysis): IC ≥ 0.05 meaningful, ≥ 0.1 strong; p < 0.05; walk-forward 70/30 chronological split; min 30 observations per component.

## Summary Rankings

| Rank | Component | n | IC (in-sample) | IC (out-of-sample) | p-value (top vs bottom, 10d) | Verdict |
|---|---|---|---|---|---|---|
| 1 | Earnings timing multiplier (insider leg) | 388 | -0.026 | 0.157 | 0.630 ⚠ insufficient evidence | Neutral |
| 2 | Freshness / time decay | 421 | 0.024 | 0.109 | 0.007 | Drives alpha |
| 3 | Cluster detection | 388 | -0.023 | 0.100 | 0.473 ⚠ insufficient evidence | Neutral |
| 4 | Insider track record (shrunk win rate) | 388 | -0.042 | 0.000 | 0.046 | Neutral |
| 5 | Options sentiment (C/P direction) | 47 | 0.252 | -0.078 | 0.218 ⚠ insufficient evidence | Noise (collapses out-of-sample) |
| 6 | Options scoring (net detailed score) | 388 | -0.019 | -0.090 | 0.389 ⚠ insufficient evidence | Neutral |
| 7 | Insider rank weighting | 421 | 0.006 | -0.096 | 0.688 ⚠ insufficient evidence | Neutral |
| 8 | Transaction-type weighting | 421 | 0.008 | -0.100 | 0.270 ⚠ insufficient evidence | Neutral |
| 9 | Buy sizing (dollar-volume points) | 421 | 0.061 | -0.102 | 0.655 ⚠ insufficient evidence | Noise (collapses out-of-sample) |
| 10 | Combo detection bonus | 388 | — | — | — | Insufficient variation |
| 11 | VIX boost | 388 | — | — | — | Insufficient variation |
| 12 | Valuation multiplier | 388 | — | — | — | Insufficient variation |

## Component Details

### Insider rank weighting

_Source: breakdown.rankWeight (DB) / getRankWeight(role) (EDGAR)_ · n = 421

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 105 | -1.40% | -0.81% | 0.71% |
| Q2 | 105 | -0.41% | 0.82% | -0.31% |
| Q3 | 105 | 0.24% | 0.45% | 1.84% |
| Q4 | 106 | -1.14% | -1.32% | -1.39% |

- Spearman: 5d: ρ=0.065 (p=0.186) · 10d: ρ=-0.039 (p=0.425) · 20d: ρ=-0.077 (p=0.114)
- IC in-sample: **0.006** (n=294) · IC out-of-sample: **-0.096** (n=127)
- Top-vs-bottom spread (10d): -0.51pp, t=-0.40, p=0.688 — **insufficient evidence**
- **Verdict: Neutral**

### Buy sizing (dollar-volume points)

_Source: breakdown.dollarVolumePoints (DB) / getDollarVolumePoints(value) (EDGAR; absolute buckets — market cap was not persisted historically)_ · n = 421

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 105 | -1.14% | -0.48% | 0.95% |
| Q2 | 105 | -0.84% | -0.62% | -1.66% |
| Q3 | 105 | -0.74% | 0.16% | 0.71% |
| Q4 | 106 | 0.01% | 0.08% | 0.83% |

- Spearman: 5d: ρ=0.112 (p=0.022) · 10d: ρ=0.007 (p=0.886) · 20d: ρ=-0.014 (p=0.772)
- IC in-sample: **0.061** (n=294) · IC out-of-sample: **-0.102** (n=127)
- Top-vs-bottom spread (10d): 0.56pp, t=0.45, p=0.655 — **insufficient evidence**
- **Verdict: Noise (collapses out-of-sample)**

### Cluster detection

_Source: breakdown.clusterMultiplier (DB only)_ · n = 388

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| V1 (=1) | 362 | -0.74% | -0.15% | 0.45% |
| V2 (=1.5) | 16 | -1.85% | -3.60% | -4.59% |
| V3 (=2) | 4 | 2.26% | 0.86% | -5.04% |
| V4 (=3) | 6 | 3.54% | 2.53% | 0.05% |

- Spearman: 5d: ρ=0.078 (p=0.123) · 10d: ρ=-0.013 (p=0.801) · 20d: ρ=-0.072 (p=0.158)
- IC in-sample: **-0.023** (n=271) · IC out-of-sample: **0.100** (n=117)
- Top-vs-bottom spread (10d): 2.68pp, t=0.77, p=0.473 — **insufficient evidence**
- **Verdict: Neutral**

### Transaction-type weighting

_Source: breakdown.typeModifier (DB) / classifyTransaction(type).modifier (EDGAR)_ · n = 421

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| V1 (=0) | 242 | -0.75% | 0.20% | 0.55% |
| V2 (=0.4) | 3 | -2.32% | -1.54% | -7.01% |
| V3 (=1) | 176 | -0.55% | -0.77% | -0.14% |

- Spearman: 5d: ρ=0.073 (p=0.136) · 10d: ρ=-0.043 (p=0.384) · 20d: ρ=-0.064 (p=0.187)
- IC in-sample: **0.008** (n=294) · IC out-of-sample: **-0.100** (n=127)
- Top-vs-bottom spread (10d): -0.97pp, t=-1.11, p=0.270 — **insufficient evidence**
- **Verdict: Neutral**

### Earnings timing multiplier (insider leg)

_Source: breakdown.timingMultiplier (DB only)_ · n = 388

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 97 | -0.95% | -1.33% | -1.61% |
| Q2 | 97 | -0.22% | 0.65% | 0.04% |
| Q3 | 97 | -0.53% | 0.48% | 2.14% |
| Q4 | 97 | -1.07% | -0.76% | 0.16% |

- Spearman: 5d: ρ=-0.018 (p=0.730) · 10d: ρ=-0.048 (p=0.351) · 20d: ρ=0.051 (p=0.314)
- IC in-sample: **-0.026** (n=271) · IC out-of-sample: **0.157** (n=117)
- Top-vs-bottom spread (10d): 0.57pp, t=0.48, p=0.630 — **insufficient evidence**
- **Verdict: Neutral**

### Options scoring (net detailed score)

_Source: breakdown.optionsScore (DB only)_ · n = 388

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 97 | -0.56% | -0.77% | 0.22% |
| Q2 | 97 | -1.42% | -1.04% | -0.13% |
| Q3 | 97 | -1.08% | 0.64% | 0.98% |
| Q4 | 97 | 0.31% | 0.22% | -0.35% |

- Spearman: 5d: ρ=0.074 (p=0.146) · 10d: ρ=-0.044 (p=0.388) · 20d: ρ=-0.141 (p=0.005)
- IC in-sample: **-0.019** (n=271) · IC out-of-sample: **-0.090** (n=117)
- Top-vs-bottom spread (10d): 0.98pp, t=0.86, p=0.389 — **insufficient evidence**
- **Verdict: Neutral**

### Options sentiment (C/P direction)

_Source: bullish premium share of options_activity JSON (DB only; 0..1)_ · n = 47

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 11 | -0.36% | -3.91% | -6.48% |
| Q2 | 11 | -1.27% | -2.56% | -4.63% |
| Q3 | 11 | 4.79% | 2.76% | -3.11% |
| Q4 | 14 | -0.04% | -0.13% | -2.42% |

- Spearman: 5d: ρ=0.116 (p=0.437) · 10d: ρ=0.159 (p=0.286) · 20d: ρ=0.236 (p=0.110)
- IC in-sample: **0.252** (n=32) · IC out-of-sample: **-0.078** (n=15)
- Top-vs-bottom spread (10d): 3.78pp, t=1.29, p=0.218 — **insufficient evidence**
- **Verdict: Noise (collapses out-of-sample)**

### Combo detection bonus

_Source: breakdown.comboBonus (DB only; 0 or 30)_ · n = 388

**Insufficient variation** — no usable cross-sectional variation (1 distinct value(s), minority n=0 < 8).

### Freshness / time decay

_Source: breakdown.freshnessMultiplier (DB) / filing-lag decay (EDGAR)_ · n = 421

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 105 | -1.10% | -1.74% | -0.92% |
| Q2 | 105 | -0.48% | 0.03% | 0.22% |
| Q3 | 105 | -0.35% | -0.52% | -0.37% |
| Q4 | 106 | -0.78% | 1.35% | 1.89% |

- Spearman: 5d: ρ=-0.015 (p=0.754) · 10d: ρ=0.071 (p=0.146) · 20d: ρ=0.091 (p=0.061)
- IC in-sample: **0.024** (n=294) · IC out-of-sample: **0.109** (n=127)
- Top-vs-bottom spread (10d): 3.10pp, t=2.72, p=0.007
- **Verdict: Drives alpha**

### VIX boost

_Source: breakdown.vixMultiplier (DB only)_ · n = 388

**Insufficient variation** — no usable cross-sectional variation (1 distinct value(s), minority n=0 < 8).

### Insider track record (shrunk win rate)

_Source: breakdown.trackRecordMultiplier (DB only)_ · n = 388

| Bucket (low → high) | n | α 5d | α 10d | α 20d |
|---|---|---|---|---|
| Q1 | 97 | -0.48% | -0.83% | 0.21% |
| Q2 | 97 | -1.41% | -0.88% | -0.27% |
| Q3 | 97 | -0.30% | -0.61% | -1.49% |
| Q4 | 97 | -0.57% | 1.37% | 2.28% |

- Spearman: 5d: ρ=-0.015 (p=0.768) · 10d: ρ=-0.038 (p=0.453) · 20d: ρ=-0.045 (p=0.380)
- IC in-sample: **-0.042** (n=271) · IC out-of-sample: **0.000** (n=117)
- Top-vs-bottom spread (10d): 2.20pp, t=2.01, p=0.046
- **Verdict: Neutral**

### Valuation multiplier

_Source: parsed from breakdown.notes ("(×1.15)" etc.; DB only — the multiplier itself is not persisted)_ · n = 388

**Insufficient variation** — no usable cross-sectional variation (2 distinct value(s), minority n=2 < 8).

## Removal Test (composite with vs without each component)

Baseline: composite reconstructed from the persisted per-observation component values (current model formula), IC vs 10d alpha = **-0.083** over n=388 DB observations. ΔIC > 0 means the component adds predictive rank power to the composite.

| Component | IC with | IC without | ΔIC |
|---|---|---|---|
| Insider rank weighting | -0.083 | -0.045 | -0.038 |
| Buy sizing (dollar-volume points) | -0.083 | -0.076 | -0.007 |
| Cluster detection | -0.083 | -0.081 | -0.002 |
| Transaction-type weighting | -0.083 | -0.083 | +0.000 |
| Earnings timing multiplier (insider leg) | -0.083 | -0.084 | +0.002 |
| Options scoring (net detailed score) | -0.083 | -0.052 | -0.031 |
| Options sentiment (C/P direction) | — | — | n/a (enters via options score sign) |
| Combo detection bonus | -0.083 | -0.083 | +0.000 |
| Freshness / time decay | -0.083 | -0.074 | -0.008 |
| VIX boost | -0.083 | -0.083 | +0.000 |
| Insider track record (shrunk win rate) | -0.083 | -0.083 | -0.000 |
| Valuation multiplier | -0.083 | -0.083 | -0.000 |

_Sanity: reconstructed-vs-stored score Spearman = 0.993 over n=388 (differences are expected where rows were scored by older model versions)._

## Recommended Weight Adjustments

Mechanically derived from the verdicts via the mapping fixed before the run (no post-hoc tuning):

- **Earnings timing multiplier (insider leg)** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Freshness / time decay** — **Increase weight** (getFreshnessMultiplier — src/types/index.ts): decay faster (exp rate −0.115 → −0.155).
- **Cluster detection** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Insider track record (shrunk win rate)** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Options sentiment (C/P direction)** — **Reduce influence** (sentiment normalization — electron/scraper/optionsMap.ts): dampen the directional split (subtract only 0.5× bearScore). In-sample edge did not survive out-of-sample.
- **Options scoring (net detailed score)** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Insider rank weighting** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Transaction-type weighting** — Keep as-is — no evidence for change (insufficient evidence at p ≥ 0.05 or |IC| < 0.05).
- **Buy sizing (dollar-volume points)** — **Reduce influence** (getDollarVolumePoints — electron/scoring.ts): flatten the buckets (20 → 14, 14 → 11, 10 → 9). In-sample edge did not survive out-of-sample.
- **Combo detection bonus** — No change — no usable cross-sectional variation (1 distinct value(s), minority n=0 < 8). Revisit once more history accumulates.
- **VIX boost** — No change — no usable cross-sectional variation (1 distinct value(s), minority n=0 < 8). Revisit once more history accumulates.
- **Valuation multiplier** — No change — no usable cross-sectional variation (2 distinct value(s), minority n=2 < 8). Revisit once more history accumulates.

## Methodology & Caveats

- Loaded 3029 raw signal rows from C:\Users\8marc\AppData\Roaming\insider-whale-terminal\insider-tracker.db.
- EDGAR: sampled 48 weekdays (43 with an index) over the last 365 days, fetched 387 Form 4 filings → 36 open-market purchases. Cluster/options/VIX/track-record/valuation are not derivable from a sampled EDGAR slice and are left unset.
- Deduplication (F31 fix): 1443 ripe raw → 1084 per ticker-day → 496 after the 5-day same-ticker gap; observations newer than 27 days are excluded so every observation has a complete 20-day outcome.
- Prices: Yahoo adjusted closes ONLY (raw closes are never used — F15). 75 observations were dropped for missing price windows; 62 ticker(s) had no usable adjusted series: SAVA, VERO, MIGI, SPX, BK, BLL, COGO, EIR, ELN, GGLOO, IIPX, NNTSK, TTYG, PPRU, CCOE, SSMFG, JJEF, -, AARDC, EENR, CCMC, TTDIC, AAVO, FFULC, GGRML, VVANI, CCOHN, CCCCTU, GGLBS, LLGHL, ….
- Entry = first trading close on/after the decision date; exits = first trading close on/after entry + horizon.
- The valuation multiplier is recovered from breakdown notes (it is not persisted as a field); it was 1.0 for nearly all historical rows because valuation pre-warm is login-gated.
- The reconstruction uses options-leg freshness = 1.0 (options were scraped live; the per-leg age is not persisted).
- Historical `dollarVolumePoints` reflect absolute buckets: market cap was not populated in production before the F1 fix, and it is not persisted per signal.
- EDGAR-derived observations cover insider-side components only; cluster detection is not measurable on a sampled EDGAR slice.
- Multiple-hypothesis caveat: 12 components at p < 0.05 imply ≈ 0.6 false positives by chance; treat single-component significance accordingly and re-run as more history accrues.

_Generated 2026-08-16T08:21:52.605Z by scripts/backtest-components.ts (read-only; no DB writes)._
