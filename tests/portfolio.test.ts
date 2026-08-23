import { describe, it, expect } from 'vitest';
import {
  addDaysYmd,
  applySlippage,
  computeStats,
  diffDaysYmd,
  earliestEntryDate,
  evaluateExit,
  firstTradableDay,
  positionSize,
  rebase,
  simulatePortfolio,
  toClosedPosition,
  type PortfolioSimInput,
} from '../src/lib/portfolio-rules';
import {
  DEFAULT_PORTFOLIO_CONFIG,
  PORTFOLIO_ENTRY_SCORE,
  type PortfolioCandidate,
  type PortfolioConfig,
} from '../src/types';

/**
 * The testing portfolio is a claim about numbers, so the numbers have to be
 * pinned. Everything here runs against the PURE engine — no database, no
 * network — which is the whole reason the rules were split out of the I/O.
 *
 * The two tests that matter most are "no look-ahead" and "determinism": if
 * either of those breaks, every figure the Portfolio tab prints is fiction, and
 * neither failure is visible by looking at a chart.
 */

const cfg = (over: Partial<PortfolioConfig> = {}): PortfolioConfig => ({ ...DEFAULT_PORTFOLIO_CONFIG, ...over });

/** N consecutive WEEKDAYS from `start` — a stand-in trading calendar. */
function calendar(start: string, n: number): string[] {
  const out: string[] = [];
  let d = start;
  while (out.length < n) {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d);
    d = addDaysYmd(d, 1);
  }
  return out;
}

const flat = (days: readonly string[], px: number): Record<string, number> =>
  Object.fromEntries(days.map((d) => [d, px]));

/** A price path laid onto a calendar; short paths hold their last value. */
function path(days: readonly string[], values: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  days.forEach((d, i) => {
    out[d] = values[Math.min(i, values.length - 1)];
  });
  return out;
}

function input(over: Partial<PortfolioSimInput> = {}): PortfolioSimInput {
  const days = calendar('2026-01-05', 40);
  return {
    config: cfg(),
    tradingDays: days,
    spy: flat(days, 500),
    prices: {},
    candidates: [],
    ...over,
  };
}

const cand = (over: Partial<PortfolioCandidate> = {}): PortfolioCandidate => ({
  ticker: 'AAA',
  earliestDate: '2026-01-05',
  score: 80,
  signalId: null,
  source: 'signal',
  ...over,
});

// ──────────────────────────────────────────────────────────────────────────

describe('position sizing', () => {
  it('starts at the base weight exactly at the entry score', () => {
    const s = positionSize(PORTFOLIO_ENTRY_SCORE, 10_000);
    expect(s.targetWeight).toBeCloseTo(0.05, 10);
    expect(s.value).toBeCloseTo(500, 10);
  });

  it('scales with the score: 82 → 7.5%', () => {
    expect(positionSize(82, 10_000).targetWeight).toBeCloseTo(0.075, 10);
    expect(positionSize(82, 10_000).value).toBeCloseTo(750, 10);
  });

  it('caps at the maximum weight', () => {
    expect(positionSize(90, 10_000).targetWeight).toBeCloseTo(0.1, 10);
    expect(positionSize(95, 10_000).targetWeight).toBeCloseTo(0.1, 10);
    expect(positionSize(140, 10_000).targetWeight).toBeCloseTo(0.1, 10);
  });

  it('is zero below the threshold — the score does not qualify at all', () => {
    expect(positionSize(73.9, 10_000)).toEqual({ targetWeight: 0, value: 0 });
    expect(positionSize(0, 10_000)).toEqual({ targetWeight: 0, value: 0 });
  });

  it('floors at the minimum weight when a lowered threshold is used', () => {
    // Threshold 60 anchors the span, so a score of 60 is the BASE weight, not
    // the floor — the floor only binds for scores under the configured entry.
    const c = cfg({ entryScore: 60 });
    expect(positionSize(60, 10_000, c).targetWeight).toBeCloseTo(0.05, 10);
    expect(positionSize(76, 10_000, c).targetWeight).toBeCloseTo(0.1, 10);
  });

  it('sizes off current equity, not the starting cash', () => {
    expect(positionSize(74, 20_000).value).toBeCloseTo(1000, 10);
  });
});

describe('slippage', () => {
  it('is charged against the book on both sides', () => {
    expect(applySlippage(100, 'buy', 5)).toBeCloseTo(100.05, 10);
    expect(applySlippage(100, 'sell', 5)).toBeCloseTo(99.95, 10);
  });

  it('reduces the shares bought and the cash received', () => {
    const days = calendar('2026-01-05', 6);
    const res = simulatePortfolio(
      input({
        config: cfg({ cashPolicy: 'idle' }),
        tradingDays: days,
        spy: flat(days, 500),
        prices: { AAA: flat(days, 100) },
        candidates: [cand({ earliestDate: days[0], score: 74 })],
      }),
    );
    const p = res.positions[0];
    expect(p.entryPrice).toBeCloseTo(100.05, 10);
    // 5% of 10,000 buys fewer than 5 shares because the fill is above the close.
    expect(p.shares).toBeLessThan(5);
    expect(p.shares).toBeCloseTo(500 / 100.05, 10);
  });
});

describe('triple barrier', () => {
  const base = { entryPrice: 100, close: 100, highWaterClose: 100, holdDays: 1 };

  it('takes profit at +20%', () => {
    expect(evaluateExit({ ...base, close: 119.9, highWaterClose: 119.9 })).toBeNull();
    expect(evaluateExit({ ...base, close: 120, highWaterClose: 120 })).toBe('take_profit');
  });

  it('stops out at −10%', () => {
    expect(evaluateExit({ ...base, close: 90.1 })).toBeNull();
    expect(evaluateExit({ ...base, close: 90 })).toBe('stop_loss');
  });

  it('times out at 30 calendar days', () => {
    expect(evaluateExit({ ...base, holdDays: 29 })).toBeNull();
    expect(evaluateExit({ ...base, holdDays: 30 })).toBe('time');
  });

  it('arms the trailing stop only above +15%', () => {
    // +14% peak, then a 10% give-back — not armed, so no trailing exit.
    expect(evaluateExit({ ...base, highWaterClose: 114, close: 102.6 })).toBeNull();
    // +15% peak and 10% below it → armed and triggered.
    expect(evaluateExit({ ...base, highWaterClose: 115, close: 103.5 })).toBe('trailing');
  });

  it('trails from the high-water close, not from the entry', () => {
    expect(evaluateExit({ ...base, highWaterClose: 150, close: 136 })).toBe('take_profit');
    expect(evaluateExit({ ...base, highWaterClose: 150, close: 134 })).toBe('trailing');
  });

  it('prefers the pessimistic barrier when several break at once', () => {
    // A day that is both below the stop and (via the high water) below the trail.
    expect(evaluateExit({ ...base, highWaterClose: 130, close: 89 })).toBe('stop_loss');
    // Trailing and take-profit together → trailing (the lower exit price).
    expect(evaluateExit({ ...base, highWaterClose: 140, close: 125 })).toBe('trailing');
    // Time and take-profit together → take-profit is the more specific reason.
    expect(evaluateExit({ ...base, close: 125, highWaterClose: 125, holdDays: 40 })).toBe('take_profit');
  });

  it('honours a reconfigured barrier set', () => {
    const c = cfg({ takeProfit: 0.3, stopLoss: 0.15, maxHoldDays: 10 });
    expect(evaluateExit({ ...base, close: 125, highWaterClose: 125 }, c)).toBeNull();
    expect(evaluateExit({ ...base, close: 130, highWaterClose: 130 }, c)).toBe('take_profit');
    expect(evaluateExit({ ...base, close: 86 }, c)).toBeNull(); // −14% is inside a −15% stop
    expect(evaluateExit({ ...base, close: 85 }, c)).toBe('stop_loss');
    expect(evaluateExit({ ...base, holdDays: 10 }, c)).toBe('time');
  });
});

describe('no look-ahead', () => {
  it('prices a post-close sighting at the NEXT session', () => {
    expect(earliestEntryDate('2026-01-05T13:00:00.000Z')).toBe('2026-01-05');
    expect(earliestEntryDate('2026-01-05T19:59:59.000Z')).toBe('2026-01-05');
    expect(earliestEntryDate('2026-01-05T20:00:00.000Z')).toBe('2026-01-06');
    expect(earliestEntryDate('2026-01-05T23:07:59.662Z')).toBe('2026-01-06');
  });

  it('reads the hour as UTC even without a zone marker (SQLite CURRENT_TIMESTAMP)', () => {
    expect(earliestEntryDate('2026-01-05 23:07:59')).toBe('2026-01-06');
    expect(earliestEntryDate('2026-01-05 09:07:59')).toBe('2026-01-05');
  });

  it('never opens a position before the day the signal was visible', () => {
    const days = calendar('2026-01-05', 10);
    // Deliberately falling prices before the signal: if the engine ever reached
    // back for a cheaper close, the entry price would be below 100.
    const prices = { AAA: path(days, [200, 180, 160, 140, 120, 100, 101, 102, 103, 104]) };
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: flat(days, 500),
        prices,
        candidates: [cand({ earliestDate: earliestEntryDate(`${days[5]}T13:00:00Z`) })],
      }),
    );
    const p = res.positions[0];
    expect(p.entryDate).toBe(days[5]);
    expect(p.entryPrice).toBeGreaterThanOrEqual(100);
    expect(p.entryDate >= days[5]).toBe(true);
  });

  it('slides a post-close signal one session forward in the simulation too', () => {
    const days = calendar('2026-01-05', 10);
    const prices = { AAA: path(days, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) };
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: flat(days, 500),
        prices,
        candidates: [cand({ earliestDate: earliestEntryDate(`${days[2]}T21:00:00Z`) })],
      }),
    );
    // Seen after the close on day 2 → filled on day 3's close (40), not day 2's (30).
    expect(res.positions[0].entryDate).toBe(days[3]);
    expect(res.positions[0].entryPrice).toBeCloseTo(applySlippage(40, 'buy', 5), 10);
  });
});

describe('determinism', () => {
  const build = (): PortfolioSimInput => {
    const days = calendar('2026-01-05', 40);
    return input({
      tradingDays: days,
      spy: path(days, days.map((_, i) => 500 + i * 0.7)),
      prices: {
        AAA: path(days, days.map((_, i) => 100 + Math.sin(i) * 8)),
        BBB: path(days, days.map((_, i) => 50 + i * 1.4)),
        CCC: path(days, days.map((_, i) => 20 - i * 0.35)),
      },
      candidates: [
        cand({ ticker: 'AAA', earliestDate: days[1], score: 76 }),
        cand({ ticker: 'BBB', earliestDate: days[2], score: 84 }),
        cand({ ticker: 'CCC', earliestDate: days[3], score: 91 }),
        cand({ ticker: 'AAA', earliestDate: days[20], score: 78 }),
      ],
    });
  };

  it('produces an identical curve, trade list and event log on a second run', () => {
    const a = simulatePortfolio(build());
    const b = simulatePortfolio(build());
    expect(b.equity).toEqual(a.equity);
    expect(b.positions).toEqual(a.positions);
    expect(b.events).toEqual(a.events);
  });

  it('is unaffected by the order candidates arrive in', () => {
    const base = build();
    const shuffled = { ...base, candidates: [...base.candidates].reverse() };
    expect(simulatePortfolio(shuffled).equity).toEqual(simulatePortfolio(base).equity);
  });
});

describe('book invariants', () => {
  it('keeps equity = cash + parked SPY + positions on every single day', () => {
    const days = calendar('2026-01-05', 30);
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: path(days, days.map((_, i) => 500 + i)),
        prices: { AAA: path(days, days.map((_, i) => 100 + i * 2)), BBB: path(days, days.map((_, i) => 40 - i * 0.5)) },
        candidates: [cand({ ticker: 'AAA', earliestDate: days[1] }), cand({ ticker: 'BBB', earliestDate: days[2] })],
      }),
    );
    expect(res.equity.length).toBe(days.length);
    for (const p of res.equity) {
      expect(Math.abs(p.equity - (p.cash + p.spyCashValue + p.positionsValue))).toBeLessThanOrEqual(0.01);
    }
  });

  it('never lets cash go negative, even when every signal fires at once', () => {
    const days = calendar('2026-01-05', 12);
    const tickers = Array.from({ length: 30 }, (_, i) => `T${String(i).padStart(2, '0')}`);
    const prices = Object.fromEntries(tickers.map((t) => [t, flat(days, 100)]));
    const res = simulatePortfolio(
      input({
        config: cfg({ cashPolicy: 'idle' }),
        tradingDays: days,
        spy: flat(days, 500),
        prices,
        candidates: tickers.map((t) => cand({ ticker: t, earliestDate: days[0], score: 90 })),
      }),
    );
    for (const p of res.equity) expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(res.events.some((e) => e.kind === 'skipped_no_cash')).toBe(true);
  });

  it('holds at most maxPositions and never two lots of one ticker', () => {
    const days = calendar('2026-01-05', 12);
    const tickers = Array.from({ length: 26 }, (_, i) => `T${String(i).padStart(2, '0')}`);
    const prices = Object.fromEntries(tickers.map((t) => [t, flat(days, 100)]));
    const res = simulatePortfolio(
      input({
        // Tiny, fixed weights so the CAP binds before the CASH does.
        config: cfg({ cashPolicy: 'idle', baseWeight: 0.03, maxWeight: 0.03, minWeight: 0.03 }),
        tradingDays: days,
        spy: flat(days, 500),
        prices,
        candidates: [
          ...tickers.map((t) => cand({ ticker: t, earliestDate: days[0], score: 80 })),
          // A second signal on an already-open ticker must NOT average up.
          cand({ ticker: 'T00', earliestDate: days[3], score: 90 }),
        ],
      }),
    );
    for (const p of res.equity) expect(p.openPositions).toBeLessThanOrEqual(DEFAULT_PORTFOLIO_CONFIG.maxPositions);
    expect(res.events.filter((e) => e.kind === 'skipped_cap').length).toBe(6);
    expect(res.positions.filter((p) => p.ticker === 'T00').length).toBe(1);
  });

  it('locks a ticker out for the cooldown after a sale', () => {
    const days = calendar('2026-01-05', 30);
    // Straight to a take-profit on day 2, then a fresh signal three days later.
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: flat(days, 500),
        prices: { AAA: path(days, [100, 100, 130, 130, 130, 130, 130, 130, 130, 130, 130]) },
        candidates: [
          cand({ ticker: 'AAA', earliestDate: days[0] }),
          cand({ ticker: 'AAA', earliestDate: days[4] }), // inside the 10-day cooldown
          cand({ ticker: 'AAA', earliestDate: days[15] }), // outside it
        ],
      }),
    );
    const entries = res.positions.map((p) => p.entryDate);
    expect(entries).toContain(days[0]);
    expect(entries).not.toContain(days[4]);
    expect(entries.length).toBe(2);
  });

  it('reproduces the benchmark as a plain SPY buy & hold', () => {
    const days = calendar('2026-01-05', 20);
    const spy = path(days, days.map((_, i) => 500 * 1.001 ** i));
    const res = simulatePortfolio(input({ tradingDays: days, spy }));
    const shares = 10_000 / applySlippage(spy[days[0]], 'buy', 5);
    for (const p of res.equity) {
      expect(p.benchmark).toBeCloseTo(Math.round(shares * spy[p.date] * 100) / 100, 2);
    }
  });

  it("tracks the index exactly while no signal fires (the 'spy' cash policy)", () => {
    const days = calendar('2026-01-05', 15);
    const spy = path(days, days.map((_, i) => 500 + i * 3));
    const res = simulatePortfolio(input({ tradingDays: days, spy }));
    for (const p of res.equity) expect(p.equity).toBeCloseTo(p.benchmark, 2);
  });

  it("leaves idle cash flat under the 'idle' policy", () => {
    const days = calendar('2026-01-05', 15);
    const res = simulatePortfolio(
      input({ config: cfg({ cashPolicy: 'idle' }), tradingDays: days, spy: path(days, days.map((_, i) => 500 + i * 3)) }),
    );
    for (const p of res.equity) expect(p.equity).toBeCloseTo(10_000, 6);
  });
});

describe('price gaps', () => {
  const days = calendar('2026-01-05', 15);

  it('slides an entry over a weekend to the next session with a price', () => {
    // 2026-01-10 is a Saturday; the signal lands there and must fill on Monday.
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: flat(days, 500),
        prices: { AAA: flat(days, 100) },
        candidates: [cand({ earliestDate: '2026-01-10' })],
      }),
    );
    expect(res.positions[0].entryDate).toBe('2026-01-12');
  });

  it('slides over a mid-week hole in the series', () => {
    const px = flat(days, 100);
    delete px[days[3]];
    delete px[days[4]];
    const res = simulatePortfolio(
      input({ tradingDays: days, spy: flat(days, 500), prices: { AAA: px }, candidates: [cand({ earliestDate: days[3] })] }),
    );
    expect(res.positions[0].entryDate).toBe(days[5]);
  });

  it('reports data_missing when the gap exceeds the search window', () => {
    const px: Record<string, number> = { [days[0]]: 100, [days[12]]: 100 };
    const res = simulatePortfolio(
      input({ tradingDays: days, spy: flat(days, 500), prices: { AAA: px }, candidates: [cand({ earliestDate: days[2] })] }),
    );
    expect(res.positions.length).toBe(0);
    expect(res.untradable).toEqual(['AAA']);
    expect(res.events.filter((e) => e.kind === 'data_missing').length).toBe(1);
  });

  it('treats a signal from the most recent session as pending, not missing', () => {
    // Seen on the last day in the calendar: its search window has not elapsed,
    // so there is nothing to conclude yet.
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: flat(days, 500),
        prices: { AAA: flat(days.slice(0, days.length - 1), 100) },
        candidates: [cand({ earliestDate: days[days.length - 1] })],
      }),
    );
    expect(res.untradable).toEqual([]);
    expect(res.events.filter((e) => e.kind === 'data_missing')).toEqual([]);
  });

  it('has no series at all → not tradable, and the ticker is named', () => {
    const res = simulatePortfolio(
      input({ tradingDays: days, spy: flat(days, 500), prices: {}, candidates: [cand({ ticker: 'GONE' })] }),
    );
    expect(res.untradable).toEqual(['GONE']);
    expect(res.positions.length).toBe(0);
  });

  it('closes a position whose series simply stops', () => {
    const long = calendar('2026-01-05', 25);
    const px: Record<string, number> = {};
    for (const d of long.slice(0, 6)) px[d] = 100;
    const res = simulatePortfolio(
      input({ tradingDays: long, spy: flat(long, 500), prices: { AAA: px }, candidates: [cand({ earliestDate: long[0] })] }),
    );
    expect(res.positions[0].exitReason).toBe('data_missing');
    expect(res.positions[0].exitPrice).toBeCloseTo(applySlippage(100, 'sell', 5), 10);
  });

  it('does not mark a ticker untradable when another sighting of it did trade', () => {
    const long = calendar('2026-01-05', 30);
    const px = flat(long, 100);
    delete px[long[20]];
    delete px[long[21]];
    delete px[long[22]];
    delete px[long[23]];
    delete px[long[24]];
    delete px[long[25]];
    delete px[long[26]];
    const res = simulatePortfolio(
      input({
        tradingDays: long,
        spy: flat(long, 500),
        prices: { AAA: px },
        candidates: [cand({ earliestDate: long[0] }), cand({ earliestDate: long[20] })],
      }),
    );
    expect(res.untradable).toEqual([]);
  });
});

describe('split safety', () => {
  const days = calendar('2026-01-05', 15);
  // A 2:1 split on day 5. RAW closes halve; ADJUSTED closes do not move at all.
  const raw = path(days, [100, 100, 100, 100, 100, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]);
  const adjusted = flat(days, 50);

  it('would stop out on raw closes', () => {
    const res = simulatePortfolio(
      input({ tradingDays: days, spy: flat(days, 500), prices: { AAA: raw }, candidates: [cand({ earliestDate: days[0] })] }),
    );
    expect(res.positions[0].exitReason).toBe('stop_loss');
  });

  it('does not stop out on adjusted closes', () => {
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: flat(days, 500),
        prices: { AAA: adjusted },
        candidates: [cand({ earliestDate: days[0] })],
      }),
    );
    expect(res.positions[0].exitReason).toBeNull();
  });
});

describe('trade alpha', () => {
  it('measures the benchmark over EXACTLY the same holding period', () => {
    const days = calendar('2026-01-05', 12);
    const res = simulatePortfolio(
      input({
        tradingDays: days,
        spy: path(days, [500, 505, 510, 515, 520, 525, 530, 535, 540, 545, 550, 555]),
        prices: { AAA: path(days, [100, 100, 100, 100, 125, 125, 125, 125, 125, 125, 125, 125]) },
        candidates: [cand({ earliestDate: days[0] })],
      }),
    );
    const closed = toClosedPosition(res.positions[0]);
    expect(closed.exitReason).toBe('take_profit');
    expect(closed.spyEntry).toBe(500);
    expect(closed.spyExit).toBe(520);
    // Position ≈ +24.9% after two-sided slippage, SPY +4% over the same 4 days.
    expect(closed.tradeAlpha).toBeCloseTo(closed.returnPct - 0.04, 10);
    expect(closed.holdDays).toBe(diffDaysYmd(days[0], days[4]));
  });
});

describe('statistics', () => {
  const days = calendar('2026-01-05', 40);
  const res = simulatePortfolio(
    input({ tradingDays: days, spy: path(days, days.map((_, i) => 500 * 1.002 ** i)) }),
  );
  const stats = computeStats(res.equity, [], []);

  it('reports n/a plus the days still missing for windows longer than the history', () => {
    const w6m = stats.windows.find((w) => w.key === '6m');
    const w1y = stats.windows.find((w) => w.key === '1y');
    expect(w6m?.portfolio).toBeNull();
    expect(w6m?.benchmark).toBeNull();
    expect(w6m?.daysRemaining).toBeGreaterThan(0);
    expect(w1y?.daysRemaining).toBeGreaterThan(w6m!.daysRemaining!);
  });

  it('computes the windows it does have history for', () => {
    const w7 = stats.windows.find((w) => w.key === '7d');
    const max = stats.windows.find((w) => w.key === 'max');
    expect(w7?.portfolio).not.toBeNull();
    expect(max?.portfolio).not.toBeNull();
    expect(max?.daysRemaining).toBeNull();
  });

  it('withholds CAGR under 90 days and Sharpe under 60', () => {
    expect(stats.cagr.portfolio).toBeNull();
    expect(stats.cagr.daysRemaining).toBeGreaterThan(0);
    expect(stats.sharpe.portfolio).toBeNull();
  });

  it('returns nothing rather than zeros for an empty curve', () => {
    const s = computeStats([], [], []);
    expect(s.spanDays).toBe(0);
    expect(s.windows.every((w) => w.portfolio === null)).toBe(true);
    expect(s.trades.winRate).toBeNull();
    expect(s.trades.avgTradeAlpha).toBeNull();
  });

  it('measures drawdown peak-to-trough', () => {
    const curve = [1000, 1200, 900, 1100].map((v, i) => ({
      date: addDaysYmd('2026-01-05', i),
      cash: 0,
      spyCashValue: 0,
      positionsValue: v,
      equity: v,
      equityIdle: v,
      benchmark: 1000,
      openPositions: 0,
    }));
    const s = computeStats(curve, [], []);
    expect(s.maxDrawdown.portfolio).toBeCloseTo(-0.25, 10);
    expect(s.maxDrawdown.benchmark).toBeCloseTo(0, 10);
  });
});

describe('helpers', () => {
  it('rebases a series to 0% at its first point', () => {
    const r = rebase([100, 110, 90]);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(0.1, 10);
    expect(r[2]).toBeCloseTo(-0.1, 10);
    expect(rebase([0, 5])).toEqual([0, 0]);
  });

  it('does UTC calendar maths, not local', () => {
    expect(addDaysYmd('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDaysYmd('2026-01-05', '2026-02-04')).toBe(30);
  });

  it('finds the first tradable day within the search window', () => {
    const days = calendar('2026-01-05', 10);
    const prices = { AAA: { [days[6]]: 10, [days[7]]: 11 } };
    expect(firstTradableDay('AAA', days[5], days, prices)).toBe(days[6]);
    // days[0] is 8 calendar days before the first close — past the search window.
    expect(firstTradableDay('AAA', days[0], days, prices)).toBeNull();
    expect(firstTradableDay('ZZZ', days[0], days, prices)).toBeNull();
  });
});
