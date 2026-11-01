/* Real strategy controls in both languages, using only local component state. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { buildSync } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'tmp/simulation-ui'); fs.mkdirSync(out, { recursive: true });
const bundle = buildSync({ stdin: { contents: `
  import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
  import {RulesCard} from './src/components/Portfolio/RulesCard';
  import {emptyPortfolioState} from './src/lib/portfolio-rules';
  function Fixture(){ const [config,setConfig]=useState(emptyPortfolioState().config); return <RulesCard
    config={config} meta={emptyPortfolioState().meta} onApplyConfig={c=>{window.applied=c;setConfig(c)}} />; }
  createRoot(document.getElementById('root')).render(<Fixture/>);
`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser',
  alias: { '@': path.join(root,'src') }, define: { 'import.meta.env.BASE_URL':'"/"', 'import.meta.env.VITE_ANALYSIS_API_URL':'""', 'import.meta.env.VITE_TARGET':'"desktop"' } }).outputFiles[0].text;
const css = fs.readFileSync(path.join(root, 'dist-web/assets', fs.readdirSync(path.join(root,'dist-web/assets')).find(n=>n.endsWith('.css'))));
const server = http.createServer((req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><main id="root" style="padding:16px;max-width:1100px;margin:auto"></main><script src="/bundle.js"></script></body></html>');
});
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); browser=await chromium.launch({headless:true});
  for(const language of ['en','de']) for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:1000}}); const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(lang=>localStorage.setItem('language',lang),language);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button',{name:language==='en'?/Rules & assumptions/:/Regelwerk & Annahmen/}).click();
    assert((await page.locator('main').innerText()).includes(language==='en'?'nominal trigger return is 3.5%':'nominelle Auslöseschwelle bei 3.5 %'));
    await page.getByRole('button',{name:language==='en'?'Edit rules':'Regeln ändern',exact:true}).click();
    await page.locator('select[name=researchPolicy]').selectOption('trail-15-10-v1');
    assert.equal(await page.locator('input[name=trailArm]').inputValue(),'15');
    await page.locator('label').filter({hasText:language==='en'?'Activated profit floor':'Gewinnschwelle nach Aktivierung'}).locator('input[type=checkbox]').check();
    const floor=page.locator('input[name=profitFloor]');await floor.fill('20');
    const submit=page.getByRole('button',{name:language==='en'?'Apply & rebuild':'Übernehmen & neu aufbauen',exact:true});
    assert(await submit.isDisabled());await floor.fill('10');
    await page.locator('input[type=radio][value=next_close]').check();await submit.click();
    const applied=await page.evaluate(()=>window.applied);
    assert.equal(applied.profitFloor,.1);assert.equal(applied.trailArm,.15);assert.equal(applied.exitExecution,'next_close');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,`${language}-${width}.png`),fullPage:true});
    console.log(`Simulation controls ${language} ${width}px: geometry, versioned preset, floor validation, delayed execution and layout passed.`);
    await context.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
