import type { BrowserContext } from 'playwright';
import type { RawInsiderTrade } from '../../src/types';
import { withPage, randomDelay, launchBrowser, createContext } from './browser';
import { extractFirstTable, type ExtractedTable } from './util';
import { mapInsiderTable } from './insiderMap';
import { loadMergedStorageState } from '../auth';

/**
 * GuruFocus insider summary. Behind Cloudflare bot-check + optional login.
 * Headless Chromium is often stuck on the CF interstitial; we wait for it to
 * clear, and if still blocked, retry once in a headed browser with the stored
 * GuruFocus session. Failures throw (orchestrator → source count -1) instead of
 * soft-empty, so a broken GF is never reported as a clean "0 alerts".
 */
const URL = 'https://www.gurufocus.com/insider/summary';

const TABLE_SELECTORS = [
  'table#non-sticky-table',
  'table.normal-table-mobile',
  'table.data-table',
  'table.table',
  '.insider-table table',
  'table',
];

const CF_TITLE_RE = /just a moment|attention required|security verification|checking your browser/i;
const CF_BODY_RE = /verify you are not a bot|cf-browser-verification|challenge-platform|performing security verification/i;

function normalizeHeaders(table: ExtractedTable): ExtractedTable {
  // "Buy / Sell" → "Buy/Sell" so shared colIndex aliases like "buy/sell" match.
  return {
    ...table,
    headers: table.headers.map((h) =>
      h
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
  };
}

async function isCloudflareChallenge(page: {
  title: () => Promise<string>;
  evaluate: (fn: () => string) => Promise<string>;
}): Promise<boolean> {
  const title = await page.title().catch(() => '');
  if (CF_TITLE_RE.test(title)) return true;
  const body = await page.evaluate(() => (document.body?.innerText || '').slice(0, 800)).catch(() => '');
  return CF_BODY_RE.test(body);
}

async function waitForCloudflareClear(
  page: {
    title: () => Promise<string>;
    evaluate: (fn: () => string) => Promise<string>;
    waitForTimeout: (ms: number) => Promise<void>;
  },
  maxMs = 40_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (!(await isCloudflareChallenge(page))) return true;
    await page.waitForTimeout(1_500);
  }
  return !(await isCloudflareChallenge(page));
}

async function parseGuruFocusPage(page: {
  title: () => Promise<string>;
  evaluate: (fn: () => string) => Promise<string>;
  waitForTimeout: (ms: number) => Promise<void>;
  waitForSelector: (sel: string, opts: { timeout: number }) => Promise<unknown>;
}): Promise<RawInsiderTrade[]> {
  const cleared = await waitForCloudflareClear(page);
  if (!cleared) {
    throw new Error('GuruFocus blocked by Cloudflare bot check (challenge did not clear)');
  }

  await page.waitForSelector('table#non-sticky-table, table.data-table, table', { timeout: 15_000 }).catch(() => undefined);
  await randomDelay(1200, 2200);

  // Login / paywall interstitial without a trades table.
  const body = await page.evaluate(() => (document.body?.innerText || '').slice(0, 2000)).catch(() => '');
  const tableProbe = await extractFirstTable(page as any, TABLE_SELECTORS);
  if (!tableProbe.rows.length && !tableProbe.headers.length) {
    if (/sign in|log in|subscribe|premium|membership/i.test(body) && !/insider trading shares|buy\/sell|filing date/i.test(body)) {
      throw new Error('GuruFocus page has no insider table (login wall or empty shell)');
    }
    throw new Error('GuruFocus insider table not found (selectors may have drifted)');
  }

  const table = normalizeHeaders(tableProbe);
  // Table present with headers but zero data rows → genuine empty day (clean 0).
  if (!table.rows.length) return [];

  const trades = mapInsiderTable(table, 'gurufocus', URL);
  // Headers present and rows present but nothing parseable → broken mapping, not empty day.
  if (trades.length === 0 && table.rows.length > 0) {
    throw new Error(
      `GuruFocus table has ${table.rows.length} rows but 0 parsed trades (header/map mismatch: ${table.headers.slice(0, 8).join(' | ')})`,
    );
  }
  return trades;
}

async function scrapeWithContext(context: BrowserContext): Promise<RawInsiderTrade[]> {
  return withPage(context, URL, async (page) => parseGuruFocusPage(page), {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
}

/**
 * Headed fallback: CF often only clears in a real window. Uses stored GF session
 * cookies when available. Always closes the temporary browser.
 */
async function scrapeHeadedFallback(): Promise<RawInsiderTrade[]> {
  const browser = await launchBrowser(false);
  try {
    const storage = loadMergedStorageState(['gurufocus']);
    const context = await createContext(browser, storage);
    return await scrapeWithContext(context);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function scrapeGuruFocus(context: BrowserContext): Promise<RawInsiderTrade[]> {
  try {
    return await scrapeWithContext(context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only fall back for CF / nav issues — not for parse mismatches (those won't improve headed).
    const worthHeadedRetry =
      /cloudflare|bot check|timeout|net::|navigation|Target closed|Table not found|no insider table/i.test(msg) ||
      /Timeout/i.test(msg);
    if (!worthHeadedRetry) throw err;

    console.warn(`[gurufocus] primary attempt failed (${msg}); retrying headed…`);
    try {
      return await scrapeHeadedFallback();
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2);
      throw new Error(`GuruFocus failed (headless: ${msg}; headed: ${msg2})`);
    }
  }
}
