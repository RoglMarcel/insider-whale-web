const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const {chromium}=require('playwright');const {mockAccessWorkflow}=require('./access-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'tmp/access-ui');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'dist-web','.'+(name==='/'?'/index.html':name));if(!file.startsWith(path.join(root,'dist-web')+path.sep)||!fs.statSync(file,{throwIfNoEntry:false})?.isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true});
  for(const width of [1440,820,390,320]) {
    const context=await browser.newContext({viewport:{width,height:width<768?844:1000},reducedMotion:'reduce'});page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));const access=await mockAccessWorkflow(page);let dataRequests=0;
    await page.route('**/data/**',route=>{dataRequests++;const name=new URL(route.request().url()).pathname.split('/').pop();return route.fulfill({json:name==='signals.json'?[]:name==='meta.json'?{version:'access-ui-test',generatedAt:new Date().toISOString()}:{stocks:{},stages:{}}});});
    const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin);
    const key=page.getByPlaceholder('Insert your Key here',{exact:true});await key.waitFor();
    assert.equal(dataRequests,0,'No terminal data is fetched behind the lock');assert.equal(await page.getByRole('button',{name:'Enter terminal',exact:true}).isEnabled(),false);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Lock screen fits');
    await page.screenshot({path:path.join(out,`${width}-lock.png`)});
    await key.fill('invalid');await page.getByRole('button',{name:'Enter terminal',exact:true}).click();await page.getByRole('alert').waitFor();
    const loaded=page.waitForResponse('**/data/signals.json');await key.fill('IWT-UI-TEST-ONLY');await page.getByRole('button',{name:'Enter terminal',exact:true}).click();await page.getByRole('button',{name:/^Lock terminal/}).waitFor();await loaded;assert(dataRequests>0,'Valid activation mounts the terminal');
    access.revokeSession();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await key.waitFor();assert.equal(await page.getByRole('button',{name:/^Lock terminal/}).count(),0,'Revoked session unmounts the terminal');
    await page.goto(origin+'/#/admin');await page.getByLabel('Admin password',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Sign in to admin',exact:true}).click();await page.getByRole('heading',{name:'Generate keys',exact:true}).waitFor();
    await page.locator('.access-duration-option').filter({hasText:'6 months'}).click();await page.getByPlaceholder('e.g. October members').fill('Browser fixture');await page.getByRole('button',{name:'Generate key',exact:true}).click();await page.getByRole('region',{name:'New keys',exact:true}).waitFor();
    assert.equal(await page.locator('.access-plan-stat').count(),4);assert.equal(await page.locator('.access-table tbody tr').count(),1);assert((await page.locator('.access-table tbody').innerText()).includes('6 months'));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin document fits');assert(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Admin shell fits');
    await page.screenshot({path:path.join(out,`${width}-admin.png`),fullPage:true});
    await page.reload();await page.getByRole('heading',{name:'All access keys',exact:false}).waitFor();assert.equal(await page.locator('.access-generated').count(),0,'Full keys are not recovered after reload');
    await page.getByRole('button',{name:'Revoke',exact:true}).click();await page.getByRole('button',{name:'Revoke',exact:true}).click();await page.locator('.status-revoked').waitFor();
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Admin password',{exact:true}).waitFor();assert.deepEqual(errors,[]);
    console.log(`Access ${width}px: lock, activation, session revocation, admin generation, one-time keys and responsive layout passed.`);await context.close();
  }
})().catch(async error=>{console.error(error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}).finally(async()=>{if(browser)await browser.close();server.close();});
