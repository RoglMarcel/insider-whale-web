import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { accessRequest, type AccessSession } from '@/lib/accessApi';
import './access.css';
import { TerminalLogo } from '@/components/UI/TerminalLogo';
const AdminAccess = lazy(() => import('./AdminAccess'));

export function Arrow() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }
export function LockMark() { return <div className="access-mark" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>; }
export function AccessBrand() { return <a className="access-brand" href={import.meta.env.BASE_URL}><span>Insider &amp; Whale<span className="access-brand-sub">TERMINAL</span></span></a>; }
export function AccessLoading() { return <main className="access-screen"><div className="access-loading" role="status"><span className="access-spinner" />Checking access…</div></main>; }

export default function AccessGate({ children }: { children: ReactNode }) {
  const [adminPage, setAdminPage] = useState(() => /\/admin\/?$/.test(location.pathname) || location.hash === '#/admin');
  const [session, setSession] = useState<AccessSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [key, setKey] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const route = () => setAdminPage(/\/admin\/?$/.test(location.pathname) || location.hash === '#/admin');
    window.addEventListener('hashchange', route); return () => window.removeEventListener('hashchange', route);
  }, []);
  const check = useCallback(async () => {
    try {
      const result = await accessRequest<{ session: AccessSession | null }>('access/session');
      setSession(previous => { if (previous && !result.session) setNotice('Your access has ended. Enter a valid key to continue.'); return result.session; });
      setError('');
    } catch (err) {
      // A network failure never unlocks the shell, including previously open tabs.
      setSession(null); setError((err as Error).message);
    } finally { setChecking(false); }
  }, []);
  useEffect(() => { if (!adminPage) void check(); }, [check, adminPage]);
  useEffect(() => {
    if (!session || adminPage) return;
    const interval = window.setInterval(() => void check(), 15_000);
    const onFocus = () => void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    const onDenied = () => { setSession(null); setNotice('Your access has ended. Enter a valid key to continue.'); };
    const ends = Math.min(session.expiresAt ?? Infinity, session.sessionExpiresAt);
    const timeout = window.setTimeout(() => { if (Date.now() >= ends) onDenied(); else void check(); }, Math.max(0, Math.min(ends - Date.now(), 2_147_000_000)));
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('iwt:access-denied', onDenied);
    return () => { clearInterval(interval); clearTimeout(timeout); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('iwt:access-denied', onDenied); };
  }, [session, adminPage, check]);
  const activate = async (event: FormEvent) => {
    event.preventDefault(); if (!key.trim() || busy) return;
    setBusy(true); setError(''); setNotice('');
    try { const result = await accessRequest<{ session: AccessSession }>('access/activate', { key, rememberDevice }); setKey(''); setSession(result.session); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true);
    try { await accessRequest(session?.role === 'admin' ? 'admin/logout' : 'access/logout', {}); location.reload(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  if (adminPage) return <Suspense fallback={<AccessLoading />}><AdminAccess /></Suspense>;
  if (checking) return <AccessLoading />;
  if (session) return <>{children}<button className="access-lock-button" type="button" onClick={() => void logout()} disabled={busy} title={error || 'Sign out and forget this device'}>Lock terminal <Arrow /></button>{error && <div className="access-session-error" role="alert">{error}</div>}</>;
  return <main className="access-screen">
    <header className="access-top gate-top"><TerminalLogo /></header>
    <div className="gate">
      <section className="gate-pitch" aria-labelledby="access-title">
        <h1 id="access-title">Insider trades and unusual options flow, in one terminal.</h1>
        <p>See what company insiders are buying and selling, next to the options activity on the same stocks.</p>
      </section>
      <form onSubmit={activate} className="gate-card" aria-labelledby="gate-form-title">
        <h2 id="gate-form-title">Enter your access key</h2>
        <label className="gate-label" htmlFor="terminal-key">Access key</label>
        <input id="terminal-key" name="key" className={`gate-input gate-input-key ${error ? 'has-error' : ''}`} value={key} onChange={event => setKey(event.target.value)} placeholder="IWT-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={100} aria-describedby={error ? 'access-error' : 'access-help'} aria-invalid={!!error} disabled={busy} />
        {error ? <p id="access-error" className="gate-note gate-error" role="alert">{error}</p> : <p id="access-help" className="gate-note">{notice || 'Your access period starts the first time you use the key. A key works on up to two devices.'}</p>}
        <label className="gate-remember"><input type="checkbox" checked={rememberDevice} onChange={event => setRememberDevice(event.target.checked)} disabled={busy} />Keep me signed in on this device</label>
        <button type="submit" className="gate-submit" disabled={busy}>{busy ? <span className="access-spinner" /> : <>Open terminal <Arrow /></>}</button>
      </form>
      <dl className="gate-facts">
        <div><dt>Insider transactions</dt><dd>Buys and sales by company insiders, scored so the strongest signals come first.</dd></div>
        <div><dt>Unusual options flow</dt><dd>Large and unusual options activity, shown alongside the insider record.</dd></div>
        <div><dt>Analysis and fair value</dt><dd>A valuation view for each stock, so a signal comes with context.</dd></div>
        <div><dt>Portfolio and backtest</dt><dd>Model portfolios and backtests built on the same signals.</dd></div>
      </dl>
    </div>
    <footer className="access-footer"><span>Insider &amp; Whale Terminal</span><a href={`${import.meta.env.BASE_URL}#/admin`}>Owner sign-in</a></footer>
  </main>;
}
