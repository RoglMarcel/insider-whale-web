import { tickerIssue, resolvedTicker } from '../src/lib/ticker-quality';
import { yahooTicker } from './scraper/util';
import { priceTicker, type PriceIdentity } from './priceSymbols';

/**
 * The one place adjusted closes enter this codebase.
 *
 * `performance.ts`, `scripts/label-outcomes.ts` and the testing portfolio all
 * used to carry their own copy of "fetch Yahoo, read indicators.adjclose, map
 * timestamps to YYYY-MM-DD" — three copies of the same three subtle rules
 * (dash-form symbols, adjusted closes only, drop non-finite points), which is
 * exactly the kind of duplication that lets one of them quietly diverge.
 *
 * Adjusted closes ONLY. A raw close series turns a 2:1 split into a −50% day,
 * which every stop-loss in the portfolio would dutifully act on.
 */

const YF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
/** Polite pacing between requests — Yahoo throttles bursts, not volume. */
export const PRICE_REQUEST_GAP_MS = 120;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * A single-session move larger than this requires review, rather than proving
 * a data error. Genuine crashes/rallies must be confirmed without clipping the
 * observed move or silently treating it as an ordinary holiday gap.
 */
export const PRICE_MAX_DAILY_MOVE = 0.6;

export interface PricePoint {
  date: string;
  px: number;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; currency?: string; exchangeName?: string; instrumentType?: string; longName?: string };
      events?: unknown;
      timestamp?: number[];
      indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> };
    }>;
  };
}

export interface FetchSeriesOptions {
  /** Start of the window; 10 days of lead-in are added so gap-search works. */
  fromYmd?: string;
  /** Yahoo range shorthand (`1y`, `2y`, `max`). Ignored when `fromYmd` is set. */
  range?: string;
  signal?: AbortSignal;
  identity?: PriceIdentity;
}

export interface PriceSnapshot {
  ticker: string;
  fetchedAt: string;
  basis: 'yahoo-adjusted-close';
  providerSymbol: string;
  metadata: NonNullable<NonNullable<YahooChart['chart']>['result']>[number]['meta'];
  corporateActions: unknown;
  rawObservations?: { timestamps: number[]; adjustedCloses: Array<number | null> };
  points: PricePoint[];
  issues: string[];
}

export async function fetchAdjCloseSeries(symbol: string, opts: FetchSeriesOptions = {}): Promise<PricePoint[] | null> {
  const snapshot = await fetchPriceSnapshot(symbol, opts);
  // Other outcome callers must not use an identified wrong instrument either.
  return snapshot && !snapshot.issues.length ? snapshot.points : null;
}

function ymdUtcMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

/**
 * Adjusted daily closes for one symbol, ascending, or null when the symbol has
 * no usable series (delisted, renamed, or simply never existed).
 */
export async function fetchPriceSnapshot(
  symbol: string,
  opts: FetchSeriesOptions = {},
): Promise<PriceSnapshot | null> {
  if (tickerIssue(symbol)) return null;
  try {
    // Yahoo writes share classes with a DASH (BRK-B) while the pipeline stores
    // the canonical dot form. Without this every class share resolves to 404 and
    // vanishes from the portfolio without a trace.
    const today = new Date().toISOString().slice(0, 10);
    const providerSymbol = yahooTicker(priceTicker(resolvedTicker(symbol, today), today, opts.identity)) || symbol;
    const sym = encodeURIComponent(providerSymbol);
    let window: string;
    if (opts.fromYmd) {
      const period1 = Math.floor((ymdUtcMs(opts.fromYmd) - 10 * 86_400_000) / 1000);
      const period2 = Math.floor(Date.now() / 1000) + 86_400;
      window = `period1=${period1}&period2=${period2}`;
    } else {
      window = `range=${opts.range ?? '1y'}`;
    }
    let json: YahooChart | null = null;
    let failure = 'no adjusted closes';
    // One retry via Yahoo's other chart host. Never substitute unadjusted
    // quotes: split-adjustment differences can trigger fictitious exits.
    for (const host of ['query1', 'query2']) {
      if (opts.signal?.aborted) return null;
      if (host === 'query2') await sleep(400);
      try {
        const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&events=div%2Csplits&${window}`, {
          headers: { 'User-Agent': YF_UA },
          signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          failure = `HTTP ${res.status}`;
          if (res.status === 404) break;
          continue;
        }
        const candidate = (await res.json()) as YahooChart;
        if (!candidate.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose?.some((p) => p != null && Number.isFinite(p) && p > 0)) {
          failure = 'no adjusted closes';
          continue;
        }
        json = candidate;
        break;
      } catch {
        failure = 'network error or timeout';
      }
    }
    if (!json) {
      console.warn(`[prices] ${symbol}: ${failure} after bounded chart lookup`);
      return null;
    }
    const result = json.chart?.result?.[0];
    const ts = result?.timestamp ?? [];
    const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
    const seen = new Set<string>();
    const out: PricePoint[] = [];
    const issues: string[] = [];
    const meta = result?.meta;
    if (meta?.symbol && meta.symbol.toUpperCase() !== providerSymbol.toUpperCase()) issues.push('provider_symbol_mismatch');
    if (meta?.currency && meta.currency !== 'USD') issues.push('non_usd_price');
    if (meta?.instrumentType && !['EQUITY', 'ETF'].includes(meta.instrumentType)) issues.push('unsupported_instrument');
    ts.forEach((t, i) => {
      const v = adj[i];
      if (v == null) return; // A missing session is retained in the raw response.
      if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(t)) { issues.push('invalid_observation'); return; }
      const date = new Date(t * 1000).toISOString().slice(0, 10);
      if (date > today) { issues.push('future_observation'); return; }
      if (seen.has(date)) { issues.push('duplicate_session'); return; }
      seen.add(date);
      out.push({ date, px: v });
    });
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out.length ? { ticker: symbol, fetchedAt: new Date().toISOString(), basis: 'yahoo-adjusted-close',
      providerSymbol, metadata: meta, corporateActions: result?.events ?? null,
      rawObservations: { timestamps: ts, adjustedCloses: adj }, points: out, issues } : null;
  } catch {
    return null;
  }
}

/** Outcome dates cannot be due beyond the benchmark's available sessions. */
export function outcomeCutoff(points: readonly PricePoint[], today: string): string | null {
  return points.filter((p) => p.date <= today && p.px > 0 && Number.isFinite(p.px))
    .map((p) => p.date).sort().at(-1) ?? null;
}

export interface ScreenedSeries {
  clean: PricePoint[];
  /** Points rejected by the plausibility check, with the move that failed. */
  suspect: Array<PricePoint & { movePct: number }>;
}

/**
 * Adjacent observations, never the last accepted anchor. Magnitude is a review
 * flag, not proof of error. Portfolio ingestion quarantines the WHOLE vintage
 * until corrected or reviewed, so a crash cannot disappear as an ordinary gap.
 */
export function screenSeries(points: readonly PricePoint[], maxMove = PRICE_MAX_DAILY_MOVE): ScreenedSeries {
  const clean: PricePoint[] = [];
  const suspect: Array<PricePoint & { movePct: number }> = [];
  let prev: number | null = null;
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!Number.isFinite(p.px) || p.px <= 0) {
      suspect.push({ ...p, movePct: NaN });
      continue;
    }
    if (prev != null) {
      const move = p.px / prev - 1;
      if (Math.abs(move) > maxMove) {
        suspect.push({ ...p, movePct: move });
        prev = p.px;
        continue;
      }
    }
    clean.push(p);
    prev = p.px;
  }
  return { clean, suspect };
}

/** First point on or after `date` — the "next trading day" rule, on a series. */
export function priceOnOrAfter(series: readonly PricePoint[], date: string): PricePoint | null {
  for (const p of series) if (p.date >= date) return p;
  return null;
}

/** Compare outcomes on the same observed market session. Missing equity prices
 * must not silently shift one side of an alpha calculation by weeks. */
export function outcomePricePair(series: readonly PricePoint[], benchmark: readonly PricePoint[], date: string): { equity: PricePoint; benchmark: PricePoint } | null {
  const session = priceOnOrAfter(benchmark, date);
  if (!session) return null;
  const equity = series.find(p => p.date === session.date);
  return equity ? { equity, benchmark: session } : null;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
