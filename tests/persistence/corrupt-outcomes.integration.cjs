// Known-corrupt outcome labels are archived once and removed on every open, so
// a device that re-imports them cannot bring them back; recomputed labels stay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../../tmp/experiment-db-test.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corrupt-outcomes-'));
const insert = (c, date, horizon, computedAt) => c.prepare(`INSERT INTO signal_outcomes(ticker,entry_date,horizon,entry_price,exit_price,ret,spy_ret,alpha,score,computed_at)
  VALUES('YYAI',?,?,8.11,182.2,21.47,0,21.47,10.3,?)`).run(date, horizon, computedAt);
const keys = (c) => c.prepare("SELECT entry_date||'|'||horizon k FROM signal_outcomes WHERE ticker='YYAI' ORDER BY 1").all().map(r => r.k);
const archived = (c) => c.prepare("SELECT state_json FROM portfolio_revisions WHERE reason LIKE 'corrupt-outcome-labels:YYAI:%'").all();
try {
  const file = path.join(root, 'history.db');
  let c = db.initDatabase(file);
  insert(c, '2026-07-10', 5, '2026-08-16T08:43:31Z');
  insert(c, '2026-07-10', 10, '2026-08-23T17:25:24Z');
  insert(c, '2026-07-11', 60, '2026-09-09T22:43:06Z');
  db.closeDatabase(); c = db.initDatabase(file);
  assert.deepEqual(keys(c), ['2026-07-10|5']);
  assert.equal(archived(c).length, 1);
  assert.deepEqual(JSON.parse(archived(c)[0].state_json).map(r => `${r.entry_date}|${r.horizon}`), ['2026-07-10|10', '2026-07-11|60']);
  // Re-imported by another device, plus a label recomputed after the price screen.
  insert(c, '2026-07-10', 10, '2026-08-23T17:25:24Z');
  insert(c, '2026-07-11', 20, '2026-11-20T10:00:00Z');
  db.closeDatabase(); c = db.initDatabase(file);
  assert.deepEqual(keys(c), ['2026-07-10|5', '2026-07-11|20']);
  assert.equal(archived(c).length, 1);
  console.log('PASS: corrupt labels archived once, removed on every open; 5-day and recomputed labels kept.');
} finally { db.closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); }
