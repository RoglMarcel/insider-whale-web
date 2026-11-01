import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTFOLIO_CONFIG as defaults, PORTFOLIO_CONFIG_VERSION, type PortfolioCandidate } from '../src/types';
import { buildAlertsAbove80, alertsAbove80Config } from '../src/lib/alerts-above-80';
import { buildInsiderOnly, insiderOnlyConfig } from '../src/lib/insider-only';
import { simulatePortfolio, positionSize, type PortfolioSimInput } from '../src/lib/portfolio-rules';

const days = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04'];
const series = (p:number[]) => Object.fromEntries(p.map((px,i)=>[days[i],px]));
const candidate = (ticker:string,score:number,date=days[0]):PortfolioCandidate => ({ticker,score,earliestDate:date,signalId:null,source:'signal'});
const fixture = ():PortfolioSimInput => ({config:{...defaults,slippageBps:0},tradingDays:days,spy:series([100,101,102,103]),
  prices:{AAA:series([100,120,103,90]),BBB:series([100,101,102,103])},candidates:[candidate('AAA',80.1),candidate('BBB',80)]});
const build = (input=fixture()) => buildAlertsAbove80(input,'2026-11-01T12:00:00Z');

describe('fourth portfolio and selected policy',()=>{
  it('ships the explicitly selected policy and keeps entry 70 for the broad books',()=>{
    expect(PORTFOLIO_CONFIG_VERSION).toBe(4);
    expect(defaults).toMatchObject({entryScore:70,trailArm:.15,trailDistance:.1,exitExecution:'next_close',
      stopLoss:.25,maxHoldDays:90,takeProfit:null,profitFloor:null,sigmaBarriers:null});
  });
  it('excludes exactly 80 and admits decimal scores strictly above it at every entry gate',()=>{
    const result=build().state;
    expect([...result.open,...result.closed].map(p=>p.ticker)).toEqual(['AAA']);
    expect(positionSize(80,10000,alertsAbove80Config(defaults)).value).toBe(0);
    expect(positionSize(80.0001,10000,alertsAbove80Config(defaults)).value).toBe(2000);
    expect(build().name).toBe('alerts >80 only');
  });
  it('matches the concentrated book except for the entry gate, including custom starting capital',()=>{
    const base={...defaults,startingCash:15000,minTicket:125};
    const {entryScore,entryScoreStrict,...fourth}=alertsAbove80Config(base);
    const {entryScore:unused,entryScoreStrict:unusedStrict,...third}=insiderOnlyConfig(base);
    expect(fourth).toEqual(third);expect(fourth.startingCash).toBe(15000);
    expect(entryScore).toBe(80);expect(entryScoreStrict).toBe(true);
  });
  it('uses the same dates and benchmark even when no score qualifies',()=>{
    const input=fixture();input.candidates=[candidate('BBB',80)];
    const state=build(input).state,third=buildInsiderOnly(input,'fixture').state;
    expect(state.open).toEqual([]);expect(state.closed).toEqual([]);
    expect(state.equity.map(p=>p.equity)).toEqual([10000,10000,10000,10000]);
    expect(state.equity.map(p=>[p.date,p.benchmark])).toEqual(third.equity.map(p=>[p.date,p.benchmark]));
  });
  it('enters at the later qualifying observation instead of backdating a higher score',()=>{
    const input=fixture();input.candidates=[candidate('BBB',72),candidate('BBB',81,days[2])];
    const state=build(input).state;
    expect(state.open[0]).toMatchObject({entryDate:days[2],entryScore:81,entryPrice:102});
  });
  it('applies the same close trigger and next-observed-close fill in all three signal books',()=>{
    const input=fixture();input.candidates=[candidate('AAA',81)];
    const main=simulatePortfolio(input).positions[0];
    const third=buildInsiderOnly(input,'fixture').state.closed[0],fourth=build(input).state.closed[0];
    for(const p of [main,third,fourth]) expect(p).toMatchObject({exitDate:days[3],exitPrice:90,exitReason:'trailing',highWaterClose:120});
  });
  it('remains deterministic and constrained to five funded slots without mutating inputs',()=>{
    const input=fixture();input.candidates='ABCDEF'.split('').map(t=>candidate(t,81));
    input.prices=Object.fromEntries(input.candidates.map(c=>[c.ticker,series([100,101,102,103])]));
    const before=structuredClone(input),result=build(input);
    expect(result.state.open).toHaveLength(5);expect(result.state.meta.skippedCap).toBe(1);
    expect(result.state.equity.every(p=>p.cash>=0)).toBe(true);
    expect(build(input)).toEqual(result);expect(input).toEqual(before);
  });
});
