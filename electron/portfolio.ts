import {
  DEFAULT_PORTFOLIO_CONFIG,
  type PortfolioCandidate,
  type PortfolioClosedPosition,
  type PortfolioConfig,
  type PortfolioEvent,
  type PortfolioOpenPosition,
  type PortfolioState,
} from '../src/types';
import {
  addDaysYmd,
  computeStats,
  earliestEntryDate,
  simulatePortfolio,
  toClosedPosition,
  toOpenPosition,
} from '../src/lib/portfolio-rules';
import {
  clearPortfolio,
  getPortfolioConfig,
  getPortfolioEquity,
  getPortfolioEvents,
  getPortfolioHistoryStart,
  getPortfolioLiveStart,
  getPortfolioOutcomeCandidates,
  getPortfolioPositions,
  getPortfolioRunMeta,
  getPortfolioSignalCandidates,
  getPortfolioUniverse,
  getPriceAsOf,
  getPriceBook,
  getPriceCoverage,
  insertPortfolioEquity,
  insertPortfolioSuspectEvents,
  replacePortfolioEvents,
  replacePortfolioPositions,
  setPortfolioConfig,
  setPortfolioRunMeta,
  upsertPriceRows,
  type PriceRow,
} from './database';
import { PRICE_REQUEST_GAP_MS, fetchAdjCloseSeries, screenSeries, sleep } from './prices';

/**
 * Testing portfolio — I/O side (v1.4.0).
 *
 * The RULES live in `src/lib/portfolio-rules.ts` and are pure; this module only
 * feeds them: pull candidate signals out of SQLite, make sure the adjusted-close
 * cache covers the window, run the simulation, persist the result.
 *
 * Two invariants are enforced here rather than in the rules:
 *  - The curve is APPEND-ONLY. A day that has been written is never rewritten,
 *    so a later price restatement cannot retroactively move a point somebody has
 *    already looked at. Drift is counted and reported, not silently applied.
 *  - SPY is mandatory. A curve without its benchmark is worthless, so a run that
 *    cannot resolve SPY writes nothing at all.
 */

const BENCHMARK = 'SPY';

let runInFlight = false;

export interface PortfolioSyncReport {
  ok: boolean;
  reason?: string;
  daysWritten: number;
  restatedDays: number;
  pricesFetched: number;
  suspectPoints: number;
}

// ── Candidates ────────────────────────────────────────────────────────────

/**
 * Every signal that ever crossed the threshold, with the earliest date its
 * close could legitimately have been traded.
 *
 * Two sources, deliberately:
 *  - `signals` is precise (it carries the sighting TIMESTAMP) but its rows
 *    rotate, so it currently reaches back only ~9 days.
 *  - `signal_outcomes` reaches five weeks further. Those rows are real signals
 *    that were scored at the time and never recomputed, so they are legitimate
 *    history — but they store only a DATE. Since roughly one scrape in three
 *    runs after the close, the sighting could have been post-close, and the only
 *    assumption that cannot manufacture look-ahead is that it was: their entry
 *    is pushed to the NEXT calendar day. That costs a day of return on the
 *    backfill and biases the result DOWN, which is the right direction for an
 *    instrument whose job is to be believed.
 */
export function buildCandidates(config: PortfolioConfig): PortfolioCandidate[] {
  const out: PortfolioCandidate[] = [];
  for (const r of getPortfolioSignalCandidates(config.entryScore)) {
    out.push({
      ticker: r.ticker,
      earliestDate: earliestEntryDate(r.seenAt),
      score: r.score,
      signalId: r.signalId,
      source: 'signal',
    });
  }
  for (const r of getPortfolioOutcomeCandidates(config.entryScore)) {
    out.push({
      ticker: r.ticker,
      earliestDate: addDaysYmd(r.seenAt.slice(0, 10), 1),
      score: r.score,
      signalId: null,
      source: 'outcome',
    });
  }
  return out.sort((a, b) => a.earliestDate.localeCompare(b.earliestDate) || b.score - a.score);
}

// ── Prices ────────────────────────────────────────────────────────────────

interface PriceSyncResult {
  fetched: number;
  suspect: PortfolioEvent[];
  missing: string[];
}

/**
 * Top the adjusted-close cache up.
 *
 * At most ONE request per ticker per calendar day: a delisted symbol never
 * catches up to SPY's newest date, so "refetch until current" would re-hammer
 * the same 404 on every run forever.
 */
async function syncPrices(tickers: readonly string[], fromYmd: string): Promise<PriceSyncResult> {
  const coverage = getPriceCoverage();
  const today = new Date().toISOString().slice(0, 10);
  const spyLast = coverage[BENCHMARK]?.last ?? '';
  const suspect: PortfolioEvent[] = [];
  const missing: string[] = [];
  let fetched = 0;

  for (const ticker of tickers) {
    const cov = coverage[ticker];
    const triedToday = cov?.fetchedAt?.slice(0, 10) === today;
    const current = ticker === BENCHMARK ? false : !!cov && !!spyLast && cov.last >= spyLast;
    if (cov && (triedToday || current)) continue;

    if (fetched > 0) await sleep(PRICE_REQUEST_GAP_MS);
    const points = await fetchAdjCloseSeries(ticker, { fromYmd });
    fetched++;
    if (!points?.length) {
      missing.push(ticker);
      continue;
    }
    const screened = screenSeries(points);
    for (const s of screened.suspect) {
      suspect.push({
        date: s.date,
        kind: 'suspect_price',
        ticker,
        score: null,
        amount: s.px,
        note: Number.isFinite(s.movePct)
          ? `${(s.movePct * 100).toFixed(1)}% single-session move — ignored`
          : 'non-finite adjusted close — ignored',
      });
    }
    const rows: PriceRow[] = screened.clean.map((p) => ({ ticker, date: p.date, adjClose: p.px }));
    upsertPriceRows(rows);
  }

  return { fetched, suspect, missing };
}

// ── Run ───────────────────────────────────────────────────────────────────

export async function syncPortfolio(): Promise<PortfolioSyncReport> {
  if (runInFlight) return { ok: false, reason: 'already running', daysWritten: 0, restatedDays: 0, pricesFetched: 0, suspectPoints: 0 };
  runInFlight = true;
  try {
    return await runSync();
  } finally {
    runInFlight = false;
  }
}

async function runSync(): Promise<PortfolioSyncReport> {
  const config = getPortfolioConfig();
  const start = getPortfolioHistoryStart(config.entryScore);
  if (!start) {
    return { ok: false, reason: 'no signal has ever reached the entry threshold', daysWritten: 0, restatedDays: 0, pricesFetched: 0, suspectPoints: 0 };
  }

  const universe = getPortfolioUniverse(config.entryScore);
  const priceSync = await syncPrices([BENCHMARK, ...universe.filter((t) => t !== BENCHMARK)], start);

  const spy = getPriceBook([BENCHMARK], start)[BENCHMARK];
  if (!spy || !Object.keys(spy).length) {
    // A curve with no benchmark cannot answer the only question it exists for.
    return { ok: false, reason: 'SPY price series unavailable — nothing written', daysWritten: 0, restatedDays: 0, pricesFetched: priceSync.fetched, suspectPoints: priceSync.suspect.length };
  }

  const prices = getPriceBook(universe, start);
  const tradingDays = Object.keys(spy).sort();
  const candidates = buildCandidates(config);

  const sim = simulatePortfolio({ config, tradingDays, spy, prices, candidates });

  // Append-only curve: compare before writing so a price restatement is REPORTED
  // rather than quietly changing history.
  const stored = new Map(getPortfolioEquity().map((p) => [p.date, p]));
  let restatedDays = 0;
  for (const p of sim.equity) {
    const old = stored.get(p.date);
    if (old && Math.abs(old.equity - p.equity) > 0.01) restatedDays++;
  }
  const daysWritten = insertPortfolioEquity(sim.equity);

  replacePortfolioPositions(sim.positions);
  replacePortfolioEvents(sim.events);
  insertPortfolioSuspectEvents(priceSync.suspect);

  const counts = countEvents(sim.events);
  setPortfolioRunMeta({
    config,
    builtAt: new Date().toISOString(),
    backfillStart: sim.equity[0]?.date ?? null,
    liveStart: getPortfolioLiveStart(),
    skippedNoCash: counts.skippedNoCash,
    skippedCap: counts.skippedCap,
    missingPrices: counts.dataMissing,
    suspectPrices: getPortfolioEvents(5000).filter((e) => e.kind === 'suspect_price').length,
    untradableTickers: sim.untradable,
    restatedDays,
  });

  return {
    ok: true,
    daysWritten,
    restatedDays,
    pricesFetched: priceSync.fetched,
    suspectPoints: priceSync.suspect.length,
  };
}

function countEvents(events: readonly PortfolioEvent[]): {
  skippedNoCash: number;
  skippedCap: number;
  dataMissing: number;
} {
  let skippedNoCash = 0;
  let skippedCap = 0;
  let dataMissing = 0;
  for (const e of events) {
    if (e.kind === 'skipped_no_cash') skippedNoCash++;
    else if (e.kind === 'skipped_cap') skippedCap++;
    else if (e.kind === 'data_missing') dataMissing++;
  }
  return { skippedNoCash, skippedCap, dataMissing };
}

/**
 * Wipe the SIMULATION and run it again from scratch. Prices, signals and
 * labeled outcomes are never touched — only the derived book. Reachable from
 * the UI solely through an explicitly confirmed button.
 */
export async function rebuildPortfolio(): Promise<PortfolioSyncReport> {
  clearPortfolio();
  return syncPortfolio();
}

export async function updatePortfolioConfig(partial: Partial<PortfolioConfig>): Promise<PortfolioSyncReport> {
  const before = getPortfolioConfig();
  const after = setPortfolioConfig(partial);
  // Different parameters mean a different book. Keeping the old curve under new
  // labels would show a chart that was never computed with the numbers beside it.
  const changed = (Object.keys(after) as (keyof PortfolioConfig)[]).some((k) => after[k] !== before[k]);
  return changed ? rebuildPortfolio() : syncPortfolio();
}

// ── Read model ────────────────────────────────────────────────────────────

export function getPortfolioState(): PortfolioState {
  const config = getPortfolioConfig();
  const runMeta = getPortfolioRunMeta();
  const equity = getPortfolioEquity();
  const positions = getPortfolioPositions();
  const events = getPortfolioEvents();
  const last = equity[equity.length - 1] ?? null;

  const openRaw = positions.filter((p) => !p.exitDate);
  const marks = last ? getPriceBook(openRaw.map((p) => p.ticker), last.date) : {};

  const open: PortfolioOpenPosition[] = last
    ? openRaw.map((p) => toOpenPosition(p, marks[p.ticker]?.[last.date] ?? p.highWaterClose ?? null, last.date, last.equity, config))
    : [];
  const closed: PortfolioClosedPosition[] = positions
    .filter((p) => !!p.exitDate)
    .map(toClosedPosition)
    .sort((a, b) => (b.exitDate ?? '').localeCompare(a.exitDate ?? ''));

  return {
    // The parameters the STORED curve was built with — never the current draft.
    config: runMeta?.config ?? config,
    meta: {
      available: equity.length > 0,
      firstDate: equity[0]?.date ?? null,
      lastDate: last?.date ?? null,
      backfillStart: runMeta?.backfillStart ?? equity[0]?.date ?? null,
      liveStart: runMeta?.liveStart ?? null,
      lastRun: runMeta?.builtAt ?? null,
      skippedNoCash: runMeta?.skippedNoCash ?? 0,
      skippedCap: runMeta?.skippedCap ?? 0,
      missingPrices: runMeta?.missingPrices ?? 0,
      suspectPrices: runMeta?.suspectPrices ?? 0,
      untradableTickers: runMeta?.untradableTickers ?? [],
      restatedDays: runMeta?.restatedDays ?? 0,
      priceAsOf: getPriceAsOf(),
      readOnly: false,
      note: equity.length ? null : 'No run yet — press Sync to build the curve from stored signal history.',
    },
    equity,
    open,
    closed,
    events,
    stats: computeStats(equity, closed, open, runMeta?.config ?? config),
  };
}

/** Empty, well-typed state for callers that have no database at all. */
export function emptyPortfolioState(note: string | null = null): PortfolioState {
  return {
    config: DEFAULT_PORTFOLIO_CONFIG,
    meta: {
      available: false,
      firstDate: null,
      lastDate: null,
      backfillStart: null,
      liveStart: null,
      lastRun: null,
      skippedNoCash: 0,
      skippedCap: 0,
      missingPrices: 0,
      suspectPrices: 0,
      untradableTickers: [],
      restatedDays: 0,
      priceAsOf: null,
      readOnly: false,
      note,
    },
    equity: [],
    open: [],
    closed: [],
    events: [],
    stats: computeStats([], [], [], DEFAULT_PORTFOLIO_CONFIG),
  };
}
