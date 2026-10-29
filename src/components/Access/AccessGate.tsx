import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { accessRequest, type AccessSession } from '@/lib/accessApi';
import './access.css';
const AdminAccess = lazy(() => import('./AdminAccess'));

export function Arrow() { return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }
export function LockMark() { return <div className="access-mark" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>; }
export function AccessBrand() { return <a className="access-brand" href={import.meta.env.BASE_URL}><span className="access-brand-icon">W<span /></span><span>Insider &amp; Whale<span className="access-brand-sub">TERMINAL</span></span></a>; }
export function AccessLoading() { return <main className="access-screen"><div className="access-loading" role="status"><span className="access-spinner" />Checking access…</div></main>; }

export default function AccessGate({ children }: { children: ReactNode }) {
  const [adminPage, setAdminPage] = useState(() => /\/admin\/?$/.test(location.pathname) || location.hash === '#/admin');
  const [session, setSession] = useState<AccessSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [key, setKey] = useState('');
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
    try { const result = await accessRequest<{ session: AccessSession }>('access/activate', { key }); setKey(''); setSession(result.session); }
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
  if (session) return <>{children}<button className="access-lock-button" type="button" onClick={() => void logout()} disabled={busy} title={error || 'Lock this terminal'}>Lock terminal <span aria-hidden="true">↗</span></button>{error && <div className="access-session-error" role="alert">{error}</div>}</>;
  return <main className="access-screen">
    <header className="access-top"><AccessBrand /><span className="access-private"><span />Private access</span></header>
    <section className="access-entry" aria-labelledby="access-title">
      <LockMark /><span className="access-eyebrow">THE EDGE STARTS HERE</span>
      <h1 id="access-title">Insider &amp; Whale<br /><span>Terminal access.</span></h1>
      <p className="access-description">Your key to the signals that matter.</p>
      <form onSubmit={activate} className="access-key-form">
        <label className="sr-only" htmlFor="terminal-key">Access key</label>
        <div className={`access-input-wrap ${error ? 'has-error' : ''}`}>
          <input id="terminal-key" name="key" value={key} onChange={event => setKey(event.target.value)} placeholder="Insert your Key here" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={100} aria-describedby={error ? 'access-error' : 'access-help'} aria-invalid={!!error} disabled={busy} />
          <button type="submit" className="access-submit" aria-label="Enter terminal" disabled={busy || !key.trim()}>{busy ? <span className="access-spinner" /> : <Arrow />}</button>
        </div>
        {error ? <p id="access-error" className="access-error" role="alert">{error}</p> : <p id="access-help" className="access-help">{notice || 'Your access period begins when you first use your key.'}</p>}
      </form>
      <div className="access-entry-rule" /><div className="access-benefits"><span>Insider activity</span><span>Whale signals</span><span>One terminal</span></div>
    </section>
    <footer className="access-footer"><span>Insider &amp; Whale Terminal</span><a href={`${import.meta.env.BASE_URL}#/admin`}>Admin access <span aria-hidden="true">↗</span></a></footer>
  </main>;
}
