import { describe, expect, it } from 'vitest';
import { expectedPriceSession, shouldRefreshPrices } from '../src/lib/price-freshness';

describe('portfolio price freshness', () => {
  it('retries Friday prices on Tuesday even when fetched earlier that UTC day', () => {
    expect(shouldRefreshPrices({ last: '2026-10-23', fetchedAt: '2026-10-27T06:30:00Z' }, new Date('2026-10-27T12:00:00Z'), true, '2026-10-23')).toBe(true);
  });
  it('bounds repeated requests but immediately catches up lagging equities', () => {
    const cov = { last: '2026-10-23', fetchedAt: '2026-10-27T12:00:00Z' };
    const now = new Date('2026-10-27T12:10:00Z');
    expect(shouldRefreshPrices(cov, now, true, cov.last)).toBe(false);
    expect(shouldRefreshPrices(cov, now, false, '2026-10-26')).toBe(true);
    expect(shouldRefreshPrices(undefined, now, true, '')).toBe(true);
  });
  it('expects Monday closes on Tuesday morning, with a post-close publication grace period', () => {
    expect(expectedPriceSession(new Date('2026-10-27T12:42:00Z'))).toBe('2026-10-26');
    expect(expectedPriceSession(new Date('2026-10-26T20:15:00Z'))).toBe('2026-10-23');
    expect(expectedPriceSession(new Date('2026-10-26T20:31:00Z'))).toBe('2026-10-26');
  });
  it('handles weekends, holidays, early closes and daylight saving', () => {
    expect(expectedPriceSession(new Date('2026-10-25T12:00:00Z'))).toBe('2026-10-23');
    expect(expectedPriceSession(new Date('2026-09-07T23:00:00Z'))).toBe('2026-09-04');
    expect(expectedPriceSession(new Date('2026-04-03T23:00:00Z'))).toBe('2026-04-02');
    expect(expectedPriceSession(new Date('2026-11-27T18:31:00Z'))).toBe('2026-11-27');
    expect(expectedPriceSession(new Date('2026-11-02T20:45:00Z'))).toBe('2026-10-30');
  });
});
