import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { PricePoint, PriceSnapshot } from './prices';
import { screenSeries } from './prices';

/** Complete immutable responses; price_history is only their active projection. */
export const PRICE_CACHE_SCHEMA = `
CREATE TABLE IF NOT EXISTS price_vintages (
 id TEXT PRIMARY KEY, ticker TEXT NOT NULL, recorded_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS price_vintages_ticker ON price_vintages(ticker, recorded_at);
CREATE TRIGGER IF NOT EXISTS price_vintages_no_update BEFORE UPDATE ON price_vintages BEGIN SELECT RAISE(ABORT,'immutable price vintage'); END;
CREATE TRIGGER IF NOT EXISTS price_vintages_no_delete BEFORE DELETE ON price_vintages BEGIN SELECT RAISE(ABORT,'immutable price vintage'); END;
`;
export const PRICE_SCREEN_VERSION = 'adjacent-review-v1';
export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)).digest('hex');

export interface PriceVintage extends PriceSnapshot {
  recordedAt: string;
  screenVersion: string;
  clean: PricePoint[];
  issues: string[];
  /** An extreme move can be released only with recorded external evidence. */
  review?: { evidence: string; reviewer: string; sourceVintageId?: string; reviewedAt?: string };
}

/** Reuse approval only for exactly the same observed discontinuities and
 * provider identity. New dates may extend a series; changed event prices,
 * adjustment scales or new extreme moves require fresh evidence. */
export function reusablePriceReview(snapshot: PriceSnapshot, previous: PriceVintage | null): PriceVintage['review'] | undefined {
  if (!previous?.review) return undefined;
  const identity = (v: PriceSnapshot) => [v.providerSymbol,v.metadata?.symbol,v.metadata?.currency,v.metadata?.exchangeName,v.metadata?.instrumentType];
  if (digest(identity(snapshot)) !== digest(identity(previous))) return undefined;
  const transitions = (v: PriceSnapshot) => {
    const points = [...v.points].sort((a,b)=>a.date.localeCompare(b.date));
    const flagged = new Set(screenSeries(points).suspect.map(p=>p.date));
    return points.flatMap((p,i)=>i && flagged.has(p.date) ? [digest([points[i-1],p])] : []);
  };
  const current = transitions(snapshot), approved = new Set(transitions(previous));
  return current.length && current.every(k=>approved.has(k)) ? previous.review : undefined;
}

export function makePriceVintage(snapshot: PriceSnapshot, review?: PriceVintage['review']): PriceVintage {
  const screened = screenSeries(snapshot.points);
  const issues = [...snapshot.issues];
  if (!snapshot.metadata?.symbol || !snapshot.metadata.currency || !snapshot.metadata.exchangeName) issues.push('unknown_provider_identity');
  if (snapshot.metadata?.symbol && snapshot.metadata.symbol.toUpperCase() !== snapshot.providerSymbol.toUpperCase()) issues.push('provider_symbol_mismatch');
  if (snapshot.metadata?.currency && snapshot.metadata.currency !== 'USD') issues.push('non_usd_price');
  if (snapshot.metadata?.instrumentType && !['EQUITY', 'ETF'].includes(snapshot.metadata.instrumentType)) issues.push('unsupported_instrument');
  if (screened.suspect.length && !review) issues.push('unexplained_discontinuity: independent price/corporate-action review required');
  if (review && (!review.evidence.trim() || !review.reviewer.trim())) throw new Error('Review requires evidence and reviewer');
  // Review releases magnitude flags, never a mismatched security/currency or
  // invalid observation. A corrected provider response is another vintage.
  const dates = snapshot.points.map(p => p.date);
  const valid = dates.length === new Set(dates).size && snapshot.points.every(p => Number.isFinite(p.px) && p.px > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(Date.parse(p.date)) && new Date(p.date).toISOString().slice(0,10) === p.date);
  if (!valid) issues.push('invalid_observation');
  const recordedAt = review?.reviewedAt && Date.parse(review.reviewedAt) > Date.parse(snapshot.fetchedAt) ? review.reviewedAt : snapshot.fetchedAt;
  return { ...snapshot, recordedAt, screenVersion: PRICE_SCREEN_VERSION, issues: [...new Set(issues)],
    clean: issues.length ? [] : [...snapshot.points], ...(review ? { review } : {}) };
}

/** Select a WHOLE vintage, including its empty quarantine. A legacy import
 * cannot restore removed dates, nor can an older snapshot win by row count. */
export function projectPriceVintages(db: Database.Database, tickers?: readonly string[]): void {
  const symbols = tickers ?? (db.prepare('SELECT DISTINCT ticker FROM price_vintages').all() as { ticker: string }[]).map(r => r.ticker);
  const latest = db.prepare('SELECT id,ticker,recorded_at,payload FROM price_vintages WHERE ticker=? ORDER BY julianday(recorded_at) DESC, id DESC LIMIT 1');
  const remove = db.prepare('DELETE FROM price_history WHERE ticker=?');
  const insert = db.prepare('INSERT INTO price_history(ticker,date,adj_close,fetched_at) VALUES(?,?,?,?)');
  for (const ticker of symbols) {
    const row = latest.get(ticker) as { id: string; ticker: string; recorded_at: string; payload: string } | undefined;
    if (!row) continue;
    const v = JSON.parse(row.payload) as PriceVintage;
    if (digest(v) !== row.id || v.ticker !== row.ticker || v.recordedAt !== row.recorded_at ||
      v.basis !== 'yahoo-adjusted-close' || v.screenVersion !== PRICE_SCREEN_VERSION ||
      digest(makePriceVintage(v, v.review).clean) !== digest(v.clean)) throw new Error(`Invalid price vintage: ${row.id}`);
    remove.run(ticker);
    for (const p of v.clean) insert.run(ticker, p.date, p.px, v.fetchedAt);
  }
}

export function storePriceVintage(db: Database.Database, vintage: PriceVintage): string {
  if (!Number.isFinite(Date.parse(vintage.fetchedAt))) throw new Error('Invalid price-vintage timestamp');
  vintage = makePriceVintage(vintage, vintage.review);
  const id = digest(vintage);
  db.transaction(() => {
    // Retain the pre-versioning cache before the first replacement. It is
    // evidence only, not another candidate for the active projection.
    const legacy = db.prepare('SELECT date,adj_close,fetched_at FROM price_history WHERE ticker=? ORDER BY date').all(vintage.ticker);
    if (legacy.length && !db.prepare('SELECT 1 FROM price_vintages WHERE ticker=?').get(vintage.ticker)) {
      db.prepare('INSERT OR IGNORE INTO portfolio_revisions(reason,saved_at,state_json) VALUES(?,?,?)')
        .run(`legacy-price-cache:${vintage.ticker}`, vintage.fetchedAt, JSON.stringify(legacy));
    }
    db.prepare('INSERT OR IGNORE INTO price_vintages VALUES(?,?,?,?)').run(id, vintage.ticker, vintage.recordedAt, JSON.stringify(vintage));
    projectPriceVintages(db, [vintage.ticker]);
  })();
  return id;
}
