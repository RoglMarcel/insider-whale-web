import { filterSignals, type InsiderTrackerAPI, type Signal, type VixQuote, type WatchlistItem } from '@/types';
import { mockApi } from './mockApi';

/**
 * Web API (v1.1.2) — the "read-only" InsiderTrackerAPI for the hosted website.
 *
 * The scrape runs on GitHub Actions (`scripts/scrape-web.ts`) and writes static
 * JSON into `public/data/`. Here we read that JSON instead of talking to an
 * Electron main process. Everything the browser genuinely cannot do (trigger a
 * scrape, log in, export CSV) falls back to `mockApi`. The watchlist is kept
 * per-device in `localStorage` — free, no backend.
 */

const DATA_BASE = `${import.meta.env.BASE_URL ?? '/'}data/`;

interface Meta {
  generatedAt?: string;
  version?: string;
  vix?: VixQuote | null;
}

let signalsCache: { at: number; data: Signal[] } | null = null;
const SIGNALS_TTL_MS = 60_000;

async function loadJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${DATA_BASE}${file}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function loadSignals(force = false): Promise<Signal[]> {
  if (!force && signalsCache && Date.now() - signalsCache.at < SIGNALS_TTL_MS) {
    return signalsCache.data;
  }
  const data = await loadJson<Signal[]>('signals.json', []);
  signalsCache = { at: Date.now(), data };
  return data;
}

const loadMeta = () => loadJson<Meta>('meta.json', {});

// ── Per-device watchlist (localStorage) ──
const WL_KEY = 'iwt.watchlist';

function readWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WL_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

function writeWatchlist(items: WatchlistItem[]): WatchlistItem[] {
  try {
    localStorage.setItem(WL_KEY, JSON.stringify(items));
  } catch {
    /* private mode / quota — best-effort */
  }
  return items;
}

async function watchlistJoined(): Promise<WatchlistItem[]> {
  const items = readWatchlist();
  if (!items.length) return items;
  const signals = await loadSignals();
  const byTicker = new Map(signals.map((s) => [s.ticker.toUpperCase(), s]));
  return items.map((it) => ({ ...it, signal: byTicker.get(it.ticker.toUpperCase()) ?? null }));
}

export const webApi: InsiderTrackerAPI = {
  ...mockApi,
  signals: {
    ...mockApi.signals,
    getAll: () => loadSignals(),
    getFiltered: async (filter) => filterSignals(await loadSignals(), filter),
    getByTicker: async (ticker) =>
      (await loadSignals()).find((s) => s.ticker.toUpperCase() === ticker.toUpperCase()) ?? null,
    // Only the latest snapshot is published in v1.1.2 (no cross-run history yet).
    getHistory: async (ticker) => {
      const s = (await loadSignals()).find((x) => x.ticker.toUpperCase() === ticker.toUpperCase());
      return s ? [s] : [];
    },
  },
  vix: {
    getCurrent: async () => (await loadMeta()).vix ?? null,
  },
  watchlist: {
    getAll: () => watchlistJoined(),
    add: async (ticker, notes) => {
      const items = readWatchlist();
      const t = ticker.toUpperCase();
      if (!items.some((i) => i.ticker.toUpperCase() === t)) {
        items.unshift({ ticker: t, addedAt: new Date().toISOString(), notes: notes ?? null });
      }
      writeWatchlist(items);
      return watchlistJoined();
    },
    remove: async (ticker) => {
      const t = ticker.toUpperCase();
      writeWatchlist(readWatchlist().filter((i) => i.ticker.toUpperCase() !== t));
      return watchlistJoined();
    },
  },
  history: {
    // No fake scrape logs on the web; the real ones live in the desktop DB.
    getScrapeLogs: async () => [],
  },
  app: {
    ...mockApi.app,
    getVersion: async () => (await loadMeta()).version ?? 'web',
    getLastScrape: async () => (await loadMeta()).generatedAt ?? null,
    // Poll the static JSON so an open tab picks up the next scrape.
    onSignalsUpdated: (cb: (signals: Signal[]) => void) => {
      const id = setInterval(async () => {
        cb(await loadSignals(true));
      }, 5 * 60_000);
      return () => clearInterval(id);
    },
  },
};
