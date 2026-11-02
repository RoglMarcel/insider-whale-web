import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const compiled = await build({entryPoints:[fileURLToPath(new URL('../../access/worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'test-shell',setup(builder){builder.onResolve({filter:/^@iwt-assets$/},()=>({path:'shell',namespace:'test'}));builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default '+JSON.stringify({'/index.html':{body:btoa('<h1>Bundled fallback</h1>'),type:'text/html'},'/assets/shell.js':{body:btoa('/* bundled */'),type:'text/javascript'}})}));}}]});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
const env={DATA_ORIGIN:'https://roglmarcel.github.io/insider-whale-web/data/',DB:{prepare(){return{bind(){return this;},async first(){return{role:'member',session_expiry:Date.now()+60000,duration:'4weeks',expires_at:Date.now()+60000,activated_at:Date.now()-1000,revoked_at:null};}};},async batch(){return[];}}};
const ctx={waitUntil(promise){promise.catch(()=>{});}};
const request=(path,authenticated=false,method='GET')=>new Request('https://terminal.test'+path,{method,headers:authenticated?{Cookie:'iwt_session='+'a'.repeat(64)}:{}});
const originalFetch=globalThis.fetch, upstreamRequests=[];
let remoteAvailable=true;
globalThis.fetch=async (url,options)=>{
  const target=new URL(url);upstreamRequests.push({url:target.href,method:options?.method,headers:options?.headers});
  assert.equal(target.origin,'https://roglmarcel.github.io');
  if (!remoteAvailable) return new Response('Not found',{status:404});
  if (target.pathname.endsWith('/terminal-shell.html')) return new Response('<h1>Current shell</h1>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
  if (target.pathname.endsWith('/assets/new-ABC.js')) return new Response('/* current */',{headers:{'Content-Type':'text/javascript'}});
  if (target.pathname.endsWith('/assets/shell.js')) return new Response('/* live */',{headers:{'Content-Type':'text/javascript'}});
  if (target.pathname.endsWith('/favicon.png')) return new Response('png',{headers:{'Content-Type':'image/png'}});
  return new Response('Not found',{status:404});
};
test('Worker blocks anonymous direct data URLs before fetching public shell',async()=>{
  const before=upstreamRequests.length, r=await worker.fetch(request('/data/signals.json'),env,ctx);
  assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(upstreamRequests.length,before);
});
test('authorized feed handoff stays fresh and never forwards credentials',async()=>{
  const r=await worker.fetch(request('/data/meta.json',true),env,ctx);
  assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://roglmarcel.github.io/insider-whale-web/data/meta.json');
  assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store, private');
});
test('Worker allows catalog files but rejects unauthorized data paths',async()=>{
  for(const path of ['/data/analysis/BRK.B.json','/data/valuations.json','/data/analysis-summary.json'])assert.equal((await worker.fetch(request(path,true),env,ctx)).status,302);
  for(const path of ['/data/passwords.json','/data/analysis/secret.txt','/data/https://evil.test/meta.json'])assert.equal((await worker.fetch(request(path,true),env,ctx)).status,404);
});
test('live Pages HTML and latest assets are fetched without user credentials',async()=>{
  for(const p of ['/','/admin']) {
    const r=await worker.fetch(request(p),env,ctx);assert.equal(r.status,200);
    assert.match(await r.text(),/Current shell/);assert.equal(r.headers.get('cache-control'),'no-store');
  }
  const js=await worker.fetch(request('/assets/new-ABC.js'),env,ctx);
  assert.equal(js.status,200);assert.match(await js.text(),/current/);
  assert.match(js.headers.get('cache-control'),/immutable/);
  for(const r of upstreamRequests) assert.equal(r.headers,undefined);
});
test('only shell and whitelisted public assets can reach Pages',async()=>{
  const before=upstreamRequests.length;
  for(const p of ['/missing','/.env','/data/secrets.json','/admin/secret','/assets/../secret.js'])assert.notEqual((await worker.fetch(request(p),env,ctx)).status,200);
  assert.equal(upstreamRequests.length,before);
  assert.equal((await worker.fetch(request('/favicon.png'),env,ctx)).status,200);
});
test('bundled UI remains available when Pages is down',async()=>{
  remoteAvailable=false;
  const page=await worker.fetch(request('/'),env,ctx);
  assert.equal(page.status,200);assert.match(await page.text(),/Bundled fallback/);
  const js=await worker.fetch(request('/assets/shell.js'),env,ctx);
  assert.equal(js.status,200);assert.match(await js.text(),/bundled/);
  remoteAvailable=true;globalThis.fetch=originalFetch;
});
