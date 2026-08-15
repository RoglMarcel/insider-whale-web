import type { ValuationResult } from '../src/types';
import { getValuationCacheRow, upsertValuationCacheRow } from './database';

/**
 * Valuation cache shared by the on-demand modal fetch (main.ts) and the scrape
 * orchestrator. In-memory for speed, backed by SQLite so app restarts don't
 * re-scrape the same ticker's fair value and burn the providers' free-view
 * limits. Lets scoring fold in a ticker's undervaluation when one is known.
 */
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map<string, { at: number; result: ValuationResult }>();

export function getCachedValuation(ticker: string): ValuationResult | null {
  const key = ticker.trim().toUpperCase();
  const e = cache.get(key);
  if (e && Date.now() - e.at < TTL_MS) return e.result;
  // Read-through to SQLite so a restart doesn't cost another provider view.
  try {
    const row = getValuationCacheRow(key);
    if (row) {
      const at = Date.parse(row.fetched_at);
      if (!Number.isNaN(at) && Date.now() - at < TTL_MS) {
        const result = JSON.parse(row.result) as ValuationResult;
        cache.set(key, { at, result });
        return result;
      }
    }
  } catch {
    /* DB unavailable (e.g. standalone scripts) — memory-only */
  }
  return null;
}

export function setCachedValuation(ticker: string, result: ValuationResult): void {
  const key = ticker.trim().toUpperCase();
  cache.set(key, { at: Date.now(), result });
  try {
    upsertValuationCacheRow(key, JSON.stringify(result));
  } catch {
    /* best-effort */
  }
}

/**
 * Mean upside% across a ticker's cached valuation sources, if fresh. Averaging
 * (not max) — always taking the more bullish of two independent models would
 * feed a systematically optimistic input into the valuation multiplier.
 */
export function getCachedUpside(ticker: string): number | undefined {
  const r = getCachedValuation(ticker);
  if (!r) return undefined;
  const ups = r.sources.map((s) => s.upsidePct).filter((u): u is number => u != null && Number.isFinite(u));
  return ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : undefined;
}
