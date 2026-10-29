// Embeds Vite's public shell in the Worker; protected data never enters the bundle.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { build } from 'esbuild';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const assets = {};
function walk(dir, prefix='') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'data' || entry.name.startsWith('.')) continue;
    const path = join(dir,entry.name), key = prefix+'/'+entry.name;
    if (entry.isDirectory()) walk(path,key);
    else assets[key] = { body:readFileSync(path).toString('base64'), type:types[extname(path)] || 'application/octet-stream' };
  }
}
walk('dist-web');
mkdirSync('tmp/access',{recursive:true});
writeFileSync('tmp/access/assets.mjs','export default '+JSON.stringify(assets)+';\n');
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
await build({entryPoints:['access/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',alias:{'@iwt-assets':join(process.cwd(),'tmp/access/assets.mjs')}});
writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
console.log(`Access Worker built with ${Object.keys(assets).length} shell assets; data served only after authorization.`);
