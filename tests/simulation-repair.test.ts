import { describe, it, expect } from 'vitest';
import { makePriceVintage, reusablePriceReview } from '../electron/priceCache';
import { screenSeries, type PriceSnapshot } from '../electron/prices';
import { earliestEntryDate, evaluateExit, nearestBarrier, simulatePortfolio } from '../src/lib/portfolio-rules';
import { DEFAULT_PORTFOLIO_CONFIG as defaults } from '../src/types';

const points = (values: number[]) => values.map((px, i) => ({ date: `2026-09-0${i+1}`, px }));
const snapshot = (values: number[]): PriceSnapshot => ({ ticker: 'TEST', fetchedAt: '2026-10-01T22:00:00Z',
  providerSymbol: 'TEST', metadata: { symbol: 'TEST', currency: 'USD', exchangeName: 'NMS' },
  basis: 'yahoo-adjusted-close', corporateActions: null, points: points(values), issues: [] });

describe('reviewable price integrity', () => {
  it('does not repeatedly screen a stable new level against one bad anchor', () => {
    expect(screenSeries(points([1, 50, 51, 52])).suspect).toHaveLength(1);
    expect(makePriceVintage(snapshot([1, 50, 51, 52])).clean).toEqual([]);
    expect(makePriceVintage(snapshot([50, 51, 52])).clean).toHaveLength(3);
  });
  it('requires explicit evidence to release a genuine extreme loss; never clips its return', () => {
    const v = snapshot([100, 20, 19]);
    expect(makePriceVintage(v).clean).toEqual([]);
    expect(makePriceVintage(v, { reviewer: 'fixture analyst', evidence: 'independent exchange fixture confirms crash' }).clean[1].px).toBe(20);
    expect(makePriceVintage({ ...v, issues: ['non_usd_price'] }, { reviewer: 'x', evidence: 'y' }).clean).toEqual([]);
  });
  it('does not manufacture split losses from a coherent adjusted vintage and fails closed on unknown identity', () => {
    expect(makePriceVintage({ ...snapshot([50, 51, 52]), corporateActions: { splits: { ratio: '2:1' } } }).clean).toHaveLength(3);
    expect(makePriceVintage({ ...snapshot([50, 51]), metadata: undefined }).issues).toContain('unknown_provider_identity');
  });
  it('retains a confirmed extreme move on a later refresh without approving changed moves or identities', () => {
    const approved = makePriceVintage(snapshot([100,20,19]), { reviewer:'analyst', evidence:'independent crash evidence' });
    expect(reusablePriceReview(snapshot([100,20,19,18]), approved)).toEqual(approved.review);
    expect(reusablePriceReview(snapshot([100,10,9]), approved)).toBeUndefined();
    expect(reusablePriceReview(snapshot([100,20,19,1]), approved)).toBeUndefined();
    expect(reusablePriceReview({ ...snapshot([100,20,19]), providerSymbol:'OTHER' }, approved)).toBeUndefined();
    const reviewed = makePriceVintage(snapshot([100,20]), { reviewer:'analyst', evidence:'external', reviewedAt:'2026-10-02T00:00:00Z' });
    expect(reviewed.fetchedAt).toBe('2026-10-01T22:00:00Z');
    expect(reviewed.recordedAt).toBe('2026-10-02T00:00:00Z');
  });
});

describe('profit protection and executable timing', () => {
  const cfg = { ...defaults, inceptionDate: null, cashPolicy: 'idle' as const, slippageBps: 0 };
  it('defers unknown observation times and rejects invalid calendar dates', () => {
    expect(earliestEntryDate('2026-09-01')).toBe('2026-09-02');
    expect(earliestEntryDate('2026-02-30')).toBe('9999-12-31');
  });
  it('shares the activated floor between the UI and engine, with stop precedence and overshoot', () => {
    const c = { ...cfg, profitFloor: .1 };
    const ctx = { entryPrice: 100, highWaterClose: 125, close: 109, holdDays: 5 };
    expect(evaluateExit({ ...ctx, highWaterClose: 124.99 }, c)).toBeNull();
    expect(evaluateExit(ctx, c)).toBe('trailing');
    expect(nearestBarrier(ctx, c)?.distance).toBeCloseTo(110/109-1);
    expect(evaluateExit({ ...ctx, close: 70 }, c)).toBe('stop_loss');
    expect(evaluateExit({ ...ctx, close: NaN }, c)).toBeNull();
  });
  it('preserves high-water, waits through missing quotes and fills a pending signal on the next real close', () => {
    const days = points([100, 130, 100, 0, 80]).map(p => p.date);
    const input = { config: { ...cfg, exitExecution: 'next_close' as const }, tradingDays: days,
      spy: Object.fromEntries(days.map(d => [d, 500])),
      prices: { TEST: Object.fromEntries(points([100, 130, 100, 0, 80]).map(p => [p.date,p.px])) },
      candidates: [{ ticker: 'TEST', earliestDate: days[0], score: 80, source: 'signal' as const, signalId: 1 }] };
    const original = JSON.stringify(input);
    const sim = simulatePortfolio(input);
    expect(sim.positions[0]).toMatchObject({ exitDate: days[4], exitPrice: 80, exitReason: 'trailing', highWaterClose: 130 });
    expect(simulatePortfolio(input)).toEqual(sim);
    expect(JSON.stringify(input)).toBe(original);
    const legacy = simulatePortfolio({ ...input, config: { ...cfg, exitExecution: 'same_close' } });
    expect(legacy.positions[0]).toMatchObject({ exitDate: days[2], exitPrice: 100 });
    const prefix = simulatePortfolio({ ...input, tradingDays: days.slice(0,2) });
    expect(prefix.positions[0].highWaterClose).toBe(130);
    expect(prefix.positions[0].exitDate).toBeNull();
    expect(simulatePortfolio({ ...input, tradingDays: days.slice(0,3) }).pendingExits).toEqual({ TEST: 'trailing' });
  });
});
