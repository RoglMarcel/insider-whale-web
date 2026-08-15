import type { BrowserContext } from 'playwright';
import { XMLParser } from 'fast-xml-parser';
import type { RawInsiderTrade } from '../../src/types';
import { cleanTicker, cleanText } from './util';

/**
 * SEC EDGAR — Form 4 straight from the authoritative source. Discovery via the
 * "current events" Atom feed (most recent Form 4 filings), then each filing's
 * primary XML document is parsed for structured roles, exact share/price
 * values, and the 10b5-1 plan checkbox — no aggregator HTML involved, so this
 * source is immune to the redesign/reformat breakages the scraped sites have.
 *
 * SEC fair-use etiquette: descriptive User-Agent with a contact address and
 * ≤ 10 requests/second (throttled well under that below).
 */

const ATOM_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=100&output=atom';
const SEC_UA = 'insider-whale-terminal/1.0 (marcel.rogls@gmail.com)';
const FILING_LIMIT = 60;
const CONCURRENCY = 4;
const PER_REQUEST_DELAY_MS = 250; // 4 workers × ~2–3 req/s each stays under SEC's 10/s
const TOTAL_BUDGET_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

const xml = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

async function secFetch(url: string): Promise<string | null> {
  await new Promise((r) => setTimeout(r, PER_REQUEST_DELAY_MS));
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function isTrue(v: unknown): boolean {
  return v === '1' || v === 'true' || v === 1 || v === true;
}

/** Form 4 XML wraps scalars: <transactionShares><value>50000</value></transactionShares>. */
function numVal(node: any): number | undefined {
  const raw = node?.value ?? node;
  if (raw == null || typeof raw === 'object') return undefined;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : undefined;
}

function strVal(node: any): string {
  const raw = node?.value ?? node;
  return raw == null || typeof raw === 'object' ? '' : String(raw).trim();
}

interface FilingRef {
  cik: string;
  accession: string; // with dashes
  indexUrl: string;
  filingDate?: string;
}

/** Parse the getcurrent Atom feed into unique filing references. */
export function parseAtomFilings(atomText: string): FilingRef[] {
  const doc = xml.parse(atomText);
  const entries = asArray(doc?.feed?.entry);
  const seen = new Set<string>();
  const out: FilingRef[] = [];
  for (const entry of entries) {
    const href: string = entry?.link?.['@_href'] ?? '';
    const m = /Archives\/edgar\/data\/(\d+)\/.*?(\d{10}-\d{2}-\d{6})-index/.exec(href);
    if (!m) continue;
    const [, cik, accession] = m;
    // Each filing appears once per associated filer (Issuer + Reporting person);
    // dedupe by accession number.
    if (seen.has(accession)) continue;
    seen.add(accession);
    const updated: string = typeof entry?.updated === 'string' ? entry.updated : '';
    out.push({
      cik,
      accession,
      indexUrl: href.startsWith('http') ? href : `https://www.sec.gov${href}`,
      filingDate: /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : undefined,
    });
  }
  return out;
}

/** Map one parsed ownershipDocument into trades (open-market purchases only). */
export function mapOwnershipDocument(doc: any, ref: FilingRef): RawInsiderTrade[] {
  const od = doc?.ownershipDocument;
  if (!od) return [];

  const issuer = asArray(od.issuer)[0];
  const ticker = cleanTicker(strVal(issuer?.issuerTradingSymbol));
  if (!ticker || ticker === 'NONE') return [];
  const companyName = cleanText(strVal(issuer?.issuerName)) || undefined;

  const owner = asArray(od.reportingOwner)[0];
  const insiderName = cleanText(strVal(owner?.reportingOwnerId?.rptOwnerName)) || 'Unknown';
  const rel = owner?.reportingOwnerRelationship ?? {};
  // Structured flags — no title-string guessing. Abbreviations match the
  // vocabulary getRankWeight already understands ("Dir", "10%").
  const roleParts: string[] = [];
  const officerTitle = cleanText(strVal(rel.officerTitle));
  if (officerTitle) roleParts.push(officerTitle);
  else if (isTrue(rel.isOfficer)) roleParts.push('Officer');
  if (isTrue(rel.isDirector)) roleParts.push('Dir');
  if (isTrue(rel.isTenPercentOwner)) roleParts.push('10%');
  const role = roleParts.join(', ') || 'Other';

  // The 10b5-1 checkbox (pre-scheduled plan) is an explicit field on the form.
  const planned = isTrue(od.aff10b5One);

  // Aggregate the filing's open-market purchases (code P, acquired) into one
  // per-filing trade, mirroring how OpenInsider reports a filing.
  let totalShares = 0;
  let totalValue = 0;
  let tradeDate = '';
  for (const tx of asArray(od.nonDerivativeTable?.nonDerivativeTransaction)) {
    const code = strVal(tx?.transactionCoding?.transactionCode).toUpperCase();
    if (code !== 'P') continue;
    const acquired = strVal(tx?.transactionAmounts?.transactionAcquiredDisposedCode).toUpperCase();
    if (acquired && acquired !== 'A') continue;
    const shares = numVal(tx?.transactionAmounts?.transactionShares) ?? 0;
    const price = numVal(tx?.transactionAmounts?.transactionPricePerShare) ?? 0;
    if (shares <= 0) continue;
    totalShares += shares;
    totalValue += shares * price;
    const d = strVal(tx?.transactionDate);
    if (/^\d{4}-\d{2}-\d{2}/.test(d) && (!tradeDate || d < tradeDate)) tradeDate = d.slice(0, 10);
  }
  if (totalShares <= 0 || !tradeDate) return [];

  return [
    {
      ticker,
      companyName,
      insiderName,
      role,
      transactionType: planned ? '10b5-1 Purchase' : 'P - Purchase',
      tradeDate,
      filingDate: ref.filingDate,
      shares: totalShares,
      price: totalValue > 0 ? totalValue / totalShares : undefined,
      value: totalValue,
      source: 'edgar',
      sourceUrl: ref.indexUrl,
    },
  ];
}

/** Locate + fetch a filing's primary Form 4 XML, then map it. */
async function fetchFiling(ref: FilingRef): Promise<RawInsiderTrade[]> {
  const folder = `https://www.sec.gov/Archives/edgar/data/${ref.cik}/${ref.accession.replace(/-/g, '')}`;
  const indexText = await secFetch(`${folder}/index.json`);
  if (!indexText) return [];
  let items: any[] = [];
  try {
    items = asArray(JSON.parse(indexText)?.directory?.item);
  } catch {
    return [];
  }
  const xmlItem = items.find((it) => typeof it?.name === 'string' && /\.xml$/i.test(it.name));
  if (!xmlItem) return [];
  const xmlText = await secFetch(`${folder}/${xmlItem.name}`);
  if (!xmlText) return [];
  try {
    return mapOwnershipDocument(xml.parse(xmlText), ref);
  } catch {
    return [];
  }
}

export async function scrapeEdgar(_context: BrowserContext): Promise<RawInsiderTrade[]> {
  const atomText = await secFetch(ATOM_URL);
  if (!atomText) return [];

  let filings: FilingRef[] = [];
  try {
    filings = parseAtomFilings(atomText).slice(0, FILING_LIMIT);
  } catch {
    return [];
  }
  if (!filings.length) return [];

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const out: RawInsiderTrade[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, filings.length) }, async () => {
    while (next < filings.length && Date.now() < deadline) {
      const ref = filings[next++];
      try {
        out.push(...(await fetchFiling(ref)));
      } catch {
        /* per-filing best-effort */
      }
    }
  });
  await Promise.all(workers);
  return out;
}
