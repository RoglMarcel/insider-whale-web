import { createAccessService } from './service.mjs';
import assets from '@iwt-assets';
const DATA_FILES = /^(?:meta|signals|portfolio|backtest|history|update-health|analysis-index)\.json$|^analysis\/[A-Z0-9.^_-]{1,32}\.json$/;
let lastCleanup = 0;
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
      // Every data request is authorized, including direct links and cached sessions.
      if (!await access.session(request)) return Response.json({ error: 'Your access has ended. Enter a valid key.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      const file = url.pathname.slice('/data/'.length);
      if (!DATA_FILES.test(file)) return new Response('Not found', { status: 404 });
      const origin = new URL(env.DATA_ORIGIN || 'https://roglmarcel.github.io/insider-whale-web/data/');
      if (origin.protocol !== 'https:') return new Response('Data source unavailable', { status: 503 });
      // The existing feed is public and CORS-enabled. An authorized handoff keeps
      // the hourly GitHub publisher authoritative without duplicating stale data.
      // No credentials are forwarded to the feed origin.
      return new Response(null, { status: 302, headers: {
        Location: new URL(file, origin).href, 'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer',
      } });
    }
    if (url.pathname === '/admin/') return Response.redirect(url.origin + '/admin', 308);
    const path = url.pathname === '/' || url.pathname === '/admin' ? '/index.html' : url.pathname;
    const asset = assets[path];
    if (!asset) return new Response('Not found', { status: 404 });
    const bytes = Uint8Array.from(atob(asset.body), c => c.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
      'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
    } });
  },
};
