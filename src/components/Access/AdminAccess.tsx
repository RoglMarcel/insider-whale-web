import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AccessApiError, accessRequest, formatAccessDate, PLANS, type AccessSession, type KeyDuration, type KeyOverview } from '@/lib/accessApi';
import { AccessBrand, AccessLoading, Arrow, LockMark } from './AccessGate';

type GeneratedKey = { id: string; key: string; duration: KeyDuration; label: string };
export default function AdminAccess() {
  const [session, setSession] = useState<AccessSession | null>(null);
  const [checking, setChecking] = useState(true), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [overview, setOverview] = useState<KeyOverview | null>(null);
  const [duration, setDuration] = useState<KeyDuration>('4weeks'), [quantity, setQuantity] = useState(1), [label, setLabel] = useState('');
  const [generated, setGenerated] = useState<GeneratedKey[]>([]), [copied, setCopied] = useState('');
  const [status, setStatus] = useState('all'), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  useEffect(() => { accessRequest<{ session: AccessSession | null }>('admin/session').then(r => setSession(r.session)).catch(e => setError(e.message)).finally(() => setChecking(false)); }, []);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await accessRequest<KeyOverview>(`admin/keys?${new URLSearchParams({ status, search, page: String(page) })}`);
      if (id === requestId.current) { setOverview(next); setError(''); }
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof AccessApiError && err.status === 401) { setSession(null); setGenerated([]); }
      setError((err as Error).message);
    } finally { if (id === requestId.current) setLoading(false); }
  }, [status, search, page]);
  useEffect(() => { if (!session) return; const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [session, load]);
  useEffect(() => {
    if (!session) return;
    const poll = setInterval(() => void load(), 30_000);
    const expired = setTimeout(() => { setSession(null); setGenerated([]); setOverview(null); setError('Your admin session has ended. Sign in again.'); }, Math.max(0, session.sessionExpiresAt - Date.now()));
    return () => { clearInterval(poll); clearTimeout(expired); };
  }, [session, load]);
  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const r = await accessRequest<{ session: AccessSession }>('admin/login', { password }); setPassword(''); setSession(r.session); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const generate = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setCopied('');
    try { const result = await accessRequest<{ keys: GeneratedKey[] }>('admin/keys', { duration, quantity, label }); setGenerated(result.keys); await load(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true); setError('');
    try { await accessRequest(`admin/keys/${id}/revoke`, {}); setConfirm(null); await load(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); }
    catch { setError('Copy is unavailable. Select and copy the key manually.'); }
  };
  const logout = async () => {
    setBusy(true);
    try { await accessRequest('admin/logout', {}); setSession(null); setOverview(null); setGenerated([]); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  if (checking) return <AccessLoading />;
  if (!session) return <main className="access-screen"><header className="access-top"><AccessBrand /><a className="access-back" href={import.meta.env.BASE_URL}>Back to terminal ↗</a></header>
    <section className="access-entry admin-login" aria-labelledby="admin-title"><LockMark /><span className="access-eyebrow">OWNER ACCESS</span><h1 id="admin-title">Access control.<br /><span>On your terms.</span></h1><p className="access-description">Sign in to generate and manage your keys.</p>
      <form onSubmit={login} className="access-key-form"><label htmlFor="admin-password" className="sr-only">Admin password</label><div className={`access-input-wrap ${error ? 'has-error' : ''}`}><input id="admin-password" name="password" type="password" placeholder="Enter admin password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required maxLength={256} disabled={busy} aria-describedby={error ? 'admin-error' : undefined} aria-invalid={!!error}/><button type="submit" className="access-submit" aria-label="Sign in to admin" disabled={busy || !password}>{busy ? <span className="access-spinner"/> : <Arrow />}</button></div>{error && <p id="admin-error" className="access-error" role="alert">{error}</p>}</form></section><footer className="access-footer"><span>Insider &amp; Whale Terminal</span><span>Owner dashboard</span></footer></main>;
  const totals = overview?.stats.reduce((sum, p) => ({ generated: sum.generated + p.generated, used: sum.used + p.used, active: sum.active + p.active }), { generated: 0, used: 0, active: 0 });
  return <main className="access-admin"><header className="access-admin-top"><AccessBrand /><div><a href={import.meta.env.BASE_URL} className="access-back">Open terminal ↗</a><button className="access-quiet-button" type="button" onClick={() => void logout()} disabled={busy}>Sign out</button></div></header>
    <div className="access-admin-body"><div className="access-admin-heading"><div><span className="access-eyebrow">OWNER DASHBOARD</span><h1>Access control<span>.</span></h1><p>Create access. Keep control.</p></div><div className="access-admin-summary"><span><strong>{totals?.active ?? '—'}</strong>active keys</span><span><strong>{totals?.used ?? '—'}</strong>used / {totals?.generated ?? '—'} generated</span></div></div>
      {error && <div className="access-admin-error" role="alert">{error}<button type="button" onClick={() => void load()} className="access-quiet-button">Retry</button></div>}
      <section className="access-plan-grid" aria-label="Usage by key duration">{PLANS.map(plan => { const stat = overview?.stats.find(p => p.duration === plan.id); return <article className="access-plan-stat" key={plan.id}><div className="access-plan-title">{plan.title}<span>{plan.id === 'lifetime' ? '∞' : '↗'}</span></div><div className="access-plan-count">{stat?.used ?? '—'}<span>/ {stat?.generated ?? '—'}</span></div><p>used / generated</p><div className="access-plan-progress"><span style={{ width: stat?.generated ? `${100 * stat.used / stat.generated}%` : 0 }} /></div><div className="access-plan-breakdown"><span><i />{stat?.active ?? '—'} active</span><span>{stat?.unused ?? '—'} ready</span><span>{stat?.expired ?? '—'} expired</span><span>{stat?.revoked ?? '—'} revoked</span></div></article>; })}</section>
      <section className="access-panel" aria-labelledby="generate-title"><div className="access-panel-heading"><div><span className="access-eyebrow">ISSUE NEW ACCESS</span><h2 id="generate-title">Generate keys</h2></div><span className="access-panel-note">The clock starts on first use.</span></div>
        <form onSubmit={generate}><fieldset className="access-duration-options"><legend className="sr-only">Key duration</legend>{PLANS.map(plan => <label className={`access-duration-option ${duration === plan.id ? 'selected' : ''}`} key={plan.id}><input type="radio" name="duration" value={plan.id} checked={duration === plan.id} onChange={() => setDuration(plan.id)} disabled={busy}/><span><strong>{plan.title}</strong><small>{plan.term}</small></span><span className="access-radio" /></label>)}</fieldset><div className="access-generator-bottom"><label className="access-field access-quantity">Quantity<input type="number" min={1} max={100} value={quantity} onChange={e => setQuantity(Number(e.target.value))} required disabled={busy}/></label><label className="access-field access-label">Label <span>(optional)</span><input type="text" value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="e.g. October members" disabled={busy}/></label><button type="submit" className="access-primary-button" disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > 100}>{busy ? 'Working…' : `Generate ${quantity === 1 ? 'key' : 'keys'}`}<Arrow /></button></div></form>
        {generated.length > 0 && <div className="access-generated" role="region" aria-label="New keys"><div className="access-generated-heading"><div><strong>{generated.length} {generated.length === 1 ? 'key' : 'keys'} ready</strong><p>Copy and save now. Full keys are shown only once.</p></div><button type="button" className="access-quiet-button" onClick={() => void copy(generated.map(k => k.key).join('\n'), 'all')}>{copied === 'all' ? 'Copied' : 'Copy all'}</button></div><div className="access-generated-list">{generated.map(item => <div key={item.id}><code>{item.key}</code><button type="button" onClick={() => void copy(item.key, item.id)} aria-label={`Copy key ending ${item.key.slice(-6)}`}>{copied === item.id ? 'Copied' : 'Copy'}</button></div>)}</div><button type="button" className="access-dismiss" onClick={() => setGenerated([])}>Done — I have saved these keys</button></div>}
      </section>
      <section className="access-panel access-register" aria-labelledby="register-title"><div className="access-panel-heading"><div><span className="access-eyebrow">YOUR KEY REGISTER</span><h2 id="register-title">All access keys <span className="access-count-badge">{overview?.total ?? '—'}</span></h2></div><button className="access-quiet-button" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh ↻'}</button></div><div className="access-register-controls"><label className="access-search"><span className="sr-only">Search keys</span><input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search label or key ending…"/></label><label className="access-filter"><span className="sr-only">Filter by status</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">All statuses</option><option value="unused">Unused</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select></label></div>
        <div className="access-table-scroll" aria-busy={loading}><table className="access-table"><thead><tr><th>Key / label</th><th>Duration</th><th>Status</th><th>First used</th><th>Expires</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{overview?.keys.map(item => <tr key={item.id}><td><code>{item.hint}</code><span className="access-table-label">{item.label || 'No label'}</span></td><td>{PLANS.find(plan => plan.id === item.duration)?.title}</td><td><span className={`access-status status-${item.status}`}>{item.status === 'unused' ? 'Unused' : item.status[0].toUpperCase() + item.status.slice(1)}</span></td><td>{formatAccessDate(item.activatedAt)}</td><td>{item.duration === 'lifetime' ? 'Never' : item.activatedAt === null ? 'Starts on first use' : formatAccessDate(item.expiresAt)}</td><td>{item.status !== 'revoked' && item.status !== 'expired' && (confirm === item.id ? <div className="access-revoke-confirm"><span>End access?</span><button className="access-revoke" type="button" disabled={busy} onClick={() => void revoke(item.id)}>Revoke</button><button className="access-quiet-button" type="button" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div> : <button className="access-quiet-button" type="button" disabled={busy} onClick={() => setConfirm(item.id)}>Revoke</button>)}</td></tr>)}</tbody></table>{overview && overview.keys.length === 0 && <div className="access-empty"><LockMark /><strong>{status !== 'all' || search ? 'No matching keys' : 'Your first key starts here'}</strong><p>{status !== 'all' || search ? 'Try another search or status.' : 'Generate a key above. It stays unused until someone enters it.'}</p></div>}{!overview && <div className="access-empty" role="status">{error ? 'Unable to load keys.' : 'Loading keys…'}</div>}</div>
        {overview && overview.total > overview.pageSize && <div className="access-pagination"><button type="button" className="access-quiet-button" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>← Previous</button><span>Page {page} of {Math.ceil(overview.total / overview.pageSize)}</span><button type="button" className="access-quiet-button" disabled={page * overview.pageSize >= overview.total || loading} onClick={() => setPage(p => p + 1)}>Next →</button></div>}
      </section><footer className="access-admin-footer">Unused keys do not expire. Expired and revoked keys cannot open the terminal.</footer>
    </div></main>;
}
