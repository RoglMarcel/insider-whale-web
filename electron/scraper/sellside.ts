import type { BrowserContext } from 'playwright';
import { XMLParser } from 'fast-xml-parser';
import { withPage } from './browser';
import { extractFirstTable, colIndex, cell, parseMoney, parseDate, cleanTicker, cleanText } from './util';

/**
 * Sell-side intelligence — the buy-only pipeline's missing other half. Two
 * collectors feed the `insider_flow` table (context/display only; they never
 * produce signals and never block the signal pipeline):
 *
 *  1. OpenInsider SALES screener (xp=0&xs=1) — per-ticker daily insider sale
 *     dollar totals, same tinytable layout as the purchases screener.
 *  2. EDGAR Form 144 Atom feed — notices of PROPOSED sales (the leading
 *     indicator that a large insider sale is coming). The atom carries no
 *     ticker, so issuer CIKs are mapped through the SEC's company_tickers.json;
 *     individual sellers' CIKs simply don't resolve and drop out naturally.
 */

export interface InsiderFlowRow {
  ticker: string;
  flowDate: string; // YYYY-MM-DD
  buyValue: number;
  sellValue: number;
  form144Count: number;
  source: string;
}

// Screener first (500 rows, 90-day window to match getNetInsiderFlow), fixed
// sales page as fallback — first URL that yields rows wins.
const SALES_URLS = [
  'http://openinsider.com/screener?s=&o=&pl=&ph=&ll=&lh=&fd=90&fdr=&td=0&tdr=&daysago=&xp=0&xs=1&vl=25&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=1&cnt=500&page=1',
  'http://openinsider.com/latest-insider-sales-100k',
];

export async function scrapeOpenInsiderSales(context: BrowserContext): Promise<InsiderFlowRow[]> {
  for (const url of SALES_URLS) {
    const rows = await scrapeSalesPage(context, url);
    if (rows.length) return rows;
  }
  return [];
}

async function scrapeSalesPage(context: BrowserContext, url: string): Promise<InsiderFlowRow[]> {
  return withPage(
    context,
    url,
    async (page) => {
      await page.waitForSelector('table.tinytable', { timeout: 15_000 }).catch(() => undefined);
      const table = await extractFirstTable(page, ['table.tinytable']);
      const idx = {
        ticker: colIndex(table.headers, ['ticker', 'symbol']),
        type: colIndex(table.headers, ['trade type', 'transaction']),
        date: colIndex(table.headers, ['trade date']),
        value: colIndex(table.headers, ['value']),
      };
      // Aggregate to one row per ticker per trade day.
      const byKey = new Map<string, number>();
      for (const row of table.rows) {
        const ticker = cleanTicker(cell(row, idx.ticker));
        if (!ticker) continue;
        // The screener is asked for sales only, but guard anyway.
        const type = cleanText(cell(row, idx.type)).toLowerCase();
        if (type && !type.includes('sale') && !type.startsWith('s')) continue;
        const flowDate = parseDate(cell(row, idx.date));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(flowDate)) continue;
        const value = Math.abs(parseMoney(cell(row, idx.value)));
        if (!value) continue;
        const key = `${ticker}|${flowDate}`;
        byKey.set(key, (byKey.get(key) ?? 0) + value);
      }
      const out: InsiderFlowRow[] = [];
      for (const [key, sellValue] of byKey) {
        const [ticker, flowDate] = key.split('|');
        out.push({ ticker, flowDate, buyValue: 0, sellValue, form144Count: 0, source: 'openinsider-sales' });
      }
      return out;
    },
    { waitUntil: 'domcontentloaded' },
  ).catch(() => [] as InsiderFlowRow[]);
}

// ──────────────────────────────────────────────────────────────────────────
// EDGAR Form 144 — proposed-sale notices (metadata level; count per ticker/day)
// ──────────────────────────────────────────────────────────────────────────

const FORM144_ATOM =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=144&company=&dateb=&owner=include&count=100&output=atom';
const TICKER_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_UA = 'insider-whale-terminal/1.0 (marcel.rogls@gmail.com)';

const xml = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

// The CIK→ticker map is ~1MB and changes rarely — cache it for the session.
let cikTickerCache: { at: number; map: Map<number, string> } | null = null;
const CIK_MAP_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCikTickerMap(): Promise<Map<number, string>> {
  if (cikTickerCache && Date.now() - cikTickerCache.at < CIK_MAP_TTL_MS) return cikTickerCache.map;
  const map = new Map<number, string>();
  try {
    const res = await fetch(TICKER_MAP_URL, {
      headers: { 'User-Agent': SEC_UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const json = (await res.json()) as Record<string, { cik_str?: number; ticker?: string }>;
      for (const entry of Object.values(json)) {
        if (typeof entry?.cik_str === 'number' && typeof entry?.ticker === 'string' && !map.has(entry.cik_str)) {
          // First occurrence wins — the file is ordered so the primary share
          // class of a CIK comes first.
          map.set(entry.cik_str, entry.ticker.toUpperCase());
        }
      }
    }
  } catch {
    /* best-effort — an empty map just yields zero 144 rows this run */
  }
  if (map.size > 0) cikTickerCache = { at: Date.now(), map };
  return map;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export async function fetchEdgarForm144(): Promise<InsiderFlowRow[]> {
  try {
    const cikMap = await getCikTickerMap();
    if (cikMap.size === 0) return [];
    const res = await fetch(FORM144_ATOM, {
      headers: { 'User-Agent': SEC_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const doc = xml.parse(await res.text());
    const entries = asArray<Record<string, unknown>>(doc?.feed?.entry);

    // One filing appears once per associated party — dedupe by accession, and
    // resolve the ticker via whichever associated CIK is a listed issuer
    // (individual sellers' CIKs are not in company_tickers.json).
    const seenAccessions = new Set<string>();
    const byKey = new Map<string, number>();
    for (const entry of entries) {
      const title = typeof entry.title === 'string' ? entry.title : '';
      if (!/^144(?:\/A)?\s*-/.test(title.trim())) continue;
      const cikMatch = /\((\d{10})\)/.exec(title);
      if (!cikMatch) continue;
      const ticker = cikMap.get(Number(cikMatch[1]));
      if (!ticker) continue; // not an issuer CIK → the seller-side entry
      const link = entry.link as { '@_href'?: string } | undefined;
      const acc = /(\d{10}-\d{2}-\d{6})/.exec(link?.['@_href'] ?? '')?.[1] ?? '';
      const accKey = acc ? `${acc}` : `${title}`;
      if (seenAccessions.has(accKey)) continue;
      seenAccessions.add(accKey);
      const updated = typeof entry.updated === 'string' ? entry.updated : '';
      const flowDate = /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : '';
      if (!flowDate) continue;
      const key = `${cleanTicker(ticker)}|${flowDate}`;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }

    const out: InsiderFlowRow[] = [];
    for (const [key, count] of byKey) {
      const [ticker, flowDate] = key.split('|');
      out.push({ ticker, flowDate, buyValue: 0, sellValue: 0, form144Count: count, source: 'edgar144' });
    }
    return out;
  } catch {
    return [];
  }
}
