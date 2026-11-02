import { createAccessService } from './service.mjs';
import assets from '@iwt-assets';

// One managed Sites deployment of this Worker enables automatic UI updates.
// The fixed Pages origin supplies code only; D1 sessions and keys stay here.
const UI_ORIGIN = new URL('https://roglmarcel.github.io/insider-whale-web/');
const DATA_FILES = /^(?:meta|signals|portfolio|backtest|history|update-health|valuations|analysis-summary|analysis-index)\.json$|^analysis\/[A-Z0-9.^_-]{1,32}\.json$/;
const PUBLIC_FILES = new Set(['/favicon.png', '/icon.svg', '/manifest.webmanifest']);
let lastCleanup = 0;

function isUiAsset(path) {
  if (PUBLIC_FILES.has(path)) return true;
  if (!path.startsWith('/assets/')) return false;
  const file = path.slice('/assets/'.length);
  return !!file && /^[a-zA-Z0-9._/-]+$/.test(file) && !file.includes('..') && !file.includes('//');
}

async function latestUi(path, method) {
  const entry = path === '/' || path === '/index.html' || path === '/admin';
  if (!entry && !isUiAsset(path)) return null;
  const target = new URL(entry ? 'terminal-shell.html' : path.slice(1), UI_ORIGIN);
  try {
    // A pinned origin and manual redirect handling prevent open proxying.
    // Do not forward any request headers, cookies, sessions or authorization.
    const response = await fetch(target.href, { method, redirect: 'manual', cache: 'no-store' });
    if (response.status !== 200) return null;
    const contentType = response.headers.get('content-type') || '';
    if (entry && !contentType.toLowerCase().includes('text/html')) return null;
    return new Response(method === 'HEAD' ? null : response.body, { headers: {
      'Content-Type': contentType || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
    } });
  } catch (error) {
    console.error('GitHub Pages shell unavailable; serving bundled fallback.', error instanceof Error ? error.message : 'network error');
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const access = createAccessService(env);
    if (Date.now() - lastCleanup > 60 * 60_000) {
      lastCleanup = Date.now();
      ctx.waitUntil(access.cleanup().catch(() => console.error('Access cleanup failed.')));
    }
    if (url.pathname.startsWith('/api/')) return access.handle(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    if (url.pathname.startsWith('/data/')) {
      if (!await access.session(request)) return Response.json({ error: 'Your access has ended. Enter a valid key.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      const file = url.pathname.slice('/data/'.length);
      if (!DATA_FILES.test(file)) return new Response('Not found', { status: 404 });
      const origin = new URL(env.DATA_ORIGIN || 'https://roglmarcel.github.io/insider-whale-web/data/');
      if (origin.protocol !== 'https:') return new Response('Data source unavailable', { status: 503 });
      return new Response(null, { status: 302, headers: {
        Location: new URL(file, origin).href, 'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer',
      } });
    }
    if (url.pathname === '/admin/') return Response.redirect(url.origin + '/admin', 308);
    const path = url.pathname === '/' || url.pathname === '/admin' ? '/index.html' : url.pathname;
    const live = await latestUi(path, request.method);
    if (live) return live;
    // Keep the previously deployed static shell usable during Pages outages.
    // All /api and /data checks happen before either shell can be served.
    const asset = assets[path];
    if (!asset) return new Response('Not found', { status: 404 });
    const bytes = Uint8Array.from(atob(asset.body), c => c.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
      'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
    } });
  },
};
