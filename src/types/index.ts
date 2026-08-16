/**
 * Shared types for both the Electron main process and the React renderer.
 * This file MUST stay dependency-free (pure TypeScript) so it can be imported
 * from either side without pulling in node-only or DOM-only modules.
 */

// ──────────────────────────────────────────────────────────────────────────
// Core domain primitives
// ──────────────────────────────────────────────────────────────────────────

export type ConvictionLevel = 'HIGH' | 'WATCH' | 'LOW';

/** SEC Form 4 transaction codes. P = open-market purchase, S = sale, etc. */
export type TransactionType = 'P' | 'S' | 'A' | 'D' | 'G' | 'M' | 'F' | 'C' | string;

export type ScraperSource =
  | 'edgar'
  | 'openinsider'
  | 'finviz'
  | 'secform4'
  | 'marketbeat'
  | 'gurufocus'
  | 'insidermonitor'
  | 'quiverquant'
  | 'barchart'
  | 'optionstrat'
  | 'insiderfinance'
  | 'marketbeatoptions';

/**
 * A congressional (House/Senate) stock transaction disclosed under the STOCK
 * Act. A first-class signal source alongside insider Form 4 and options flow.
 */
export interface PoliticianTrade {
  id?: number;
  politician: string;
  chamber: 'House' | 'Senate';
  party: 'Democrat' | 'Republican' | 'Independent' | string;
  committee?: string;
  ticker: string;
  transactionType: 'buy' | 'sell';
  /** USD midpoint of the disclosed amount range. */
  amountMidpoint: number;
  tradeDate: string; // YYYY-MM-DD
  disclosureDate: string; // YYYY-MM-DD
  daysToDisclose: number;
  scrapedAt: string;
}

/** Politician combo tiers — congressional buying aligned with other signals. */
export type PoliticianComboTier = 'POLITICIAN_INSIDER' | 'POLITICIAN_OPTIONS' | 'MEGA_SIGNAL';

/** Normalized insider trade emitted by every insider scraper. */
export interface RawInsiderTrade {
  ticker: string;
  companyName?: string;
  insiderName: string;
  /** Raw role/title string as scraped (e.g. "Chief Executive Officer"). */
  role: string;
  transactionType: TransactionType;
  /** ISO date string (YYYY-MM-DD) of the trade (when the insider executed). */
  tradeDate: string;
  /** ISO date string of the SEC Form 4 filing, if available. */
  filingDate?: string;
  shares: number;
  price?: number;
  /** Absolute USD value of the transaction (always positive). */
  value: number;
  /** Source key, e.g. 'openinsider'. */
  source: ScraperSource;
  sourceUrl?: string;
  /** Feature 1 — true if filed > 4 business days after the trade (suspicious). */
  lateFiling?: boolean;
  /** Feature 6 — link to the insider's OpenInsider history page, when known. */
  insiderUrl?: string;
}

/** Normalized unusual-options event emitted by every options scraper. */
export interface OptionsActivity {
  ticker: string;
  type: 'call' | 'put';
  sentiment: 'bullish' | 'bearish';
  /** USD notional / total premium of the sweep/block. */
  notional: number;
  strike?: number;
  /** ISO date string of expiry. */
  expiry?: string;
  volume?: number;
  openInterest?: number;
  source: ScraperSource;
  sourceUrl?: string;
  // ── Feature 3 — options-specific detail ──
  /** Days to expiration from the trade date. */
  dte?: number;
  /** Underlying price at the time of the trade. */
  currentPrice?: number;
  /** Signed % out-of-the-money: positive = OTM, negative = ITM, for both calls and puts. */
  otmPercent?: number;
  /** True if the order swept multiple exchanges. */
  isSweep?: boolean;
  /** volume / open_interest. */
  volOiRatio?: number;
  /** Total dollar premium paid (alias of notional when present). */
  premiumTotal?: number;
  /** ISO timestamp when first scraped (for temporal merging). */
  scrapedAt?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Scoring
// ──────────────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  /** Step 1 — highest insider rank weight on the ticker (1–10). */
  rankWeight: number;
  /** Step 2 — dollar-volume points from total eligible buy volume (1–20). */
  dollarVolumePoints: number;
  /** Feature 2 — value-weighted transaction-type modifier (0–1). */
  typeModifier: number;
  /** Step 3 — cluster multiplier from distinct insiders (1.0–3.0). */
  clusterMultiplier: number;
  /** Feature 5 — insider earnings-timing multiplier (1.0–2.34). */
  timingMultiplier: number;
  /** Feature 3 — detailed options score (signed; negative for net bearish). */
  optionsScore: number;
  /** Feature 5 — options earnings-timing multiplier (1.0–2.0). */
  optionsTimingMultiplier: number;
  /** Feature 1 — freshness/time-decay multiplier (0.15–1.0). */
  freshnessMultiplier: number;
  /** Feature 8 — VIX fear multiplier on insider buying (1.0 or 1.15). */
  vixMultiplier: number;
  /** Feature 6 — best-insider track-record multiplier (0.85–1.2). */
  trackRecordMultiplier: number;
  /** Feature 4 — flat combo bonus added post-normalization (0 or 30). */
  comboBonus: number;
  /** Back-compat alias of optionsScore for older UI paths. */
  optionsBonus: number;
  /** Feature 1 — age (days) of the freshest eligible buy, for display. */
  signalAgeDays: number | null;
  /** Composite raw score before normalization. */
  rawScore: number;
  /** Theoretical maximum raw score, used for normalization. */
  maxPossibleRaw: number;
  /** Final 0–100 score. */
  normalizedScore: number;
  /**
   * Data confidence 0–100 — how much the system actually KNOWS about this
   * signal (field completeness + cross-source corroboration + authoritative
   * sourcing). Two equal scores are not equal when one is a single-aggregator
   * estimate and the other is EDGAR-corroborated with full enrichment.
   */
  confidence?: number;
  /** Congressional trading leg — raw politician score folded into the composite. */
  politicianScore?: number;
  /** Which politician-combo tier fired (or null). */
  politicianComboTier?: PoliticianComboTier | null;
  /** Human-readable notes about which bonuses applied. */
  notes: string[];
}

/** A scored, persisted signal for a single ticker. */
export interface Signal {
  id?: number;
  ticker: string;
  companyName?: string | null;
  score: number;
  convictionLevel: ConvictionLevel;
  totalDollarVolume: number;
  insiderCount: number;
  topInsiderRole: string | null;
  topInsiderName?: string | null;
  optionsActivity: OptionsActivity[];
  rawTrades: RawInsiderTrade[];
  breakdown: ScoreBreakdown;
  /** ISO datetime of the scrape that produced this signal. */
  scrapedAt: string;
  /** Score under the shadow (A/B) config, when one is active. */
  shadowScore?: number | null;
  sourceUrls: string[];
  // ── Feature 1 — representative dates (freshest eligible buy) ──
  tradeDate?: string | null;
  filingDate?: string | null;
  lateFiling?: boolean;
  // ── Feature 4 — combo ──
  comboSignal?: boolean;
  comboDetectedAt?: string | null;
  // ── Feature 5 — earnings ──
  earningsDate?: string | null;
  earningsTiming?: string | null;
  daysToEarnings?: number | null;
  bigPlayer?: boolean;
  /** Feature 6 — sector/industry classification, when known. */
  sector?: string | null;
  /** Sell-side context — trailing-90d same-company insider flow (display only). */
  insiderFlow?: InsiderFlowSummary | null;
  /** Equity stats pack — short interest / float / liquidity / 52w drawdown (display only). */
  stats?: EquityStatsSummary | null;
  /** Congressional trading leg — raw politician score contributed to the composite. */
  politicianScore?: number;
  /** Recent congressional trades on this ticker (display + combo detection). */
  politicianTrades?: PoliticianTrade[];
}

/** Trailing-window insider buy/sell dollar totals + Form 144 notice count. */
export interface InsiderFlowSummary {
  buys: number;
  sells: number;
  form144: number;
}

/** Squeeze context, tradeability, and price context for a ticker. */
export interface EquityStatsSummary {
  shortPctFloat?: number;
  floatShares?: number;
  avgDollarVolume?: number;
  /** Distance from the 52-week high, ≤ 0 (e.g. −34.2 = 34% below the high). */
  pctFrom52wHigh?: number;
}

/** Aggregated per-ticker input that feeds the scoring function. */
export interface TickerAggregate {
  ticker: string;
  companyName?: string;
  trades: RawInsiderTrade[];
  options: OptionsActivity[];
  /** Feature 5 — days until next earnings (enables the timing bonus). */
  daysToEarnings?: number;
  earningsDate?: string;
  earningsTiming?: string;
  /** Feature 8 — VIX at scrape time (boosts insider buys when > 25). */
  vix?: number;
  /** Feature 6 — best cached insider accuracy_3m for this ticker (0–1). */
  bestAccuracy3m?: number;
  /** Market cap (USD) when known — normalizes buy size by company size. */
  marketCap?: number;
  /** Feature 10 — best cached fair-value upside% (undervaluation) for this ticker. */
  upsidePct?: number;
  /** Feature 6 — sector/industry, when known. */
  sector?: string;
  /**
   * Sell-side context — trailing-90d same-company insider flow (buy/sell
   * dollar totals + Form 144 proposed-sale notices). Display/notes only; not a
   * score input until backtested.
   */
  insiderFlow?: { buys: number; sells: number; form144: number };
  /**
   * Equity stats pack — squeeze context, tradeability, and price context
   * (drawdown from the 52-week high, ≤ 0). Display/notes only; not a score
   * input until backtested.
   */
  stats?: { shortPctFloat?: number; floatShares?: number; avgDollarVolume?: number; pctFrom52wHigh?: number };
  /** Recent SC 13D/13G filings on this ticker (90d window; display/notes only). */
  filingEvents?: FilingEvent[];
  /** Distinct scraper sources that reported this ticker (pre-dedup corroboration). */
  sourceCount?: number;
  /** Congressional trades on this ticker (last 90 days), merged in by the orchestrator. */
  politicianTrades?: PoliticianTrade[];
  sourceUrls: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// Insider track record (Features 6 + 9)
// ──────────────────────────────────────────────────────────────────────────

export interface InsiderHistoricalTrade {
  tradeDate: string;
  ticker: string;
  transactionType: string;
  shares?: number;
  value?: number;
  /** Raw price the insider paid (for display). */
  purchasePrice?: number;
  /** Split/dividend-adjusted price ~3 / ~6 months after the trade. */
  price3mLater?: number;
  price6mLater?: number;
  /** ~3-month return IN EXCESS of the S&P 500 (alpha), split/dividend-adjusted. */
  return3m?: number;
  /** True if the trade BEAT the S&P 500 over ~3 / ~6 months. */
  wasProfitable3m?: boolean;
  wasProfitable6m?: boolean;
}

/**
 * Calendar-pattern classification (Cohen–Malloy–Pomorski, "Decoding Inside
 * Information"): insiders whose purchases cluster in the same calendar month
 * across years are ROUTINE (scheduled/habitual — little information); a
 * first-ever open-market buy is OPPORTUNISTIC (where the alpha lives). Mixed
 * histories make no claim (null). Display-only until backtested.
 */
export type InsiderPattern = 'routine' | 'opportunistic';

export function classifyInsiderPattern(purchaseDates: readonly string[]): InsiderPattern | null {
  const months: number[] = [];
  const years = new Set<number>();
  for (const d of purchaseDates) {
    const m = /^(\d{4})-(\d{2})/.exec(d ?? '');
    if (!m) continue;
    years.add(Number(m[1]));
    months.push(Number(m[2]));
  }
  const n = months.length;
  if (n === 0) return null;
  if (n === 1) return 'opportunistic'; // first-ever open-market buy
  if (n >= 3 && years.size >= 2) {
    const counts = new Map<number, number>();
    for (const mo of months) counts.set(mo, (counts.get(mo) ?? 0) + 1);
    // ≥60% of all purchases in one calendar month, across multiple years =
    // scheduled/habitual buying (a within-one-year cluster does NOT qualify).
    if (Math.max(...counts.values()) / n >= 0.6) return 'routine';
  }
  return null;
}

export interface InsiderTrackRecord {
  insiderName: string;
  insiderRole?: string | null;
  totalTrades: number;
  /** Count of trades that beat the S&P 500 over ~3 / ~6 months. */
  profitable3m: number;
  profitable6m: number;
  /** Share of trades that beat the market over ~3 months (0–1). */
  accuracy3m: number;
  accuracy6m: number;
  /** Average ~3-month return vs the S&P 500 (alpha), in percent. */
  avgReturn3m: number;
  lastUpdated: string;
  /** Most recent historical trades (for the sparkline + popover). */
  recentTrades: InsiderHistoricalTrade[];
  /** Calendar-pattern classification (see classifyInsiderPattern). */
  pattern?: InsiderPattern | null;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// VIX (Feature 8)
// ──────────────────────────────────────────────────────────────────────────

export interface VixQuote {
  value: number;
  level: 'low' | 'normal' | 'high';
  timestamp: string;
}

/** "Follow this signal" P&L since a ticker first appeared as a signal. */
export interface SignalPerformance {
  ticker: string;
  /** Date the signal entry is measured from (first trade/scrape date). */
  sinceDate: string;
  entryPrice?: number;
  currentPrice?: number;
  /** Split/dividend-adjusted return since the entry date, in percent. */
  returnPct?: number;
  /** Return in excess of the S&P 500 over the same window (alpha). */
  alphaPct?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Dashboard filtering (Feature 7)
// ──────────────────────────────────────────────────────────────────────────

export type TimeRange = '24h' | '48h' | 'week' | 'all';
export type TypeFilter = 'all' | 'openmarket' | 'options' | 'combo';
export type ConvictionFilter = 'all' | 'HIGH' | 'WATCH';
export type SortKey = 'score' | 'confidence';

export interface SignalFilter {
  timeRange: TimeRange;
  type: TypeFilter;
  conviction: ConvictionFilter;
  bigPlayersOnly: boolean;
  /** Dashboard sort: raw conviction score or data-confidence. */
  sortBy?: SortKey;
  /**
   * Free-text query over ticker / company / insider name. Part of the filter (not
   * Dashboard-local state) so the stat cards describe the same set the grid shows —
   * otherwise the header reported "12 on watch" while a search left none visible.
   */
  search?: string;
}

// Default to "This Week", not 48h: insider Form 4 *trade* dates lag the *filing*
// (and our scrape) by several days, so a 48h-on-trade-date window is almost
// always empty and makes a freshly-scraped dashboard look broken. Week shows the
// recent batch; the 48h / Today buttons remain for narrowing.
export const DEFAULT_FILTER: SignalFilter = {
  timeRange: 'week',
  type: 'all',
  conviction: 'all',
  bigPlayersOnly: false,
  sortBy: 'score',
};

// ──────────────────────────────────────────────────────────────────────────
// Watchlist / history / logs
// ──────────────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id?: number;
  ticker: string;
  addedAt: string;
  notes?: string | null;
  /** Most recent signal for this ticker, joined for the live score badge. */
  signal?: Signal | null;
}

export interface ScrapeLogEntry {
  id?: number;
  startedAt: string;
  finishedAt?: string | null;
  sourcesScraped: string[];
  signalsFound: number;
  status: 'success' | 'partial' | 'failed';
  /** Feature 8 — VIX captured at scrape time. */
  vixAtScrape?: number | null;
  sourceBreakdown?: Record<string, number> | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Scraper status / results
// ──────────────────────────────────────────────────────────────────────────

export interface ScrapeStatus {
  running: boolean;
  phase: string;
  currentSource?: string;
  completedSources: string[];
  totalSources: number;
  signalsFound: number;
  startedAt?: string;
  error?: string;
}

export interface ScrapeError {
  source: string;
  message: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Activist / large-holder filings (SC 13D / 13G radar)
// ──────────────────────────────────────────────────────────────────────────

export interface FilingEvent {
  ticker: string;
  /** e.g. 'SC 13D', 'SC 13D/A', 'SC 13G'. */
  type: string;
  /** Reporting person / fund, when resolvable from the filing feed. */
  filer: string | null;
  filedDate: string; // YYYY-MM-DD
  url: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Performance dashboard (calibration report)
// ──────────────────────────────────────────────────────────────────────────

export interface PerformanceTierStats {
  tier: string;
  n: number;
  /** Share of observations with positive 10-day alpha vs SPY. */
  winRate10: number;
  avgAlpha10: number;
  avgAlpha20: number;
}

export interface PerformanceBucketStats {
  label: string;
  n: number;
  avgAlpha10: number;
}

/** Realized-outcome calibration of stored signals (F31 dedup, SPY-relative). */
export interface PerformanceReport {
  ranAt: string;
  fromDate: string | null;
  toDate: string | null;
  nObservations: number;
  tiers: PerformanceTierStats[];
  buckets: PerformanceBucketStats[];
  /** Spearman rank correlation between score and 10-day alpha. */
  ic10: number | null;
  note?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Custom alert rules — pure evaluation, shared by main (post-scrape) + UI
// ──────────────────────────────────────────────────────────────────────────

export type AlertScope = 'ticker' | 'watchlist' | 'global';
export type AlertCondition = 'score_gte' | 'new_insider_buy' | 'new_combo' | 'cluster_gte';

export interface AlertRule {
  id?: number;
  scope: AlertScope;
  /** Required when scope = 'ticker'. */
  ticker?: string | null;
  condition: AlertCondition;
  /** score for score_gte; insider count for cluster_gte; unused otherwise. */
  threshold?: number | null;
  enabled: boolean;
  createdAt?: string;
}

export interface AlertHit {
  ruleId: number;
  ticker: string;
  message: string;
}

export const ALERT_CONDITION_LABELS: Record<AlertCondition, string> = {
  score_gte: 'Score crosses threshold',
  new_insider_buy: 'Any new insider buy',
  new_combo: 'New combo signal',
  cluster_gte: 'Insider cluster reaches N',
};

/**
 * Evaluate alert rules against the new scrape session, CROSSING-style: a rule
 * fires when its condition became true this session vs the previous one, not
 * while it merely stays true. Cold start (no previous session at all) fires
 * nothing — otherwise a fresh install floods one alert per signal.
 */
export function evaluateAlertRules(
  rules: readonly AlertRule[],
  current: readonly Signal[],
  previous: readonly Signal[],
  watchlistTickers: readonly string[],
): AlertHit[] {
  if (previous.length === 0) return [];
  const prevByTicker = new Map(previous.map((s) => [s.ticker, s]));
  const watch = new Set(watchlistTickers.map((t) => t.toUpperCase()));
  const hits: AlertHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.id == null) continue;
    const scoped = current.filter((s) => {
      if (rule.scope === 'ticker') return s.ticker === (rule.ticker ?? '').trim().toUpperCase();
      if (rule.scope === 'watchlist') return watch.has(s.ticker);
      return true;
    });
    for (const s of scoped) {
      const prev = prevByTicker.get(s.ticker);
      switch (rule.condition) {
        case 'score_gte': {
          const th = rule.threshold ?? 80;
          if (s.score >= th && (!prev || prev.score < th)) {
            hits.push({ ruleId: rule.id, ticker: s.ticker, message: `${s.ticker} score crossed ${th} (now ${s.score.toFixed(0)})` });
          }
          break;
        }
        case 'new_insider_buy': {
          const newer = !prev || (s.tradeDate ?? '') > (prev.tradeDate ?? '') || s.insiderCount > prev.insiderCount;
          if (newer && s.insiderCount > 0) {
            hits.push({
              ruleId: rule.id,
              ticker: s.ticker,
              message: `New insider buying on ${s.ticker} (${s.insiderCount} insider(s), score ${s.score.toFixed(0)})`,
            });
          }
          break;
        }
        case 'new_combo': {
          if (s.comboSignal && !prev?.comboSignal) {
            hits.push({ ruleId: rule.id, ticker: s.ticker, message: `New combo signal on ${s.ticker} (score ${s.score.toFixed(0)})` });
          }
          break;
        }
        case 'cluster_gte': {
          const th = rule.threshold ?? 3;
          if (s.insiderCount >= th && (!prev || prev.insiderCount < th)) {
            hits.push({ ruleId: rule.id, ticker: s.ticker, message: `${s.ticker} insider cluster reached ${s.insiderCount} (rule: ≥${th})` });
          }
          break;
        }
      }
    }
  }
  return hits;
}

// ──────────────────────────────────────────────────────────────────────────
// Source health (silent-rot detection) — pure, shared
// ──────────────────────────────────────────────────────────────────────────

export interface SourceHealthIssue {
  source: string;
  /** How many consecutive most-recent runs returned zero rows. */
  consecutiveZeroRuns: number;
  /** Rolling median row count for this source over the inspected window. */
  rollingMedian: number;
}

/**
 * Detect silently-broken sources: every scraper fails soft (empty array), so a
 * site redesign shows up ONLY as a source that used to produce rows suddenly
 * producing zero, run after run. A source is flagged when it has a healthy
 * history (median > 0 over ≥ 4 participating runs) but returned 0 rows in the
 * 2+ most recent consecutive runs. Chronically-empty sources are never flagged.
 *
 * @param runsNewestFirst per-run `sourceBreakdown` maps, most recent first.
 */
export function computeSourceHealth(
  enabledKeys: readonly string[],
  runsNewestFirst: readonly Record<string, number>[],
): SourceHealthIssue[] {
  const issues: SourceHealthIssue[] = [];
  for (const key of enabledKeys) {
    // Only runs in which this source actually participated.
    // Counts may be negative: sentinel for hard failure (timeout / all layers failed).
    const counts = runsNewestFirst
      .map((run) => run[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (counts.length < 2) continue;
    // Normalize failure sentinel (-1) to 0 for median/zero-run math.
    const norm = counts.map((c) => (c < 0 ? 0 : c));
    const sorted = [...norm].sort((a, b) => a - b);
    const rollingMedian = sorted[Math.floor(sorted.length / 2)];
    let consecutiveZeroRuns = 0;
    for (const c of norm) {
      if (c === 0) consecutiveZeroRuns++;
      else break;
    }
    if (consecutiveZeroRuns < 2) continue;
    // (a) Healthy history then zero — need ≥4 participating runs (stable median).
    // (b) Hard-fail sentinel (−1) twice in a row — flag immediately (not silent empty).
    const recentHardFails = counts.slice(0, consecutiveZeroRuns).filter((c) => c < 0).length;
    const healthyThenDead = counts.length >= 4 && rollingMedian > 0;
    const hardFailDead = recentHardFails >= 2;
    if (healthyThenDead || hardFailDead) {
      issues.push({ source: key, consecutiveZeroRuns, rollingMedian: Math.max(rollingMedian, 0) });
    }
  }
  return issues;
}

export interface ScrapeResult {
  status: 'success' | 'partial' | 'failed';
  signalsFound: number;
  signals: Signal[];
  sourcesScraped: string[];
  errors: ScrapeError[];
  /** Tickers that newly crossed into HIGH conviction this session. */
  newHighConviction: string[];
  /** Feature 4 — tickers that are new combo signals this session. */
  newCombos: string[];
  /** Feature 9 — tickers whose score jumped sharply vs the previous session. */
  scoreSurges: { ticker: string; from: number; to: number }[];
  /** Sources that look silently broken (healthy history, now zero rows). */
  sourceHealth?: SourceHealthIssue[];
  /** Custom alert rules that fired this session. */
  alertHits?: AlertHit[];
  /** SC 13D/13G filings first seen this session. */
  filingEvents?: FilingEvent[];
  startedAt: string;
  finishedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Valuation
// ──────────────────────────────────────────────────────────────────────────

export interface ValuationSourceResult {
  source: 'alphaspread' | 'valueinvesting';
  fairValue?: number;
  currentPrice?: number;
  /** (fairValue - price) / price * 100. Positive = undervalued / upside. */
  upsidePct?: number;
  label?: string;
  url: string;
  error?: string;
}

export interface ValuationResult {
  ticker: string;
  currentPrice?: number;
  sources: ValuationSourceResult[];
  fetchedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────────────────────────────────

export interface AppSettings {
  scheduleEnabled: boolean;
  scheduleTimes: {
    marketOpen: boolean; // 9:30 AM EST
    midday: boolean; // 12:00 PM EST
    close: boolean; // 4:00 PM EST
  };
  /** Score at/above which a desktop notification fires. */
  notificationThreshold: number;
  /** Minimum total dollar volume for a ticker to be scored/shown. */
  minDollarVolume: number;
  /** Per role-category include toggle (keys from ROLE_CATEGORIES). */
  roleFilters: Record<string, boolean>;
  /** Per-source enable toggle. */
  sources: Record<ScraperSource, boolean>;
  /** Run Chromium headless (true in production by default). */
  headless: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Transaction-type classification (Feature 2) — pure, shared by main + renderer
// ──────────────────────────────────────────────────────────────────────────

export type TxTier = 'strong' | 'reduced' | 'excluded';

export interface TxClassification {
  modifier: number;
  label: string;
  tier: TxTier;
}

/**
 * Classify a raw transaction-type string into a scoring modifier + display tier.
 * Handles SEC codes (first char) and the descriptive strings sources emit.
 */
export function classifyTransaction(raw: string): TxClassification {
  const s = (raw ?? '').toLowerCase().trim();
  const code = s.charAt(0);
  const has = (...t: string[]) => t.some((x) => s.includes(x));

  // 10b5-1 pre-scheduled plans
  if (has('10b5-1', '10b5', 'planned')) {
    if (has('sale', 'sell', 'dispos')) return { modifier: 0.0, label: '10b5-1 Sale', tier: 'excluded' };
    return { modifier: 0.4, label: '10b5-1 Buy', tier: 'reduced' };
  }
  // Option exercise (SEC code M / "exercise" / openinsider "+OE")
  if (has('exercise', '+oe') || code === 'm') {
    if (has('sale', 'sell', '+s', 'dispos')) return { modifier: 0.0, label: 'Exercise + Sale', tier: 'excluded' };
    return { modifier: 0.5, label: 'Exercise + Hold', tier: 'reduced' };
  }
  // Gift (SEC code G)
  if (has('gift') || code === 'g') {
    if (has('given', 'dispos')) return { modifier: 0.0, label: 'Gift Given', tier: 'excluded' };
    return { modifier: 0.1, label: 'Gift Received', tier: 'reduced' };
  }
  // Award / RSU / vest / grant (SEC code A)
  if (has('award', 'rsu', 'vest', 'grant') || code === 'a') {
    return { modifier: 0.0, label: 'Stock Award', tier: 'excluded' };
  }
  // Conversion of derivative (SEC code C)
  if (has('conversion', 'convert') || code === 'c') {
    return { modifier: 0.2, label: 'Derivative Conversion', tier: 'reduced' };
  }
  // Sale / disposition (SEC codes S, D, F)
  if (has('sale', 'sell', 'dispos') || code === 's' || code === 'd' || code === 'f') {
    return { modifier: 0.0, label: 'Sale', tier: 'excluded' };
  }
  // Open-market purchase (SEC code P / "buy" / "purchase") — the strongest signal
  if (has('purchase', 'buy') || code === 'p') {
    return { modifier: 1.0, label: 'Open Market Buy', tier: 'strong' };
  }
  // Unknown / empty — do NOT assume a buy (prevents bad scrapes scoring as purchases).
  return { modifier: 0.0, label: raw?.trim() ? `Unknown (${raw})` : 'Unknown', tier: 'excluded' };
}

// ──────────────────────────────────────────────────────────────────────────
// Insider name normalization — pure, shared by main (cluster dedup) + renderer
// (modal dedup). Kept in one place so the two sides can never drift apart.
// ──────────────────────────────────────────────────────────────────────────

const INSIDER_ROLE_SUFFIXES = [
  'director', 'officer', 'ceo', 'cfo', 'coo', 'president', '10% owner', '10%owner', 'owner', 'executive',
  'chairman', 'general counsel', 'general partner', 'secretary', 'treasurer', 'vice president', 'vp',
  'svp', 'evp', 'avp', 'trustee', 'beneficial owner', 'controller',
].sort((a, b) => b.length - a.length);

/**
 * Canonical key for an insider name: strips a trailing role/title (so the same
 * person filed as "Jane Doe CEO" and "Jane Doe Director" dedupes to one) and
 * reduces to lowercase alphanumerics.
 */
export function normalizeInsiderName(name: string): string {
  if (!name) return '';
  let clean = name.trim();
  const lower = clean.toLowerCase();
  for (const role of INSIDER_ROLE_SUFFIXES) {
    if (lower.endsWith(role)) {
      const prefix = clean.slice(0, -role.length).trim();
      if (prefix.length >= 3) {
        clean = prefix;
        break;
      }
    }
  }
  // Word-order-insensitive: sources disagree on name order ("Doe John" on
  // SEC-style feeds vs "John Doe" on aggregators), so sort the tokens before
  // collapsing — otherwise the same person double-counts volume and clusters.
  return clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join('');
}

// ──────────────────────────────────────────────────────────────────────────
// Date / freshness helpers (Feature 1) — pure, shared
// ──────────────────────────────────────────────────────────────────────────

export function daysBetween(fromIso?: string | null, toMs: number = Date.now()): number | null {
  if (!fromIso) return null;
  // Date-only strings parse as LOCAL midnight — Date.parse would use UTC,
  // skewing every age by the timezone offset and flipping trades across the
  // freshness-decay boundaries (and diverging from signalTradeMs below).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso.trim());
  const t = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    : Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return (toMs - t) / (1000 * 60 * 60 * 24);
}

/** Whole business days between two ISO dates (excludes weekends). Date-only strings use local midnight (same as daysBetween). */
export function businessDaysBetween(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const parseLocal = (iso: string): number => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    const t = Date.parse(iso);
    return Number.isNaN(t) ? NaN : t;
  };
  const startMs = parseLocal(startIso);
  const endMs = parseLocal(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  if (endMs < startMs) return 0;
  let count = 0;
  const cur = new Date(startMs);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return count;
}

/** Feature 1 — filed more than 4 business days after the trade. */
export function isLateFiling(tradeDate?: string | null, filingDate?: string | null): boolean {
  const bd = businessDaysBetween(tradeDate, filingDate);
  return bd != null && bd > 4;
}

/**
 * Feature 1 — freshness multiplier from signal age in days. The rate/floor
 * parameters exist for the shadow-scoring (A/B) framework; the defaults ARE
 * the production curve.
 *
 * BACKTEST 2026-07-03: upweighted (floor 0.2 → 0.15) — the only component
 * with confirmed out-of-sample alpha (IC(oos)=0.342, Q4−Q1 spread p=0.021,
 * n=88). The edge is concentrated in the STALE quartile (−4.2% 10d alpha vs
 * ≈+3% for the rest), so only the stale-end floor is deepened; the decay
 * rate is left at −0.115 because mid-age (2–4d) signals were the BEST
 * bucket and a uniformly faster decay would have punished them.
 */
export function getFreshnessMultiplier(ageDays: number | null, decayRate = 0.115, floor = 0.15): number {
  if (ageDays == null || ageDays < 1) return 1.0;
  // Smooth exponential (half-life ≈ 6 days) instead of step cliffs, so a
  // signal no longer loses 30–50% of its insider leg overnight crossing a
  // bucket boundary.
  return Math.max(floor, Math.exp(-decayRate * ageDays));
}

// ──────────────────────────────────────────────────────────────────────────
// Shadow scoring (A/B framework) — tunable knobs as data
// ──────────────────────────────────────────────────────────────────────────

/**
 * The scoring model's tunable knobs. The defaults ARE the production model;
 * a shadow config (stored in app_settings) overrides some of them, and every
 * scrape then also computes a `shadowScore` per signal so candidate weights
 * can be compared against realized alpha before ever touching the live score.
 */
export interface ScoringConfig {
  /** Exponential freshness decay rate (default 0.115). */
  freshnessDecayRate: number;
  /** Freshness floor for stale signals (default 0.15). */
  freshnessFloor: number;
  /** Flat combo bonus added post-normalization (default 30). */
  comboBonus: number;
  /** Track-record curve slope around 0.5 (default 0.65). */
  trackRecordSlope: number;
  /** Saturating-curve half-saturation point (default 105). */
  scoreHalfSaturation: number;
  /** VIX ramp ceiling (default 1.15). */
  vixCap: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  freshnessDecayRate: 0.115,
  freshnessFloor: 0.15,
  comboBonus: 30,
  trackRecordSlope: 0.65,
  scoreHalfSaturation: 105,
  vixCap: 1.15,
};

export type FreshnessLevel = 'fresh' | 'recent' | 'aging' | 'stale';

export function getFreshnessLevel(ageDays: number | null): FreshnessLevel {
  if (ageDays == null) return 'stale';
  if (ageDays < 1) return 'fresh';
  if (ageDays <= 3) return 'recent';
  if (ageDays <= 7) return 'aging';
  return 'stale';
}

// ──────────────────────────────────────────────────────────────────────────
// Signal filtering (Feature 7) — pure, shared by store + DB IPC
// ──────────────────────────────────────────────────────────────────────────

function startOfDayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Trade date → LOCAL ms. A date-only string ("YYYY-MM-DD") is treated as local
 * midnight; otherwise Date.parse is used. This avoids the bug where a naive date
 * parsed as UTC midnight fell *before* a precise "now − 48h" cutoff, dropping
 * same-day / recent trades. Falls back to scrapedAt when no trade date is set.
 */
function signalTradeMs(s: Signal): number | null {
  const date = s.tradeDate || s.scrapedAt;
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : t;
}

/**
 * Does this signal read as a COMBO to the user? True for the classic
 * insider+options combo AND for the politician tiers, because both render a COMBO
 * badge on the card. Shared by the filter, the stat cards and the notifications so
 * they can't disagree (the header said "0 combos" while three cards showed one).
 */
export function isComboSignal(s: Signal): boolean {
  return !!(s.comboSignal || s.breakdown?.politicianComboTier);
}

export function filterSignals(signals: Signal[], filter: SignalFilter): Signal[] {
  const now = Date.now();
  // Calendar-day cutoffs so same-day & recent trades reliably pass regardless of
  // timezone. 24h = today; 48h = today + yesterday; week = rolling last 7 days
  // (NOT "since Monday", which left the default view near-empty every Monday
  // morning — the exact failure mode the week default exists to avoid).
  let cutoff = -Infinity;
  if (filter.timeRange === '24h') cutoff = startOfDayMs(now);
  else if (filter.timeRange === '48h') cutoff = startOfDayMs(now) - 86_400_000;
  else if (filter.timeRange === 'week') cutoff = startOfDayMs(now) - 6 * 86_400_000;

  return signals.filter((s) => {
    // Time range (by trade date)
    if (filter.timeRange !== 'all') {
      const ms = signalTradeMs(s);
      if (ms == null || ms < cutoff) return false;
    }
    // Free-text search (ticker / company / insider), same rule the grid used to
    // apply locally.
    const q = filter.search?.trim().toLowerCase();
    if (q) {
      const hit =
        s.ticker.toLowerCase().includes(q) ||
        !!s.companyName?.toLowerCase().includes(q) ||
        !!s.rawTrades?.some((t) => t.insiderName.toLowerCase().includes(q));
      if (!hit) return false;
    }
    // Transaction-type filter. A politician combo tier (POLITICIAN_INSIDER /
    // _OPTIONS / MEGA_SIGNAL) badges the card as a COMBO too, so it must satisfy
    // the combo filter — otherwise the card shows "COMBO" but the filter hides it.
    if (filter.type === 'combo' && !isComboSignal(s)) return false;
    if (filter.type === 'options' && (s.optionsActivity?.length ?? 0) === 0) return false;
    if (filter.type === 'openmarket') {
      const hasOpenMarket = (s.rawTrades ?? []).some((t) => classifyTransaction(t.transactionType).modifier >= 1);
      if (!hasOpenMarket) return false;
    }
    // Conviction filter
    if (filter.conviction !== 'all' && s.convictionLevel !== filter.conviction) return false;
    // Big player filter
    if (filter.bigPlayersOnly && !s.bigPlayer) return false;
    return true;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Constants shared across processes
// ──────────────────────────────────────────────────────────────────────────

export interface RoleCategory {
  key: string;
  label: string;
  weight: number;
}

export const ROLE_CATEGORIES: readonly RoleCategory[] = [
  { key: 'exec', label: 'CEO / Executive Chairman', weight: 10 },
  { key: 'cfo', label: 'CFO / COO / President', weight: 8 },
  { key: 'csuite', label: 'CTO / CMO / Other C-Suite', weight: 6 },
  { key: 'director', label: 'Director / Board Member', weight: 4 },
  { key: 'vp', label: 'VP / Senior Officer', weight: 3 },
  { key: 'other', label: 'Other Insider', weight: 1 },
] as const;

export interface SourceMeta {
  key: ScraperSource;
  label: string;
  kind: 'insider' | 'options';
  url: string;
  /** Whether the site usually needs auth (best-effort, graceful fallback). */
  authOptional?: boolean;
}

export const SCRAPER_SOURCES: readonly SourceMeta[] = [
  { key: 'edgar', label: 'SEC EDGAR', kind: 'insider', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&count=100' },
  { key: 'openinsider', label: 'OpenInsider', kind: 'insider', url: 'http://openinsider.com/latest-insider-purchases-25k' },
  { key: 'finviz', label: 'Finviz Insider', kind: 'insider', url: 'https://finviz.com/insidertrading.ashx' },
  { key: 'secform4', label: 'SECForm4', kind: 'insider', url: 'https://www.secform4.com/all-buys' },
  { key: 'marketbeat', label: 'MarketBeat', kind: 'insider', url: 'https://www.marketbeat.com/insider-trades/' },
  { key: 'gurufocus', label: 'GuruFocus', kind: 'insider', url: 'https://www.gurufocus.com/insider/summary' },
  { key: 'insidermonitor', label: 'Insider Monitor', kind: 'insider', url: 'http://www.insider-monitor.com/insider_stock_purchases.html' },
  { key: 'quiverquant', label: 'Quiver Insiders', kind: 'insider', url: 'https://www.quiverquant.com/insiders/' },
  { key: 'barchart', label: 'Barchart Options', kind: 'options', url: 'https://www.barchart.com/options/unusual-activity/stocks' },
  { key: 'optionstrat', label: 'OptionStrat Flow', kind: 'options', url: 'https://optionstrat.com/flow', authOptional: true },
  { key: 'insiderfinance', label: 'InsiderFinance Flow', kind: 'options', url: 'https://www.insiderfinance.io/flow', authOptional: true },
  { key: 'marketbeatoptions', label: 'MarketBeat Options Volume', kind: 'options', url: 'https://www.marketbeat.com/market-data/unusual-call-options-volume/' },
] as const;

/**
 * Always-on side pipelines (not Settings toggles) but still tracked in scrape
 * session breakdown + source health. Keys appear in sourceBreakdown.
 * Sentinel: count < 0 means the pipeline hard-failed (vs 0 = ran, found nothing).
 */
export const SIDE_PIPELINE_SOURCES: readonly { key: string; label: string }[] = [
  { key: 'capitoltrades', label: 'Congressional Trades' },
  { key: 'sellside', label: 'Sell-side Flow' },
  { key: 'activist', label: '13D/13G Activist' },
] as const;

/** All keys that participate in source health / session breakdown labels. */
export function sourceLabel(key: string): string {
  const main = SCRAPER_SOURCES.find((s) => s.key === key);
  if (main) return main.label;
  const side = SIDE_PIPELINE_SOURCES.find((s) => s.key === key);
  return side?.label ?? key;
}

// ──────────────────────────────────────────────────────────────────────────
// Platform logins (authenticated scraping)
// ──────────────────────────────────────────────────────────────────────────

export interface NewsItem {
  id: number;
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
  scrapedAt: string;
}

export type LoginGating = 'required' | 'optional';

export interface LoginPlatform {
  key: string;
  label: string;
  /** Page to open for the user to log in manually. */
  loginUrl: string;
  category: 'insider' | 'options' | 'valuation' | 'news';
  /** 'required' means the scrape source toggle stays locked until logged in. */
  gating: LoginGating;
  /** The scraper source this login gates/improves (valuation providers have none). */
  sourceKey?: ScraperSource;
  hint?: string;
}

/**
 * Platforms the user can authenticate to so the scraper reads past free-view
 * limits / account-gated data. Login captures the browser session (cookies) -
 * no passwords are stored.
 */
export const LOGIN_PLATFORMS: readonly LoginPlatform[] = [
  { key: 'valueinvesting', label: 'ValueInvesting.io', loginUrl: 'https://valueinvesting.io/login', category: 'valuation', gating: 'optional', hint: 'Removes the free-view limit on fair value.' },
  { key: 'alphaspread', label: 'AlphaSpread', loginUrl: 'https://www.alphaspread.com/login', category: 'valuation', gating: 'optional', hint: 'More complete DCF / intrinsic value.' },
  { key: 'optionstrat', label: 'OptionStrat', loginUrl: 'https://optionstrat.com/login', category: 'options', gating: 'required', sourceKey: 'optionstrat', hint: 'Options flow requires an account.' },
  { key: 'insiderfinance', label: 'InsiderFinance', loginUrl: 'https://www.insiderfinance.io/login', category: 'options', gating: 'required', sourceKey: 'insiderfinance', hint: 'Options flow requires an account.' },
  { key: 'barchart', label: 'Barchart', loginUrl: 'https://www.barchart.com/login', category: 'options', gating: 'optional', sourceKey: 'barchart', hint: 'Free tier works; login lifts limits.' },
  { key: 'gurufocus', label: 'GuruFocus', loginUrl: 'https://www.gurufocus.com/login/', category: 'insider', gating: 'optional', sourceKey: 'gurufocus', hint: 'Most data is gated behind login.' },
  { key: 'finviz', label: 'Finviz Elite', loginUrl: 'https://finviz.com/login.ashx', category: 'insider', gating: 'optional', sourceKey: 'finviz', hint: 'Elite removes delays.' },
  { key: 'marketbeat', label: 'MarketBeat', loginUrl: 'https://www.marketbeat.com/login/', category: 'insider', gating: 'optional', sourceKey: 'marketbeat' },
  { key: 'twitter', label: 'Twitter/X', loginUrl: 'https://x.com/login', category: 'news', gating: 'required', hint: 'Required to scrape WhaleInsider news feed.' },
] as const;

export interface AuthInfo {
  loggedIn: boolean;
  savedAt: string | null;
}

/** platform key -> auth info. */
export type AuthStatus = Record<string, AuthInfo>;

/** True if a gated scraper source is allowed to run (public, or logged in). */
export function isSourceUnlocked(sourceKey: ScraperSource, auth: AuthStatus): boolean {
  const platform = LOGIN_PLATFORMS.find((p) => p.sourceKey === sourceKey);
  if (!platform) return true;
  return !!auth[platform.key]?.loggedIn;
}

export const CONVICTION_THRESHOLDS = {
  high: 80,
  watch: 50,
} as const;

// Scoring maxima shared by the score model (electron/scoring.ts) and the
// breakdown UI (ScoreBreakdown.tsx) so progress-bar fills can't drift from the
// real ceilings if the model is retuned.
/** Max insider earnings-timing multiplier: earnings 1–5d (1.8) × finance pre-earnings (1.3). */
export const MAX_INSIDER_TIMING_MULT = 1.8 * 1.3; // 2.34
/**
 * Top rung of the premium ladder in `baseOptionPoints()` (electron/scoring.ts).
 * Shared so the ladder and the display ceilings below can never drift apart.
 */
export const MAX_OPTION_BASE_POINTS = 26;
/** Max points for a single option: base(26) × sweep(1.6) × dte(1.5) × otm(1.4) × volOi(1.3). */
export const MAX_SINGLE_OPTION_POINTS = MAX_OPTION_BASE_POINTS * 1.6 * 1.5 * 1.4 * 1.3; // 113.568
/**
 * Display ceiling for the summed per-direction options score: best print plus
 * a geometric tail (best + ½·2nd + ¼·3rd + … < 2× best).
 */
export const MAX_OPTIONS_SCORE_TOTAL = MAX_SINGLE_OPTION_POINTS * 2; // 157.248

// Track-record reliability controls (Feature 6). A win rate over a handful of
// trades is mostly noise, so the scoring multiplier ignores insiders below a
// minimum sample and shrinks the rest toward 0.5 (coin-flip) before judging them.
/** Minimum number of completed-outcome trades for an insider's record to influence scoring. */
export const MIN_TRACK_RECORD_TRADES = 5;
/** Pseudo-count for Bayesian shrinkage toward 0.5 (higher = more regression to the mean). */
export const TRACK_RECORD_SHRINKAGE_K = 3;

/**
 * Bayesian-shrunk win rate: (wins + k·0.5) / (n + k). Pulls small samples toward
 * 0.5 so a 1-for-1 record reads ~0.62, not 1.0, while a 30-for-40 stays near 0.74.
 */
export function shrunkAccuracy(wins: number, total: number, k = TRACK_RECORD_SHRINKAGE_K): number {
  if (total <= 0) return 0.5;
  return (wins + k * 0.5) / (total + k);
}

export const DEFAULT_SETTINGS: AppSettings = {
  scheduleEnabled: true,
  scheduleTimes: { marketOpen: true, midday: true, close: true },
  notificationThreshold: 80,
  minDollarVolume: 50_000,
  roleFilters: {
    exec: true,
    cfo: true,
    csuite: true,
    director: true,
    vp: true,
    other: true,
  },
  sources: {
    edgar: true,
    openinsider: true,
    finviz: true,
    secform4: true,
    marketbeat: true,
    gurufocus: true,
    insidermonitor: true,
    quiverquant: true,
    barchart: true,
    optionstrat: false,
    insiderfinance: false,
    marketbeatoptions: true,
  },
  headless: true,
};

// ──────────────────────────────────────────────────────────────────────────
// IPC surface (implemented by preload, consumed by renderer)
// ──────────────────────────────────────────────────────────────────────────

export interface InsiderTrackerAPI {
  scraper: {
    start: () => Promise<ScrapeResult>;
    getStatus: () => Promise<ScrapeStatus>;
    onStatus: (cb: (status: ScrapeStatus) => void) => () => void;
  };
  signals: {
    getAll: () => Promise<Signal[]>;
    getByTicker: (ticker: string) => Promise<Signal | null>;
    getHistory: (ticker: string) => Promise<Signal[]>;
    getFiltered: (filter: SignalFilter) => Promise<Signal[]>;
    getPerformance: (ticker: string) => Promise<SignalPerformance | null>;
    exportCsv: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  };
  watchlist: {
    add: (ticker: string, notes?: string) => Promise<WatchlistItem[]>;
    remove: (ticker: string) => Promise<WatchlistItem[]>;
    getAll: () => Promise<WatchlistItem[]>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  };
  valuation: {
    fetch: (ticker: string) => Promise<ValuationResult>;
  },
  earnings: {
    fetch: (ticker: string) => Promise<{ earningsDate?: string; daysToEarnings?: number; earningsTiming?: string }>;
  };
  vix: {
    getCurrent: () => Promise<VixQuote | null>;
  };
  insider: {
    getTrackRecord: (name: string, role?: string, url?: string) => Promise<InsiderTrackRecord | null>;
  };
  auth: {
    status: () => Promise<AuthStatus>;
    startLogin: (platform: string) => Promise<{ ok: boolean; message?: string }>;
    saveLogin: (platform: string) => Promise<{ ok: boolean; message?: string }>;
    cancelLogin: (platform: string) => Promise<void>;
    logout: (platform: string) => Promise<AuthStatus>;
  };
  history: {
    getScrapeLogs: () => Promise<ScrapeLogEntry[]>;
  };
  alerts: {
    getRules: () => Promise<AlertRule[]>;
    addRule: (rule: AlertRule) => Promise<AlertRule[]>;
    removeRule: (id: number) => Promise<AlertRule[]>;
    toggleRule: (id: number, enabled: boolean) => Promise<AlertRule[]>;
  };
  performance: {
    getLatest: () => Promise<PerformanceReport | null>;
    recompute: () => Promise<PerformanceReport>;
  };
  shadow: {
    get: () => Promise<Partial<ScoringConfig> | null>;
    set: (config: Partial<ScoringConfig> | null) => Promise<Partial<ScoringConfig> | null>;
  };
  db: {
    clear: () => Promise<void>;
  };
  news: {
    getAll: () => Promise<NewsItem[]>;
    getForTicker: (ticker: string) => Promise<NewsItem[]>;
    scrapeNow: () => Promise<void>;
    setAutoStart: (enabled: boolean) => Promise<void>;
    getAutoStart: () => Promise<boolean>;
  };
  app: {
    getVersion: () => Promise<string>;
    getLastScrape: () => Promise<string | null>;
    onSignalsUpdated: (cb: (signals: Signal[]) => void) => () => void;
    onOpenTicker: (cb: (ticker: string) => void) => () => void;
    onUpdateAvailable: (cb: (version: string) => void) => () => void;
    onUpdateDownloaded: (cb: (version: string) => void) => () => void;
    onUpdateError: (cb: (err: string) => void) => () => void;
    quitAndInstall: () => Promise<void>;
    getUpdateStatus: () => Promise<{ status: 'idle' | 'available' | 'downloaded'; version: string }>;
    testSchedule: () => Promise<void>;
    setTheme: (theme: string) => Promise<void>;
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Big Players Constants & Helpers
// ──────────────────────────────────────────────────────────────────────────

export const BIG_PLAYERS = new Set<string>([
  'AAOI', 'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'ADSK', 'AEP', 'AIG', 'ALB',
  'ALGN', 'ALK', 'ALL', 'AMAT', 'AMD', 'AMGN', 'AMH', 'AMP', 'AMT', 'AMZN',
  'ANSS', 'AON', 'APD', 'ARE', 'ASML', 'AVB', 'AVGO', 'AWK', 'AXP', 'AZO',
  'BA', 'BAC', 'BAX', 'BDX', 'BIIB', 'BK', 'BKR', 'BLK', 'BRK.B', 'BSX',
  'C', 'CAG', 'CAH', 'CARR', 'CAT', 'CB', 'CCI', 'CDNS', 'CDW', 'CE',
  'CHD', 'CHRW', 'CI', 'CINF', 'CL', 'CME', 'CMI', 'CNC', 'CNQ', 'COF',
  'COP', 'COR', 'COST', 'CPB', 'CRM', 'CSCO', 'CSGP', 'CSL', 'CTRA', 'CTSH',
  'CTVA', 'CVE', 'CVS', 'CVX', 'D', 'DAL', 'DD', 'DE', 'DFS', 'DG',
  'DHR', 'DLR', 'DLTR', 'DOW', 'DUK', 'DVN', 'DXCM', 'ECL', 'ED', 'EG',
  'EL', 'ELV', 'EMN', 'EMR', 'ENB', 'EOG', 'EPAM', 'EPD', 'EQIX', 'EQR',
  'EQT', 'ES', 'ETN', 'EW', 'EXC', 'EXPD', 'EXR', 'FANG', 'FAST', 'FCX',
  'FDX', 'FI', 'FITB', 'FMC', 'FTNT', 'GD', 'GE', 'GIS', 'GL', 'GOOG',
  'GOOGL', 'GS', 'GWW', 'HAL', 'HCA', 'HD', 'HES', 'HIG', 'HOLX', 'HON',
  'HOOD', 'HSY', 'HUM', 'HWM', 'IBM', 'ICE', 'IDXX', 'INTC', 'INTU', 'INVH',
  'IQV', 'ISRG', 'IT', 'ITW', 'JBHT', 'JBL', 'JCI', 'JNJ', 'JPM', 'K',
  'KDP', 'KHC', 'KLAC', 'KMB', 'KMI', 'KO', 'KR', 'LDOS', 'LIN', 'LLY',
  'LMT', 'LNG', 'LRCX', 'LULU', 'LUV', 'LW', 'LYB', 'MA', 'MAA', 'MCD',
  'MCHP', 'MCK', 'MDLZ', 'MDT', 'MET', 'META', 'MKC', 'MLM', 'MMC', 'MNST',
  'MO', 'MPC', 'MRK', 'MRO', 'MS', 'MSFT', 'MTB', 'MTD', 'MU', 'NEE',
  'NEM', 'NFLX', 'NKE', 'NOC', 'NOW', 'NTAP', 'NTRS', 'NUE', 'NVDA', 'NXPI',
  'O', 'ODFL', 'OKE', 'ORCL', 'ORLY', 'OTIS', 'OXY', 'PANW', 'PBA', 'PCAR',
  'PEG', 'PEP', 'PFE', 'PG', 'PGR', 'PLD', 'PM', 'PNC', 'PPG', 'PRU',
  'PSA', 'PSX', 'PTC', 'PWR', 'PXD', 'QCOM', 'REGN', 'RJF', 'RMD', 'ROK',
  'ROP', 'ROST', 'RS', 'RTX', 'SBUX', 'SCHW', 'SHW', 'SJM', 'SLB', 'SNPS',
  'SO', 'SOFI', 'SPG', 'SPGI', 'SRE', 'STE', 'STLD', 'STT', 'STX', 'STZ',
  'SU', 'SYF', 'SYK', 'TAP', 'TFC', 'TFX', 'TGT', 'TJX', 'TMO', 'TRGP',
  'TRV', 'TSCO', 'TT', 'TTWO', 'TXN', 'TXT', 'TYL', 'UAL', 'UNH', 'UNP',
  'UPS', 'URI', 'USB', 'V', 'VLO', 'VMC', 'VRTX', 'VTR', 'WAT', 'WDC',
  'WEC', 'WELL', 'WFC', 'WMB', 'WMT', 'WST', 'XEL', 'XOM', 'YUM', 'ZBH',
  'ZTS'
]);

export function isBigPlayer(ticker: string): boolean {
  if (!ticker) return false;
  return BIG_PLAYERS.has(ticker.trim().toUpperCase());
}

/**
 * Big player when market cap ≥ $10B (self-maintaining — the static list above
 * rots as companies are acquired/delisted), falling back to the list when the
 * cap is unknown.
 */
export function isBigPlayerByCap(ticker: string, marketCap?: number): boolean {
  if (marketCap != null && marketCap >= 10_000_000_000) return true;
  return isBigPlayer(ticker);
}
