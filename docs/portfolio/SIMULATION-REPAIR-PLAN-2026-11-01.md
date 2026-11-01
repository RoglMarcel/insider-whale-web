# Simulation repair plan — 2026-11-01

Baseline: `6c5bc2352ede2f4550a471ecdd0e5512877ae176`. Read all Math, Studies and Trading notes and the frozen exit investigation. No production database will be modified in this investigation.

## Confirmed mechanisms

1. `syncPrices` drops rejected incoming observations, then only upserts accepted rows. Previously cached rejected dates survive. The frozen input records 24 ALP rejection events on dates still usable in the cache; correctness of the actual ALP prices remains unresolved.
2. `screenSeries` holds the last accepted anchor after a rejection. A bad anchor or genuine discontinuity can poison the rest of a fetch. Magnitude alone cannot establish a bad quote.
3. `runSync` preserves settled equity while replacing positions/events from a fresh replay. Price restatements can produce inconsistent curve components and trade results.
4. The existing 25%/20% trailing geometry arms at a nominal 0% trigger return. This is a policy choice, not a failed comparison. Same-close decisions/fills are optimistic execution assumptions; closes can overshoot stops.
5. The read model computes barriers using draft settings even while returning stored settings. Publication lacks identifiers for frozen simulation inputs. Both portfolios share signals/rules and are dependent comparisons.

## Implementation

* Data integrity: retain immutable complete price vintages, including quarantine reasons, provider identity and basis. Atomically replace each active ticker series on a successful refresh, including empty/quarantined series; preserve on transport failure. Never merge disjoint adjusted-price vintages. Propagate complete vintages through desktop/shared/Python publication paths, with legacy import unable to resurrect rejected points. Unexplained extreme moves require review or corrected data, with no repeated last-good-anchor comparison. Corporate-action adjustment remains full-series, not raw-close substitution.
* Reproducibility: preserve prior books before coherent replay replacement; transact equity, positions, experiment, events and run metadata together. Hash configuration, candidates and price inputs; expose execution/basis/run identifiers in published state. Archive original backtest evidence through its existing immutable record/replay mechanism.
* Policy: retain defaults. Add optional activated profit floor and next-observed-session-close exit execution, with versioned comparison presets. Keep full-position archive semantics; partial realization is a diagnostic comparison only until its accounting/archive model exists. Use the same barrier calculation in engine and UI.
* Files: prices/cache/database, portfolio engine/orchestrator, shared-history/web/Python transport, types/config/rules UI, research CLI, regression tests and decision report. Additive schema migration; legacy caches remain identifiable until refreshed. No silent default-parameter migration.

## Acceptance and research

Reproduce the five frozen main-book closures and all six earlier fixed-entry diagnostics. Freeze an independent local SQLite backup for candidate/capital-constrained replay where coverage permits; report input hashes, costs, open marks, cash reuse, caps, cooldown and benchmark. Compare earlier/narrower trail, floor, target, partial diagnostic and delayed execution; stress costs. No declaration of optimality or claim that exits explain every loss.

Test rejected cached dates, corrected recovery, outages, extreme moves, adjusted identity/currency, cross-vintage merge, restart, activation/precedence/overshoot, peak persistence, delayed exits with missing quotes, stored-vs-draft labels, config persistence and deterministic replay. Run CI checks (typecheck, unit/invariant/golden, scoring, builds, SQLite/persistence/access and relevant UI checks). Record exact failures and limits.

## Remaining uncertainty

Original provider responses, independent ALP identity/action confirmation, screenshot source/build and intraday liquidity are absent. A replay of cached observations is conditional on those observations, not verified market truth. Fourteen selected entries and overlapping portfolios cannot validate new production thresholds. Unknown publication times and reconstructed entry candidates limit historical execution claims.
