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
  db.initDatabase(file);
  const candidate = { ticker: 'TEST', earliestDate: '2026-09-01', score: 80, signalId: 1, source: 'signal' };
  assert.deepEqual(db.archiveExperimentCandidates('test-v1', [candidate]), [candidate]);
  db.setPortfolioExperiment({ id: 'test-v1', definedAt: '2026-09-23', state: { equity: [{ date: '2026-09-01', equity: 10000 }] } });
  db.closeDatabase();
  db.initDatabase(file);
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
