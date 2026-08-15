# Insider & Whale Terminal — Full Codebase Audit

_Date: 2026-07-02 · Audited version: 1.0.38 · Analysis-only, nothing was changed._

This document supersedes `PROJECT_ANALYSIS.md` (which was written against v1.0.37; several of its findings — the 30-day track-record proxy, whale-signal discarding, linear normalization, unbounded DB growth — were fixed in v1.0.38 and are NOT re-reported here).

**Method:** every file in `electron/`, `electron/scraper/`, `src/types/`, `src/lib/`, `src/store/`, `scripts/`, and every logic-bearing component in `src/components/` was read line-by-line. Suspected bugs were verified empirically: date-parsing behavior was reproduced in Node, and the live HTML of openinsider.com and stockanalysis.com was fetched and tested against the code's actual regexes and header aliases on 2026-07-02. Findings marked **[VERIFIED LIVE]** were confirmed against real, current data.

---

## Part 0 — Strategy-by-Strategy Verdicts

Each scoring strategy, one by one, with a verdict and the finding IDs (from Part 1) that affect it:

| # | Strategy | Verdict | Related findings |
|---|----------|---------|------------------|
| 1 | **Insider rank weighting** (`getRankWeight`) | **Broken in practice.** The logic is sound for long-form titles, but the primary source (OpenInsider) emits abbreviated titles (`Dir`, `Pres`, `COB`, `GC`). 41% of live rows are titled `Dir` and score weight 1 instead of 4. | F3 |
| 2 | **Market-cap-relative buy sizing** (`getDollarVolumePoints`) | **Inert in production.** The formula itself is correct, but `marketCap` is never populated because the stockanalysis.com regex no longer matches the live HTML — every ticker silently falls back to absolute buckets. The headline v1.0.38 feature does nothing. | F1 |
| 3 | **Cluster detection** (`getClusterMultiplier` + name dedup) | **Partially broken.** Correct multiplier table, but (a) cross-source name-order differences ("Doe John" vs "John Doe") create phantom second insiders, inflating clusters and dollar volume; (b) a stale-cluster fallback re-grants the full multiplier to >30-day-old clusters; (c) the Finviz year-2001 date bug breaks the trade-date dedup key. | F2, F8, F22 |
| 4 | **Transaction-type weighting** (`classifyTransaction`) | **Sound.** Codes and phrases map correctly; `A` (award) correctly excluded; value-weighted modifier math is correct. One caveat: the SECForm4 mapper collapses everything non-sale to `P`. | F26 |
| 5 | **Earnings timing** (`getInsiderTimingMultiplier` / options variant) | **Mostly sound.** Multiplier tables are fine. Bug: on earnings day itself (afternoon), `daysToEarnings` computes to −1 and the strongest timing case (AMC earnings today) earns no boost. | F13 |
| 6 | **Detailed options scoring** (`scoreOneOption` / `scoreOptionsDetailed`) | **Two real flaws.** (a) The OTM boost uses `Math.abs`, so deep-ITM contracts (conservative, delta≈1) collect the far-OTM "lottery ticket" ×1.4 multiplier. (b) Only the single strongest bullish and strongest bearish prints count — five separate $1M bullish sweeps score the same as one. | F7, F23 |
| 7 | **Options sentiment normalization** (`optionsMap.ts`) | **Broken for InsiderFinance, and for any strategy-text source.** (a) The `type` header alias matches InsiderFinance's order-type column ("Type" = SWEEP/BLOCK) before the actual `C/P` column, so every put is read as a bullish call. (b) `parseStrategy` maps "bear" to `action: sell`, which inverts bear put spreads into *bullish*. | F5, F6 |
| 8 | **Combo detection** (`detectCombo`) | **Flawed.** The options leg accepts ANY print > $250k regardless of sentiment — a $300k bearish put block plus an insider buy triggers the +30 "insider buying + unusual options flow" combo bonus. | F4 |
| 9 | **Freshness / time decay** (`getFreshnessMultiplier`, `daysBetween`) | **Mostly sound.** Bug: date-only strings parse as UTC midnight, adding a timezone-offset skew to every age; a trade exactly 3/7/14 days old lands on the wrong side of the decay cliffs. The Finviz 2001-date bug also pollutes this. | F2, F12 |
| 10 | **VIX boost** (`getVixMultiplier`) | **Sound.** Smooth 20→35 ramp is correct and applied only to the insider leg (deliberate). Minor: the cached VIX never expires on fetch failure, and the UI "high >25" label disagrees with the ramp starting at 20. | F28, F33 |
| 11 | **Insider track record** (`insiderHistory.ts` + shrinkage) | **Sound core, three flaws.** Alpha-vs-SPY with split-adjusted prices and Bayesian shrinkage is well designed. Bugs: (a) transient scrape errors are cached for 7 days by the pre-warm path, suppressing records; (b) trades older than the 10-year Yahoo window silently compare a raw basis price against adjusted later prices; (c) a missing SPY window silently degrades alpha to absolute return. | F14, F15, F30 |
| 12 | **Valuation multiplier** (`getValuationMultiplier` + cache) | **Sound formula, biased input.** Taking the MAX upside across providers is systematically optimistic; the cache is memory-only, so every app restart burns providers' free views again. | F16, F17 |
| 13 | **Whale (options-only) signals** (`buildAggregates`) | **Works, one flaw.** A ticker whose only qualifying print is a huge *bearish* put still surfaces as a "whale" signal (score ≈ 0, LOW) — noise rows on the dashboard. | F24 |
| 14 | **Score normalization** (saturating sigmoid) | **Sound.** `100·r/(r+105)` anchored at 420→80 is monotonic, smooth, and the math checks out (420/525 = 0.80 exactly). Stale doc comment claims the display ceiling is ≈2126 when it computes ≈2445. | F34 |
| 15 | **Signal expiry & dashboard filters** (`filterSignals`, `getLatestSignals`) | **Sound.** Calendar-day cutoffs, local-midnight parsing, ISO-string comparison all correct. Note: "week" = since Monday, so Monday mornings show near-nothing (design choice, documented below). | F35 |
| 16 | **Role-category filters** (Settings → "roleFilters") | **Dead feature.** The setting renders in Settings and persists, but no code in the scraper or scoring ever reads it. | F9 |
| 17 | **Backtest harness** (`scripts/backtest.ts`) | **Sound math, one statistical flaw.** Pearson/stats implementations are correct. The same ticker scraped 3×/day contributes many near-identical, autocorrelated observations, inflating `n` and washing out the correlation. | F31 |
| 18 | **Scheduling** (node-cron + schtasks) | **Sound.** Dual scheduling is safe: when the app is open, the schtasks-spawned instance loses the single-instance lock and exits; the in-app cron scrapes. Headless path awaits VIX before scoring. Minor DST drift possible if the app isn't opened across a DST boundary. | F36 |

---

## Part 1 — Findings

Every finding follows the same template and is fully self-contained.

---

### F1. [SCRAPING/BUG] — stockanalysis.com Market-Cap and Sector regexes silently fail: relative buy sizing and sector tagging are dead **[VERIFIED LIVE]**

**Severity:** Critical

**Location:** `electron/scraper/index.ts` — `fetchStockAnalysisEarnings()`, lines 380–387

**Problem:**
The current code:

```ts
const capMatch = html.match(/Market Cap<\/td><td[^>]*>([^<]+)<\/td>/i);
if (capMatch) out.marketCap = parseMarketCap(capMatch[1].trim());

const secMatch = html.match(/Sector<\/td><td[^>]*>(?:<a[^>]*>)?([^<]+)/i);
```

On the live page (verified 2026-07-02 against `https://stockanalysis.com/stocks/aapl/`), the "Market Cap" label is wrapped in an anchor and followed by a Svelte comment marker before `</td>`:

```html
<td class="..."><!--[--><a href="/stocks/aapl/market-cap/" class="dothref text-default">Market Cap</a><!--]--></td><td class="...">4.53T <!----><span class="rg">+52.9%</span><!----></td>
```

So `Market Cap</td>` never occurs and `capMatch` is always `null`. Likewise "Sector" is not in a `<td>` at all — it is:

```html
<span class="block font-semibold">Sector</span> <!--[--><a href="/stocks/sector/technology/" class="dothref text-default">Technology</a><!--]-->
```

so `secMatch` is always `null`. Only the "Earnings Date" regex still matches (`Earnings Date</td><td ...>Jul 30, 2026</td>` — verified matching).

Consequences, all silent:
1. `agg.marketCap` is `undefined` for every ticker → `getDollarVolumePoints(perInsiderValue, undefined)` always uses the absolute-dollar fallback → **the entire "Relative Buy Sizing" feature of v1.0.38 never executes**.
2. `agg.sector` is always `undefined` → the `sector` column in the DB is always NULL, the detail-modal sector line never renders, CSV export sector column is always empty.

**Solution:**
Strip HTML comments first, then match label-through-anchor. Replace lines 380–387 with:

```ts
const cleaned = html.replace(/<!--[\s\S]*?-->/g, '');

const capMatch = cleaned.match(/Market Cap(?:<\/a>)?<\/td><td[^>]*>\s*([^<]+)/i);
if (capMatch) out.marketCap = parseMarketCap(capMatch[1].trim());

const secMatch = cleaned.match(/>Sector<\/span>\s*<a[^>]*>([^<]+)/i);
if (secMatch) {
  const sector = secMatch[1].trim();
  if (sector && sector !== '-' && sector !== '—') out.sector = sector;
}

const m = cleaned.match(/Earnings Date(?:<\/a>)?<\/td><td[^>]*>\s*([^<]+)/i);
```

(Use `cleaned` for the earnings match too so it survives if that label is also anchor-wrapped later.) Note the market-cap cell content is `"4.53T "` followed by a `<span>` — `([^<]+)` captures `"4.53T "` and the existing `parseMarketCap` handles it.

Additionally add a fallback so the feature can't die silently again: after the stockanalysis fetch, if `out.marketCap` is still undefined, derive it from Yahoo (already used elsewhere in the app): `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d` — the response's `chart.result[0].meta` does not carry market cap, so instead use `https://query1.finance.yahoo.com/v7/finance/quote?symbols={ticker}` and read `quoteResponse.result[0].marketCap` (plain number). If that endpoint returns 401 (crumb requirement varies), skip — the regex fix alone restores the feature.

**Why this matters:**
The centerpiece calibration of v1.0.38 (buy size relative to company size) has been a no-op in production, and every signal has been scored on absolute-dollar buckets while the README and score-breakdown notes claim otherwise.

---

### F2. [SCRAPING/BUG] — Dates without a year ("Jul 01") parse as year 2001: Finviz trades get 25-year ages and break dedup **[VERIFIED]**

**Severity:** Critical

**Location:** `electron/scraper/util.ts` — `parseDate()`, lines 31–68 (the `Date.parse` fallback at lines 57–65)

**Problem:**
Finviz's insider-trading table (`https://finviz.com/insidertrading.ashx?tc=1`, enabled by default) renders trade dates without a year: `"Jul 01"`, `"Jun 30"`. `parseDate` has branches for ISO and `MM/DD/YYYY`, then falls back to `Date.parse(cleaned)`. Verified in Node:

```
Date.parse("Jul 01")  → 2001-07-01   (V8 interprets the "01" as the year 2001)
Date.parse("Dec 31")  → 2001-12-31
```

So every Finviz trade gets `tradeDate: "2001-07-01"`. Effects:
1. `daysBetween` reports the trade as ~25 years old → `getFreshnessMultiplier` = 0.2, and the trade fails the 30-day cluster window.
2. **Cross-source dedup breaks**: `dedupTrades` keys on `ticker|insider|tradeDate`. The same Form 4 arrives from OpenInsider with the correct date and from Finviz with `2001-07-01` → two distinct keys → both survive → `totalDollarVolume` and the trade list double-count.
3. The dashboard week/48h filters and the trade-date display are wrong for any signal whose representative trade came from Finviz.

**Solution:**
In `parseDate`, add a month-day-without-year branch BEFORE the `Date.parse` fallback:

```ts
// 3. Month-name + day with NO year (e.g. Finviz "Jul 01", "Dec 31 06:33 PM"):
// assume the current year, rolling back one year if that lands in the future.
const matchMonthDay = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?!\s*[,\d])/);
if (matchMonthDay) {
  const year = new Date().getFullYear();
  const candidate = new Date(`${matchMonthDay[1]} ${matchMonthDay[2]}, ${year}`);
  if (!Number.isNaN(candidate.getTime())) {
    // A trade date can't be in the future; "Dec 31" scraped on Jan 2 means last year.
    if (candidate.getTime() > Date.now() + 86_400_000) candidate.setFullYear(year - 1);
    const y = candidate.getFullYear();
    const m = String(candidate.getMonth() + 1).padStart(2, '0');
    const d = String(candidate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
```

The negative lookahead `(?!\s*[,\d])` ensures strings that DO carry a year ("Jul 1, 2026" / "Jul 01 2026") still fall through to `Date.parse`, which handles them correctly.

**Why this matters:**
With Finviz enabled by default, every overlapping filing is double-counted in dollar volume and every Finviz-only trade is scored as maximally stale — both directions corrupt the score.

---

### F3. [SCORING/BUG] — `getRankWeight` doesn't recognize OpenInsider's abbreviated titles: "Dir" (41% of live rows) scores weight 1 instead of 4 **[VERIFIED LIVE]**

**Severity:** Critical

**Location:** `electron/scoring.ts` — `getRankWeight()`, lines 102–140

**Problem:**
OpenInsider (the primary, most reliable source) emits abbreviated titles. Live distribution fetched 2026-07-02 from the purchases screener (100 rows): `Dir` ×41, `10%` ×20, `CEO` ×6, `Dir, 10%` ×5, `CFO` ×3, `Pres, CEO` ×3, `CEO, 10%` ×3, plus `COB, CEO, 10%`, `VP`, `COO`, etc.

Tracing the current code:
- `'Dir'` → `has('director', 'board')` is false (`'dir'.includes('director')` is false) → falls all the way through → **weight 1, category 'other'** (should be 4, 'director').
- Standalone `'Pres'` → `has('president')` false → **weight 1** (should be 8).
- `'COB'` (Chairman of the Board) → no branch matches → **weight 1** (should be 6).
- `'GC'` (General Counsel) → **weight 1** (should be 3).
- `'CEO'`, `'CFO'`, `'COO'`, `'VP'`, `'SVP'`, `'10%'` are handled correctly by the existing `hasWord` checks.

`rankWeight` multiplies the entire insider leg, so the single most common title on the primary source under-scores its signals by 4×.

**Solution:**
In `getRankWeight`, (a) move the 10%-owner branch ABOVE the director branch (so `"Dir, 10%"` resolves to 5, not 4), and (b) add the abbreviations:

```ts
// after the CFO/COO branch:
if ((has('president') || hasWord('pres')) && !isVice) {
  return { weight: 8, category: 'cfo' };
}
// ... founder branch unchanged ...
if (
  has('chief technology', 'chief marketing', 'chief accounting', 'chairman') ||
  hasWord('cto', 'cmo', 'cio', 'chro', 'cob') ||
  role.includes('chief')
) {
  return { weight: 6, category: 'csuite' };
}
// 10% owners BEFORE directors so "Dir, 10%" takes the higher weight:
if (has('10%', 'beneficial owner', 'major shareholder')) {
  return { weight: 5, category: 'director' };
}
if (has('director', 'board') || hasWord('dir')) {
  return { weight: 4, category: 'director' };
}
if (isVice || hasWord('gc') || has('officer', 'senior', 'head of', 'general counsel', 'secretary', 'treasurer')) {
  return { weight: 3, category: 'vp' };
}
```

`hasWord` already uses `\b` word boundaries, so `hasWord('pres')` does NOT match inside "president" or "vice president" (no word boundary after "pres" there), and `hasWord('dir')` does not match inside "director". Also update the same role logic reflected in `isFinanceInsider` — no change needed there (`'cfo'` substring already matches).

**Why this matters:**
41% of all rows from the highest-priority source are currently scored as anonymous "other insiders", flattening the single largest differentiator in the insider leg.

---

### F4. [SCORING/BUG] — Combo bonus fires on bearish options flow

**Severity:** High

**Location:** `electron/scoring.ts` — `detectCombo()`, lines 348–359

**Problem:**
```ts
const optionsHit = options.some((o) => optionPremium(o) > 250_000);
```
The sentiment of the print is never checked. A ticker with an insider buy plus a **$300k bearish put block** (a contradictory signal) receives the flat `+30` combo bonus — which, post-normalization, is enough to jump a whole conviction tier — with the note "⚡ COMBO: insider buying + unusual options flow".

**Solution:**
```ts
const optionsHit = options.some((o) => o.sentiment === 'bullish' && optionPremium(o) > 250_000);
```
Keep everything else identical. (The insider leg's `modifier <= 0.4` exclusion of 10b5-1 buys is correct — leave it.)

**Why this matters:**
The combo bonus is the largest single score adjustment in the model (+30 points on a 0–100 scale); it must only reward *confirming* flow.

---

### F5. [SCRAPING/BUG] — InsiderFinance column collision: the `type` header alias matches the order-type column, so every put becomes a bullish call **[VERIFIED]**

**Severity:** High

**Location:** `electron/scraper/optionsMap.ts` — `mapOptionsTable()`, line 62 (the `idx.type` alias list); interacts with `electron/scraper/insiderfinance.ts` line 94 (fallback header list)

**Problem:**
The InsiderFinance layout (both the scraped header row and the hardcoded fallback list) is:
`['Time','Ticker','Expiry','C/P','Spot','Strike','OTM','Price','Size','Open Interest','Implied Vol','Type','Premium','Sector','Heat Score']`
where **"C/P" (index 3) is call/put** and **"Type" (index 11) is the order type** (SWEEP / BLOCK / SPLIT).

`colIndex(headers, ['type', 'c/p', 'call/put', 'put/call', 'side'])` scans aliases in order — `'type'` first — and returns index **11** (verified). So `typeStr` becomes `"sweep"` / `"block"`, which contains neither `"put"` nor equals `"p"` → `type = 'call'` for **every row**. With no sentiment column and no strategy column, sentiment falls through to `type === 'put' ? 'bearish' : 'bullish'` → **every InsiderFinance row is recorded as a bullish call**, including put sweeps.

**Solution:**
Two coordinated edits in `mapOptionsTable`:

1. Reorder the type aliases so the specific ones win:
```ts
type: colIndex(headers, ['c/p', 'call/put', 'put/call', 'side', 'type']),
```
2. The sweep detection currently works only *by accident* (it reads `typeStr`, which happens to contain "sweep"). Make it explicit by adding `'type'` to the order-column aliases so `orderText` still sees the SWEEP/BLOCK column after the fix:
```ts
order: colIndex(headers, ['trade type', 'order type', 'order', 'flow', 'condition', 'type']),
```
(For Barchart, whose call/put column is literally headed "Type" and which has no "C/P" header, the reordered alias list still resolves correctly to that column, and its order alias match is harmless.)

Also handle the `C`/`P` single-letter cell values that InsiderFinance uses: change the type resolution to
```ts
type = typeStr.includes('put') || typeStr === 'p' ? 'put' : 'call';
```
— this line already exists and is correct once `typeStr` reads the right column.

**Why this matters:**
When the user logs into InsiderFinance (a login-gated, deliberately-enabled source), all of its bearish flow is currently scored as bullish — inverting the options leg and poisoning combo detection.

---

### F6. [SCRAPING/BUG] — `parseStrategy` maps "bear" to a *sell* action, inverting bear put spreads into bullish sentiment **[VERIFIED]**

**Severity:** High

**Location:** `electron/scraper/optionsMap.ts` — `parseStrategy()`, lines 34–38, and the sentiment resolution in `mapOptionsTable()`, lines 103–117

**Problem:**
```ts
if (lower.includes('buy') || lower.includes('bull') || lower.includes('sweep') || lower.includes('block') || lower.includes('ask')) {
  action = 'buy';
} else if (lower.includes('sell') || lower.includes('bear') || lower.includes('write') || lower.includes('bid')) {
  action = 'sell';
}
```
"Bull"/"bear" are *sentiment* words, not order actions. Verified trace: strategy text `"Bear Put Spread"` → contains `'bear'` → `action = 'sell'` → in `mapOptionsTable`, sold put ⇒ `sentiment = 'bullish'`. A bear put spread is scored **bullish**. ("Bull Call Spread" only comes out right by coincidence.) Additionally, `'sweep'` and `'block'` imply nothing about direction and must not force `action = 'buy'`.

**Solution:**
1. Extend `parseStrategy`'s return type with an explicit sentiment and stop treating bull/bear/sweep/block as actions:

```ts
export function parseStrategy(strategyText: string): {
  type?: 'call' | 'put'; strike?: number; action?: 'buy' | 'sell'; sentiment?: 'bullish' | 'bearish';
} {
  ...
  let sentiment: 'bullish' | 'bearish' | undefined;
  if (lower.includes('bull')) sentiment = 'bullish';
  else if (lower.includes('bear')) sentiment = 'bearish';

  if (lower.includes('buy') || lower.includes('ask')) action = 'buy';
  else if (lower.includes('sell') || lower.includes('write') || lower.includes('bid')) action = 'sell';
  ...
  return { type, strike, action, sentiment };
}
```

2. In `mapOptionsTable`'s sentiment resolution, check the explicit strategy sentiment before the action heuristic:

```ts
if (sentRaw.includes('bear')) sentiment = 'bearish';
else if (sentRaw.includes('bull')) sentiment = 'bullish';
else if (stratInfo.sentiment) sentiment = stratInfo.sentiment;
else if (stratInfo.action) { ...existing action→sentiment logic... }
else sentiment = type === 'put' ? 'bearish' : 'bullish';
```

**Why this matters:**
Named-strategy flow (spreads) is exactly the flow where naive put/call sentiment is wrong; this function exists to fix that and currently inverts it.

---

### F7. [MATH] — OTM boost uses `Math.abs`: deep in-the-money options collect the far-OTM speculation multiplier

**Severity:** Medium

**Location:** `electron/scoring.ts` — `scoreOneOption()`, lines 256–260

**Problem:**
```ts
if (o.otmPercent != null) {
  const otm = Math.abs(o.otmPercent);
  if (otm > 15) pts *= 1.4;
  else if (otm >= 5) pts *= 1.1;
}
```
`otmPercent` is sign-normalized upstream (positive = OTM, negative = ITM, for both calls and puts — `optionsMap.ts` lines 147–160). The ×1.4 boost is meant for far-OTM "conviction lottery tickets", but `Math.abs` grants the identical boost to a 20%-ITM contract — a conservative, delta≈1 stock substitute that signals much less directional conviction.

**Solution:**
Use the signed value; do not boost ITM:
```ts
if (o.otmPercent != null) {
  if (o.otmPercent > 15) pts *= 1.4;
  else if (o.otmPercent >= 5) pts *= 1.1;
}
```
Also update the shared display ceiling comment in `src/types/index.ts` line 691 if desired — the max is unchanged (18 × 1.6 × 1.5 × 1.4 × 1.3 = 78.624), so `MAX_SINGLE_OPTION_POINTS` needs no edit.

**Why this matters:**
Deep-ITM institutional prints currently read as maximum-aggression speculation, inflating the options leg for exactly the flow that is least informative about direction conviction.

---

### F8. [BUG/MATH] — Cross-source insider-name word order defeats dedup and inflates clusters ("Doe John" vs "John Doe")

**Severity:** High

**Location:** `src/types/index.ts` — `normalizeInsiderName()`, lines 446–460; consumed by `dedupTrades()` (`electron/scraper/index.ts` line 164) and cluster counting (`electron/scoring.ts` lines 402–407)

**Problem:**
OpenInsider/Finviz/SECForm4 render names SEC-style, last-name-first (`"Mosseri Marlio Charles"` — verified live), while MarketBeat renders first-name-first (`"Marlio Charles Mosseri"`). `normalizeInsiderName` lowercases and strips non-alphanumerics but preserves word order, so the same person produces two different keys (`mosserimarliocharles` vs `marliocharlesmosseri`). Consequences:
1. `dedupTrades` groups by `ticker|insider|tradeDate` → the same Form 4 from two sources is never in the same group → **double-counted dollar volume**.
2. `scoreTicker`'s `recentInsiders`/`allInsiders` sets count the person twice → **phantom 2-insider cluster ⇒ ×1.5 multiplier** for a single buyer.

**Solution:**
Make the key word-order-insensitive by sorting name tokens before collapsing. In `normalizeInsiderName`, replace the final return with:

```ts
return clean
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, '')
  .split(/\s+/)
  .filter(Boolean)
  .sort()
  .join('');
```

This maps both orderings to `charlesmarliomosseri`. (Collision risk — two *different* insiders on the same ticker whose names are permutations of each other — is negligible.) The function is shared by main and renderer, so the fix automatically repairs cluster dedup, modal dedup, and track-record keying together.

**Why this matters:**
With five insider sources on by default, any name-order disagreement simultaneously double-counts money and manufactures a cluster multiplier — two of the strongest score inputs.

---

### F9. [BUG] — The Settings "roleFilters" toggles are dead: rendered, persisted, never applied

**Severity:** Medium

**Location:** Setting defined at `src/types/index.ts` lines 367 + 716–723; UI at `src/components/Settings/SettingsPanel.tsx` lines 132–138; **no consumer anywhere** in `electron/` (verified by project-wide grep — only `database.ts` merge lines 599/610 touch it)

**Problem:**
`AppSettings.roleFilters` (per-role-category include toggles: exec/cfo/csuite/director/vp/other) is shown in Settings and saved to the DB, but neither the orchestrator nor the scoring reads it. Unchecking "Other Insider" changes nothing.

**Solution:**
Apply it in the orchestrator right before aggregation. In `electron/scraper/index.ts`, inside `runScrape` immediately before `buildAggregates(...)` (line 564):

```ts
import { getRankWeight } from '../scoring'; // add to existing imports

const roleAllowed = (role: string) => settings.roleFilters[getRankWeight(role).category] !== false;
const filteredTrades = allTrades.filter((t) => roleAllowed(t.role));
aggregates = buildAggregates(filteredTrades, mergedOptions, settings.minDollarVolume);
```

(Default-missing keys to allowed via `!== false`, matching the UI's `?? true`.)

**Why this matters:**
A visible, persisted control that does nothing erodes trust in every other setting and silently includes insiders the user explicitly excluded.

---

### F10. [BUG/ROBUSTNESS] — No timeout on stockanalysis.com fetches: one hung request can stall the whole scrape for minutes

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — `fetchStockAnalysisEarnings()` line 375 (`await fetch(url, { headers: ... })`), driven by `mapLimit(aggregates, 6, ...)` at line 573 with no surrounding `withTimeout`

**Problem:**
The earnings/market-cap enrichment phase fires one `fetch` per aggregate with bounded concurrency but **no per-request timeout and no phase budget**. Node's undici defaults allow a headers/body stall of up to ~5 minutes per request; six hung sockets stall the entire scrape (the Finviz fallback phase, by contrast, has both). The same appllies to `main.ts`'s `fetchEarningsForTicker` (line 224).

**Solution:**
Add an abort signal to the fetch in `fetchStockAnalysisEarnings`:
```ts
const resp = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
```
And wrap the enrichment phase in a total budget, mirroring the Finviz fallback:
```ts
await withTimeout(
  mapLimit(aggregates, 6, async (agg) => { ... }),
  60_000,
  undefined,
);
```
Apply `AbortSignal.timeout(10_000)` to every raw `fetch` in the codebase for consistency: `electron/vix.ts` already has one (AbortController); add to `electron/main.ts` `yahooAdjMap` (line 261), `electron/scraper/insiderHistory.ts` benchmark + per-ticker fetches (lines 46, 118), `scripts/backtest.ts` (line 32).

**Why this matters:**
A single unresponsive host currently converts a 2-minute scheduled scrape into a multi-minute hang; on the headless `--scheduled-scrape` path that delays process exit and overlaps the next scheduled run.

---

### F11. [BUG] — `scrapeInFlight` is never reset if pre-`try` code throws: all future scrapes report "already running" until restart

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — `runScrape()`, lines 437–495 (`scrapeInFlight = true` at 437; the `try` only starts at the browser launch, line 495–496)

**Problem:**
Between `scrapeInFlight = true` and the `try` block, the code calls `startScrapeLog()` and `getMostRecentSessionSignals()` (DB operations) and `setStatus`. If any of these throws (locked DB, disk error), the exception propagates with `scrapeInFlight` still `true`. Every subsequent scrape then early-returns `'A scrape is already running.'` until the app restarts. The same is true of the final section after the `finally` (lines 641–763): a throw in scoring/persistence/log-finishing skips `scrapeInFlight = false` at line 750.

**Solution:**
Wrap the entire body after the in-flight check in `try { ... } finally { scrapeInFlight = false; }`:

```ts
scrapeInFlight = true;
try {
  // ...everything from the `enabled` computation through the return statement...
  return { ... };
} finally {
  scrapeInFlight = false;
}
```
Remove the two existing `scrapeInFlight = false` assignments (lines 454 and 750) as the `finally` supersedes them.

**Why this matters:**
A one-off DB hiccup currently bricks scraping for the whole session with a misleading error.

---

### F12. [MATH] — `daysBetween` parses date-only strings as UTC midnight: every signal age is skewed by the timezone offset, flipping freshness-cliff boundaries **[VERIFIED]**

**Severity:** Medium

**Location:** `src/types/index.ts` — `daysBetween()`, lines 466–471

**Problem:**
```ts
const t = Date.parse(fromIso);   // "2026-06-29" → 2026-06-29T00:00:00Z (UTC midnight)
return (toMs - t) / 86_400_000;
```
Verified: for a user in UTC+2 evaluating at 14:00 UTC on 2026-07-02, a trade dated `2026-06-29` reads **3.58 days** old instead of 3.0. Because `getFreshnessMultiplier` has hard cliffs at 1/3/7/14 days, this systematically pushes trades across boundaries (3.58 > 3 ⇒ ×0.7 instead of ×0.85; likewise at the 7- and 14-day edges, and at the 30-day cluster window in `scoreTicker`). Note the codebase already solved this exact problem for filtering — `signalTradeMs()` (lines 543–550) parses date-only strings as *local* midnight, so scoring and filtering currently disagree.

**Solution:**
Mirror `signalTradeMs`'s logic inside `daysBetween`:

```ts
export function daysBetween(fromIso?: string | null, toMs: number = Date.now()): number | null {
  if (!fromIso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIso.trim());
  const t = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    : Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return (toMs - t) / (1000 * 60 * 60 * 24);
}
```

**Why this matters:**
Freshness is a multiplicative score factor with step cliffs; a constant +N-hour bias re-buckets a large share of trades every day, and does so differently depending on the user's timezone.

---

### F13. [MATH] — Earnings today reads as `daysToEarnings = -1` in the afternoon, forfeiting the strongest timing boost

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — `fetchStockAnalysisEarnings()`, line 398; same pattern in `electron/scraper/finviz.ts` — `parseFinvizEarnings()`, line 65

**Problem:**
```ts
out.daysToEarnings = Math.round((parsed.getTime() - Date.now()) / 86_400_000);
```
`parsed` is midnight local of the earnings date. Scraping at 3 PM on earnings day yields `(−15h)/24h ≈ −0.62 → round → −1`. Both `getInsiderTimingMultiplier` and `getOptionsTimingMultiplier` require `daysToEarnings >= 0`, so a company reporting **after market close today** — the single most timing-sensitive case the feature exists for — receives multiplier 1.0.

**Solution:**
Compute whole-calendar-day difference from local midnight to local midnight, in both locations:

```ts
const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
out.daysToEarnings = Math.round((parsed.getTime() - startOfToday.getTime()) / 86_400_000);
```
This yields 0 on earnings day regardless of time of day; the `<= 5` bucket then applies (×1.8 insider / ×2.0 options).

**Why this matters:**
The earnings-timing multipliers exist precisely for imminent earnings; the current rounding zeroes them out on the most imminent day.

---

### F14. [BUG] — Track-record pre-warm caches transient errors for 7 days, suppressing insiders' records

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — `prewarmTrackRecords()`, freshness check at lines 292–296 and upsert at line 312

**Problem:**
```ts
const fresh = cached && Date.now() - Date.parse(cached.lastUpdated) < TRACK_RECORD_TTL_MS
  && (cached.totalTrades > 0 || !!cached.error);
...
if (rec && (rec.totalTrades > 0 || rec.error)) upsertTrackRecord(rec);
```
`fetchInsiderTrackRecord` returns `error: err.message` for ANY failure — including a one-off navigation timeout or a Yahoo 429. The pre-warm upserts such records, and the freshness check treats *any* error-bearing record as fresh for `TRACK_RECORD_TTL_MS` (7 days). One transient network blip therefore blanks an insider's track record (and their `trackRecordMultiplier` contribution) for a week. Note the modal path in `electron/main.ts` (`fetchTrackRecord`, line 197) already got this right by whitelisting only the two *permanent* error strings.

**Solution:**
Make the pre-warm upsert use the same whitelist as `main.ts`:

```ts
const CACHEABLE_ERRORS = new Set([
  'No post-trade performance data yet.',
  'No history page available for this insider.',
]);
if (rec && (rec.totalTrades > 0 || (rec.error && CACHEABLE_ERRORS.has(rec.error)))) {
  upsertTrackRecord(rec);
}
```
(Optionally export the two strings as constants from `insiderHistory.ts` so the two call-sites can't drift.)

**Why this matters:**
The track-record multiplier was specifically pre-warmed in v1.0.38 so it "actually participates" in scoring; transient-error caching quietly reverses that for exactly the flaky-network cases where scrapes retry.

---

### F15. [MATH] — Track-record basis falls back to the *unadjusted* purchase price when Yahoo data is missing, mixing adjusted and raw prices

**Severity:** Medium

**Location:** `electron/scraper/insiderHistory.ts` — line 167 (`const basis = getPriceNear(priceMap, tradeDate, 0) ?? purchasePrice;`)

**Problem:**
Later prices (`price3mLater`, `price6mLater`) always come from Yahoo's **split/dividend-adjusted** series. When the trade date is outside the fetched `range=10y` window (older trades on an insider's history page) or the symbol changed, `getPriceNear(...)` returns `undefined` and the basis silently falls back to the raw fill price the insider paid. For any ticker with splits/large dividends between then and now, the computed "return" is dominated by the adjustment factor, not the actual performance (e.g. a 10:1 split makes every old buy look like −90% before drift). These corrupted outcomes flow into `accuracy3m`, `avgReturn3m`, and the scoring multiplier.

**Solution:**
Never mix bases. Replace line 167 with:

```ts
const basis = getPriceNear(priceMap, tradeDate, 0);
if (basis == null) continue; // no adjusted basis → no comparable outcome; skip the trade
```
(The `?? purchasePrice` fallback should be deleted, not kept as a secondary path.) `purchasePrice` remains display-only, which is what the UI already uses it for.

**Why this matters:**
One pre-split trade can single-handedly flip an insider's win rate and hand the ticker an undeserved ×0.85 or mask a genuine ×1.2.

---

### F16. [MATH] — Valuation upside uses the MAX across providers: systematically optimistic input to the score

**Severity:** Medium

**Location:** `electron/valuationCache.ts` — `getCachedUpside()`, lines 22–27

**Problem:**
```ts
const ups = r.sources.map((s) => s.upsidePct).filter(...);
return ups.length ? Math.max(...ups) : undefined;
```
With two independent fair-value models (AlphaSpread, ValueInvesting.io), taking the maximum upside is a one-sided selection: whenever the models disagree, the score always sees the more bullish one. Over many tickers this injects a persistent upward bias into `getValuationMultiplier` (which upgrades at ≥15% and ≥40% upside but only penalizes at ≤−25%).

**Solution:**
Average the available estimates instead:

```ts
return ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : undefined;
```
(If a more conservative posture is wanted, use `Math.min` — but the average is the standard defensible default for combining independent estimates.)

**Why this matters:**
The multiplier's asymmetric thresholds plus a max-selection input means "undervalued" boosts fire far more often than they should.

---

### F17. [OPTIMIZATION] — Valuation cache is memory-only: every app restart re-burns providers' free-view limits

**Severity:** Medium

**Location:** `electron/valuationCache.ts` (whole module — `const cache = new Map(...)`)

**Problem:**
The 6-hour valuation cache lives in a `Map` in the main process. Restarting the app (or an update) empties it, so the next detail-modal open or pre-warm re-scrapes AlphaSpread/ValueInvesting.io. ValueInvesting.io's free tier is ~5 stocks/month — the README documents this exact pain — so cold caches directly consume the scarcest resource in the pipeline.

**Solution:**
Persist the cache in SQLite. Add a table (via the existing migration pattern in `electron/database.ts`):

```sql
CREATE TABLE IF NOT EXISTS valuation_cache (
  ticker TEXT PRIMARY KEY,
  result TEXT,          -- JSON ValuationResult
  fetched_at DATETIME
);
```
In `valuationCache.ts`, back `getCachedValuation`/`setCachedValuation` with `SELECT`/`INSERT OR REPLACE` on that table (keep the in-memory Map as a read-through layer). Apply the same 6h TTL by comparing `fetched_at`. Prune rows older than 7 days inside `pruneOldData()`.

**Why this matters:**
Free-view quota is the binding constraint on the valuation feature; persistence makes the quota last ~an order of magnitude longer for the same coverage.

---

### F18. [SCRAPING] — OpenInsider: use the screener endpoint (500 rows, purchases-only filter) instead of the fixed ~100-row page **[VERIFIED LIVE]**

**Severity:** Medium

**Location:** `electron/scraper/openinsider.ts` — line 12 (`const URLS = ['http://openinsider.com/latest-insider-purchases-25k']`)

**Problem:**
The fixed page returns a limited most-recent slice. On busy filing days (post-earnings-season windows), buys scroll off between scheduled scrapes and are simply never seen. The page also cannot be filtered or extended.

**Solution:**
Point at the screener with explicit parameters — verified live (2026-07-02) to return the identical `table.tinytable` structure the existing parser already handles (headers: `Filing Date, Trade Date, Ticker, Company Name, Insider Name, Title, Trade Type, Price, Qty, Owned, ΔOwn, Value`, plus insider `/insider/` links intact):

```ts
const URLS = [
  'http://openinsider.com/screener?s=&o=&pl=&ph=&ll=&lh=&fd=7&fdr=&td=0&tdr=&daysago=&xp=1&xs=0&vl=25&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=1&cnt=500&page=1',
];
```
Key parameters: `xp=1` = purchases only, `xs=0` = exclude sales, `vl=25` = value ≥ $25k, `fd=7` = filings from the last 7 days, `cnt=500` = 500 rows, `sortcol=1` = sort by filing date desc. No other code changes needed — `mapRows` consumes it as-is (a 100-row fetch with `cnt=100` was verified end-to-end). Also switch `http://` to `https://openinsider.com` here and in the insider-URL prefixes at lines 102/107 (the site serves HTTPS; cleartext adds a needless MITM/redirect step).

**Why this matters:**
This is the primary data source; 5× the rows and an explicit purchases+freshness filter directly widens signal coverage with zero parser risk.

---

### F19. [SCRAPING] — Add SEC EDGAR Form 4 as the authoritative insider source (replaces HTML-scrape fragility)

**Severity:** Medium (high value, more work)

**Location:** New file `electron/scraper/edgar.ts`; register in `INSIDER_SCRAPERS` in `electron/scraper/index.ts` and `SCRAPER_SOURCES` in `src/types/index.ts`

**Problem:**
All five insider sources are HTML scrapes of aggregators that themselves ingest SEC EDGAR. Every one of them re-formats dates, truncates titles, rounds values, and can break on redesign (three findings in this audit are exactly such breakages). The primary source — EDGAR itself — is free, structured, and stable.

**Solution:**
Implement an EDGAR Form 4 fetcher with plain `fetch` (no Playwright needed):

1. **Discovery** — recent Form 4 filings via the full-text search JSON API:
   `GET https://efts.sec.gov/LATEST/search-index?q=&dateRange=custom&startdt=YYYY-MM-DD&enddt=YYYY-MM-DD&forms=4`
   — or, simpler and fully documented, the daily index: `https://www.sec.gov/Archives/edgar/daily-index/{yyyy}/QTR{n}/form.{yyyymmdd}.idx` (plain text; filter lines whose form type is `4`). Each line gives CIK, company, date, and the filing path.
2. **Per filing** — fetch the folder's `index.json` (`https://www.sec.gov/Archives/edgar/data/{cik}/{accession-no-dashes}/index.json`), locate the primary XML document (name matches `*.xml`, typically `primary_doc.xml` or `form4.xml`), and fetch it.
3. **Parse the XML** (with `fast-xml-parser`, a pure-JS dependency): `issuer/issuerTradingSymbol` → ticker; `reportingOwner/reportingOwnerId/rptOwnerName` → insider name; `reportingOwnerRelationship` → precise flags `isDirector/isOfficer/isTenPercentOwner/officerTitle` (eliminates all title-string guessing — F3 becomes structurally impossible for this source); `nonDerivativeTransaction` entries where `transactionCoding/transactionCode == 'P'` → shares (`transactionAmounts/transactionShares/value`), price (`transactionPricePerShare/value`), date (`transactionDate/value`); `aff10b5One` attribute → exact 10b5-1 plan flag (today inferred from text).
4. **Etiquette:** SEC requires a descriptive `User-Agent` including contact email (e.g. `insider-whale-terminal/1.0 (marcel.rogls@gmail.com)`) and ≤10 requests/second; throttle with the existing `mapLimit` at concurrency 4 with a 150ms delay.

Emit `RawInsiderTrade` objects with `source: 'edgar'` (extend the `ScraperSource` union and `SCRAPER_SOURCES` with `{ key: 'edgar', label: 'SEC EDGAR', kind: 'insider', url: 'https://www.sec.gov/cgi-srv/browse-edgar?action=getcompany' }`). Because EDGAR carries exact values, prefer EDGAR rows in `dedupTrades`'s keep-preference sort (currently insiderUrl-first) via `(a.source === 'edgar' ? -1 : 0)` ordering.

**Why this matters:**
Exact filing data (including the 10b5-1 checkbox and structured roles) removes an entire class of parsing bugs and makes the app independent of aggregator redesigns.

---

### F20. [SCRAPING] — VIX: use CBOE's official delayed-quote JSON as primary (Yahoo as fallback) **[VERIFIED LIVE]**

**Severity:** Low

**Location:** `electron/vix.ts` — `VIX_URL` (line 7) and `fetchVix()` (lines 23–44)

**Problem:**
VIX currently depends on Yahoo's unofficial chart API, which periodically tightens (crumb/cookie requirements, 429s). CBOE — the index's publisher — exposes a stable public JSON endpoint, verified working 2026-07-02:

```
GET https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json
→ { "data": { "symbol": "^VIX", "current_price": 16.64, ... } }
```

**Solution:**
In `fetchVix()`, try CBOE first and fall back to the existing Yahoo path:

```ts
const CBOE_URL = 'https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json';
// parse: (json as any)?.data?.current_price  — a plain number
```
Keep the identical caching/rounding logic. Additionally, expire the stale cache: `getCachedVix()` currently returns a value of any age after repeated fetch failures; add a guard `if (cached && Date.now() - Date.parse(cached.timestamp) > 2 * 60 * 60 * 1000) return null;` so scoring omits the VIX multiplier rather than using a days-old reading.

**Why this matters:**
The publisher's own endpoint removes the most fragile third-party dependency for a score input, and the staleness guard stops silently scoring with obsolete volatility.

---

### F21. [OPTIMIZATION] — Earnings/market-cap/sector fetched for every aggregate on every scrape: add a SQLite TTL cache

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — the enrichment block at lines 566–615 (`mapLimit(aggregates, 6, ... fetchStockAnalysisEarnings ...)`)

**Problem:**
Three scheduled scrapes per day × N aggregates (often 50–150 tickers) = hundreds of stockanalysis.com hits daily, re-fetching values that change at most daily (market cap) or quarterly (earnings date, sector). Beyond waste, this is the most likely path to getting the app's IP rate-limited by its only earnings source.

**Solution:**
Add a `ticker_meta` table:

```sql
CREATE TABLE IF NOT EXISTS ticker_meta (
  ticker TEXT PRIMARY KEY,
  market_cap REAL,
  sector TEXT,
  earnings_date TEXT,
  earnings_timing TEXT,
  fetched_at DATETIME
);
```
In the enrichment loop: read the row first; if `fetched_at` < 24h old, use it and skip the network call (recompute `daysToEarnings` locally from `earnings_date` — never cache the countdown itself). On a successful fetch, upsert. Keep the Finviz fallback for cache-miss tickers only. This typically converts ~90% of enrichment requests into DB reads after the first scrape of the day.

**Why this matters:**
Cuts the scrape's slowest network phase dramatically and removes the main rate-limit exposure, while making `daysToEarnings` fresher (recomputed each scoring pass instead of only at fetch time).

---

### F22. [MATH] — Stale-cluster fallback re-grants the full cluster multiplier to >30-day-old clusters

**Severity:** Low

**Location:** `electron/scoring.ts` — `scoreTicker()`, line 438 (`const clusterCount = recentInsiders.size || allInsiders.size;`)

**Problem:**
`recentInsiders` is deliberately restricted to buys in the last 30 days (Step 3's contract, "distinct insiders, last 30 days"). But when zero insiders are recent, the code falls back to `allInsiders.size` — i.e., a 4-insider cluster from two months ago earns the full ×3.0 as if it were current, contradicting the model's own definition. (Freshness decay dampens but does not remove this: ×3.0 × 0.2 ≫ ×1.0 × 0.2.)

**Solution:**
Delete the fallback:
```ts
const clusterCount = recentInsiders.size;
```
`getClusterMultiplier(0)` and `(1)` both return 1.0, so no other change is needed; the "N insiders buying" note already keys off `clusterCount >= 2`.

**Why this matters:**
The cluster multiplier is the second-largest insider factor; applying it outside its stated window overweights old, already-priced-in activity.

---

### F23. [MATH] — Options score counts only the single strongest print per direction: breadth of flow is invisible

**Severity:** Low

**Location:** `electron/scoring.ts` — `scoreOptionsDetailed()`, lines 269–283

**Problem:**
```ts
if (o.sentiment === 'bearish') bestBear = Math.max(bestBear, pts);
else if (o.sentiment === 'bullish') bestBull = Math.max(bestBull, pts);
...
return { score: bestBull - bestBear, notes };
```
Five independent $1M bullish sweeps on the same ticker score identically to one. Repeated large prints are one of the more reliable unusual-flow tells, and the app already merges 72h of history precisely to observe persistence — which this max() then discards.

**Solution:**
Use a decaying sum so breadth counts without letting many small prints swamp one huge one. Replace the loop and return with:

```ts
const bulls: number[] = [];
const bears: number[] = [];
for (const o of options) {
  const pts = scoreOneOption(o);
  if (o.sentiment === 'bearish') bears.push(pts);
  else if (o.sentiment === 'bullish') bulls.push(pts);
}
const decayedSum = (xs: number[]) =>
  xs.sort((a, b) => b - a).reduce((s, x, i) => s + x * Math.pow(0.5, i), 0);
const bullScore = decayedSum(bulls);   // best + ½·2nd + ¼·3rd + …
const bearScore = decayedSum(bears);
return { score: bullScore - bearScore, notes };
```
The geometric-decay sum is bounded at 2× the best print, so update the shared display ceiling: in `src/types/index.ts`, `MAX_SINGLE_OPTION_POINTS` stays as the per-print max, but `electron/scoring.ts` `MAX_OPTIONS_SCORE` becomes `MAX_SINGLE_OPTION_POINTS * 2` (and the `ScoreBreakdown.tsx` fill divisor at line 44 should use the same doubled constant — export it from types as e.g. `MAX_OPTIONS_SCORE_TOTAL`).

**Why this matters:**
Persistent repeated whale flow — the pattern the 72h merge was built to capture — currently adds nothing beyond the first print.

---

### F24. [STRATEGY] — A lone big *bearish* print creates a zero-score "whale" signal row

**Severity:** Low

**Location:** `electron/scraper/index.ts` — `buildAggregates()`, lines 237–247 (`topOptionsPremium` ignores sentiment)

**Problem:**
```ts
const topOptionsPremium = (agg) => agg.options.reduce((m, o) => Math.max(m, o.premiumTotal ?? o.notional ?? 0), 0);
...
const hasWhaleOptions = topOptionsPremium(agg) >= MIN_OPTIONS_PREMIUM;
```
A ticker whose only qualifying activity is a $400k bearish put block passes the whale gate, gets scored (`opts.score` < 0 → composite floored at 0), and lands on the dashboard as a permanent 0-score LOW row — noise that also dilutes the "Unusual Options" stat count.

**Solution:**
Gate the *whale-only* path on bullish premium (insider-backed aggregates keep bearish prints for context/penalty as today):

```ts
const topBullishPremium = (agg: TickerAggregate) =>
  agg.options.reduce((m, o) => (o.sentiment === 'bullish' ? Math.max(m, o.premiumTotal ?? o.notional ?? 0) : m), 0);

return [...byTicker.values()].filter((agg) => {
  const hasInsiderSignal = agg.trades.some(isScoringEligible) && eligibleVolume(agg) >= minDollarVolume;
  const hasWhaleOptions = topBullishPremium(agg) >= MIN_OPTIONS_PREMIUM;
  return hasInsiderSignal || hasWhaleOptions;
});
```
This also re-aligns the gate with `detectCombo` after F4 (both then measure *bullish* $250k+ prints).

**Why this matters:**
Keeps the dashboard's whale signals meaningful — a bearish whale is actionable information only in the context of an insider signal, which the insider path already preserves.

---

### F25. [BUG] — Trade dedup misses same-filing values that differ >5% across sources, and can merge two genuinely distinct same-day buys

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — `dedupTrades()` lines 161–182 and `valuesClose()` lines 148–152

**Problem:**
Grouped by `ticker|insider|tradeDate`, records within 5% value tolerance are collapsed. Two failure modes:
1. Sources round differently or aggregate multiple same-day fills differently — OpenInsider `$1,234,567` vs MarketBeat `$1.1M` is a 10.9% gap → both kept → double-counted volume.
2. Conversely, an insider who really made two similar-size buys the same day (e.g. two ~$100k fills reported as separate Form 4 lines) is collapsed into one.

**Solution:**
Prefer per-source authority over a numeric tolerance. In each group: if any record comes from `openinsider` (or `edgar` once F19 lands), keep **only** that source's records (they are per-filing exact, and legitimately-distinct same-day buys appear as distinct rows there); otherwise fall back to the current 5%-tolerance collapse. Concretely, replace the inner keep-loop with:

```ts
const AUTHORITATIVE: ReadonlySet<string> = new Set(['openinsider', 'edgar']);
for (const group of groups.values()) {
  const authoritative = group.filter((t) => AUTHORITATIVE.has(t.source));
  if (authoritative.length) { out.push(...authoritative); continue; }
  group.sort((a, b) => (a.insiderUrl ? 0 : 1) - (b.insiderUrl ? 0 : 1));
  const kept: RawInsiderTrade[] = [];
  for (const t of group) {
    if (kept.some((k) => valuesClose(k.value, t.value))) continue;
    kept.push(t);
  }
  out.push(...kept);
}
```

**Why this matters:**
`totalDollarVolume` feeds both the dollar-volume points and the minimum-volume gate; cross-source rounding noise shouldn't be able to double it.

---

### F26. [SCRAPING] — SECForm4 mapper classifies every non-sale row as an open-market purchase

**Severity:** Low

**Location:** `electron/scraper/insiderMap.ts` — lines 59–70 (`transactionType = typePart.toLowerCase().includes('sale') ? 'S' : 'P';`)

**Problem:**
The SECForm4 merged-cell parser binarizes the transaction type: anything not containing "sale" becomes `'P'` (modifier 1.0, "Open Market Buy"). If the page ever includes grants, exercises, or conversions in that feed (the `/all-buys` page is mostly purchases, but "buy" there includes acquisitions of several codes), they are scored at full strength instead of being reduced/excluded by `classifyTransaction`.

**Solution:**
Pass the raw type text through instead of binarizing, and let the shared classifier decide:

```ts
transactionType = typePart || 'P';
```
`classifyTransaction` already handles descriptive strings ("Option Exercise", "Grant", "Sale", "Purchase") and defaults unknown acquisitions to a buy, which preserves the current behavior for genuine buys.

**Why this matters:**
Keeps Feature 2 (transaction-type weighting) authoritative for every source instead of being bypassed by one mapper.

---

### F27. [BUG] — `InsiderTable` uses its own name normalizer without role-stripping: track-record cells can show "—" for loaded records

**Severity:** Low

**Location:** `src/components/Detail/InsiderTable.tsx` — local `norm()` at lines 6–8, used at line 169 (`const key = norm(t.insiderName)`)

**Problem:**
The records map passed into `InsiderTable` is keyed by `normalizeInsiderName()` (role-suffix-stripping — built in `SignalModal.tsx` line 192). The table looks records up with a *local* `norm()` that only lowercases/strips punctuation. For any insider name that carries a trailing title (common in MarketBeat/GuruFocus merged cells, e.g. "Jane Doe Director"), the keys diverge and the row shows "—" although the record loaded. This is also the "copy-pasted normalization" drift the shared helper was created to prevent.

**Solution:**
Delete the local `norm()` and import the shared one:
```ts
import { classifyTransaction, normalizeInsiderName } from '@/types';
...
const key = normalizeInsiderName(t.insiderName);
```
(If F8's token-sorting change lands, this import picks it up automatically — the local copy would otherwise diverge even further.)

**Why this matters:**
Same-person lookups must use one canonical key; two normalizers guarantee eventual drift.

---

### F28. [BUG] — Cached VIX never expires: scoring can silently use a days-old reading

**Severity:** Low

**Location:** `electron/vix.ts` — `getCachedVix()` (lines 13–15) and `fetchVix()`'s `return cached` failure paths (lines 29, 34, 42)

**Problem:**
On any fetch failure `fetchVix` returns the previous `cached` quote, and `getCachedVix` has no age check. After a network outage or a Yahoo API change, every scrape keeps scoring with the last value obtained — potentially days old — with no indication.

**Solution:**
Add a staleness cutoff in `getCachedVix`:
```ts
const VIX_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export function getCachedVix(): VixQuote | null {
  if (!cached) return null;
  if (Date.now() - Date.parse(cached.timestamp) > VIX_MAX_AGE_MS) return null;
  return cached;
}
```
`getVixMultiplier(undefined)` already returns 1.0, so scoring degrades gracefully to "no VIX effect" instead of using stale data. (Pairs with F20's CBOE endpoint to make failures rare in the first place.)

**Why this matters:**
A stale multiplier is worse than none — it applies a volatility regime that no longer exists.

---

### F29. [OPTIMIZATION] — Insider sources scraped strictly sequentially: scrape time is the sum of all sources

**Severity:** Medium

**Location:** `electron/scraper/index.ts` — the `for (const source of enabled)` loop, lines 512–527

**Problem:**
Eight sources × (page load + parse + `randomDelay`) run one after another on a single context; a full run routinely takes several minutes before enrichment even starts. Each scraper already opens its own page via `withPage`, so they are independent.

**Solution:**
Run scrapers with the existing `mapLimit` pool at concurrency 3 (different domains, so per-domain politeness is unaffected):

```ts
await mapLimit([...enabled], 3, async (source) => {
  setStatus({ phase: `Scraping ${source.label}…`, currentSource: source.label });
  try {
    if (source.kind === 'insider') {
      const fn = INSIDER_SCRAPERS[source.key];
      if (fn) allTrades.push(...(await withTimeout(fn(context), PER_SCRAPER_TIMEOUT_MS, [])));
    } else {
      const fn = OPTIONS_SCRAPERS[source.key];
      if (fn) allOptions.push(...(await withTimeout(fn(context), PER_SCRAPER_TIMEOUT_MS, [])));
    }
  } catch (err) {
    errors.push({ source: source.key, message: err instanceof Error ? err.message : String(err) });
  }
  completed.push(source.key);
  setStatus({ completedSources: [...completed] });
});
```
`allTrades.push`/`errors.push` are safe here (single-threaded event loop; pushes are synchronous). The `currentSource` status label becomes approximate under concurrency — acceptable, or track a `Set` of active sources.

**Why this matters:**
Cuts wall-clock scrape time roughly 2–3×, which matters most for the headless scheduled runs that hold a hidden Electron process open until completion.

---

### F30. [MATH] — Missing SPY window silently degrades "alpha" to absolute return

**Severity:** Low

**Location:** `electron/scraper/insiderHistory.ts` — lines 172–174 (`const mkt3 = pctChange(...) ?? 0;`)

**Problem:**
If the SPY benchmark fetch failed entirely (empty map) or lacks the window, `mkt3`/`mkt6` default to 0 and the stored `return3m` — documented and displayed as "return IN EXCESS of the S&P 500" — is actually the raw return. In a bull tape this inflates every win rate computed during the benchmark outage.

**Solution:**
Treat a missing benchmark as a missing outcome:

```ts
const mktBasis = getPriceNear(benchmarkMap, tradeDate, 0);
const mkt3 = pctChange(getPriceNear(benchmarkMap, tradeDate, 90), mktBasis);
const mkt6 = pctChange(getPriceNear(benchmarkMap, tradeDate, 180), mktBasis);
const r3 = abs3 != null && mkt3 != null ? abs3 - mkt3 : undefined;
const r6 = abs6 != null && mkt6 != null ? abs6 - mkt6 : undefined;
```
(Both windows failing leaves `r3`/`r6` undefined and the existing `continue` skips the trade.)

**Why this matters:**
"Beat the market" statistics computed without the market are mislabeled data feeding a scoring multiplier.

---

### F31. [MATH] — Backtest pseudo-replication: the same ticker contributes near-duplicate observations from every scrape session

**Severity:** Medium

**Location:** `scripts/backtest.ts` — outcome loop, lines 142–155

**Problem:**
Signals are appended per scrape (3×/weekday). A ticker alive for two weeks contributes ~30 rows with nearly identical entry dates and overlapping forward windows. These are not independent samples: `n` is inflated ~10–30×, tier averages are dominated by long-lived tickers, and the Pearson correlation's implicit significance is meaningless.

**Solution:**
Deduplicate to one observation per `(ticker, entryDate)` — keeping the FIRST session's score (the score at the earliest decision point, which is what a trader could actually have acted on):

```ts
const seen = new Set<string>();
const deduped = ripe.filter((r) => {
  const entryDate = r.trade_date && /^\d{4}-\d{2}-\d{2}$/.test(r.trade_date) ? r.trade_date : r.scraped_at.slice(0, 10);
  const key = `${r.ticker}|${entryDate}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```
(`ripe` is already sorted `scraped_at ASC`, so first = earliest.) Use `deduped` in place of `ripe` in the outcome loop. Optionally print both n's so the effect is visible.

**Why this matters:**
The backtest is the tool for judging whether the score works at all; autocorrelated duplicates can manufacture or hide a correlation.

---

### F32. [OPTIMIZATION] — Per-insider Yahoo price fetches are uncached across insiders in one scrape

**Severity:** Low

**Location:** `electron/scraper/insiderHistory.ts` — the per-ticker fetch loop, lines 115–127

**Problem:**
`fetchInsiderTrackRecord` fetches 10-year history for every ticker on an insider's page, per insider. Insiders in the same sector overlap heavily; during pre-warm (up to 12 insiders × ~5–40 tickers each) the same symbols are fetched repeatedly in one run. The SPY benchmark already has exactly the right pattern (module-level cache, line 41).

**Solution:**
Add a module-level ticker map cache next to `benchmarkCache`:

```ts
const tickerHistoryCache = new Map<string, { at: number; map: Record<string, number> }>();
const TICKER_CACHE_TTL = 6 * 60 * 60 * 1000;
```
Consult it before the per-ticker `fetch` and store after. Cap it (e.g. 300 entries, delete-oldest) to bound memory. Combined with `AbortSignal.timeout` (F10), this both speeds pre-warm and reduces the Yahoo 429 risk that currently produces the transient errors F14 caches.

**Why this matters:**
Pre-warm has a 60s total budget; wasting it on duplicate downloads is the main reason records don't finish within budget.

---

### F33. [MATH/CONSISTENCY] — `vixLevel` thresholds disagree with the scoring ramp

**Severity:** Low

**Location:** `electron/vix.ts` — `vixLevel()`, lines 17–21; vs `electron/scoring.ts` `getVixMultiplier()`, lines 289–296

**Problem:**
The UI level flags "high" only above 25 (`value <= 25 → 'normal'`), while the scoring boost begins at 20. A VIX of 23 shows a "normal" indicator while silently boosting insider scores ×1.03 — a mismatch users can't reconcile with the displayed state.

**Solution:**
Align the display bands with the ramp: `< 15 → 'low'`, `15–20 → 'normal'`, `> 20 → 'high'` — or (better) add an `'elevated'` band 20–25 if the UI supports it. Minimum change:
```ts
export function vixLevel(value: number): VixQuote['level'] {
  if (value < 15) return 'low';
  if (value <= 20) return 'normal';
  return 'high';
}
```

**Why this matters:**
Score explanations ("Elevated VIX — boosted ×1.05") should never coexist with a UI element that says volatility is normal.

---

### F34. [DOCS/MATH] — Stale `MAX_POSSIBLE_RAW` doc comment (≈2126 vs actual ≈2445)

**Severity:** Low

**Location:** `electron/scoring.ts` — the doc comment at lines 44–50 vs the computation at lines 51–52

**Problem:**
The comment says "≈ 2126.22 — the theoretical ceiling", but the expression `(MAX_INSIDER_RAW + MAX_OPTIONS_RAW) * MAX_TRACK_RECORD * MAX_VALUATION` evaluates to ≈2445.15 (10 × 20 × 1.0 × 3.0 × 2.34 × 1.15 = 1614.6; + 78.624 × 2 = 157.25; total 1771.85; × 1.2 × 1.15 ≈ 2445.15 — the verify script itself asserts 2445.15). 2126 was the pre-valuation-multiplier value. The constant is display-only (score-breakdown "Raw X / 2445" line), so only the comment and the display denominator's meaning are affected.

**Solution:**
Update the comment to "≈ 2445.15" (and delete the trailing "≈ 2445" duplicate on line 52 or keep just one). No code change.

**Why this matters:**
The next person recalibrating the curve will reach for this number; a stale anchor invites a wrong retune.

---

### F35. [STRATEGY/LOW] — "Week" filter means "since Monday": Monday mornings look empty

**Severity:** Low

**Location:** `src/types/index.ts` — `startOfWeekMs()` lines 528–535 and the cutoff at line 559

**Problem:**
The default filter is `week`, computed as "since local Monday 00:00". On Monday and Tuesday this window excludes Thursday/Friday filings — the same freshly-scraped-dashboard-looks-broken failure mode the `week` default was chosen to avoid (per the comment at lines 257–260), just moved to the start of the week.

**Solution:**
Change the `week` cutoff to a rolling 7 days anchored to local midnight:
```ts
else if (filter.timeRange === 'week') cutoff = startOfDayMs(now) - 6 * 86_400_000;
```
(Keep the label "This Week" or rename to "7 Days" in `FilterBar` — labeling is the UI's concern; the semantics fix is the point.)

**Why this matters:**
Insider trade dates lag filings by days; a calendar-week cutoff re-creates the "empty dashboard" problem two mornings a week.

---

### F36. [ROBUSTNESS] — schtasks triggers store local times computed at registration: DST shifts misalign them until the next app launch

**Severity:** Low

**Location:** `electron/scheduler.ts` — `getLocalTimeForET()` (lines 38–79) and `syncTaskScheduler()` trigger construction (lines 107–118)

**Problem:**
Windows Task Scheduler triggers are registered with a fixed local `HH:MM` derived from ET *at registration time*. When DST flips (ET and the user's zone don't always flip together), the stored local time now corresponds to 8:30/10:30 ET. Tasks are only re-synced when `configureScheduler` runs (app start / settings change), so a machine that runs headless-only across a DST boundary scrapes at the wrong market times until the app is next opened.

**Solution:**
Two options; either is sufficient:
1. Add a weekly re-sync trigger: register one extra `schtasks` entry that runs the app with `--scheduled-scrape` replaced by a lightweight `--resync-schedule` flag, which calls `syncTaskScheduler(getSettings())` and exits. Or:
2. Simpler: in the `--scheduled-scrape` startup path in `electron/main.ts` (line 644), fire `void syncTaskScheduler(getSettings())` before exiting — every scheduled run then self-heals the trigger times within one day of a DST change.

**Why this matters:**
Market-open/close timing is the entire point of the schedule; an hour of drift puts the "open" scrape into pre-market.

---

### F37. [OPTIMIZATION] — Options merge key includes volume/notional: the same contract re-scraped intra-window duplicates

**Severity:** Low

**Location:** `electron/scraper/index.ts` — `mergeOptionsActivity()` / `getOptionKey()`, lines 102–129

**Problem:**
```ts
`${o.ticker}|${o.type}|${o.sentiment}|${o.strike ?? 0}|${o.expiry ?? ''}|${o.notional}|${o.volume ?? 0}|${o.source}`
```
The same contract observed again with updated volume/premium (normal intra-day growth) produces a different key, so both the old and new snapshot survive the 72h merge. `scoreOptionsDetailed`'s max() masks most scoring impact (worsens if F23's decayed sum lands — duplicates would then double-count), but `optionsActivity` arrays and the Vol/OI display accumulate stale snapshots.

**Solution:**
Key on contract identity only, and keep the *current* (first-seen in iteration order) snapshot:
```ts
const getOptionKey = (o: OptionsActivity) =>
  `${o.ticker.toUpperCase()}|${o.type}|${o.strike ?? 0}|${o.expiry ?? ''}|${o.source}`;
```
Current entries are inserted before previous ones, so the freshest volume/premium snapshot naturally wins and older duplicates of the same contract are dropped. (Sentiment is excluded from the key deliberately: a sentiment flip for the same contract from the same source is a re-read of the same flow, and the newest read should win.) If F23 is implemented, this fix becomes a prerequisite, not optional.

**Why this matters:**
Prevents double-counting under the improved options-breadth scoring and keeps the flow panel truthful.

---

### F38. [OPTIMIZATION] — `insertSignal` re-prepares its INSERT statement for every row

**Severity:** Low

**Location:** `electron/database.ts` — `insertSignal()` line 289 (`const stmt = getDb().prepare(...)`) called per-signal from `insertSignals()` line 332

**Problem:**
better-sqlite3's `prepare` compiles SQL each call; inside the batch transaction this is pure overhead (100+ compiles per scrape) and is the idiomatic anti-pattern the library's docs warn about.

**Solution:**
Hoist a lazily-initialized prepared statement:

```ts
let insertSignalStmt: Database.Statement | null = null;
function getInsertSignalStmt() {
  if (!insertSignalStmt) insertSignalStmt = getDb().prepare(`INSERT INTO signals (...) VALUES (...)`);
  return insertSignalStmt;
}
```
Reset `insertSignalStmt = null` in `closeDatabase()`. Same pattern applies to `getTrackRecord`/`upsertTrackRecord` (called in loops during pre-warm) if desired.

**Why this matters:**
Cheap, standard fix; keeps the write path constant-time as signal counts grow.

---

### F39. [OPTIMIZATION] — WAL file is never checkpointed after pruning

**Severity:** Low

**Location:** `electron/database.ts` — `initDatabase()` (line 179, `journal_mode = WAL`) and `pruneOldData()` (lines 726–733)

**Problem:**
WAL mode with a long-lived connection lets `insider-tracker.db-wal` grow unbounded between automatic checkpoints, especially after the daily prune deletes a year-old slice inside a transaction. `clearDatabase()` VACUUMs, but the routine prune path never checkpoints or reclaims space.

**Solution:**
At the end of `pruneOldData()` add:
```ts
getDb().pragma('wal_checkpoint(TRUNCATE)');
```
(Optionally also `PRAGMA incremental_vacuum` with `auto_vacuum = INCREMENTAL` set at init, but the checkpoint alone addresses the WAL growth.)

**Why this matters:**
Prevents the sidecar WAL file from quietly exceeding the database itself on long-lived installs.

---

### F40. [BUG] — `getNewsForTicker` cashtag LIKE matches prefixes: `$T` matches `$TSLA`

**Severity:** Low

**Location:** `electron/database.ts` — `getNewsForTicker()`, lines 679–702 (`LIKE '%$' || ? || '%'`)

**Problem:**
The SQL pattern `%$TICKER%` has no right-hand boundary: ticker `T` matches `$TSLA`, `$TXN`, etc.; `AA` matches `$AAPL`. Short tickers (T, F, C, A, O — all real S&P names) return mostly-wrong "Recent Mentions" in the detail modal.

**Solution:**
Keep the LIKE as a coarse SQL prefilter and add an exact-boundary check in JS before returning:

```ts
const re = new RegExp(`\\$${sym}\\b`, 'i');
return rows.filter((r) => re.test(r.text ?? '')).map(...);
```
(`\b` after the symbol rejects `$TSLA` for `$T` since `S` is a word character; tickers are alphanumeric so the regex is safe to build directly.)

**Why this matters:**
Wrong-ticker news in a signal modal is actively misleading, not just noisy.

---

### F41. [SCRAPING] — Barchart: parse the core-api JSON response instead of walking the shadow DOM

**Severity:** Medium

**Location:** `electron/scraper/barchart.ts` — entire scraper (shadow-DOM class-name walk, lines 22–78)

**Problem:**
The current approach reads `bc-data-grid`'s shadow root and filters elements whose class names *contain the substring* "row" — an extremely fragile heuristic (any UI refactor or CSS-module hash change breaks it silently, returning `[]`). Barchart's page itself is populated from an internal JSON API (`https://www.barchart.com/proxies/core-api/v1/options/...`) that the page calls with an XSRF token cookie the browser already holds.

**Solution:**
Intercept the XHR instead of parsing the DOM. Inside the existing `withPage` callback, before waiting for selectors:

```ts
const apiResponse = page.waitForResponse(
  (r) => r.url().includes('/proxies/core-api/v1/options') && r.status() === 200,
  { timeout: 25_000 },
);
// (navigation already happened via withPage; reload to retrigger the XHR deterministically)
await page.reload({ waitUntil: 'domcontentloaded' });
const resp = await apiResponse;
const json = await resp.json(); // { data: [ { baseSymbol, symbolType, strikePrice, expirationDate, daysToExpiration, volume, openInterest, volumeOpenInterestRatio, lastPrice, tradeTime, ... } ] }
```
Map `json.data` rows directly to `OptionsActivity` (`baseSymbol` → ticker; `symbolType` "Call"/"Put" → type; premium = `volume × lastPrice × 100`; `daysToExpiration` → dte; `volumeOpenInterestRatio` → volOiRatio). Keep the current shadow-DOM path as the fallback when no matching response arrives. Field names should be confirmed once from the DevTools network tab on the live page — the response is a flat `{ total, data: [...] }` structure.

**Why this matters:**
Structured JSON with typed fields eliminates the entire class of header-alias/parse bugs (F5-style) for the one options source that works without login.

---

### F42. [SCRAPING] — Twitter/news scrape reads only the initially-rendered tweets (no scroll)

**Severity:** Low

**Location:** `electron/scraper/twitter.ts` — `runTwitterScrape()`, lines 28–60

**Problem:**
The scraper waits for `[data-testid="tweet"]` and reads whatever is mounted — typically the first ~6–10 tweets. The News tab promises "all posts within the 12-hour window"; on an active day the account posts more than one screenful in 12h, and the 15-minute cron mitigates but doesn't guarantee coverage (overnight gaps, missed runs while the PC sleeps).

**Solution:**
Add a bounded scroll loop before extraction:

```ts
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(1200);
}
```
Then run the existing evaluate. Tweet extraction already deduplicates by `tweet_id` (`ON CONFLICT DO NOTHING`), so re-reads are free. Stop early if the oldest visible tweet's `datetime` is older than 12h (evaluate `document.querySelectorAll('time')` last element between scrolls).

**Why this matters:**
Closes the gap between the documented 12-hour window and what is actually captured after any pause in polling.

---

### F43. [DATA] — `BIG_PLAYERS` contains delisted tickers (PXD, MRO) and will keep decaying; derive from market cap instead

**Severity:** Low

**Location:** `src/types/index.ts` — `BIG_PLAYERS` set, lines 815–846; `isBigPlayer()` 848–851; consumed in `electron/scraper/index.ts` line 672 and `electron/database.ts` line 279

**Problem:**
The hardcoded list already contains companies acquired/delisted before the audit date (PXD → acquired by Exxon 2024; MRO → acquired by ConocoPhillips 2024), and misses newer mega-caps. A static list of "highly capitalized stocks" is guaranteed to rot.

**Solution:**
Once F1 restores `marketCap`, make cap the primary criterion with the list as fallback:

```ts
export function isBigPlayerByCap(ticker: string, marketCap?: number): boolean {
  if (marketCap != null && marketCap >= 10_000_000_000) return true; // ≥ $10B
  return isBigPlayer(ticker);
}
```
In `runScrape`'s signal construction (`electron/scraper/index.ts` line 672), use `isBigPlayerByCap(scored.ticker, agg.marketCap)`. Keep the DB-read path (`rowToSignal`) on the static fallback (no cap stored per row) or persist a `big_player` column at insert time — preferable: add `big_player INTEGER DEFAULT 0` via the existing migration pattern, write it at insert, and read it back instead of recomputing.

**Why this matters:**
The Big Player badge/filter silently degrades as the market changes; a cap threshold is self-maintaining.

---

### F44. [ROBUSTNESS] — `withTimeout` never cancels the losing branch or clears its timer

**Severity:** Low

**Location:** `electron/scraper/index.ts` — `withTimeout()`, lines 98–100

**Problem:**
`Promise.race` leaves the timed-out scraper running (its pages stay open on the shared context until the scrape ends) and leaves a live `setTimeout` for every call that finishes early — harmless in the windowed app, but in `--scheduled-scrape` mode stray timers/pages delay natural process wind-down (mitigated today only by the hard `app.exit()`).

**Solution:**
Clear the timer, and give scrapers an optional abort path:

```ts
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]);
}
```
For true cancellation, have `withPage` accept an `AbortSignal` and call `page.close()` on abort — worth doing only if scraper hangs are observed in practice.

**Why this matters:**
Keeps the headless scheduled process lean and removes a slow-leak of open pages during long scrapes.

---

### F45. [STRATEGY/CALIBRATION] — Track-record ×1.2 boost effectively requires a perfect 5-for-5 record at the minimum sample

**Severity:** Low

**Location:** `electron/scoring.ts` — `getTrackRecordMultiplier()` lines 298–303, with `shrunkAccuracy` (k=3) and `MIN_TRACK_RECORD_TRADES = 5` from `src/types/index.ts` lines 698–709

**Problem:**
The boost threshold is shrunk-accuracy > 0.7. With k=3 shrinkage: 5 trades needs 5 wins ((5+1.5)/8 = 0.8125; 4 wins gives 0.6875 — no boost); 10 trades needs 9 wins. The penalty (<0.4) needs ≤1 win in 5. So in practice the multiplier is 1.0 for almost everyone — statistically defensible, but it makes the whole track-record pipeline (pre-warm budget, Yahoo fetches) nearly inert as a score factor. Additionally `lookupBestAccuracy` takes the MAX across a ticker's insiders, so the 0.85 penalty can only ever fire when the ticker's *best* insider is bad.

**Solution (calibration choice, not a bug fix):**
Convert the two-step threshold into a smooth multiplier so intermediate records matter:

```ts
export function getTrackRecordMultiplier(bestAccuracy3m: number | undefined): number {
  if (bestAccuracy3m == null) return 1.0;
  // 0.5 (coin-flip) → 1.0; 0.8 → ~1.2; 0.3 → ~0.87. Linear, clamped to [0.85, 1.2].
  return clamp(1 + (bestAccuracy3m - 0.5) * 0.65, 0.85, 1.2);
}
```
Update `ScoreBreakdown.tsx`'s `trackRecordMultiplier !== 1` row (it already renders arbitrary values) and the two hardcoded note strings in `scoreTicker` (lines 492–493) to print the actual multiplier. Re-run `npm run verify:scoring` and update its three track-record checks to the new curve.

**Why this matters:**
A factor that is 1.0 in ~99% of cases costs scrape budget while adding no discrimination; a smooth curve extracts signal from the records the app already pays to build.

---

### F46. [ROBUSTNESS] — Scrape result `status` compares error count against completed-source count using non-source errors

**Severity:** Low

**Location:** `electron/scraper/index.ts` — line 715–716 (`errors.length === 0 ? 'success' : completed.length > errors.length ? 'partial' : 'failed'`)

**Problem:**
`errors` mixes per-source failures with pipeline errors (`finviz-earnings`, `track-records`, `valuations`, `database`, `browser`). Two sources completing with three pipeline warnings yields `'failed'` even though signals were produced and persisted; conversely a DB persist failure with 8 completed sources shows `'partial'` though zero signals were saved.

**Solution:**
Classify explicitly:
```ts
const persistFailed = errors.some((e) => e.source === 'database');
const sourceErrors = errors.filter((e) => enabled.some((s) => s.key === e.source)).length;
const status: ScrapeResult['status'] =
  persistFailed ? 'failed'
  : errors.length === 0 ? 'success'
  : sourceErrors < enabled.length ? 'partial'
  : 'failed';
```

**Why this matters:**
The History tab's status pill is the user's main health indicator; it should reflect whether signals were actually produced and saved.

---

### F47. [MATH] — Freshness decay cliffs: consider a smooth exponential (optional calibration)

**Severity:** Low

**Location:** `src/types/index.ts` — `getFreshnessMultiplier()`, lines 499–506

**Problem:**
The step function (1.0 / 0.85 / 0.7 / 0.4 / 0.2 at 1/3/7/14 days) creates discontinuities: a signal loses 30% of its insider leg overnight crossing day 7, and 50% crossing day 14. Combined with F12's timezone skew, scores visibly jump between scrapes with no new information.

**Solution (optional, after F12):**
Replace with an exponential matched to the current curve's half-life (~8 days):

```ts
export function getFreshnessMultiplier(ageDays: number | null): number {
  if (ageDays == null || ageDays < 1) return 1.0;
  return Math.max(0.2, Math.exp(-0.115 * ageDays)); // ≈0.89@1d, 0.71@3d, 0.45@7d, 0.20@14d+
}
```
`getFreshnessLevel` (badge bucketing) stays as-is. Update `verify-scoring.ts`'s five freshness checks to the new values.

**Why this matters:**
Removes artificial score jumps at day boundaries; decay then reflects information aging continuously, which also stabilizes the score-surge (Δ≥25) alert against false triggers.

---

### F48. [ROBUSTNESS] — Notification de-dupe set is replaced wholesale each scrape: flapping tickers re-notify

**Severity:** Low

**Location:** `electron/notifications.ts` — `notifyForSignals()`, line 143 (`notified = new Set(currentTickers)`)

**Problem:**
The "already notified" set is overwritten with only the tickers *currently* at/above threshold. A ticker that dips below the threshold for one scrape (freshness decay at midday) and re-crosses at close re-notifies the user, even though nothing new happened.

**Solution:**
Accumulate instead of replace, and let the seed/threshold interplay stand:
```ts
for (const t of currentTickers) notified.add(t);
```
(If unbounded growth over a long session is a concern, prune entries not seen for e.g. 7 days by storing `Map<string, number>` of last-seen timestamps — but the simple union is sufficient given daily restarts are common.)

**Why this matters:**
Repeat notifications for known signals train the user to ignore all notifications.

---

## Part 2 — Priority Queue

Ranked by impact on correctness of the product's core output (the conviction score and the signals list), then by breadth and effort.

1. **F1 — stockanalysis Market-Cap/Sector regexes dead; relative buy sizing inert** — Critical — `electron/scraper/index.ts`
2. **F2 — Year-less dates parse as 2001 (Finviz): wrong ages + broken dedup** — Critical — `electron/scraper/util.ts`
3. **F3 — `getRankWeight` misses abbreviated titles; "Dir" (41% of rows) scores 1 not 4** — Critical — `electron/scoring.ts`
4. **F4 — Combo bonus fires on bearish options flow** — High — `electron/scoring.ts`
5. **F8 — Insider-name word order defeats dedup, inflates clusters and volume** — High — `src/types/index.ts`
6. **F5 — InsiderFinance C/P column collision: all puts read as bullish calls** — High — `electron/scraper/optionsMap.ts`
7. **F6 — `parseStrategy` inverts bear-spread sentiment** — High — `electron/scraper/optionsMap.ts`
8. **F25 — Cross-source value-tolerance dedup gaps double-count volume** — Medium — `electron/scraper/index.ts`
9. **F12 — UTC-midnight age skew flips freshness cliffs** — Medium — `src/types/index.ts`
10. **F13 — Earnings-day afternoon reads `daysToEarnings = −1`, forfeits max boost** — Medium — `electron/scraper/index.ts`, `electron/scraper/finviz.ts`
11. **F7 — OTM boost via `Math.abs` rewards deep-ITM prints** — Medium — `electron/scoring.ts`
12. **F14 — Pre-warm caches transient track-record errors 7 days** — Medium — `electron/scraper/index.ts`
13. **F15 — Track-record mixes raw basis with adjusted later prices** — Medium — `electron/scraper/insiderHistory.ts`
14. **F11 — `scrapeInFlight` can stick permanently on early throw** — Medium — `electron/scraper/index.ts`
15. **F10 — No timeout on earnings fetches can stall the scrape minutes** — Medium — `electron/scraper/index.ts`, `electron/main.ts`
16. **F9 — roleFilters setting is dead** — Medium — `electron/scraper/index.ts`
17. **F18 — OpenInsider screener endpoint: 5× coverage, purchases-only filter** — Medium — `electron/scraper/openinsider.ts`
18. **F16 — Valuation upside MAX-selection bias → average** — Medium — `electron/valuationCache.ts`
19. **F21 — Cache earnings/market-cap/sector per ticker (24h TTL) in SQLite** — Medium — `electron/scraper/index.ts`, `electron/database.ts`
20. **F17 — Persist valuation cache in SQLite (free-view quota)** — Medium — `electron/valuationCache.ts`, `electron/database.ts`
21. **F31 — Backtest pseudo-replication inflates n, corrupts correlation** — Medium — `scripts/backtest.ts`
22. **F29 — Parallelize source scrapes (concurrency 3)** — Medium — `electron/scraper/index.ts`
23. **F41 — Barchart: parse core-api JSON instead of shadow DOM** — Medium — `electron/scraper/barchart.ts`
24. **F19 — Add SEC EDGAR Form 4 as authoritative insider source** — Medium — new `electron/scraper/edgar.ts`
25. **F24 — Bearish-only prints create zero-score whale rows** — Low — `electron/scraper/index.ts`
26. **F37 — Options merge key includes volume/notional: intra-window duplicates** — Low — `electron/scraper/index.ts` (prerequisite for F23)
27. **F23 — Options score ignores breadth (max-only); use decayed sum** — Low — `electron/scoring.ts`
28. **F22 — Stale-cluster fallback re-grants full multiplier** — Low — `electron/scoring.ts`
29. **F30 — Missing SPY window silently degrades alpha to raw return** — Low — `electron/scraper/insiderHistory.ts`
30. **F26 — SECForm4 mapper binarizes transaction types to P** — Low — `electron/scraper/insiderMap.ts`
31. **F27 — InsiderTable local name normalizer diverges from shared one** — Low — `src/components/Detail/InsiderTable.tsx`
32. **F20 — VIX via CBOE official JSON + stale-cache expiry** — Low — `electron/vix.ts`
33. **F28 — Cached VIX never expires** — Low — `electron/vix.ts` (folded into F20 if done together)
34. **F45 — Track-record multiplier ~always 1.0; smooth the curve** — Low — `electron/scoring.ts`
35. **F47 — Freshness step-cliffs → exponential decay** — Low — `src/types/index.ts`
36. **F35 — "Week" filter empty on Monday mornings → rolling 7 days** — Low — `src/types/index.ts`
37. **F46 — Scrape status misclassifies pipeline vs source errors** — Low — `electron/scraper/index.ts`
38. **F40 — Cashtag LIKE prefix-matches wrong tickers** — Low — `electron/database.ts`
39. **F48 — Notification de-dupe set replaced wholesale; flapping re-notifies** — Low — `electron/notifications.ts`
40. **F43 — BIG_PLAYERS contains delisted tickers; derive from market cap** — Low — `src/types/index.ts`, `electron/scraper/index.ts`
41. **F32 — Cache Yahoo ticker histories across insiders per scrape** — Low — `electron/scraper/insiderHistory.ts`
42. **F36 — schtasks DST drift; self-heal on scheduled runs** — Low — `electron/scheduler.ts`, `electron/main.ts`
43. **F42 — Twitter scrape doesn't scroll; misses 12h window** — Low — `electron/scraper/twitter.ts`
44. **F38 — `insertSignal` re-prepares statement per row** — Low — `electron/database.ts`
45. **F39 — WAL never checkpointed after prune** — Low — `electron/database.ts`
46. **F44 — `withTimeout` leaks timers, never cancels losers** — Low — `electron/scraper/index.ts`
47. **F33 — `vixLevel` display bands disagree with scoring ramp** — Low — `electron/vix.ts`
48. **F34 — Stale `MAX_POSSIBLE_RAW` doc comment (2126 vs 2445)** — Low — `electron/scoring.ts`

**Implementation notes for the fixing AI:**
- After any change to `electron/scoring.ts` or the shared helpers in `src/types/index.ts`, run `npm run typecheck` and `npm run verify:scoring` (some checks assert current constants — F45/F47 explicitly require updating those assertions; all other fixes here leave the existing assertions passing except where noted).
- F5+F6 touch the same file and the same sentiment-resolution block — implement together.
- F20+F28 touch the same module — implement together.
- F37 is a prerequisite for F23.
- F1, F21, and F43 interact (market cap becomes available, then cached, then reused for Big Player) — implement in that order.
