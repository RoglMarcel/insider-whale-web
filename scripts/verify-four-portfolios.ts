import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase,closeDatabase,getDb,getPortfolioConfig,setPortfolioConfig,setPortfolioRunMeta,
  insertPortfolioEquity,setPortfolioExperiment,migratePortfolioConfig,getPortfolioSignalCandidates,
  insertSignal,replacePriceSeries,getPortfolioPositions } from '../electron/database';
import { DEFAULT_PORTFOLIO_CONFIG,PORTFOLIO_SELECTED_EXIT_POLICY } from '../src/types';
import { simulatePortfolio,earliestEntryDate } from '../src/lib/portfolio-rules';
import { buildInsiderOnly,INSIDER_ONLY_ID } from '../src/lib/insider-only';
import { ALERTS_ABOVE_80_ID } from '../src/lib/alerts-above-80';
import { makePriceVintage } from '../electron/priceCache';
import { syncPortfolio,getPortfolioState,writePortfolioJson } from '../electron/portfolio';
import { getBacktestState } from '../electron/backtest';
import { exportSharedHistory,mergeSharedHistory } from '../electron/sharedHistory';
import { sampleSignals } from '../src/lib/sampleData';

async function verify():Promise<void>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'four-portfolios-')),file=path.join(root,'book.db');
  const days=['2026-09-01','2026-09-02','2026-09-03','2026-09-04'];
  const series=(values:number[])=>Object.fromEntries(values.map((v,i)=>[days[i],v]));
  try{
    initDatabase(file);
    const legacy={...DEFAULT_PORTFOLIO_CONFIG,startingCash:15000,minTicket:125,trailArm:.25,trailDistance:.2,exitExecution:'same_close' as const};
    setPortfolioConfig(legacy);
    getDb().prepare("UPDATE app_settings SET value='3' WHERE key='portfolio_config_version'").run();
    const oldInput={config:legacy,tradingDays:days,spy:series([500,501,502,503]),prices:{},candidates:[]};
    insertPortfolioEquity(simulatePortfolio(oldInput).equity);
    setPortfolioExperiment(buildInsiderOnly(oldInput,'2026-10-30T22:00:00Z'));
    setPortfolioRunMeta({config:legacy,curveVersion:6,builtAt:'2026-10-30T22:00:00Z',backfillStart:days[0],liveStart:null,
      skippedNoCash:0,skippedCap:0,missingPrices:0,suspectPrices:0,untradableTickers:[],restatedDays:0});
    closeDatabase();initDatabase(file);
    const migrated=getPortfolioConfig();
    for(const [key,value] of Object.entries(PORTFOLIO_SELECTED_EXIT_POLICY))assert.equal(migrated[key as keyof typeof migrated],value);
    assert.equal(migrated.startingCash,15000);assert.equal(migrated.minTicket,125);assert.equal(migrated.entryScore,70);
    const archived=JSON.parse((getDb().prepare("SELECT state_json FROM portfolio_revisions WHERE reason='before-exit-policy-v2-migration'").get() as {state_json:string}).state_json);
    assert.equal(archived.meta.config.trailArm,.25);assert.equal(archived.experiments.length,1);
    assert.equal(migratePortfolioConfig(),null);
    setPortfolioConfig({maxHoldDays:75});closeDatabase();initDatabase(file);
    assert.equal(getPortfolioConfig().maxHoldDays,75); // v4 custom edits survive restart
    setPortfolioConfig(PORTFOLIO_SELECTED_EXIT_POLICY);

    const add=(ticker:string,score:number,time:string)=>insertSignal({...sampleSignals[0],ticker,score,scrapedAt:`2026-09-01T${time}:00Z`});
    add('AAA',69,'09:00');add('AAA',80,'10:00');add('AAA',80.1,'11:00');add('AAA',90,'12:00');
    add('LATE',70,'19:00');add('LATE',81,'20:30');add('BND',80,'11:00');
    const broad=getPortfolioSignalCandidates(70),strict=getPortfolioSignalCandidates(80,true);
    assert.equal(broad.find(r=>r.ticker==='AAA')!.score,80);
    assert.equal(strict.find(r=>r.ticker==='AAA')!.score,80.1); // first qualifying, not daily max
    assert(!strict.some(r=>r.ticker==='BND'));
    assert.equal(earliestEntryDate(strict.find(r=>r.ticker==='LATE')!.seenAt),days[1]);
    const seed=(last=90)=>{
      const paths={SPY:[500,501,502,503],AAA:[100,120,103,last],LATE:[100,110,110,110],BND:[100,100,100,100]};
      for(const [ticker,values] of Object.entries(paths))replacePriceSeries(makePriceVintage({ticker,
        fetchedAt:new Date().toISOString(),basis:'yahoo-adjusted-close',providerSymbol:ticker,
        metadata:{symbol:ticker,currency:'USD',exchangeName:'NMS'},corporateActions:null,issues:[],
        points:values.map((px,i)=>({date:days[i],px}))}));
    };
    seed();assert((await syncPortfolio()).ok);
    const state=getPortfolioState(),third=state.insiderOnly!.state,fourth=state.alertsAbove80!.state;
    assert.equal(state.alertsAbove80!.name,'alerts >80 only');
    for(const book of [state,third,fourth]){
      assert.equal(book.config.startingCash,15000);assert.equal(book.config.exitExecution,'next_close');
      assert.equal(book.config.trailArm,.15);assert.equal(book.config.trailDistance,.1);
      assert.equal(book.meta.liveStart,'2026-11-01');
      assert.equal(book.meta.provenance!.inputHash,state.meta.provenance!.inputHash);
      assert.deepEqual(book.equity.map(p=>[p.date,p.benchmark]),state.equity.map(p=>[p.date,p.benchmark]));
      assert.equal(book.closed.find(p=>p.ticker==='AAA')!.exitDate,days[3]);
    }
    assert(![...fourth.open,...fourth.closed].some(p=>p.ticker==='BND'));
    assert.equal(fourth.open.find(p=>p.ticker==='LATE')!.entryDate,days[1]);
    assert(getBacktestState().records.every(r=>r.portfolio==='Hauptdepot'));
    const originalDecision=(getDb().prepare('SELECT payload FROM backtest_decisions ORDER BY key LIMIT 1').get() as {payload:string}).payload;
    getDb().exec(`CREATE TEMP TRIGGER fourth_failure BEFORE UPDATE ON portfolio_experiments
      WHEN NEW.id='${ALERTS_ABOVE_80_ID}' BEGIN SELECT RAISE(ABORT,'fixture fourth failure'); END;`);
    seed(85);await assert.rejects(syncPortfolio(),/fixture fourth failure/);
    assert.equal(getPortfolioState().meta.provenance!.runId,state.meta.provenance!.runId);
    assert.deepEqual(getPortfolioState().insiderOnly, state.insiderOnly);
    assert.deepEqual(getPortfolioState().alertsAbove80,state.alertsAbove80);
    getDb().exec('DROP TRIGGER fourth_failure');assert((await syncPortfolio()).ok);
    const corrected=getPortfolioState();
    assert.notEqual(corrected.meta.provenance!.runId,state.meta.provenance!.runId);
    assert.equal(corrected.alertsAbove80!.state.closed.find(p=>p.ticker==='AAA')!.exitPrice,85*.9995);
    assert(getBacktestState().records.some(r=>r.replayChanged));
    writePortfolioJson(root);
    const published=JSON.parse(fs.readFileSync(path.join(root,'portfolio.json'),'utf8'));
    assert.deepEqual(published.alertsAbove80,corrected.alertsAbove80);
    getDb().exec('DELETE FROM signals; DELETE FROM signal_outcomes');
    assert((await syncPortfolio()).ok);
    assert.deepEqual(getPortfolioState().alertsAbove80!.state.equity,corrected.alertsAbove80!.state.equity);
    assert.equal((getDb().prepare('SELECT payload FROM backtest_decisions ORDER BY key LIMIT 1').get() as {payload:string}).payload,originalDecision);
    const transport=path.join(root,'shared.db');exportSharedHistory(file,transport,getPortfolioState());
    const expected=getPortfolioState().alertsAbove80;
    closeDatabase();initDatabase(path.join(root,'receiver.db'));
    mergeSharedHistory(getDb(),transport,'2026-11-01T22:00:00Z');
    assert.deepEqual(getPortfolioState().alertsAbove80,expected);
    closeDatabase();initDatabase(file);assert.deepEqual(getPortfolioState().alertsAbove80,expected);
    assert.equal(getPortfolioPositions().length,3);
    setPortfolioConfig({inceptionDate:'9999-12-31'});await syncPortfolio();
    assert.equal(getPortfolioState().insiderOnly,null);assert.equal(getPortfolioState().alertsAbove80,null);
    assert(getDb().prepare("SELECT 1 FROM portfolio_revisions WHERE reason LIKE 'before-future-inception:%'").get());
    console.log('Four portfolios: v4 archival migration, first-qualified strict cutoff/timestamps, shared controls, atomic rollback, immutable history, publication, pruning, transport and restart passed.');
  }finally{closeDatabase();fs.rmSync(root,{recursive:true,force:true});}
}
verify().catch(e=>{console.error(e);process.exitCode=1;});
