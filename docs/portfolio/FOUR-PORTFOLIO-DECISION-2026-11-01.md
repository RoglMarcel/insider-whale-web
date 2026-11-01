# Selected exit policy and four-portfolio comparison

The owner explicitly selected **15% activation / 10% trailing distance with next-close execution** on 2026-11-01. This supersedes the initial repair decision to retain legacy exits. It is an experimental choice after inspecting the sample, not a claim of optimized parameters. Keep the 25% loss trigger and 90-calendar-day hold; disable fixed profit targets, activated profit floors and sigma-scaled barriers.

## Published comparison

| Portfolio | Entry gate | Allocation / unused capital |
|---|---|---|
| 1 · S&P 500 | Buy-and-hold SPY | Same starting capital and comparison dates |
| 2 · Small positions + S&P 500 | Existing gate, 70 by default | Existing score-based sizing; unused capital in SPY |
| 3 · Concentrated signals | Same gate as portfolio 2 | 20% entry targets, five slots; unused capital stays in cash |
| 4 · alerts >80 only | Strictly **>80**, including decimals | Same controls as portfolio 3; only the cutoff differs |

All signal portfolios use the selected exits, shared prices, dates, starting capital, slippage, minimum ticket and cooldown. The fourth book is cash-based to isolate its cutoff against portfolio 3. A score of exactly 80 is excluded; 80.1 qualifies. The first qualifying observation controls entry eligibility. An alert first seen at 70 cannot be bought earlier using a later score above 80. The daily query now finds the first qualifying observation, rather than discarding later crossings or selecting the daily maximum. Date-only outcome observations remain deferred conservatively. Raw alerts and archived candidates remain available for research.

A completed closing price may trigger an exit; the order fills at the next available session close with an actual quote, including adverse gaps and slippage. It never fills at an invented stop level. At activation the trailing price trigger is approximately +3.5% before costs; the later fill can still lose money. SPY is the market benchmark. Portfolios 2–4 share signals and are dependent comparisons.

## Persistence and history

Configuration version 4 archives the previous configuration, stored book, events and experiments before applying the owner-selected exits once. Capital, inception, entry threshold and unrelated allocation settings are preserved. Later v4 custom edits survive restart. Engine version 7 builds and commits the main book and both comparison books in one transaction; a failure while writing the fourth book rolls everything back. Original immutable Backtest decision/closure evidence is retained; comparison replays do not create duplicate main-book decisions.

Each run records policy ID `trail15-10-nextclose-v2`, definition date 2026-11-01, input/config/run hashes and price-vintage IDs. Results before policy selection are labeled retrospective. Complete older runs remain archived, rather than being spliced into new curves. The fourth book survives JSON publication, source pruning, database restart and shared-history delivery. Shared delivery now retains string experiment IDs, fixing the loss of saved comparison books on transfer. Older payloads without a fourth book display a pending fourth card. Dates, capital, benchmark and exit/cost controls must match before curves are compared.

## Frozen diagnostic

The read-only backup and investigation end on 2026-10-30. The revised diagnostic reconstructs 74 broad candidate observations and four strict-cutoff observations from remaining first-qualified source rows, candidate archives and recovered entries. This expanded pool differs from the initial 66-observation study. Both policies below use identical inputs within each portfolio; differences from that older study must not be attributed entirely to exits.

All books start with $10,000 on 2026-09-01. Slippage is 5 bps per side. The SPY benchmark ends at **$9,882.37 (−1.18%)**.

| Portfolio | Legacy 25/20, same close | Selected 15/10, next close | Selected entries | Mean capital in alerts |
|---|---:|---:|---:|---:|
| Alerts + S&P 500 | $9,175.75 (−8.24%) | $9,707.00 (−2.93%) | 14 | 41.5% |
| Concentrated signals | $8,992.45 (−10.08%) | $9,622.81 (−3.77%) | 8 | 88.3% |
| alerts >80 only | $9,661.93 (−3.38%) | $10,255.09 (+2.55%) | 2 | 18.0% |

The selected exits improve this slice, but two high-score entries cannot establish a superior cutoff. Low exposure, overlapping signals, selection after seeing the results, incomplete expired observations, unresolved price/security/ALP evidence, and absent liquidity/tax/fee modeling limit inference. This is a retrospective calculation, not independent validation or a live track record. Continue collecting the broad data and compare future observations under fixed documented rules.

Input hashes: investigation SHA-256 `e247834a4b86b942617c50e9e1f30adb7acf44564ec269bfaa9410f47635da07`; price map `3bef4c2c9176e7c6d2e4221a678a1ff7b45cf7b3d3f0d432ef33c2273e971ec5`; broad candidates `2c65f6ee54f6b5ea6bf64e4dc6239778bb6dce229e9a098b8594e8dafd2d7540`; strict candidates `f09fa02363287f45e8523503e4773bfa2c7a2c9ccd8bc1c95e55a4c8f6228d4f`. Repeated replays match exactly.

Reproduce with explicitly supplied frozen files; the script never migrates the database or fetches prices:

```sh
npx esbuild scripts/research-four-portfolios.ts --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=tmp/research-four-portfolios.cjs
node tmp/research-four-portfolios.cjs INVESTIGATION.json FROZEN.db OUTPUT.json
```

## Verification and delivery

`npm test` passes 644 unit/invariant/golden tests. Both TypeScript projects, scoring regression, desktop and web builds pass. `npm run verify:comparisons` covers migration/restart, archive preservation, threshold timing, shared controls, atomic rollback, price correction, immutable history, publication, pruning and transport. Existing simulation/backtest/shared-history/native persistence checks pass, along with 21 Python persistence tests, five parser tests and 26 access tests under Node 22. Responsive browser checks cover 320–1440 px, English/German fourth-book details, exact-80 exclusion, legacy/mismatched payloads and existing access, Backtest and simulation controls.

Only isolated fixtures are migrated or synced. The installed database and public deployment are untouched. Delivery is a normal push to the existing repair branch/PR; no force-push or merge. The selected policy and fourth book become active after that change is merged/released and the normal portfolio sync completes.
