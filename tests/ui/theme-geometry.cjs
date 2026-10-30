/* Theme contract: preserve the existing layout while changing surface paint. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const postcss=require('postcss');
const root=path.resolve(__dirname,'../..');
const baseline=fs.readFileSync(path.join(__dirname,'fixtures/terminal-before-theme.css'),'utf8');
const current=fs.readFileSync(path.join(root,'src/styles/globals.css'),'utf8');
const paintVariables=new Set(['bg-primary','bg-secondary','bg-glass','bg-glass-hover','bg-input','bg-elevated','border-glass','border-active','border-input','text-primary','text-secondary','text-muted','text-on-accent','accent-green','accent-yellow','accent-red','accent-blue','accent-purple','accent-orange','shadow-glass','shadow-glass-hover','blob-1','blob-2','blob-3','portfolio-market','portfolio-overlay','portfolio-insider'].map(p=>'--'+p));
const paintProperties=/^(?:color|background(?:-.+)?|border(?:-(?:top|right|bottom|left))?-color|box-shadow|text-shadow|outline-color|fill|stroke|accent-color|caret-color)$/;
function geometry(css){
  const records=[];
  postcss.parse(css).walkDecls(decl=>{
    if(paintVariables.has(decl.prop)||paintProperties.test(decl.prop))return;
    let value=decl.value;
    if(/^(?:border(?:-(?:top|right|bottom|left))?|outline)$/.test(decl.prop)) {
      // Color changes in a shorthand must retain the original width and style.
      const match=value.match(/^(\S+)\s+(solid|dashed|dotted|double|groove|ridge|inset|outset)\b/);
      if(match)value=match[1]+' '+match[2];
    }
    const context=[];let parent=decl.parent;
    while(parent&&parent.type!=='root'){context.unshift(parent.type==='rule'?parent.selector:'@'+parent.name+' '+parent.params);parent=parent.parent;}
    records.push({context:context.join(' > '),property:decl.prop,value,important:!!decl.important});
  });return records;
}
function verifyLayoutContract(){
  const before=geometry(baseline),after=geometry(current);
  assert.equal(after.length,before.length,'Theme change added or removed layout/typography declarations');
  before.forEach((value,index)=>assert.deepEqual(after[index],value,'Layout/typography changed at '+value.context+' / '+value.property));
  return before.length;
}
const preserved=verifyLayoutContract();
let oldStyles;
async function baselineStyles(){
  return oldStyles??=(async()=>{
    const config=require(path.join(root,'tailwind.config.js'));
    const result=await postcss([require('tailwindcss')({...config,content:config.content.map(p=>path.join(root,p))}),require('autoprefixer')]).process(fs.readFileSync(path.join(root,'src/components/Access/access.css'),'utf8')+'\n'+baseline,{from:path.join(root,'src/styles/globals.css'),map:false});
    return result.css;
  })();
}
async function measure(page){
  return page.evaluate(()=>[...document.querySelectorAll('.app-shell, .app-shell *, [role="dialog"], [role="dialog"] *, .access-lock-button')].filter(el=>el.namespaceURI==='http://www.w3.org/1999/xhtml'&&!el.closest('.recharts-wrapper')&&el.tagName!=='STYLE'&&el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,css:el.getAttribute('class')||'',rect:[r.x,r.y,r.width,r.height]};}));
}
async function assertThemeGeometry(page,label){
  const css=await baselineStyles();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForLoadState('networkidle', {timeout:15000});
  // Compare settled layouts, not the first frame of a newly mounted view.
  const freeze=await page.addStyleTag({content:'.app-shell, .app-shell *, [role=dialog], [role=dialog] * { animation: none !important; transition: none !important; }'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const now=await measure(page);let style;
  try{
    style=await page.addStyleTag({content:css});
    await page.evaluate(()=>{
      document.querySelectorAll('link[rel="stylesheet"]').forEach(el=>{if(new URL(el.href).origin===location.origin&&!el.disabled){el.setAttribute('data-theme-check-disabled','');el.disabled=true;}});
      return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const before=await measure(page);
    assert.equal(now.length,before.length,label+': visible element count changed');
    for(let i=0;i<now.length;i++)for(let j=0;j<4;j++)assert(Math.abs(now[i].rect[j]-before[i].rect[j])<=0.05,`${label}: ${now[i].tag}.${now[i].css} #${i} moved/resized: ${JSON.stringify(before[i].rect)} -> ${JSON.stringify(now[i].rect)}`);
  }finally{
    if(style)await style.evaluate(el=>el.remove());
    await freeze.evaluate(el=>el.remove());
    await page.evaluate(()=>{document.querySelectorAll('[data-theme-check-disabled]').forEach(el=>{el.disabled=false;el.removeAttribute('data-theme-check-disabled');});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  }
}
module.exports={verifyLayoutContract,assertThemeGeometry};
if(require.main===module)console.log(`Theme contract passed: ${preserved} layout and typography declarations preserved.`);
