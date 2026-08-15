import type { BrowserContext } from 'playwright';
import type { RawInsiderTrade } from '../../src/types';
import { withPage } from './browser';
import { extractFirstTable } from './util';
import { mapInsiderTable } from './insiderMap';

/**
 * SECForm4 — additional Form 4 data. Layout is loosely structured, so we use
 * the generic table extractor and fuzzy header mapping. Best-effort.
 */
const URL = 'https://www.secform4.com/all-buys';

const TABLE_SELECTORS = ['table.tablesorter', 'table.insiders', 'table[width]', 'table'];

export async function scrapeSecForm4(context: BrowserContext): Promise<RawInsiderTrade[]> {
  return withPage(
    context,
    URL,
    async (page) => {
      await page.waitForSelector('table', { timeout: 15_000 }).catch(() => undefined);
      const table = await extractFirstTable(page, TABLE_SELECTORS);
      return mapInsiderTable(table, 'secform4', URL);
    },
    { waitUntil: 'domcontentloaded' },
  ).catch(() => [] as RawInsiderTrade[]);
}
