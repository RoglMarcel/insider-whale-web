// Real SQLite close/reopen verifies the experiment survives process restarts
// and rolling source pruning without changing its first-observed candidates.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../../tmp/experiment-db-test.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-experiment-'));
try {
  const file = path.join(root, 'history.db');
  const connection = db.initDatabase(file);
  const candidate = { ticker: 'TEST', earliestDate: '2026-09-01', score: 80, signalId: 1, source: 'signal' };
  assert.deepEqual(db.archiveExperimentCandidates('test-v1', [candidate]), [candidate]);
  db.setPortfolioExperiment({ id: 'test-v1', definedAt: '2026-09-23', state: { equity: [{ date: '2026-09-01', equity: 10000 }] } });
  connection.exec("INSERT INTO signals(ticker,score,scraped_at) VALUES ('NVDAEARNINGS',80,'2026-09-25T12:00:00Z'), ('CYBN',80,'2026-09-25T12:00:00Z'), ('HELP',75,'2026-09-25T13:00:00Z')");
  db.archivePortfolioRevision('ticker-cleanup-v1', { equity: [10000], open: ['ORIGINAL'] });
  db.archivePortfolioRevision('ticker-cleanup-v1', { equity: [0] });
  db.closeDatabase();
  const reopened = db.initDatabase(file);
  assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM signals').get().n, 3);
  assert.equal(reopened.prepare("SELECT reason FROM ticker_quarantine WHERE ticker='NVDAEARNINGS'").get().reason, 'non_symbol_text');
  assert.deepEqual(db.getLatestSignals().map(s => s.ticker), ['HELP']);
  assert.equal(db.getLatestSignals()[0].score, 75);
  assert.deepEqual(JSON.parse(reopened.prepare("SELECT state_json FROM portfolio_revisions WHERE reason='ticker-cleanup-v1'").get().state_json), { equity: [10000], open: ['ORIGINAL'] });

  assert.equal(db.getPortfolioExperiment('test-v1').state.equity[0].equity, 10000);
  assert.deepEqual(db.archiveExperimentCandidates('test-v1', []), [candidate]);
  assert.deepEqual(db.archiveExperimentCandidates('test-v1', [{ ...candidate, score: 99 }]), [candidate]);
  const next = { ...candidate, earliestDate: '2026-09-10', score: 76 };
  assert.deepEqual(db.archiveExperimentCandidates('test-v1', [next]), [candidate, next]);
  assert.deepEqual(db.archiveExperimentCandidates('another-experiment', []), []);
  assert.equal(db.getPortfolioExperiment('missing'), null);
  console.log('Experiment snapshot, archived candidates, first-observed scores and isolation survive SQLite reopen.');
} finally {
  db.closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
}
