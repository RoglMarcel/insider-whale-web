import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase, getDb, insertSignal, setPortfolioConfig, replacePriceSeries, getPortfolioPositions } from '../electron/database';
import { makePriceVintage } from '../electron/priceCache';
import { syncPortfolio } from '../electron/portfolio';
import { getBacktestState } from '../electron/backtest';
import { sampleSignals } from '../src/lib/sampleData';

/** Exercise the production sync using only cached fixture prices: no network. */
async function verify(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backtest-sync-'));
  try {
    initDatabase(path.join(dir, 'sync.db'));
    const date = (days: number) => new Date(Date.parse('2026-09-01T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
    const seed = (later: boolean) => {
      for (const ticker of ['SPY', 'TEST']) replacePriceSeries(makePriceVintage({ ticker,
        fetchedAt: new Date(Date.now() - (later ? 0 : 1000)).toISOString(), providerSymbol: ticker,
        metadata: { symbol: ticker, currency: 'USD', exchangeName: 'NMS' }, basis: 'yahoo-adjusted-close', corporateActions: null, issues: [],
        points: [{ date: date(1), px: ticker === 'SPY' ? 500 : 100 }, ...(later ? [{ date: date(11), px: ticker === 'SPY' ? 525 : 110 }] : [])] }));
    };
    setPortfolioConfig({ inceptionDate: date(0), maxHoldDays: 5 });
    insertSignal({ ...sampleSignals[0], ticker: 'TEST', scrapedAt: date(0) + 'T12:00:00Z', score: 80 });
    seed(false);
    assert.equal((await syncPortfolio()).ok, true);
    let state = getBacktestState();
    assert.equal(state.records.length, 1);
    // This fixture is reconstructed today with a past observed date. It must
    // honestly report missing contemporaneous evidence, not backdate capture.
    assert(state.records.every(r => r.status === 'open' && r.snapshot.provenance === 'missing'));
    const originals = new Map(state.records.map(r => [r.key, JSON.stringify(r.snapshot)]));
    // Expire all alert/outcome source rows while the positions are still open.
    getDb().exec('DELETE FROM signals; DELETE FROM signal_outcomes');
    seed(true);
    assert.equal((await syncPortfolio()).ok, true);
    state = getBacktestState();
    assert.equal(state.records.length, 1);
    assert(state.records.every(r => r.status === 'complete' && r.trades.length === 2));
    assert(state.records.every(r => originals.get(r.key) === JSON.stringify(r.snapshot)));
    assert.equal(getPortfolioPositions()[0].entryDate, date(1));
    assert.equal(getPortfolioPositions()[0].exitDate, date(11));
    const saved = state.records;
    assert.equal((await syncPortfolio()).ok, true);
    assert.deepEqual(getBacktestState().records, saved);
    closeDatabase(); initDatabase(path.join(dir, 'sync.db'));
    assert.deepEqual(getBacktestState().records, saved);
    console.log('Production portfolio sync: historical buys with honest evidence labels, retained entries after source expiry, closure/analysis, idempotence and restart passed. No network requests.');
  } finally { closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
