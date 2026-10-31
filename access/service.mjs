/** Key licensing API. D1 owns all authority; browser state never grants access. */
const encoder = new TextEncoder();
const DAY = 86_400_000;
export const DURATIONS = ['4weeks', '6months', '1year', 'lifetime', '3days'];
export class AccessError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export const normalizeKey = value => typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
export function expiration(duration, now) {
  if (duration === 'lifetime') return null;
  if (duration === '3days') return now + 3 * DAY;
  if (duration === '4weeks') return now + 28 * DAY;
  const date = new Date(now), day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (duration === '6months' ? 6 : 12));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
export function keyStatus(key, now) {
  return key.revoked_at !== null ? 'revoked' : key.activated_at === null ? 'unused' : key.expires_at !== null && key.expires_at <= now ? 'expired' : 'active';
}
// A nullable trial cap extends the immutable legacy duration constraint without
// rebuilding keys or their session references. Public/API terms stay explicit.
const effectiveDuration = key => key.trial_days === 3 ? '3days' : key.duration;
function publicKey(key, now) {
  return { id: key.id, hint: key.hint, duration: effectiveDuration(key), label: key.label,
    createdAt: key.created_at, activatedAt: key.activated_at, expiresAt: key.expires_at,
    revokedAt: key.revoked_at, status: keyStatus(key, now) };
}
async function passwordMatches(password, verifier) {
  const [scheme, count, salt, hash] = (verifier || '').split('$');
  if (scheme !== 'pbkdf2' || Number(count) !== 100000 || !salt || !/^[a-f0-9]{64}$/.test(hash || '')) throw new AccessError(503, 'Admin access is not configured.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  // Workers' WebCrypto caps PBKDF2 at 100,000 iterations; verifier stays a runtime secret.
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: Number(count), hash: 'SHA-256' }, material, 256);
  const candidate = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  let difference = 0;
  for (let i = 0; i < hash.length; i++) difference |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return difference === 0;
}
function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(p => p.trim().split('=')).filter(p => p.length === 2));
}
function cookie(name, token, maxAge, persistent = true) {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict${persistent ? `; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}` : ''}`;
}
function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
async function body(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new AccessError(415, 'Send JSON.');
  // Bounded streaming read, including requests without Content-Length.
  const reader = request.body?.getReader(); let size = 0, chunks = [];
  if (reader) while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new AccessError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed;
  } catch { throw new AccessError(400, 'Invalid request.'); }
}
export function createAccessService(env, clock = Date.now) {
  const db = env.DB;
  async function throttle(request, category, limit) {
    const now = clock();
    // Cloudflare overwrites this header. Never trust a client-supplied X-Forwarded-For.
    const identity = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bucket = await digest(`${category}:${identity}:${Math.floor(now / (15 * 60_000))}`);
    const row = await db.prepare('INSERT INTO access_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket, now + 30 * 60_000).first();
    if (row.attempts > limit) throw new AccessError(429, 'Too many attempts. Try again in 15 minutes.');
  }
  async function sessionFromToken(token, role) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    const row = await db.prepare(`SELECT s.role,s.key_id,s.expires_at AS session_expiry,k.duration,k.trial_days,k.expires_at,k.revoked_at,k.activated_at
      FROM access_sessions s LEFT JOIN access_keys k ON k.id=s.key_id
      WHERE s.token_hash=? AND s.role=? AND s.expires_at>?`).bind(await digest(token), role, clock()).first();
    if (!row) return null;
    if (role === 'member' && (row.activated_at === null || row.revoked_at !== null || (row.expires_at !== null && row.expires_at <= clock()))) return null;
    return { role: row.role, expiresAt: role === 'admin' ? row.session_expiry : row.expires_at,
      sessionExpiresAt: row.session_expiry, duration: effectiveDuration(row) ?? null };
  }
  async function session(request, adminOnly = false) {
    const c = cookies(request);
    if (!adminOnly) { const member = await sessionFromToken(c.iwt_session, 'member'); if (member) return member; }
    return sessionFromToken(c.iwt_admin, 'admin');
  }
  async function requireAdmin(request) {
    if (!await session(request, true)) throw new AccessError(401, 'Sign in to manage access keys.');
  }
  async function cleanup() {
    const now = clock();
    await db.batch([
      db.prepare('DELETE FROM access_sessions WHERE expires_at<=? OR key_id IN (SELECT id FROM access_keys WHERE revoked_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at<=?))').bind(now, now),
      db.prepare('DELETE FROM access_rate_limits WHERE expires_at<=?').bind(now),
    ]);
  }
  async function handle(request) {
    try {
      if (!db) throw new AccessError(503, 'Access service is not available.');
      const url = new URL(request.url), path = url.pathname, now = clock();
      if (request.method !== 'GET') {
        if (request.method !== 'POST') throw new AccessError(405, 'Method not allowed.');
        if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new AccessError(403, 'Request origin is not allowed.');
      }
      if (path === '/api/access/session' && request.method === 'GET') return json({ session: await session(request) });
      if (path === '/api/admin/session' && request.method === 'GET') return json({ session: await session(request, true) });
      if (path === '/api/access/activate' && request.method === 'POST') {
        await throttle(request, 'activate', 30);
        const data = await body(request), normalized = normalizeKey(data.key);
        if (data.rememberDevice !== undefined && typeof data.rememberDevice !== 'boolean') throw new AccessError(400, 'Choose whether to remember this device.');
        if (!/^IWT[A-HJ-NP-Z2-9]{32}$/.test(normalized)) throw new AccessError(401, 'This key is invalid, expired or revoked.');
        const hash = await digest(normalized);
        const existing = await db.prepare('SELECT duration,trial_days FROM access_keys WHERE key_hash=?').bind(hash).first();
        if (!existing) throw new AccessError(401, 'This key is invalid, expired or revoked.');
        // Single conditional update: concurrent first-use requests cannot restart the term.
        const key = await db.prepare(`UPDATE access_keys SET activated_at=COALESCE(activated_at,?),
          expires_at=CASE WHEN activated_at IS NULL THEN ? ELSE expires_at END
          WHERE key_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) RETURNING *`)
          .bind(now, expiration(effectiveDuration(existing), now), hash, now).first();
        if (!key) throw new AccessError(401, 'This key is invalid, expired or revoked.');
        // Preserve the legacy 30-day session for older clients. Explicit opt-out
        // uses a browser-session cookie and an eight-hour server-side limit.
        const lifetime = data.rememberDevice === true ? 365 * DAY : data.rememberDevice === false ? 8 * 60 * 60_000 : 30 * DAY;
        const token = randomToken(), ends = Math.min(now + lifetime, key.expires_at ?? Infinity);
        await db.prepare('INSERT INTO access_sessions(token_hash,role,key_id,expires_at) VALUES(?,\'member\',?,?)').bind(await digest(token), key.id, ends).run();
        // Replace this browser's old session rather than accumulating it on every login.
        const old = cookies(request).iwt_session;
        if (old) await db.prepare('DELETE FROM access_sessions WHERE token_hash=?').bind(await digest(old)).run();
        return json({ session: { role: 'member', duration: effectiveDuration(key), expiresAt: key.expires_at, sessionExpiresAt: ends } }, 200, { 'Set-Cookie': cookie('iwt_session', token, ends - now, data.rememberDevice !== false) });
      }
      if (path === '/api/admin/login' && request.method === 'POST') {
        await throttle(request, 'admin-login', 10);
        const data = await body(request);
        if (typeof data.password !== 'string' || data.password.length > 256 || !await passwordMatches(data.password, env.ADMIN_PASSWORD_HASH)) throw new AccessError(401, 'Incorrect password.');
        const token = randomToken(), ends = now + 8 * 60 * 60_000;
        await db.prepare('INSERT INTO access_sessions(token_hash,role,key_id,expires_at) VALUES(?,\'admin\',NULL,?)').bind(await digest(token), ends).run();
        const old = cookies(request).iwt_admin;
        if (old) await db.prepare('DELETE FROM access_sessions WHERE token_hash=?').bind(await digest(old)).run();
        return json({ session: { role: 'admin', expiresAt: ends, sessionExpiresAt: ends } }, 200, { 'Set-Cookie': cookie('iwt_admin', token, ends - now) });
      }
      if ((path === '/api/access/logout' || path === '/api/admin/logout') && request.method === 'POST') {
        const name = path.includes('/admin/') ? 'iwt_admin' : 'iwt_session';
        const token = cookies(request)[name];
        if (token) await db.prepare('DELETE FROM access_sessions WHERE token_hash=?').bind(await digest(token)).run();
        return json({ ok: true }, 200, { 'Set-Cookie': cookie(name, '', 0) });
      }
      if (path.startsWith('/api/admin/')) {
        await requireAdmin(request);
        if (path === '/api/admin/keys' && request.method === 'POST') {
          await throttle(request, 'generate', 60);
          const data = await body(request), quantity = data.quantity ?? 1;
          if (!DURATIONS.includes(data.duration) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || (data.label !== undefined && (typeof data.label !== 'string' || data.label.length > 80))) throw new AccessError(400, 'Choose a duration, 1–100 keys and a label up to 80 characters.');
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', keys = [], statements = [];
          for (let i = 0; i < quantity; i++) {
            const text = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => alphabet[byte & 31]).join('');
            const plaintext = 'IWT-' + text.match(/.{8}/g).join('-');
            const key = { id: crypto.randomUUID(), key: plaintext, duration: data.duration, label: (data.label || '').trim() };
            keys.push(key);
            statements.push(db.prepare('INSERT INTO access_keys(id,key_hash,hint,duration,trial_days,label,created_at) VALUES(?,?,?,?,?,?,?)')
              .bind(key.id, await digest(normalizeKey(plaintext)), `IWT-••••-${text.slice(-6)}`, key.duration === '3days' ? '4weeks' : key.duration, key.duration === '3days' ? 3 : null, key.label, now));
          }
          await db.batch(statements);
          return json({ keys }, 201);
        }
        if (path === '/api/admin/keys' && request.method === 'GET') {
          const page = Math.max(1, Math.min(1_000_000, Number(url.searchParams.get('page')) || 1));
          const status = url.searchParams.get('status') || 'all', search = (url.searchParams.get('search') || '').slice(0, 80).trim();
          const predicates = ['1=1'], bindings = [];
          if (status === 'unused') predicates.push('revoked_at IS NULL AND activated_at IS NULL');
          else if (status === 'active') { predicates.push('revoked_at IS NULL AND activated_at IS NOT NULL AND (expires_at IS NULL OR expires_at>?)'); bindings.push(now); }
          else if (status === 'expired') { predicates.push('revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?'); bindings.push(now); }
          else if (status === 'revoked') predicates.push('revoked_at IS NOT NULL');
          else if (status !== 'all') throw new AccessError(400, 'Invalid status filter.');
          if (search) { predicates.push('(instr(lower(label),lower(?))>0 OR instr(lower(hint),lower(?))>0)'); bindings.push(search, search); }
          const where = predicates.join(' AND ');
          const [list, count, totals] = await db.batch([
            db.prepare(`SELECT * FROM access_keys WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`).bind(...bindings, (page - 1) * 50),
            db.prepare(`SELECT COUNT(*) AS count FROM access_keys WHERE ${where}`).bind(...bindings),
            db.prepare(`SELECT CASE WHEN trial_days=3 THEN '3days' ELSE duration END AS duration,COUNT(*) AS generated,SUM(activated_at IS NOT NULL) AS used,
              SUM(revoked_at IS NULL AND activated_at IS NULL) AS unused,
              SUM(revoked_at IS NULL AND activated_at IS NOT NULL AND (expires_at IS NULL OR expires_at>?)) AS active,
              SUM(revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at<=?) AS expired,
              SUM(revoked_at IS NOT NULL) AS revoked FROM access_keys GROUP BY CASE WHEN trial_days=3 THEN '3days' ELSE duration END`).bind(now, now),
          ]);
          return json({ keys: list.results.map(k => publicKey(k, now)), total: count.results[0].count, page, pageSize: 50,
            stats: DURATIONS.map(duration => ({ duration, generated: 0, used: 0, unused: 0, active: 0, expired: 0, revoked: 0, ...totals.results.find(k => k.duration === duration) })) });
        }
        const revoke = path.match(/^\/api\/admin\/keys\/([a-f0-9-]{36})\/revoke$/);
        if (revoke && request.method === 'POST') {
          const key = await db.prepare('UPDATE access_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? RETURNING id').bind(now, revoke[1]).first();
          if (!key) throw new AccessError(404, 'Key not found.');
          await db.prepare('DELETE FROM access_sessions WHERE key_id=?').bind(revoke[1]).run();
          return json({ ok: true });
        }
      }
      throw new AccessError(404, 'Not found.');
    } catch (error) {
      if (error instanceof AccessError) return json({ error: error.message }, error.status, error.status === 429 ? { 'Retry-After': '900' } : {});
      // Do not leak SQL, hashes, passwords or submitted keys into responses/logs.
      console.error('Access service request failed.', error instanceof DOMException ? error.name : 'InternalError');
      return json({ error: 'Access service is temporarily unavailable. Please try again.' }, 503);
    }
  }
  return { handle, session, cleanup };
}
