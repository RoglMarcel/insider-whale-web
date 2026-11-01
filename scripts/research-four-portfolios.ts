/** Offline diagnostic, no migration, price fetch or application database writes.
 * Bundle with esbuild --bundle --platform=node --format=cjs --external:better-sqlite3.
 * Usage: node BUNDLE.cjs INVESTIGATION.json FROZEN.db OUTPUT.json
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { digest } from '../electron/priceCache';
import { PORTFOLIO_SELECTED_EXIT_POLICY, PORTFOLIO_EXIT_POLICY_ID, type PortfolioCandidate, type PortfolioConfig } from '../src/types';
import { simulatePortfolio, earliestEntryDate, addDaysYmd } from '../src/lib/portfolio-rules';
import { insiderOnlyConfig } from '../src/lib/insider-only';
import { alertsAbove80Config } from '../src/lib/alerts-above-80';
import { cleanPortfolioCandidates } from '../src/lib/ticker-quality';

const [snapshotPath, databasePath, outputPath] = process.argv.slice(2);
if (!snapshotPath || !databasePath || !outputPath) throw new Error('Supply frozen investigation JSON, read-only SQLite backup, and output JSON');
const raw = fs.readFileSync(snapshotPath, 'utf8'), frozen = JSON.parse(raw);
const base: PortfolioConfig = frozen.meta.config, asOf: string = frozen.equity.at(-1).date;
const db = new Database(databasePath, { readonly: true });
db.pragma('query_only=ON');
const prices: Record<string, Record<string, number>> = {};
for (const r of db.prepare('SELECT ticker,date,adj_close FROM price_history WHERE date>=? AND date<=? ORDER BY ticker,date')
  .all(addDaysYmd(base.inceptionDate ?? '2026-09-01', -100), asOf) as {ticker:string;date:string;adj_close:number}[])
  (prices[r.ticker] ??= {})[r.date] = r.adj_close;
const archives = (db.prepare("SELECT candidate_json FROM portfolio_experiment_candidates WHERE experiment_id IN ('main-backtest-v1.7','insider-only-v1') ORDER BY experiment_id,earliest_date,ticker")
  .all() as {candidate_json:string}[]).map(r => JSON.parse(r.candidate_json) as PortfolioCandidate);
const recovered: PortfolioCandidate[] = frozen.positions.map((p: Record<string, any>) => ({ticker:p.ticker,
  earliestDate:p.entry_date,score:p.entry_score,signalId:p.signal_id,source:'signal'}));
function pool(threshold:number, strict=false):PortfolioCandidate[]{
  const op = strict ? '>' : '>=';
  const signals = db.prepare(`SELECT ticker,score,scraped_at AS seenAt,id AS signalId FROM (
    SELECT *,ROW_NUMBER() OVER(PARTITION BY ticker,substr(scraped_at,1,10) ORDER BY scraped_at,id) rn
    FROM signals WHERE score ${op} ? AND substr(scraped_at,1,10)<=?) WHERE rn=1 ORDER BY seenAt,signalId`)
    .all(threshold,asOf) as {ticker:string;score:number;seenAt:string;signalId:number}[];
  const outcomes = db.prepare(`SELECT ticker,MAX(score) score,entry_date seenAt FROM signal_outcomes
    WHERE score ${op} ? AND entry_date<=? GROUP BY ticker,entry_date ORDER BY entry_date,ticker`)
    .all(threshold,asOf) as {ticker:string;score:number;seenAt:string}[];
  const sources:PortfolioCandidate[] = [
    ...signals.map(r => ({ticker:r.ticker,score:r.score,signalId:r.signalId,earliestDate:earliestEntryDate(r.seenAt),source:'signal' as const})),
    ...outcomes.map(r => ({ticker:r.ticker,score:r.score,signalId:null,earliestDate:addDaysYmd(r.seenAt,1),source:'outcome' as const})),
  ];
  const unique = new Map<string,PortfolioCandidate>();
  // Match production archive priority. A new strict book first sees its own
  // qualified sources; lower-score entries never acquire a later high score.
  const ordered = strict ? [...sources,...archives,...recovered] : [...archives,...recovered,...sources];
  for(const c of cleanPortfolioCandidates(ordered)) if((strict ? c.score>threshold : c.score>=threshold)
    && c.earliestDate>=(base.inceptionDate ?? '') && c.earliestDate<=asOf
    && !unique.has(`${c.ticker}|${c.earliestDate}`)) unique.set(`${c.ticker}|${c.earliestDate}`,c);
  return [...unique.values()].sort((a,b)=>a.earliestDate.localeCompare(b.earliestDate)||a.ticker.localeCompare(b.ticker));
}
const broad=pool(70), high=pool(80,true);db.close();
const spy=prices.SPY;
if(!spy)throw new Error('Frozen benchmark is missing');
const tradingDays=Object.keys(spy).filter(d=>d>=(base.inceptionDate ?? '')&&d<=asOf).sort();
const results=[];
for(const policy of ['legacy','selected'] as const){
  const cfg:PortfolioConfig=policy==='selected'?{...base,...PORTFOLIO_SELECTED_EXIT_POLICY}:base;
  for(const [name,config,candidates] of [
    ['Alerts + S&P 500',cfg,broad],
    ['Concentrated signals',insiderOnlyConfig(cfg),broad],
    ['alerts >80 only',alertsAbove80Config(cfg),high],
  ] as const){
    const input={config,tradingDays,spy,prices,candidates};
    const sim=simulatePortfolio(input);
    assert.deepEqual(sim,simulatePortfolio(input),'Deterministic replay');
    const last=sim.equity.at(-1)!;
    let peak=config.startingCash,drawdown=0;
    for(const p of sim.equity){peak=Math.max(peak,p.equity);drawdown=Math.min(drawdown,p.equity/peak-1);}
    results.push({policy,name,config,candidateCount:candidates.length,endingEquity:last.equity,
      return:last.equity/config.startingCash-1,benchmark:last.benchmark,maxDrawdown:drawdown,
      meanAlertExposure:sim.equity.reduce((n,p)=>n+p.positionsValue/p.equity,0)/sim.equity.length,
      entries:sim.positions.length,open:sim.positions.filter(p=>!p.exitDate).length,
      closed:sim.positions.filter(p=>!!p.exitDate).length,
      inputHash:digest(input),positions:sim.positions,equity:sim.equity});
  }
}
const result={asOf,selectedPolicy:PORTFOLIO_EXIT_POLICY_ID,policyDefinedAt:'2026-11-01',
  investigationSha256:createHash('sha256').update(raw).digest('hex'),priceHash:digest(prices),broadCandidateHash:digest(broad),highCandidateHash:digest(high),
  firstDate:tradingDays[0],lastDate:tradingDays.at(-1),capital:base.startingCash,deterministic:true,
  limitations:['Retrospective in-sample diagnostic, not independent validation or a live track record.',
    'Legacy cached prices have unresolved identity, adjustment and ALP quarantine evidence.',
    'Expired observations cannot be recovered in full; archived/recovered entries supplement remaining source rows.',
    'No intraday data, liquidity constraint, fees, taxes or distributions cashflow model; adjusted-close accounting and fractional shares.',
    'All portfolios share signals. The strict-cutoff experiment has very few qualifying opportunities.'],results};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,results:results.map(({positions,equity,...summary})=>summary)},null,2));
