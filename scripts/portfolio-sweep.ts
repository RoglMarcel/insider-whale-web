/**
 * Parameter sweep for the testing portfolio (READ-ONLY).
 *
 *   npm run portfolio:sweep
 *
 * Re-runs the whole simulation under alternative thresholds, hold limits,
 * barrier pairs and cash policies, and prints one row per variant.
 *
 * READ THE CAVEAT IT PRINTS. With ~11 entry days of stored signal history and a
 * handful of signals above the threshold, no variant here is statistically
 * distinguishable from any other. The sweep measures SENSITIVITY — how much the
 * answer moves when a knob moves — not superiority. A single trade decides most
 * of these rows, which is exactly why the defaults are only changed when a
 * variant wins CONSISTENTLY across every threshold step, never on one number.
 *
 * The database is opened read-only; prices missing from the cache (the sweep
 * reaches below the live entry threshold, so it needs tickers the sync never
 * fetched) are pulled into MEMORY and never written back.
 */
import path from 'node:path';
import fs from 'node:fs';
import {
  initDatabase,
  closeDatabase,
  getPortfolioConfig,
  getPortfolioHistoryStart,
  getPortfolioOutcomeCandidates,
  getPortfolioSignalCandidates,
  getPriceBook,
} from '../electron/database';
import { PRICE_REQUEST_GAP_MS, fetchAdjCloseSeries, screenSeries, sleep } from '../electron/prices';
import {
  addDaysYmd,
  computeStats,
  earliestEntryDate,
  simulatePortfolio,
  toClosedPosition,
} from '../src/lib/portfolio-rules';
import { DEFAULT_PORTFOLIO_CONFIG, type PortfolioCandidate, type PortfolioConfig } from '../src/types';

/** Lowest threshold in the sweep — decides how wide the price fetch has to be. */
const SWEEP_MIN_SCORE = 60;
const THRESHOLDS = [60, 65, 70, 74, 78];
const HOLD_DAYS = [10, 20, 30, 45, 60];
const BARRIERS: Array<[number, number]> = [
  [0.15, 0.08],
  [0.2, 0.1],
  [0.25, 0.12],
  [0.3, 0.15],
];

const pct = (v: number | null | undefined, digits = 2): string =>
  v == null ? '   n/a' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`;

interface Row {
  label: string;
  entries: number;
  closed: number;
  finalEquity: number;
  totalReturn: number | null;
  edge: number | null;
  winRate: number | null;
  avgAlpha: number | null;
  alphaN: number;
  maxDd: number | null;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function padL(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function printTable(title: string, rows: Row[]): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 74 - title.length))}`);
  console.log(
    `${pad('variant', 16)}${padL('entries', 8)}${padL('closed', 8)}${padL('final $', 11)}${padL('return', 9)}${padL('vs SPY', 9)}${padL('hit', 7)}${padL('Ø α', 9)}${padL('n', 4)}${padL('maxDD', 9)}`,
  );
  for (const r of rows) {
    console.log(
      pad(r.label, 16) +
        padL(String(r.entries), 8) +
        padL(String(r.closed), 8) +
        padL(r.finalEquity.toFixed(2), 11) +
        padL(pct(r.totalReturn), 9) +
        padL(pct(r.edge), 9) +
        padL(r.winRate == null ? 'n/a' : `${(r.winRate * 100).toFixed(0)}%`, 7) +
        padL(pct(r.avgAlpha), 9) +
        padL(String(r.alphaN), 4) +
        padL(pct(r.maxDd), 9),
    );
  }
}

async function main(): Promise<void> {
  const dbPath = (process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'insider-tracker.db')).trim();
  if (!fs.existsSync(dbPath)) {
    console.log(`No database at ${dbPath}.`);
    return;
  }
  console.log(`DB: ${dbPath} (read-only)\n`);
  initDatabase(dbPath, { readonly: true });

  const base: PortfolioConfig = { ...DEFAULT_PORTFOLIO_CONFIG, ...getPortfolioConfig() };

  // Candidates at the WIDEST threshold; each variant filters further.
  const candidates: PortfolioCandidate[] = [
    ...getPortfolioSignalCandidates(SWEEP_MIN_SCORE).map((r) => ({
      ticker: r.ticker,
      earliestDate: earliestEntryDate(r.seenAt),
      score: r.score,
      signalId: r.signalId,
      source: 'signal' as const,
    })),
    ...getPortfolioOutcomeCandidates(SWEEP_MIN_SCORE).map((r) => ({
      ticker: r.ticker,
      earliestDate: addDaysYmd(r.seenAt.slice(0, 10), 1),
      score: r.score,
      signalId: null,
      source: 'outcome' as const,
    })),
  ];
  const universe = [...new Set(candidates.map((c) => c.ticker))].sort();
  // Same origin the live sync uses, so "vs SPY" here means the same thing it
  // means on the Portfolio tab rather than being measured over a shifted window.
  const start =
    getPortfolioHistoryStart(SWEEP_MIN_SCORE) ??
    candidates.reduce((m, c) => (c.earliestDate < m ? c.earliestDate : m), '9999-12-31');

  // Cache first, network only for what is genuinely missing. Nothing is written.
  const prices: Record<string, Record<string, number>> = getPriceBook([...universe, 'SPY'], start);
  const toFetch = [...universe, 'SPY'].filter((t) => !prices[t] || !Object.keys(prices[t]).length);
  if (toFetch.length) {
    console.log(`Fetching ${toFetch.length} series the cache does not have (in memory only)…`);
    for (const t of toFetch) {
      await sleep(PRICE_REQUEST_GAP_MS);
      const points = await fetchAdjCloseSeries(t, { fromYmd: start });
      if (!points?.length) continue;
      prices[t] = Object.fromEntries(screenSeries(points).clean.map((p) => [p.date, p.px]));
    }
  }

  const spy = prices.SPY;
  if (!spy || !Object.keys(spy).length) {
    console.log('SPY series unavailable — a sweep without the benchmark says nothing.');
    closeDatabase();
    return;
  }
  const tradingDays = Object.keys(spy).sort();

  const run = (label: string, over: Partial<PortfolioConfig>): Row => {
    const config: PortfolioConfig = { ...base, ...over };
    const sim = simulatePortfolio({ config, tradingDays, spy, prices, candidates });
    const closed = sim.positions.filter((p) => p.exitDate).map(toClosedPosition);
    const stats = computeStats(sim.equity, closed, [], config);
    const max = stats.windows.find((w) => w.key === 'max');
    const last = sim.equity[sim.equity.length - 1];
    return {
      label,
      entries: sim.positions.length,
      closed: closed.length,
      finalEquity: last?.equity ?? config.startingCash,
      totalReturn: max?.portfolio ?? null,
      edge: max?.diff ?? null,
      winRate: stats.trades.winRate,
      avgAlpha: stats.trades.avgTradeAlpha,
      alphaN: stats.trades.alphaN,
      maxDd: stats.maxDrawdown.portfolio,
    };
  };

  console.log(
    `Window: ${tradingDays[0]} → ${tradingDays[tradingDays.length - 1]} (${tradingDays.length} sessions) · ` +
      `${candidates.length} candidate sighting(s) at score ≥ ${SWEEP_MIN_SCORE} · ${universe.length} ticker(s)`,
  );
  const benchRow = run('SPY buy & hold', { entryScore: 1e9 });
  console.log(`Benchmark over the same window: ${pct(benchRow.totalReturn)}\n`);

  printTable(
    'Entry threshold (everything else at the defaults)',
    THRESHOLDS.map((t) => run(`score ≥ ${t}`, { entryScore: t })),
  );
  printTable(
    'Time stop (calendar days)',
    HOLD_DAYS.map((d) => run(`hold ≤ ${d}d`, { maxHoldDays: d })),
  );
  printTable(
    'Take-profit / stop-loss',
    BARRIERS.map(([tp, sl]) => run(`+${tp * 100}% / −${sl * 100}%`, { takeProfit: tp, stopLoss: sl })),
  );
  printTable('Cash policy', [
    run('cash → SPY', { cashPolicy: 'spy' }),
    run('cash idle', { cashPolicy: 'idle' }),
  ]);

  // Cross-check: does one time stop win at EVERY threshold, or only on average?
  console.log(`\n── Time stop × entry threshold (avg trade alpha) ${'─'.repeat(30)}`);
  console.log(pad('', 12) + HOLD_DAYS.map((d) => padL(`${d}d`, 11)).join(''));
  for (const t of THRESHOLDS) {
    const cells = HOLD_DAYS.map((d) => {
      const r = run('x', { entryScore: t, maxHoldDays: d });
      return padL(`${pct(r.avgAlpha, 1)}/${r.alphaN}`, 11);
    });
    console.log(pad(`≥ ${t}`, 12) + cells.join(''));
  }

  console.log(`
── How much of this is real? ───────────────────────────────────────────────
The stored signal history is ~6 weeks and produces a single-digit number of
entries at the default threshold. Every row above therefore rests on a handful
of trades, several of them the same ticker, and one position can move a whole
column by percentage points.

Read these as SENSITIVITY, not as a ranking: they show how hard the result
leans on each knob, which is worth knowing. They cannot show that one setting
is better than another — there is not enough data for that question to have an
answer yet, and picking the best-looking row would be fitting to noise.

The defaults change only when a variant wins across EVERY threshold step in the
cross-table above, not when it wins on average.`);

  closeDatabase();
}

main().catch((err) => {
  console.error('[sweep] THREW:', err);
  process.exit(1);
});
