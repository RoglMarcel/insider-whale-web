import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('trial migration preserves existing licenses, sessions and foreign keys', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync(new URL('../../drizzle/0000_access.sql', import.meta.url), 'utf8'));
    for (const [i, duration] of ['4weeks', '6months', '1year', 'lifetime'].entries()) {
      db.prepare('INSERT INTO access_keys VALUES(?,?,?,?,?,?,?,?,?)').run(`key-${i}`, `hash-${i}`, `hint-${i}`, duration, 'Existing customer', 100, i ? 200 : null, i === 3 ? null : 300, i === 2 ? 250 : null);
      db.prepare('INSERT INTO access_sessions VALUES(?,?,?,?)').run(`session-${i}`, 'member', `key-${i}`, 300);
    }
    db.prepare('INSERT INTO access_sessions VALUES(?,?,?,?)').run('owner-session', 'admin', null, 500);
    const keys = db.prepare('SELECT * FROM access_keys ORDER BY id').all().map(key => ({...key}));
    const sessions = db.prepare('SELECT * FROM access_sessions ORDER BY token_hash').all();
    db.exec('BEGIN');
    db.exec(readFileSync(new URL('../../drizzle/0001_trial_keys.sql', import.meta.url), 'utf8'));
    db.exec('COMMIT');
    assert.deepEqual(db.prepare('SELECT * FROM access_keys ORDER BY id').all().map(({trial_days, ...key}) => {
      assert.equal(trial_days, null); return key;
    }), keys);
    assert.deepEqual(db.prepare('SELECT * FROM access_sessions ORDER BY token_hash').all(), sessions);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.throws(() => db.prepare('UPDATE access_keys SET trial_days=4 WHERE id=?').run('key-0'), /CHECK/);
  } finally { db.close(); }
});
