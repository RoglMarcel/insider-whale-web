import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import { createAccessService, expiration, digest, normalizeKey } from '../../access/service.mjs';

let sql, db, api, now;
const password = 'test-owner-password';
const verifier = ['pbkdf2',100000,'test-salt',pbkdf2Sync(password,'test-salt',100000,32,'sha256').toString('hex')].join('$');
function adapter(sql) {
  return { prepare(query) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return sql.prepare(query).get(...args) ?? null; }, async run() { return sql.prepare(query).run(...args); }, async all() { return { results: sql.prepare(query).all(...args) }; } };
  }, async batch(statements) {
    sql.exec('BEGIN IMMEDIATE');
    try { const result = []; for (const statement of statements) result.push(await statement.all()); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
}
beforeEach(() => {
  now = Date.UTC(2026,0,31,14,15,16);
  sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON'); sql.exec(readFileSync(new URL('../../drizzle/0000_access.sql',import.meta.url),'utf8'));
  db = adapter(sql); api = createAccessService({ DB: db, ADMIN_PASSWORD_HASH: verifier }, () => now);
});
afterEach(() => sql.close());
async function request(path, data, cookie, origin = 'https://terminal.test') {
  const headers = { Origin: origin, 'CF-Connecting-IP': '192.0.2.1' };
  if (cookie) headers.Cookie = cookie;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  return api.handle(new Request('https://terminal.test/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data) }));
}
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0];
async function login() { const r = await request('admin/login',{password}); assert.equal(r.status,200); return cookieOf(r); }
async function generate(duration = '4weeks', quantity = 1) {
  const admin = await login(); const r = await request('admin/keys',{duration,quantity,label:'Test cohort'},admin); assert.equal(r.status,201); return { admin, ...(await r.json()) };
}
test('anonymous visitors cannot generate, list or revoke keys; session stays locked',async () => {
  assert.equal((await request('admin/keys')).status,401);
  assert.equal((await request('admin/keys',{duration:'lifetime'})).status,401);
  assert.equal((await request('admin/keys/12345678-1234-1234-1234-123456789abc/revoke',{})).status,401);
  assert.deepEqual(await (await request('access/session')).json(),{session:null});
});
test('admin password is checked server-side; cookies are opaque, secure and HttpOnly',async () => {
  assert.equal((await request('admin/login',{password:'wrong'})).status,401);
  const r = await request('admin/login',{password});
  assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const session = await (await request('admin/session',undefined,cookieOf(r))).json(); assert.equal(session.session.role,'admin');
  now += 8*60*60_000; assert.equal((await (await request('admin/session',undefined,cookieOf(r))).json()).session,null);
});
test('generation stores only digests; unused keys never start or expire',async () => {
  const {admin,keys} = await generate('6months',2);
  assert.notEqual(keys[0].key,keys[1].key); assert.match(keys[0].key,/^IWT-(?:[A-HJ-NP-Z2-9]{8}-){3}[A-HJ-NP-Z2-9]{8}$/);
  const stored = sql.prepare('SELECT * FROM access_keys').all(); assert.equal(stored.length,2);
  assert.equal(stored[0].activated_at,null); assert.equal(stored[0].expires_at,null);
  assert.ok(!JSON.stringify(stored).includes(keys[0].key));
  const overview = await (await request('admin/keys',undefined,admin)).json();
  assert.equal(overview.stats.find(p=>p.duration==='6months').used,0);
  assert.equal(overview.stats.find(p=>p.duration==='6months').unused,2);
  assert.ok(!JSON.stringify(overview).includes('key_hash')); assert.ok(!JSON.stringify(overview).includes(keys[0].key));
});
test('4-week access starts on first redemption and stops exactly at expiry, including old cookies',async () => {
  const {keys} = await generate(); now += 100*86_400_000;
  const activated = now, first = await request('access/activate',{key:keys[0].key}); assert.equal(first.status,200);
  const user = cookieOf(first), data = await first.json(); assert.equal(data.session.expiresAt,activated+28*86_400_000);
  now += 27*86_400_000; assert.ok((await (await request('access/session',undefined,user)).json()).session);
  const again = await request('access/activate',{key:keys[0].key.toLowerCase().replaceAll('-',' ')}); assert.equal((await again.json()).session.expiresAt,activated+28*86_400_000);
  now = activated+28*86_400_000;
  assert.equal((await (await request('access/session',undefined,user)).json()).session,null);
  assert.equal((await request('access/activate',{key:keys[0].key})).status,401);
});
test('calendar month/year terms clamp month ends and leap days in UTC',() => {
  const jan31 = Date.UTC(2026,0,31,13,1,2), leapDay = Date.UTC(2024,1,29,13,1,2);
  assert.equal(expiration('6months',jan31),Date.UTC(2026,6,31,13,1,2));
  assert.equal(expiration('6months',Date.UTC(2026,7,31)),Date.UTC(2027,1,28));
  assert.equal(expiration('1year',leapDay),Date.UTC(2025,1,28,13,1,2));
  assert.equal(expiration('lifetime',jan31),null);
});
test('concurrent first uses keep one activation timestamp and one expiry',async () => {
  const {keys} = await generate('1year');
  const replies = await Promise.all([request('access/activate',{key:keys[0].key}),request('access/activate',{key:keys[0].key})]);
  const data = await Promise.all(replies.map(r=>r.json()));
  assert.equal(data[0].session.expiresAt,data[1].session.expiresAt);
  const row = sql.prepare('SELECT activated_at FROM access_keys').get(); assert.equal(row.activated_at,now);
});
test('lifetime keys keep no expiry; fresh sessions work years later',async () => {
  const {keys} = await generate('lifetime');
  const first = await request('access/activate',{key:keys[0].key}); assert.equal((await first.json()).session.expiresAt,null);
  now += 15*365*86_400_000;
  const again = await request('access/activate',{key:keys[0].key}); assert.equal(again.status,200); assert.equal((await again.json()).session.expiresAt,null);
});
test('revocation invalidates every session and future redemption immediately',async () => {
  const {admin,keys} = await generate('lifetime');
  const a = cookieOf(await request('access/activate',{key:keys[0].key}));
  const b = cookieOf(await request('access/activate',{key:keys[0].key}));
  assert.equal((await request(`admin/keys/${keys[0].id}/revoke`,{},admin)).status,200);
  for (const user of [a,b]) assert.equal((await (await request('access/session',undefined,user)).json()).session,null);
  assert.equal((await request('access/activate',{key:keys[0].key})).status,401);
});
test('members cannot use admin APIs; forged cookies grant no access',async () => {
  const {keys} = await generate(); const user = cookieOf(await request('access/activate',{key:keys[0].key}));
  assert.equal((await request('admin/keys',undefined,user)).status,401);
  assert.equal((await (await request('access/session',undefined,'iwt_session='+'a'.repeat(64))).json()).session,null);
});
test('cross-origin mutations and oversized requests are rejected',async () => {
  assert.equal((await request('admin/login',{password},undefined,'https://evil.test')).status,403);
  assert.equal((await request('admin/login',{password:'a'.repeat(9000)})).status,413);
});
test('login brute-force limit persists across service instances',async () => {
  for(let i=0;i<10;i++) assert.equal((await request('admin/login',{password:'wrong'})).status,401);
  api = createAccessService({DB:db,ADMIN_PASSWORD_HASH:verifier},()=>now);
  const blocked = await request('admin/login',{password}); assert.equal(blocked.status,429); assert.equal(blocked.headers.get('retry-after'),'900');
  now+=16*60_000; assert.equal((await request('admin/login',{password})).status,200);
});
test('usage statistics distinguish used, unused, expired and revoked in all four plans',async () => {
  const admin = await login(); const keys=[];
  for(const duration of ['4weeks','6months','1year','lifetime']) {
    const r=await request('admin/keys',{duration,quantity:4},admin); keys.push(...(await r.json()).keys);
  }
  for(let i=0;i<keys.length;i+=4) {
    await request('access/activate',{key:keys[i].key});
    await request('access/activate',{key:keys[i+1].key});
    await request(`admin/keys/${keys[i+1].id}/revoke`,{},admin);
  }
  now+=29*86_400_000; const fresh=await login();
  const overview=await (await request('admin/keys',undefined,fresh)).json();
  for(const stat of overview.stats) { assert.equal(stat.generated,4);assert.equal(stat.used,2);assert.equal(stat.unused,2);assert.equal(stat.revoked,1); }
  assert.equal(overview.stats[0].expired,1);assert.equal(overview.stats[0].active,0);assert.equal(overview.stats[3].active,1);
});
test('pagination, literal search, bounds and invalid plans',async () => {
  const {admin}=await generate('lifetime',55);
  const page=await (await request('admin/keys?page=2&status=unused&search=Test',undefined,admin)).json();
  assert.equal(page.keys.length,5);assert.equal(page.total,55);
  for(const data of [{duration:'forever'},{duration:'1year',quantity:101},{duration:'4weeks',quantity:0},{duration:'lifetime',label:'x'.repeat(81)}]) assert.equal((await request('admin/keys',data,admin)).status,400);
  const search=await (await request('admin/keys?search=%25',undefined,admin)).json();assert.equal(search.total,0);
});
test('logout revokes server session and cleanup removes expired sessions while keeping audit counts',async () => {
  const {keys}=await generate(); const response=await request('access/activate',{key:keys[0].key}); const user=cookieOf(response);
  assert.equal((await request('access/logout',{},user)).status,200);
  assert.equal((await (await request('access/session',undefined,user)).json()).session,null);
  await request('access/activate',{key:keys[0].key});now+=31*86_400_000;await api.cleanup();
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM access_sessions').get().n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM access_keys').get().n,1);
});
test('server without its password verifier fails closed',async () => {
  api=createAccessService({DB:db},()=>now);assert.equal((await request('admin/login',{password})).status,503);
});

test('password derivation stays within the hosted WebCrypto iteration cap',async () => {
  const derive = crypto.subtle.deriveBits;
  crypto.subtle.deriveBits = function(algorithm,key,length) {
    assert.ok(algorithm.iterations <= 100000, 'Workers rejects larger PBKDF2 calls');
    return derive.call(this,algorithm,key,length);
  };
  try { assert.equal((await request('admin/login',{password})).status,200); }
  finally { crypto.subtle.deriveBits=derive; }
});
