import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { closeDatabase, getDb, getPortfolioConfig, getPriceBook, initDatabase, insertSignal,
  replacePriceSeries, SCHEMA, setPortfolioConfig, upsertPriceRows } from '../electron/database';
import { makePriceVintage, storePriceVintage } from '../electron/priceCache';
import { mergeSharedHistory } from '../electron/sharedHistory';
import { getPortfolioState, syncPortfolio, writePortfolioJson } from '../electron/portfolio';
import { sampleSignals } from '../src/lib/sampleData';

async function verify(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simulation-repair-'));
  const file = path.join(root, 'local.db');
  const snapshot = (ticker: string, values: number[], fetchedAt = new Date().toISOString()) => makePriceVintage({ ticker,
    fetchedAt, basis: 'yahoo-adjusted-close', providerSymbol: ticker,
    metadata: { symbol: ticker, currency: 'USD', exchangeName: 'NMS' }, corporateActions: null, issues: [],
    points: values.map((px, i) => ({ date: `2026-09-0${i+1}`, px })) });
  try {
    initDatabase(file);
    upsertPriceRows([{ ticker: 'TEST', date: '2026-09-01', adjClose: 1 }, { ticker: 'TEST', date: '2026-09-02', adjClose: 50 }]);
    replacePriceSeries(snapshot('TEST', [1,50,51], '2026-10-01T00:00:00Z'));
    assert.deepEqual(getPriceBook(['TEST'], '2026-01-01'), {});
    assert.equal(getDb().prepare('SELECT COUNT(*) AS n FROM price_vintages').get() && getDb().prepare('SELECT COUNT(*) AS n FROM price_vintages').pluck().get(), 1);
    assert(getDb().prepare("SELECT 1 FROM portfolio_revisions WHERE reason='legacy-price-cache:TEST'").get());
    closeDatabase(); initDatabase(file);
    assert.deepEqual(getPriceBook(['TEST'], '2026-01-01'), {});
    const remote = path.join(root, 'remote.db');
    const source = new Database(remote); source.exec(SCHEMA);
    source.prepare('INSERT INTO price_history VALUES(?,?,?,?)').run('TEST', '2026-09-02', 50, '2026-10-02T00:00:00Z');
    source.close();
    mergeSharedHistory(getDb(), remote);
    assert.deepEqual(getPriceBook(['TEST'], '2026-01-01'), {}); // legacy cannot resurrect
    const corrected = new Database(remote);
    storePriceVintage(corrected, snapshot('TEST', [50,51], '2026-10-03T00:00:00Z'));
    corrected.close();
    mergeSharedHistory(getDb(), remote);
    assert.deepEqual(getPriceBook(['TEST'], '2026-01-01').TEST, { '2026-09-01': 50, '2026-09-02': 51 });
    assert.throws(() => upsertPriceRows([{ ticker: 'TEST', date: '2026-09-03', adjClose: 1 }]), /complete price vintage/);
    assert.equal(getDb().prepare('SELECT COUNT(*) FROM price_vintages').pluck().get(), 2);

    // Real orchestrator, no provider calls. Equal-date caches are fresh.
    const seed = (prices: number[]) => {
      replacePriceSeries(snapshot('TEST', prices));
      replacePriceSeries(snapshot('SPY', prices.map(() => 500)));
    };
    setPortfolioConfig({ inceptionDate: '2026-09-01', profitFloor: .1, exitExecution: 'next_close' });
    assert.throws(() => setPortfolioConfig({ profitFloor: .3 }), /below trailing/);
    insertSignal({ ...sampleSignals[0], ticker: 'TEST', scrapedAt: '2026-09-01T12:00:00Z', score: 80 });
    seed([100,120,110]);
    assert((await syncPortfolio()).ok);
    const original = getPortfolioState();
    assert(original.meta.provenance?.runId);
    assert.equal(original.open[0].highWaterClose, 120);
    seed([100,115,105]);
    // A price refresh alone cannot change an already-published run's marks.
    assert.equal(getPortfolioState().open[0].lastPrice, 110);
    assert((await syncPortfolio()).ok);
    const replay = getPortfolioState();
    assert.equal(replay.open[0].lastPrice, 105);
    assert.notEqual(original.meta.provenance?.runId, replay.meta.provenance?.runId);
    assert.equal(replay.equity.at(-1)!.positionsValue, Math.round(replay.open[0].marketValue * 100) / 100);
    const revision = getDb().prepare("SELECT state_json FROM portfolio_revisions WHERE reason LIKE 'before-replay:%' ORDER BY saved_at DESC LIMIT 1").get() as { state_json: string };
    assert.equal(JSON.parse(revision.state_json).open[0].lastPrice, 110);
    writePortfolioJson(root);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8')).meta.provenance, replay.meta.provenance);
    assert((await syncPortfolio()).ok);
    assert.equal(getPortfolioState().meta.provenance?.runId, replay.meta.provenance?.runId);
    closeDatabase(); initDatabase(file);
    assert.equal(getPortfolioState().open[0].highWaterClose, 115);
    assert.equal(getPortfolioConfig().profitFloor, .1);
    assert.equal(getPortfolioConfig().exitExecution, 'next_close');
    console.log('Simulation repair: quarantine/recovery, legacy/shared merge, coherent replay, immutable prior marks, config, publication and SQLite restart passed.');
  } finally { closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
