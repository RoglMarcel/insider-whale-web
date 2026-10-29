// GitHub Pages stays the existing scrape publisher. Its entry sends visitors to
// the managed terminal, which can enforce key access on every data request.
import { readFileSync, writeFileSync } from 'node:fs';
const { publicOrigin } = JSON.parse(readFileSync(new URL('../access/deployment.json', import.meta.url), 'utf8'));
const origin = new URL(publicOrigin);
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Expected an HTTPS terminal origin.');
writeFileSync('dist-web/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=${origin.href}"><title>Insider &amp; Whale Terminal</title><script src="./terminal-redirect.js" defer></script></head><body style="background:#09090c;color:#f6f6f8;font:14px system-ui;display:grid;place-items:center;min-height:95vh"><a href="${origin.href}" style="color:#00e676">Open Insider &amp; Whale Terminal →</a></body></html>`);
writeFileSync('dist-web/terminal-redirect.js', `location.replace(${JSON.stringify(origin.origin)} + (location.hash === '#/admin' ? '/admin' : '/'));\n`);
console.log('Pages entry now redirects to the managed, key-protected terminal.');
