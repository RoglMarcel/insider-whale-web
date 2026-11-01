/** Offline research only. Reads explicitly supplied frozen files; never opens
 * the application database for writing or fetches/revises market observations.
 * npx esbuild scripts/research-simulation.ts --bundle --platform=node --format=cjs
 *   --external:better-sqlite3 --outfile=tmp/research-simulation.cjs
 * node tmp/research-simulation.cjs SNAPSHOT.json FROZEN.db OUTPUT.json
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { digest } from '../electron/priceCache';
import { screenSeries } from '../electron/prices';
import { EXIT_POLICIES } from '../src/lib/exit-policies';
import { applySlippage, diffDaysYmd, earliestEntryDate, addDaysYmd, evaluateExit, simulatePortfolio } from '../src/lib/portfolio-rules';
import { insiderOnlyConfig } from '../src/lib/insider-only';
import { cleanPortfolioCandidates } from '../src/lib/ticker-quality';
import type { PortfolioCandidate, PortfolioConfig, PortfolioPosition } from '../src/types';

const [snapshotPath, dbPath, output] = process.argv.slice(2);
if (!snapshotPath || !dbPath || !output) throw new Error('Supply frozen investigation JSON, read-only SQLite backup, and output JSON');
const raw = fs.readFileSync(snapshotPath);
const frozen = JSON.parse(raw.toString('utf8'));
const cfg = frozen.meta.config as PortfolioConfig;
const asOf = frozen.equity.at(-1).date as string;
const pmap = (p: Record<string, any>): PortfolioPosition => ({ id: p.id, ticker: p.ticker, signalId: p.signal_id,
  entryDate: p.entry_date, entryPrice: p.entry_price, shares: p.shares, costBasis: p.cost_basis, entryScore: p.entry_score,
  targetWeight: p.target_weight, highWaterClose: p.high_water_close, exitDate: p.exit_date, exitPrice: p.exit_price,
  exitReason: p.exit_reason, realizedPnl: p.realized_pnl, spyEntry: p.spy_entry, spyExit: p.spy_exit });
const positions: PortfolioPosition[] = frozen.positions.map(pmap);

function fixedEntry(p: PortfolioPosition, config: PortfolioConfig, partial = false) {
  let peak = p.entryPrice, last = p.entryPrice, remaining = 1, proceeds = 0, soldHalf = false;
  let date = p.entryDate, reason: string | null = null, pending: string | null = null;
  for (const d of Object.keys(frozen.prices[p.ticker]).sort()) {
    if (d <= p.entryDate || d > asOf) continue;
    const px = frozen.prices[p.ticker][d];
    if (!(px > 0) || !Number.isFinite(px)) continue;
    peak = Math.max(peak, px); last = px; date = d;
    reason = pending ?? evaluateExit({ entryPrice: p.entryPrice, close: px, highWaterClose: peak, holdDays: diffDaysYmd(p.entryDate, d) }, config);
    if (reason) {
      if (!pending && config.exitExecution === 'next_close') { pending = reason; reason = null; continue; }
      proceeds += remaining * applySlippage(px, 'sell', config.slippageBps); remaining = 0; break;
    }
    if (partial && !soldHalf && px / p.entryPrice - 1 >= .25 - 1e-9) {
      proceeds += .5 * applySlippage(px, 'sell', config.slippageBps); remaining = .5; soldHalf = true;
    }
  }
  const value = proceeds + remaining * last;
  return { ticker: p.ticker, date, reason, partial: soldHalf, return: value / p.entryPrice - 1,
    pnl: p.shares * value - p.costBasis };
}
const fixed = EXIT_POLICIES.map(policy => {
  const results = positions.map(p => fixedEntry(p, { ...cfg, ...policy.patch }));
  return { id: policy.id, meanReturn: results.reduce((n,r) => n+r.return,0)/results.length,
    pnl: results.reduce((n,r) => n+r.pnl,0), closed: results.filter(r=>r.reason).length, results };
});
const partial = positions.map(p => fixedEntry(p, cfg, true));
const baselineMatches = positions.filter((p,i) => p.exitDate === (fixed[0].results[i].reason ? fixed[0].results[i].date : null)
  && p.exitReason === fixed[0].results[i].reason && (!p.exitDate || Math.abs(fixed[0].results[i].return - (p.exitPrice! / p.entryPrice - 1)) < 1e-10)).length;

const db = new Database(dbPath, { readonly: true });
db.pragma('query_only=ON');
const priceRows = db.prepare('SELECT ticker,date,adj_close,fetched_at FROM price_history WHERE date>=? AND date<=? ORDER BY ticker,date')
  .all(addDaysYmd(cfg.inceptionDate ?? '2026-09-01', -100), asOf) as { ticker:string; date:string; adj_close:number; fetched_at:string }[];
const prices: Record<string, Record<string,number>> = {};
for (const row of priceRows) (prices[row.ticker] ??= {})[row.date] = row.adj_close;
const spy = prices.SPY;
if (!spy) throw new Error('Frozen backup does not contain benchmark prices');
const archived = (db.prepare('SELECT candidate_json FROM portfolio_experiment_candidates WHERE experiment_id=? ORDER BY earliest_date,ticker')
  .all('main-backtest-v1.7') as { candidate_json:string }[]).map(r => JSON.parse(r.candidate_json) as PortfolioCandidate);
const signalRows = db.prepare(`SELECT id AS signalId,ticker,score,scraped_at AS seenAt FROM signals WHERE id IN (
  SELECT id FROM (SELECT id,ROW_NUMBER() OVER(PARTITION BY ticker,substr(scraped_at,1,10) ORDER BY scraped_at,id) rn FROM signals) WHERE rn=1)
  AND score>=? AND substr(scraped_at,1,10)<=? ORDER BY scraped_at,id`).all(cfg.entryScore, asOf) as { signalId:number;ticker:string;score:number;seenAt:string }[];
const outcomes = db.prepare('SELECT ticker,MAX(score) score,entry_date seenAt FROM signal_outcomes WHERE score>=? AND entry_date<=? GROUP BY ticker,entry_date')
  .all(cfg.entryScore,asOf) as { ticker:string;score:number;seenAt:string }[];
const pool = [...archived, ...positions.map(p => ({ ticker:p.ticker, earliestDate:p.entryDate, score:p.entryScore, signalId:p.signalId, source:'signal' as const })),
  ...signalRows.map(r=>({ ticker:r.ticker, earliestDate:earliestEntryDate(r.seenAt), score:r.score, signalId:r.signalId, source:'signal' as const })),
  ...outcomes.map(r=>({ ticker:r.ticker, earliestDate:addDaysYmd(r.seenAt,1), score:r.score, signalId:null, source:'outcome' as const }))];
const unique = new Map<string,PortfolioCandidate>();
for (const c of cleanPortfolioCandidates(pool)) if (!unique.has(`${c.ticker}|${c.earliestDate}`)) unique.set(`${c.ticker}|${c.earliestDate}`,c);
const candidates = [...unique.values()].filter(c=>(!cfg.inceptionDate || c.earliestDate>=cfg.inceptionDate) && c.earliestDate<=asOf)
  .sort((a,b)=>a.earliestDate.localeCompare(b.earliestDate)||a.ticker.localeCompare(b.ticker));
db.close();
const tradingDays = Object.keys(spy).filter(d=>d<=asOf).sort();
const input = { config:cfg, tradingDays, spy, prices, candidates };
const quarantined = candidates.map(c=>c.ticker).filter((t,i,a)=>a.indexOf(t)===i).filter(t =>
  screenSeries(Object.entries(prices[t]??{}).map(([date,px])=>({ date,px }))).suspect.length);
// A numerically smooth cache does not resolve contradictory legacy rejection
// evidence. This is exclusion uncertainty, not proof the ALP marks are wrong.
for (const e of frozen.price_quality_events ?? []) if (e.kind === 'suspect_price' && e.ticker && !quarantined.includes(e.ticker)) quarantined.push(e.ticker);
const summarize = (sim: ReturnType<typeof simulatePortfolio>, config: PortfolioConfig) => {
  const last = sim.equity.at(-1);
  let peak = config.startingCash, maxDrawdown = 0;
  for(const p of sim.equity){ peak=Math.max(peak,p.equity); maxDrawdown=Math.min(maxDrawdown,p.equity/peak-1); }
  return { endingEquity:last?.equity, return:last ? last.equity/config.startingCash-1:null,
    benchmark:last?.benchmark, excess:last ? (last.equity-last.benchmark)/config.startingCash:null,
    maxDrawdown, open:sim.positions.filter(p=>!p.exitDate).length, closed:sim.positions.filter(p=>p.exitDate).length,
    skippedCap:sim.events.filter(e=>e.kind==='skipped_cap').length, skippedCash:sim.events.filter(e=>e.kind==='skipped_no_cash').length,
    missing:sim.untradable, positions:sim.positions, events:sim.events };
};
const full = [];
for(const portfolio of ['main','concentrated'] as const) for(const execution of ['same_close','next_close'] as const)
  for(const bps of [5,50]) for(const policy of EXIT_POLICIES){
    const config={ ...(portfolio==='main'?cfg:insiderOnlyConfig(cfg)), ...policy.patch, exitExecution:execution, slippageBps:bps };
    const sim=simulatePortfolio({ ...input,config });
    full.push({ portfolio, execution, bps, policy:policy.id, ...summarize(sim,config) });
  }
const screened = simulatePortfolio({ ...input, prices: Object.fromEntries(Object.entries(prices).filter(([t])=>!quarantined.includes(t))) });
const baselineSim = simulatePortfolio(input);
const deterministic = JSON.stringify(baselineSim) === JSON.stringify(simulatePortfolio(input));
const report={ schemaVersion:1, asOf, investigationSha256:createHash('sha256').update(raw).digest('hex'),
  replayInputHash:digest(input), candidates:candidates.length, coveredTickers:Object.keys(prices).length,
  candidateHash:digest(candidates), priceHash:digest({spy,prices}), deterministic, baselineMatches,
  inputLimitations:['Price/security/corporate-action truth unverified; legacy cached vintages only',
    'Candidate archives include recovered executed entries; historical full opportunity set may be incomplete',
    'Both portfolios use the same frozen candidate pool; correlated results are not independent evidence',
    'Adjusted closes represent synthetic return-accounting units; fractional shares; no volume/participation constraint, fees, taxes or distributions cashflow model',
    'Same-close scenario reuses close proceeds; next-close exits allow decisions based on an earlier completed close',
    'All variants are disclosed in-sample diagnostics, with no untouched test set'],
  fixedEntry:fixed, partialDiagnostic:{ id:'half-at-25-trail-remainder-v1', pnl:partial.reduce((n,r)=>n+r.pnl,0), results:partial },
  baselinePortfolio:summarize(baselineSim,cfg), quarantinedTickers:quarantined,
  quarantineDiagnostic:summarize(screened,cfg), fullPortfolioReplays:full };
fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({ asOf, candidates:candidates.length, baselineMatches, deterministic,
  baseline:{ stored:frozen.equity.at(-1).equity, replay:report.baselinePortfolio.endingEquity },
  fixed:fixed.map(({id,pnl,closed})=>({id,pnl,closed})), partialPnl:report.partialDiagnostic.pnl, quarantined,
  full:full.filter(r=>r.portfolio==='main'&&r.bps===5).map(({execution,policy,endingEquity,excess,closed,open})=>({execution,policy,endingEquity,excess,closed,open})) },null,2));
