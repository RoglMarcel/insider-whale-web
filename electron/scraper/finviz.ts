import type { BrowserContext } from 'playwright';
import type { RawInsiderTrade } from '../../src/types';
import { withPage, randomDelay } from './browser';
import { extractFirstTable } from './util';
import { mapInsiderTable } from './insiderMap';

/**
 * Finviz insider trading — role-labeled trades. `tc=1` filters to buys.
 * Finviz changes its table class periodically, so we try several selectors.
 */
const URL = 'https://finviz.com/insidertrading.ashx?tc=1';

const TABLE_SELECTORS = [
  'table.body-table',
  'table.styled-table-new',
  'table.insider-trading-table',
  '#insider-trading table',
  'table.table-light',
];

export async function scrapeFinviz(context: BrowserContext): Promise<RawInsiderTrade[]> {
  return withPage(
    context,
    URL,
    async (page) => {
      await page.waitForSelector('table', { timeout: 15_000 }).catch(() => undefined);
      const table = await extractFirstTable(page, TABLE_SELECTORS);

      // Finviz renders a company logo chip inside the ticker cell whose fallback
      // letter is part of textContent — so the cell reads "PPAL" for PAL (verified
      // live: <span class="company-ticker" style="--logo-url:…/PAL.svg">). Read the
      // ticker from the row's authoritative quote link (`…?t=PAL`) instead, keyed by
      // the *rendered cell text* so it survives row-order differences.
      const tickerByCell = await page.evaluate((selectors: string[]) => {
        const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
        const out: Record<string, string> = {};
        for (const sel of selectors) {
          const tbl = document.querySelector(sel);
          if (!tbl) continue;
          const rows = Array.from(tbl.querySelectorAll('tbody tr, tr'));
          for (const tr of rows) {
            const td = tr.querySelector('td');
            if (!td) continue;
            const cellText = norm(td.textContent);
            if (!cellText) continue;
            for (const a of Array.from(tr.querySelectorAll('a'))) {
              const href = a.getAttribute('href') || '';
              const m = /[?&]t=([A-Za-z0-9.\-]{1,12})(?:&|$)/.exec(href);
              if (m) {
                out[cellText] = m[1].toUpperCase();
                break;
              }
            }
          }
          if (Object.keys(out).length) break;
        }
        return out;
      }, TABLE_SELECTORS);

      const idx = table.headers.findIndex((h) => /ticker|symbol|stock/i.test(h));
      if (idx >= 0 && Object.keys(tickerByCell).length) {
        for (const row of table.rows) {
          const fromHref = tickerByCell[(row[idx] ?? '').trim()];
          if (fromHref) row[idx] = fromHref;
        }
      }

      // Only keep rows that look like insider data (have an Owner/Relationship header).
      const trades = mapInsiderTable(table, 'finviz', URL);
      return trades;
    },
    { waitUntil: 'domcontentloaded' },
  ).catch(() => [] as RawInsiderTrade[]);
}

// ──────────────────────────────────────────────────────────────────────────
// Feature 5 — earnings dates from the Finviz quote snapshot table
// ──────────────────────────────────────────────────────────────────────────

export interface EarningsInfo {
  ticker: string;
  earningsDate?: string;
  earningsTiming?: 'AMC' | 'BMO';
  daysToEarnings?: number;
}

/** Parse Finviz's "Earnings" cell, e.g. "Jun 15 AMC", "May 1/a", "Feb 21 BMO". */
export function parseFinvizEarnings(raw: string): Omit<EarningsInfo, 'ticker'> | null {
  const s = (raw ?? '').trim();
  if (!s || /^-+$/.test(s)) return null;

  let earningsTiming: 'AMC' | 'BMO' | undefined;
  if (/amc|\/a\b/i.test(s)) earningsTiming = 'AMC';
  else if (/bmo|\/b\b/i.test(s)) earningsTiming = 'BMO';

  const dateStr = s.replace(/\/[ab]\b/i, '').replace(/\b(amc|bmo)\b/i, '').trim();
  const year = new Date().getFullYear();
  const parsed = new Date(`${dateStr} ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;

  // Earnings are forward-looking — roll to next year if the date looks past.
  const todayMs = new Date().setHours(0, 0, 0, 0);
  if (parsed.getTime() < todayMs - 5 * 86_400_000) parsed.setFullYear(year + 1);

  // Whole-calendar-day countdown (midnight to midnight): an earnings report
  // later TODAY must read 0, not −1, or it forfeits the timing boost.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysToEarnings = Math.round((parsed.getTime() - startOfToday.getTime()) / 86_400_000);
  const y = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return { earningsDate: `${y}-${month}-${d}`, earningsTiming, daysToEarnings };
}

/**
 * Fetch upcoming earnings for a set of tickers from their Finviz quote pages.
 * Bounded (default 25) and politely delayed so it doesn't dominate the scrape.
 */
export async function scrapeFinvizEarnings(
  context: BrowserContext,
  tickers: string[],
  limit = 25,
  maxDurationMs = 80_000,
): Promise<Map<string, EarningsInfo>> {
  const start = Date.now();
  const out = new Map<string, EarningsInfo>();
  for (const ticker of tickers.slice(0, limit)) {
    if (Date.now() - start > maxDurationMs) {
      console.log(`[scraper] scrapeFinvizEarnings timing out early at ${Date.now() - start}ms to preserve ${out.size} results`);
      break;
    }
    try {
      const raw = await withPage(
        context,
        `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`,
        async (page) => {
          await page.waitForSelector('.snapshot-table2', { timeout: 10_000 }).catch(() => undefined);
          return page.evaluate(() => {
            const cells = Array.from(document.querySelectorAll('.snapshot-table2 td')).map(
              (td) => td.textContent?.replace(/\s+/g, ' ').trim() || '',
            );
            for (let i = 0; i < cells.length - 1; i++) {
              if (cells[i].toLowerCase() === 'earnings') return cells[i + 1];
            }
            return '';
          });
        },
        { waitUntil: 'domcontentloaded', timeout: 20_000 },
      );
      const parsed = parseFinvizEarnings(raw);
      if (parsed) out.set(ticker, { ticker, ...parsed });
    } catch {
      /* skip this ticker */
    }
    await randomDelay(700, 1400);
  }
  return out;
}
