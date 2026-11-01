import { DEFAULT_PORTFOLIO_CONFIG } from '../src/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  coverage: vi.fn(), fetch: vi.fn(), upsert: vi.fn(),
  config: vi.fn(), equity: vi.fn(), positions: vi.fn(), book: vi.fn(), meta: vi.fn(),
}));
vi.mock('../electron/database', () => ({
  getPriceCoverage: mocks.coverage,
  replacePriceSeries: mocks.upsert,
  getPriceVintageIds: () => ({}),
  getReviewedPriceVintage: () => null,
  getPortfolioConfig: mocks.config,
  getPortfolioRunMeta: mocks.meta,
  getPortfolioExperiment: () => null,
  getPortfolioEquity: mocks.equity,
  getPortfolioPositions: mocks.positions,
  getPortfolioEvents: () => [],
  getPriceBook: mocks.book,
  getPriceAsOf: () => '2026-09-21',

}));
vi.mock('../electron/prices', async importOriginal => ({
  ...await importOriginal<typeof import('../electron/prices')>(),
  PRICE_REQUEST_GAP_MS: 0,
  fetchPriceSnapshot: mocks.fetch,
  sleep: async () => {},
}));
import { getPortfolioState, syncPrices } from '../electron/portfolio';
const snapshot = (ticker: string, prices = [ticker === 'SPY' ? 500 : 100]) => ({
  ticker, fetchedAt: '2026-09-21T20:00:00Z', basis: 'yahoo-adjusted-close', providerSymbol: ticker,
  metadata: { symbol: ticker, currency: 'USD', exchangeName: 'NMS' }, corporateActions: null, issues: [],
  points: prices.map((px, i) => ({ date: `2026-09-${20 + i}`, px })),
});

describe('portfolio price synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T20:00:00Z'));
    mocks.coverage.mockReturnValue({
      SPY: { last: '2026-09-11', fetchedAt: '2026-09-11T20:00:00Z' },
      AAA: { last: '2026-09-11', fetchedAt: '2026-09-11T20:00:00Z' },
    });
  });
  afterEach(() => vi.useRealTimers());

  it('refreshes holdings against freshly fetched SPY, not the old database date', async () => {
    mocks.fetch.mockImplementation(async (ticker: string) => snapshot(ticker));
    await syncPrices(['AAA', 'SPY'], '2026-09-01');
    expect(mocks.fetch.mock.calls.map((call) => call[0])).toEqual(['SPY', 'AAA']);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ ticker: 'AAA', clean: [{ date: '2026-09-20', px: 100 }] }));
  });

  it('reports a holding fetch failure without deleting cached prices', async () => {
    mocks.fetch.mockImplementation(async (ticker: string) => ticker === 'SPY'
      ? snapshot(ticker) : null);
    const result = await syncPrices(['SPY', 'AAA'], '2026-09-01');
    expect(result.missing).toEqual(['AAA']);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('replaces previously usable prices with an empty quarantine, then allows corrected recovery', async () => {
    mocks.fetch.mockImplementation(async (ticker: string) => snapshot(ticker, ticker === 'AAA' ? [1, 50, 51] : [500, 501]));
    expect((await syncPrices(['AAA'], '2026-09-01')).missing).toEqual(['AAA']);
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ ticker: 'AAA', clean: [], issues: [expect.stringContaining('unexplained_discontinuity')] }));
    mocks.fetch.mockImplementation(async (ticker: string) => snapshot(ticker, [50, 51, 52]));
    expect((await syncPrices(['AAA'], '2026-09-01')).missing).toEqual([]);
    expect(mocks.upsert.mock.calls.at(-1)![0].clean).toHaveLength(3);
  });
});

it('shows the last known close, not the historical high, when today has no quote', () => {
  mocks.config.mockReturnValue(DEFAULT_PORTFOLIO_CONFIG);
  mocks.equity.mockReturnValue([{
    date: '2026-09-21', equity: 9900, cash: 9000, positionsValue: 900,
    spyCashValue: 0, equityIdle: 9900, benchmark: 10000, openPositions: 1,
  }]);
  mocks.positions.mockReturnValue([{
    id: 1, ticker: 'AAA', signalId: null, entryDate: '2026-09-01', entryPrice: 100,
    shares: 10, costBasis: 1000, entryScore: 70, targetWeight: 0.1,
    highWaterClose: 120, exitDate: null, exitPrice: null, exitReason: null,
    realizedPnl: null, spyEntry: 500, spyExit: null,
  }]);
  mocks.book.mockReturnValue({ AAA: {
    '2026-09-01': 100, '2026-09-10': 120, '2026-09-11': 90,
    '2026-09-22': 200, // Future prices must never enter today's mark.
  } });
  const state = getPortfolioState();
  expect(state.open[0]).toMatchObject({
    lastPrice: 90, priceAsOf: '2026-09-11', priceStale: true,
    marketValue: 900, nearestBarrier: null,
  });
  expect(state.open[0].unrealizedPct).toBeCloseTo(-0.1);
  mocks.meta.mockReturnValue({ config: { ...DEFAULT_PORTFOLIO_CONFIG, trailArm: .1, trailDistance: .1 },
    positionMarks: { AAA: { date: '2026-09-21', px: 110 } } });
  const stored = getPortfolioState();
  expect(stored.open[0].lastPrice).toBe(110);
  expect(stored.open[0].nearestBarrier).toBe('trailing');
  expect(stored.config.trailArm).toBe(.1);
});
