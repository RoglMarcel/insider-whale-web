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
  if(oldStyles)return oldStyles;
  const previous=postcss.parse(baseline);
  previous.walkDecls(decl=>{
    if(paintVariables.has(decl.prop)||paintProperties.test(decl.prop))return;
    if(/^(?:border(?:-(?:top|right|bottom|left))?|outline)$/.test(decl.prop)){
      const match=decl.value.match(/^\S+\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(.+)$/);
      if(match){decl.prop+='-color';decl.value=match[1];return;}
    }
    decl.remove();
  });
  previous.walkAtRules(rule=>{
    if(['tailwind','apply','keyframes','-webkit-keyframes'].includes(rule.name))rule.remove();
    else if(rule.name==='layer')rule.replaceWith(rule.nodes||[]);
  });
  // Swap only paint. Unloading a live CSS asset introduces a temporary unstyled
  // layout and changes native closed-details visibility caches in Chromium.
  oldStyles=previous.toString();return oldStyles;
}
async function measure(page){
  return page.evaluate(()=>[...document.querySelectorAll('.app-shell, .app-shell *, [role="dialog"], [role="dialog"] *, .access-lock-button')].filter(el=>{
    if(el.namespaceURI!=='http://www.w3.org/1999/xhtml'||el.closest('.recharts-wrapper')||el.tagName==='STYLE'||el.classList.contains('sr-only')||getComputedStyle(el).visibility!=='visible'||!el.getClientRects().length)return false;
    // Closed details can retain cached descendant rectangles; those are not visible boxes.
    for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(el))return false;
    return true;
  }).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,css:el.getAttribute('class')||'',rect:[r.x,r.y,r.width,r.height]};}));
}
function same(a,b){return a.length===b.length&&a.every((node,i)=>node.tag===b[i].tag&&node.css===b[i].css&&node.rect.every((n,j)=>Math.abs(n-b[i].rect[j])<=0.05));}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function assertThemeGeometry(page,label){
  const css=await baselineStyles();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForLoadState('networkidle', {timeout:15000});
  const freeze=await page.addStyleTag({content:'.app-shell, .app-shell *, [role=dialog], [role=dialog] * { animation: none !important; transition: none !important; }'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  try{
    for(let attempt=0;attempt<3;attempt++){
      const now=await measure(page);let style,before;
      try{
        style=await page.addStyleTag({content:css});
        await settle(page);
        before=await measure(page);
      }finally{if(style)await style.evaluate(el=>el.remove());await settle(page);}
      const after=await measure(page);
      // An unrelated async update is not a palette difference. Require a stable
      // current -> previous -> current round trip before asserting old/new equality.
      if(!same(now,after)){
        assert(attempt<2,label+': view kept updating during the geometry comparison');
        await page.waitForLoadState('networkidle',{timeout:15000});continue;
      }
      assert.equal(now.length,before.length,label+': visible element count changed: '+JSON.stringify({current:now.map(n=>n.tag+'.'+n.css),previous:before.map(n=>n.tag+'.'+n.css)}));
      for(let i=0;i<now.length;i++)for(let j=0;j<4;j++)assert(Math.abs(now[i].rect[j]-before[i].rect[j])<=0.05,`${label}: ${now[i].tag}.${now[i].css} #${i} moved/resized: ${JSON.stringify(before[i].rect)} -> ${JSON.stringify(now[i].rect)}`);
      return;
    }
  }finally{await freeze.evaluate(el=>el.remove());await settle(page);}
}
module.exports={verifyLayoutContract,assertThemeGeometry};
if(require.main===module)console.log(`Theme contract passed: ${preserved} layout and typography declarations preserved.`);
