// Browser-only fixture. Never imported by app/server code or shipped to visitors.
const session = role => ({role, duration: role === 'member' ? '4weeks' : null, expiresAt:Date.now()+3_600_000, sessionExpiresAt:Date.now()+3_600_000});
exports.mockMemberAccess = async page => {
  await page.route('**/api/access/session', route => route.fulfill({json:{session:session('member')}}));
};
exports.mockAccessWorkflow = async page => {
  let member=null, admin=null, keys=[];
  const fulfill=(route,data,status=200)=>route.fulfill({status,json:data});
  await page.route(/\/api\/(access|admin)\//, async route => {
    const request=route.request(),url=new URL(request.url()),path=url.pathname,post=request.method()==='POST',data=post?request.postDataJSON():null;
    if(path==='/api/access/session')return fulfill(route,{session:member || admin});
    if(path==='/api/admin/session')return fulfill(route,{session:admin});
    if(path==='/api/access/activate') {
      if(data.key!=='IWT-UI-TEST-ONLY')return fulfill(route,{error:'This key is invalid, expired or revoked.'},401);
      member=session('member');return fulfill(route,{session:member});
    }
    if(path==='/api/access/logout'){member=null;return fulfill(route,{ok:true});}
    if(path==='/api/admin/login') {
      if(data.password!=='test-only')return fulfill(route,{error:'Incorrect password.'},401);
      admin=session('admin');return fulfill(route,{session:admin});
    }
    if(path==='/api/admin/logout'){admin=null;return fulfill(route,{ok:true});}
    if(!admin)return fulfill(route,{error:'Sign in to manage access keys.'},401);
    if(path==='/api/admin/keys' && post) {
      const key={id:'12345678-1234-1234-1234-123456789abc',key:'IWT-BROWSER-FIXTURE-KEY',hint:'IWT-••••-FIXKEY',duration:data.duration,label:data.label,status:'unused',createdAt:Date.now(),activatedAt:null,expiresAt:null,revokedAt:null};
      keys.push(key);return fulfill(route,{keys:[key]},201);
    }
    if(path.endsWith('/revoke')){keys[0].status='revoked';keys[0].revokedAt=Date.now();return fulfill(route,{ok:true});}
    if(path==='/api/admin/keys')return fulfill(route,{keys:keys.map(({key,...visible})=>visible),total:keys.length,page:1,pageSize:50,stats:['4weeks','6months','1year','lifetime'].map(duration=>({duration,generated:keys.filter(k=>k.duration===duration).length,used:0,active:0,unused:keys.filter(k=>k.duration===duration&&k.status==='unused').length,expired:0,revoked:keys.filter(k=>k.duration===duration&&k.status==='revoked').length}))});
    return fulfill(route,{error:'Not found'},404);
  });
  return {revokeSession(){member=null;}};
};
