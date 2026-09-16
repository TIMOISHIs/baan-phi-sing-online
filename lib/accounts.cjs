'use strict';
const {randomUUID}=require('crypto');
const fs=require('fs'),path=require('path');
const {levelProgress,validName}=require('./progression.cjs');
const PROFILE_FIELDS='id,display_name,avatar_key,total_xp,games_played,wins';
function createAccounts({env=process.env,avatars,fetchImpl=fetch,clock=Date.now,clientFactory}={}){
  const enabled=env.ACCOUNTS_ENABLED==='true',url=env.SUPABASE_URL,publicKey=env.SUPABASE_PUBLISHABLE_KEY,secret=env.SUPABASE_SECRET_KEY,origin=env.APP_URL;
  if(enabled&&(!url||!publicKey||!secret||!origin||!env.DATA_DIR))throw Error('Account configuration incomplete: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, APP_URL and DATA_DIR required');
  if(enabled&&(!/^https:\/\/[^/]+$/.test(origin)||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)))throw Error('Use HTTPS APP_URL origin and hosted Supabase URL');
  const sockets=new Map(),limits=new Map();
  const avatarKeys=new Set(avatars.map(a=>a.key));
  const pending=new Map();let flushing=false;
  const dataDir=env.DATA_DIR,outbox=dataDir&&path.join(dataDir,'xp-outbox.json');
  if(enabled){fs.mkdirSync(dataDir,{recursive:true});if(fs.existsSync(outbox))for(const item of JSON.parse(fs.readFileSync(outbox,'utf8')))pending.set(item.p_match_id,item)}
  function persist(){if(!enabled)return;const tmp=outbox+'.tmp';fs.writeFileSync(tmp,JSON.stringify([...pending.values()]),{mode:0o600});fs.renameSync(tmp,outbox)}
  function client(req,res){
    const factory=clientFactory||require('@supabase/ssr').createServerClient;
    return factory(url,publicKey,{cookieOptions:{httpOnly:true,secure:true,sameSite:'lax',path:'/'},cookies:{
      getAll(){return String(req.headers.cookie||'').split(';').map(v=>{const i=v.indexOf('=');if(i<0)return null;try{return {name:v.slice(0,i).trim(),value:decodeURIComponent(v.slice(i+1))}}catch{return null}}).filter(Boolean)},
      setAll(cookies){if(!res)return;for(const c of cookies)res.cookie(c.name,c.value,{...c.options,maxAge:c.options.maxAge==null?undefined:c.options.maxAge*1000,httpOnly:true,secure:true,sameSite:'lax',path:'/'})}
    }});
  }
  async function db(route,{method='GET',body,prefer}={}){
    const response=await fetchImpl(url+'/rest/v1/'+route,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Database unavailable');return response.status===204?null:response.json();
  }
  async function identity(req,res){
    const auth=client(req,res);const {data,error}=await auth.auth.getUser();
    if(error||!data.user||!data.user.identities?.some(i=>i.provider==='google'))return null;
    return {id:data.user.id,auth};
  }
  async function profile(id){const rows=await db('profiles?select='+PROFILE_FIELDS+'&id=eq.'+encodeURIComponent(id));return rows[0]||null}
  function publicProfile(p){return p?{...p,progress:levelProgress(p.total_xp),avatar:avatars.find(a=>a.key===p.avatar_key)?.art||null}:null}
  function rate(req){const now=clock(),key=req.ip;let r=limits.get(key);if(!r||r.until<now){r={count:0,until:now+60000};limits.set(key,r)}if(limits.size>5000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);return ++r.count<=60}
  function route(fn,{mutation=false,anonymous=false}={}){return async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!enabled)return res.status(503).json({error:'ระบบสมาชิกยังไม่เปิดให้บริการ'});
    if(!rate(req))return res.status(429).json({error:'ลองใหม่อีกสักครู่นะ'});
    if(mutation&&req.headers.origin!==origin)return res.status(403).json({error:'คำขอไม่ถูกต้อง'});
    try{const user=anonymous?null:await identity(req,res);if(!anonymous&&!user)return res.status(401).json({error:'กรุณาเข้าสู่ระบบด้วย Google'});await fn(req,res,user)}catch{res.status(503).json({error:'เชื่อมต่อบัญชีไม่ได้ ลองใหม่อีกครั้ง'})}
  }}
  function install(app,express){
    app.get('/api/account/config',(_req,res)=>res.json({enabled,avatars}));
    if(!enabled)return;
    app.use(express.json({limit:'8kb'}));
    app.get('/auth/google',route(async(req,res)=>{
      const {data,error}=await client(req,res).auth.signInWithOAuth({provider:'google',options:{redirectTo:origin+'/auth/callback',skipBrowserRedirect:true}});
      if(error||!data.url)throw Error('OAuth failed');res.redirect(data.url);
    },{anonymous:true}));
    app.get('/auth/callback',async(req,res)=>{
      res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');
      try{if(typeof req.query.code!=='string')throw Error('No code');const {error}=await client(req,res).auth.exchangeCodeForSession(req.query.code);if(error)throw error;res.redirect('/')}catch{res.redirect('/?login=failed')}
    });
    app.get('/api/account/me',route(async(req,res,user)=>res.json({profile:publicProfile(await profile(user.id))})));
    app.get('/api/account/history',route(async(req,res,user)=>res.json({matches:await db('match_results?select=match_id,rank,xp,score,created_at&user_id=eq.'+user.id+'&order=created_at.desc&limit=20')})));
    app.post('/api/account/profile',route(async(req,res,user)=>{
      const {displayName,avatarKey}=req.body||{};
      if(!validName(displayName)||!avatarKeys.has(avatarKey))return res.status(400).json({error:'ชื่อ 2–18 ตัวอักษร ใช้ตัวอักษร ตัวเลข เว้นวรรค _ . - และเลือกรูปที่มีให้'});
      const previous=await profile(user.id),record={display_name:displayName.trim(),avatar_key:avatarKey};
      const rows=await db(previous?'profiles?id=eq.'+user.id:'profiles',{method:previous?'PATCH':'POST',body:previous?record:{id:user.id,...record},prefer:'return=representation'});
      const p=publicProfile(rows[0]);const socket=sockets.get(user.id);if(socket)socket.data.account=p;
      res.json({profile:p});
    },{mutation:true}));
    app.post('/api/account/logout',route(async(req,res,user)=>{const {error}=await user.auth.auth.signOut({scope:'local'});if(error)throw error;sockets.get(user.id)?.disconnect(true);res.json({ok:true})},{mutation:true}));
  }
  function installSockets(io){
    if(!enabled)return;
    io.use(async(socket,next)=>{
      if(socket.handshake.headers.origin!==origin)return next(Error('AUTH_REQUIRED'));
      try{const user=await identity({headers:socket.handshake.headers});if(!user)return next(Error('AUTH_REQUIRED'));const p=await profile(user.id);if(!p)return next(Error('PROFILE_REQUIRED'));socket.data.account=publicProfile(p);socket.data.accountUser=user;next()}catch{next(Error('ACCOUNT_UNAVAILABLE'))}
    });
    io.on('connection',socket=>{
      const id=socket.data.account.id,old=sockets.get(id);sockets.set(id,socket);
      if(old&&old!==socket){old.emit('accountReplaced');old.disconnect(true)}
      let checked=clock();socket.use(async(_packet,next)=>{
        if(sockets.get(id)!==socket)return next(Error('SESSION_REPLACED'));
        if(clock()-checked<60000)return next();
        try{const {data,error}=await socket.data.accountUser.auth.auth.getUser();if(error||data.user?.id!==id){socket.emit('accountExpired');socket.disconnect(true);return}checked=clock();next()}catch{socket.emit('accountExpired');socket.disconnect(true)}
      });
      socket.on('disconnect',()=>{if(sockets.get(id)===socket)sockets.delete(id)});
    });
  }
  async function flush(){
    if(!enabled||flushing)return;flushing=true;
    try{for(const [id,item] of pending){await db('rpc/award_match',{method:'POST',body:item});pending.delete(id);try{persist()}catch{pending.set(id,item);throw Error('Outbox write failed')}for(const row of item.p_results)sockets.get(row.user_id)?.emit('profileUpdated');}}
    catch{console.warn('XP remains queued; retry scheduled')}finally{flushing=false}
  }
  function record(room){
    if(!enabled||room.accountResultQueued||!room.result||!room.accountMatchId)return;
    const rows=room.result.rows||[];
    const records=rows.map(row=>({user_id:room.players.find(p=>p.id===row.id)?.accountId,score:row.total}));
    if(records.length<2||records.some(r=>!r.user_id))return;
    const item={p_match_id:room.accountMatchId,p_results:records,p_defeat:!!room.result.defeat};
    pending.set(item.p_match_id,item);persist();room.accountResultQueued=true;void flush();
  }
  let timer;if(enabled){timer=setInterval(()=>void flush(),30000);timer.unref();void flush()}
  return {enabled,install,installSockets,record,profile,publicProfile,flush,pending,close(){clearInterval(timer)},client,identity};
}
module.exports={createAccounts,PROFILE_FIELDS};
