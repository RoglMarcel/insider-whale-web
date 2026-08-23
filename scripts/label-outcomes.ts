/**
 * Outcome labeler — turns stored signals into TRAINING DATA (v1.1.13).
 *
 * For every signal whose horizon has ripened, it records the realized
 * SPY-relative alpha into `signal_outcomes`. Runs after each scheduled scrape, so
 * the labeled dataset grows on its own — which is the thing the scoring model
 * actually lacks (the component backtest measured ICs on samples where most
 * components never varied).
 *
 *   npm run label:outcomes
 *
 * Design notes:
 *  - The score is taken from the FIRST sighting of a signal and never recomputed,
 *    so labels can't inherit hindsight.
 *  - Prices are adjusted closes from Yahoo's chart API (same endpoint the app
 *    already uses in stockstats.ts), one request per ticker, cached per run.
 *  - Rows are written once (ON CONFLICT DO NOTHING) — re-running is cheap and
 *    only fills genuine gaps.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fetchAdjCloseSeries, priceOnOrAfter, PRICE_REQUEST_GAP_MS, sleep } from '../electron/prices';
import {
  initDatabase,
  closeDatabase,
  getOutcomeCandidates,
  getLabeledKeys,
  upsertSignalOutcomes,
  getOutcomeCoverage,
  type SignalOutcome,
} from '../electron/database';

const HORIZONS = [5, 10, 20] as const; // calendar days forward
const MAX_TICKERS_PER_RUN = Number(process.env.LABEL_MAX_TICKERS ?? 250);

type Series = { date: string; px: number }[];
const cache = new Map<string, Series | null>();

async function fetchSeries(ticker: string): Promise<Series | null> {
  if (cache.has(ticker)) return cache.get(ticker)!;
  await sleep(PRICE_REQUEST_GAP_MS);
  const points = await fetchAdjCloseSeries(ticker, { range: '1y' });
  const series = points?.length ? points : null;
  cache.set(ticker, series);
  return series;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'insider-tracker.db');
  if (!fs.existsSync(dbPath)) {
    console.log(`[label] no DB at ${dbPath} — nothing to label.`);
    return;
  }
  initDatabase(dbPath);

  const candidates = getOutcomeCandidates().filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.entryDate));
  const labeled = getLabeledKeys();
  const today = new Date().toISOString().slice(0, 10);

  // Only ripe (entry + horizon in the past) and not-yet-labeled work.
  const todo = candidates.filter((c) =>
    HORIZONS.some((h) => addDays(c.entryDate, h) <= today && !labeled.has(`${c.ticker}|${c.entryDate}|${h}`)),
  );
  // Newest first: delisted / bad tickers never return prices, so they'd otherwise
  // consume the whole per-run budget every time and starve fresh signals.
  const tickers = [
    ...new Set([...todo].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).map((c) => c.ticker)),
  ].slice(0, MAX_TICKERS_PER_RUN);
  console.log(
    `[label] candidates=${candidates.length} · already labeled=${labeled.size} · ripe+missing=${todo.length} · tickers this run=${tickers.length}`,
  );
  if (!tickers.length) {
    report();
    closeDatabase();
    return;
  }

  const spy = await fetchSeries('SPY');
  if (!spy) {
    console.log('[label] SPY series unavailable — aborting (alpha needs the benchmark).');
    closeDatabase();
    return;
  }

  const out: SignalOutcome[] = [];
  let done = 0;
  for (const ticker of tickers) {
    const series = await fetchSeries(ticker);
    done++;
    if (done % 50 === 0) console.log(`   …${done}/${tickers.length}`);
    if (!series) continue;
    for (const c of todo.filter((x) => x.ticker === ticker)) {
      const entry = priceOnOrAfter(series, c.entryDate);
      const spyEntry = priceOnOrAfter(spy, c.entryDate);
      if (!entry || !spyEntry) continue;
      for (const h of HORIZONS) {
        const key = `${c.ticker}|${c.entryDate}|${h}`;
        if (labeled.has(key)) continue;
        const target = addDays(c.entryDate, h);
        if (target > today) continue;
        const exit = priceOnOrAfter(series, target);
        const spyExit = priceOnOrAfter(spy, target);
        if (!exit || !spyExit) continue;
        const ret = exit.px / entry.px - 1;
        const spyRet = spyExit.px / spyEntry.px - 1;
        out.push({
          ticker: c.ticker,
          entryDate: c.entryDate,
          horizon: h,
          entryPrice: entry.px,
          exitPrice: exit.px,
          ret,
          spyRet,
          alpha: ret - spyRet,
          score: c.score,
          conviction: c.conviction,
          breakdown: c.breakdown,
        });
      }
    }
  }

  const written = upsertSignalOutcomes(out);
  console.log(`[label] wrote ${written} new labeled outcome(s).`);
  report();
  closeDatabase();
}

/** Honest coverage: how much data exists, and is each component measurable yet? */
function report(): void {
  const { perHorizon, components } = getOutcomeCoverage();
  console.log('\n── Trainingsdaten ───────────────────────────');
  if (!perHorizon.length) {
    console.log('  (noch keine gelabelten Outcomes)');
  } else {
    for (const h of perHorizon) {
      // Power rule of thumb: SE(IC) ≈ 1/√n → n≈780 detects IC 0.10 at 80% power.
      const need = 780;
      const pct = Math.min(100, Math.round((h.n / need) * 100));
      console.log(`  ${String(h.horizon).padStart(2)}d Horizont: n=${String(h.n).padStart(5)}   ${pct}% des Ziels (n≈${need} für IC 0.10)`);
    }
  }
  if (components.length && components[0].total > 0) {
    console.log('\n── Messbarkeit je Komponente (20d) ──────────');
    for (const c of [...components].sort((a, b) => b.varying - a.varying)) {
      const pct = (c.varying / c.total) * 100;
      const verdict = pct >= 30 ? 'messbar' : pct >= 10 ? 'grenzwertig' : 'NICHT messbar';
      console.log(`  ${c.name.padEnd(18)} variiert in ${String(c.varying).padStart(5)}/${c.total} (${pct.toFixed(1)}%)  ${verdict}`);
    }
  }
}

main().catch((err) => {
  console.error('[label] THREW:', err);
  process.exit(1);
});
