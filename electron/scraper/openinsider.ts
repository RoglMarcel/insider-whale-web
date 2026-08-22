import type { BrowserContext } from 'playwright';
import type { RawInsiderTrade } from '../../src/types';
import { withPage, randomDelay } from './browser';
import { colIndex, cell, parseMoney, parseShares, parseDate, cleanTicker, cleanText, sanitizeTradeAmounts } from './util';

/**
 * OpenInsider — SEC Form 4 filings. Highest priority, most reliable source.
 * Uses the screener (same tinytable layout as the fixed feeds) with explicit
 * filters: xp=1 purchases only, xs=0 no sales, vl=25 value ≥ $25k, fd=14 filed
 * in the last 14 days, cnt=500 rows.
 * Also captures each insider's history-page URL (`/insider/<slug>/<cik>`) so
 * Feature 6 can look up their track record later.
 *
 * WINDOW: this used to be fd=7, which made 7 days the effective memory of the
 * ENTIRE pipeline — every other enabled source is a "latest filings" feed too,
 * and EDGAR's getcurrent atom covers only minutes. A real $1M CEO buy therefore
 * vanished from its own signal on day 7 while the 90-day insider_flow panel kept
 * showing its dollars. Trades are now persisted (see `insider_trades`), so the
 * window is redundancy margin, not the retention mechanism: it only has to cover
 * the gap between successful scrapes. 14 days gives 2× headroom over the 3×-daily
 * schedule and survives a multi-day CI outage.
 *
 * CEILING: cnt=500 is the binding constraint, not fd. Measured 2026-08-21 —
 * fd=7 → 184 rows, fd=14 → 422, fd=21 → 500 (capped, silently truncating the
 * oldest filings). Do not widen fd past 14 without paginating (&page=2…n);
 * `capReached` below warns if the cap is ever hit.
 *
 * NOTE: http:// is deliberate — openinsider.com refuses connections on port
 * 443 (verified live), so https simply fails.
 */
const ROW_LIMIT = 500;
const URLS = [
  'http://openinsider.com/screener?s=&o=&pl=&ph=&ll=&lh=&fd=14&fdr=&td=0&tdr=&daysago=&xp=1&xs=0&vl=25&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=1&cnt=500&page=1',
];

interface RawRow {
  cells: string[];
  insiderUrl: string;
  sourceUrl?: string;
}

function mapRows(headers: string[], rows: RawRow[], url: string): RawInsiderTrade[] {
  const idx = {
    ticker: colIndex(headers, ['ticker', 'symbol']),
    company: colIndex(headers, ['company name', 'company']),
    insider: colIndex(headers, ['insider name', 'insider']),
    title: colIndex(headers, ['title']),
    type: colIndex(headers, ['trade type', 'transaction']),
    tradeDate: colIndex(headers, ['trade date']),
    filingDate: colIndex(headers, ['filing date']),
    qty: colIndex(headers, ['qty', 'quantity', 'shares']),
    price: colIndex(headers, ['price']),
    value: colIndex(headers, ['value']),
  };

  const out: RawInsiderTrade[] = [];
  for (const { cells, insiderUrl, sourceUrl } of rows) {
    const ticker = cleanTicker(cell(cells, idx.ticker));
    if (!ticker) continue;
    const shares = parseShares(cell(cells, idx.qty));
    let price = parseMoney(cell(cells, idx.price)) || undefined;
    let value = Math.abs(parseMoney(cell(cells, idx.value)));
    if (!value && shares && price) {
      value = shares * price;
    } else if (value && shares && !price) {
      price = value / shares;
    }
    const sane = sanitizeTradeAmounts(shares, price, value);
    if (!sane) continue;

    out.push({
      ticker,
      companyName: cleanText(cell(cells, idx.company)) || undefined,
      insiderName: cleanText(cell(cells, idx.insider)) || 'Unknown',
      role: cleanText(cell(cells, idx.title)),
      transactionType: cleanText(cell(cells, idx.type)) || 'P',
      tradeDate: parseDate(cell(cells, idx.tradeDate)),
      filingDate: parseDate(cell(cells, idx.filingDate)) || undefined,
      shares: sane.shares,
      price: sane.price,
      value: sane.value,
      source: 'openinsider',
      sourceUrl: sourceUrl || url,
      insiderUrl: insiderUrl || undefined,
    });
  }
  return out;
}

export async function scrapeOpenInsider(context: BrowserContext): Promise<RawInsiderTrade[]> {
  const all: RawInsiderTrade[] = [];
  for (const url of URLS) {
    // Deliberately NOT wrapped in `.catch(() => [])`: this is the pipeline's
    // widest source (~200 rows/run), so an empty result is never a legitimate
    // "nothing to report" — it means the fetch or the parse broke. Swallowing it
    // reported a healthy 0 rows, which the orchestrator logged as success and
    // the health monitor ignored, silently zeroing every signal this source was
    // carrying. Let it throw so the orchestrator records the −1 failure sentinel.
    const trades = await withPage(context, url, async (page) => {
      await page.waitForSelector('table.tinytable', { timeout: 15_000 }).catch(() => undefined);
      const data = await page.evaluate(() => {
        const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
        const table = document.querySelector('table.tinytable');
        if (!table) return { headers: [] as string[], rows: [] as { cells: string[]; insiderUrl: string; filingUrl: string }[] };
        const headers = Array.from(table.querySelectorAll('thead th, thead td')).map((e) => norm(e.textContent));
        const rows: { cells: string[]; insiderUrl: string; filingUrl: string }[] = [];
        table.querySelectorAll('tbody tr').forEach((tr) => {
          const tds = Array.from(tr.querySelectorAll('td'));
          const cells = tds.map((td) => norm(td.textContent));
          let insiderUrl = '';
          let filingUrl = '';
          for (const td of tds) {
            const a = td.querySelector('a[href*="/insider/"]');
            if (a) {
              insiderUrl = a.getAttribute('href') || '';
            }
            const filingA = td.querySelector('a[href*="sec.gov"], a[href*="edgar"], a[href*="s.php?id="]');
            if (filingA) {
              filingUrl = filingA.getAttribute('href') || '';
            }
          }
          if (cells.length) rows.push({ cells, insiderUrl, filingUrl });
        });
        return { headers, rows };
      });

      const resolved = data.rows.map((r) => ({
        cells: r.cells,
        insiderUrl: r.insiderUrl
          ? r.insiderUrl.startsWith('http')
            ? r.insiderUrl
            : `http://openinsider.com${r.insiderUrl}`
          : '',
        sourceUrl: r.filingUrl
          ? r.filingUrl.startsWith('http')
            ? r.filingUrl
            : `http://openinsider.com${r.filingUrl}`
          : '',
      }));
      // The screener silently truncates at cnt, dropping the OLDEST filings —
      // exactly the ones the window exists to cover. Surfacing it beats
      // discovering it as another mystery gap months later.
      if (data.rows.length >= ROW_LIMIT) {
        console.warn(
          `[openinsider] hit the cnt=${ROW_LIMIT} row cap (${data.rows.length} rows) — ` +
            `the oldest filings in the window are being truncated; narrow fd or add pagination`,
        );
      }
      const mapped = mapRows(data.headers, resolved, url);
      if (!mapped.length) {
        throw new Error(
          `OpenInsider returned no usable rows (${data.rows.length} raw row(s), ` +
            `${data.headers.length} header(s)) — page shape changed or the request was blocked`,
        );
      }
      return mapped;
    });
    all.push(...trades);
    await randomDelay();
  }
  return all;
}
