import type { BrowserContext, Page } from 'playwright';
import type { ValuationResult, ValuationSourceResult } from '../../src/types';
import { randomDelay } from './browser';

/** Parse a price string that may use English (1,234.56) or European (1.234,56) formatting. */
export function parseLocalizedPrice(str: string): number | undefined {
  const cleaned = str.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return undefined;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let s = cleaned;

  if (hasComma && hasDot) {
    const commaIdx = cleaned.indexOf(',');
    const dotIdx = cleaned.indexOf('.');
    if (commaIdx < dotIdx) {
      // English format: 1,234.56 -> remove commas
      s = cleaned.replace(/,/g, '');
    } else {
      // European format: 1.234,56 -> remove dots, replace comma with dot
      s = cleaned.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (hasComma) {
    // Only comma: e.g. 14,01 or 1,250
    const parts = cleaned.split(',');
    const lastPart = parts[parts.length - 1];
    // If the last part has exactly 2 digits, or if it is not 3 digits, treat as decimal separator
    if (lastPart.length === 2 || lastPart.length === 1) {
      s = cleaned.replace(/,/g, '.');
    } else {
      s = cleaned.replace(/,/g, '');
    }
  }

  // Extract the numeric part (including optional minus sign, digits, and dot)
  const match = s.match(/-?[0-9.]+/);
  if (!match) return undefined;
  const val = parseFloat(match[0]);
  return Number.isFinite(val) ? val : undefined;
}

/** Pull a labeled dollar figure out of page text, e.g. "Intrinsic Value $123.45". */
function findValueNear(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    // Matches labels followed by optional spaces, optional $, optional -, and a number (which may contain commas/dots/%)
    const re = new RegExp(`${label}[^$0-9,-]{0,40}\\$?[-]?\\s*([0-9][0-9,.-]*\\s*%?)`, 'i');
    const m = text.match(re);
    if (m) {
      const matchStr = m[1].trim();
      if (matchStr.endsWith('%')) {
        continue; // reject percentages!
      }
      const parsed = parseLocalizedPrice(matchStr);
      if (parsed !== undefined && parsed > 0) return parsed;
    }
  }
  return undefined;
}

function upside(fairValue?: number, price?: number): number | undefined {
  if (fairValue == null || price == null || price === 0) return undefined;
  return Math.round(((fairValue - price) / price) * 1000) / 10;
}

// ──────────────────────────────────────────────────────────────────────────
// AlphaSpread — DCF fair value
// ──────────────────────────────────────────────────────────────────────────

async function fetchAlphaSpread(page: Page, ticker: string): Promise<ValuationSourceResult> {
  const exchanges = ['nasdaq', 'nyse', 'amex'];
  let lastUrl = `https://www.alphaspread.com/security/nasdaq/${ticker.toLowerCase()}/summary`;
  for (const ex of exchanges) {
    const url = `https://www.alphaspread.com/security/${ex}/${ticker.toLowerCase()}/summary`;
    lastUrl = url;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (resp && resp.status() >= 400) continue;
      await page.waitForTimeout(2500);

      const domResult = await page.evaluate(() => {
        const ivEl = document.querySelector('.price-ladder__point--iv .price-ladder__value');
        const priceEl = document.querySelector('.price-ladder__point--current .price-ladder__value');
        return {
          fairValueText: ivEl?.textContent?.trim() || null,
          currentPriceText: priceEl?.textContent?.trim() || null,
        };
      });

      let fairValue: number | undefined = domResult.fairValueText ? parseLocalizedPrice(domResult.fairValueText) : undefined;
      let currentPrice: number | undefined = domResult.currentPriceText ? parseLocalizedPrice(domResult.currentPriceText) : undefined;
      let label: string | undefined = undefined;

      const text = await page.evaluate(() => document.body.innerText || '');
      
      const isLocked = (domResult.fairValueText?.toLowerCase().includes('locked') ||
                        text.toLowerCase().includes('unlock intrinsic value') ||
                        text.toLowerCase().includes('unlock this valuation') ||
                        text.toLowerCase().includes('subscribe to unlock') ||
                        text.toLowerCase().includes('free plan limit reached'));
      if (isLocked) {
        return {
          source: 'alphaspread',
          url,
          error: 'AlphaSpread free plan limit reached or premium required.'
        };
      }

      const labelMatch = text.match(/(under ?valued|over ?valued|fairly valued)/i);
      if (labelMatch) label = labelMatch[1];

      // Fallback to regex if DOM selector failed
      if (fairValue === undefined) {
        fairValue = findValueNear(text, ['base case intrinsic value', 'intrinsic value', 'fair value', 'dcf value']);
      }
      if (currentPrice === undefined) {
        currentPrice = findValueNear(text, ['market price', 'current price', 'last price', 'price']);
      }

      if (fairValue !== undefined) {
        return {
          source: 'alphaspread',
          fairValue,
          currentPrice,
          upsidePct: upside(fairValue, currentPrice),
          label: label || (currentPrice && fairValue < currentPrice ? 'Overvalued' : 'Undervalued'),
          url,
        };
      }
    } catch {
      /* try next exchange */
    }
  }
  return { source: 'alphaspread', url: lastUrl, error: 'Fair value not found (page gated or layout changed).' };
}

// ──────────────────────────────────────────────────────────────────────────
// ValueInvesting.io — intrinsic value estimate
// ──────────────────────────────────────────────────────────────────────────

async function fetchValueInvesting(page: Page, ticker: string): Promise<ValuationSourceResult> {
  const url = `https://valueinvesting.io/${ticker.toUpperCase()}/valuation/intrinsic-value`;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (resp && resp.status() >= 400) {
      return { source: 'valueinvesting', url, error: `HTTP ${resp.status()}` };
    }
    await page.waitForTimeout(2500);

    const text = await page.evaluate(() => document.body.innerText || '');
    const isLimited = text.toLowerCase().includes('monthly view limit') ||
                      text.toLowerCase().includes('reached your free plan') ||
                      text.toLowerCase().includes('limit of free views') ||
                      text.toLowerCase().includes('upgrade your plan to unlock');
    if (isLimited) {
      return {
        source: 'valueinvesting',
        url,
        error: 'ValueInvesting.io free plan limit reached (5 stocks/month).'
      };
    }

    const domResult = await page.evaluate(() => {
      const squares = Array.from(document.querySelectorAll('.price_square'));
      let fairValueText: string | null = null;
      let currentPriceText: string | null = null;

      squares.forEach(sq => {
        const normEl = sq.querySelector('.norm');
        const tinyEl = sq.querySelector('.tiny');
        if (normEl && tinyEl) {
          const valText = normEl.textContent?.trim() || '';
          const label = tinyEl.textContent?.trim().toLowerCase() || '';

          if (label.includes('intrinsic value') || label.includes('fair value')) {
            fairValueText = valText;
          } else if (label.includes('stock price') || label.includes('current price')) {
            currentPriceText = valText;
          }
        }
      });

      return { fairValueText, currentPriceText };
    });

    let fairValue: number | undefined = domResult.fairValueText ? parseLocalizedPrice(domResult.fairValueText) : undefined;
    let currentPrice: number | undefined = domResult.currentPriceText ? parseLocalizedPrice(domResult.currentPriceText) : undefined;

    // Fallback to regex if DOM selector failed
    if (fairValue === undefined || currentPrice === undefined) {
      const text = await page.evaluate(() => document.body.innerText || '');
      if (fairValue === undefined) {
        // Refined regex to avoid matching header upside (supports commas/dots)
        const sentenceMatch = text.match(/Intrinsic Value of [^(]+\([^)]+\) is\s*(-?[0-9][0-9,.-]*)/i);
        if (sentenceMatch) {
          const parsed = parseLocalizedPrice(sentenceMatch[1]);
          if (parsed !== undefined) fairValue = parsed;
        }
        if (fairValue === undefined) {
          fairValue = findValueNear(text, ['intrinsic value', 'fair value', 'dcf', 'base case']);
        }
      }
      if (currentPrice === undefined) {
        currentPrice = findValueNear(text, ['current price', 'market price', 'stock price', 'last price']);
      }
    }



    if (fairValue !== undefined) {
      return {
        source: 'valueinvesting',
        fairValue,
        currentPrice,
        upsidePct: upside(fairValue, currentPrice),
        label: currentPrice && fairValue < currentPrice ? 'Overvalued' : 'Undervalued',
        url,
      };
    }
    return { source: 'valueinvesting', url, error: 'Intrinsic value not found (page gated or layout changed).' };
  } catch (err) {
    return { source: 'valueinvesting', url, error: err instanceof Error ? err.message : 'Failed to load' };
  }
}

/**
 * Fetch fair-value estimates for a ticker from both providers. Each runs on its
 * own page and fails independently. Called lazily when a detail modal opens.
 */
export async function fetchValuation(context: BrowserContext, ticker: string): Promise<ValuationResult> {
  const sym = ticker.trim().toUpperCase();
  const sources: ValuationSourceResult[] = [];

  const page = await context.newPage();
  try {
    // Both providers are gated 'optional' (see LOGIN_PLATFORMS): attempt best-effort
    // even without a saved session. Each scraper detects and reports its own
    // free-view limit, and an injected logged-in session lifts those limits.
    sources.push(await fetchAlphaSpread(page, sym));
    await randomDelay();
    sources.push(await fetchValueInvesting(page, sym));
  } finally {
    await page.close().catch(() => undefined);
  }

  // Best current-price estimate from whichever source reported one.
  const currentPrice = sources.find((s) => s.currentPrice != null)?.currentPrice;

  return {
    ticker: sym,
    currentPrice,
    sources,
    fetchedAt: new Date().toISOString(),
  };
}
