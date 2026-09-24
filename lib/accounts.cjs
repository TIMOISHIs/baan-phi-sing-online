'use strict';
const {randomUUID}=require('crypto');
const fs=require('fs'),path=require('path');
const {levelProgress,validName}=require('./progression.cjs');
const {CHARACTERS,CATEGORIES,ownedCharacters}=require('./shop-catalog.cjs');
const PROFILE_FIELDS='id,display_name,avatar_key,total_xp,games_played,wins';
function createAccounts({env=process.env,avatars,fetchImpl=fetch,clock=Date.now,clientFactory}={}){
  // APP_URL is an origin, but dashboard variables are often pasted with a
  // trailing slash. Keep one canonical value for OAuth, HTTP checks and the
  // Socket.IO guard so an otherwise valid deployment does not reject itself.
  const normalizeOrigin=value=>String(value||'').trim().replace(/\/+$/,'');
  const enabled=env.ACCOUNTS_ENABLED==='true',url=env.SUPABASE_URL,publicKey=env.SUPABASE_PUBLISHABLE_KEY,secret=env.SUPABASE_SECRET_KEY,origin=normalizeOrigin(env.APP_URL);
  if(enabled&&(!url||!publicKey||!secret||!origin||!env.DATA_DIR))throw Error('Account configuration incomplete: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, APP_URL and DATA_DIR required');
  if(enabled&&(!/^https:\/\/[^/]+$/.test(origin)||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)))throw Error('Use HTTPS APP_URL origin and hosted Supabase URL');
  const shopEnabled=enabled&&env.SHOP_ENABLED==='true';
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
  async function shopState(id){
    if(!shopEnabled)return {enabled:false};
    const [wallet,items]=await Promise.all([db('wallets?select=baht&user_id=eq.'+encodeURIComponent(id)),db('character_ownership?select=character_key&user_id=eq.'+encodeURIComponent(id))]);
    return {enabled:true,baht:Number(wallet[0]?.baht||0),owned:ownedCharacters(items.map(x=>x.character_key)),catalog:CHARACTERS.map(c=>({...avatars.find(a=>a.key===c.key),...c})),categories:CATEGORIES};
  }
  const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const friendFields='id,user_low,user_high,requested_by,status,created_at,accepted_at';
  async function friendRows(id){
    const [low,high]=await Promise.all([
      db('friendships?select='+friendFields+'&user_low=eq.'+encodeURIComponent(id)+'&order=created_at.desc&limit=200'),
      db('friendships?select='+friendFields+'&user_high=eq.'+encodeURIComponent(id)+'&order=created_at.desc&limit=200')
    ]);
    return [...low,...high];
  }
  async function friendProfiles(ids){
    if(!ids.length)return [];
    return db('profiles?select=id,display_name,avatar_key&id=in.('+ids.map(encodeURIComponent).join(',')+')');
  }
  async function friendView(row){
    return {id:row.id,displayName:row.display_name,avatar:avatars.find(a=>a.key===row.avatar_key)?.art||null};
  }
  async function friendData(id){
    const rows=await friendRows(id),accepted=rows.filter(r=>r.status==='accepted');
    const ids=[...new Set(accepted.map(r=>r.user_low===id?r.user_high:r.user_low))];
    const profiles=await friendProfiles(ids),presence=ids.length?await db('friend_presence?select=user_id,last_seen&user_id=in.('+ids.map(encodeURIComponent).join(',')+')'):[];
    const seen=new Map(presence.map(p=>[p.user_id,Date.parse(p.last_seen)||0])),onlineCutoff=clock()-90000,byId=new Map(profiles.map(p=>[p.id,p]));
    const peer=async(uid)=>{const p=byId.get(uid);return p?{...(await friendView(p)),online:(seen.get(uid)||0)>=onlineCutoff,lastSeen:seen.get(uid)?new Date(seen.get(uid)).toISOString():null}:null};
    const friends=(await Promise.all(accepted.map(async r=>peer(r.user_low===id?r.user_high:r.user_low)))).filter(Boolean).sort((a,b)=>Number(b.online)-Number(a.online)||a.displayName.localeCompare(b.displayName,'th'));
    const incoming=rows.filter(r=>r.status==='pending'&&r.requested_by!==id),sent=rows.filter(r=>r.status==='pending'&&r.requested_by===id);
    const incomingProfiles=await friendProfiles(incoming.map(r=>r.requested_by)),sentProfiles=await friendProfiles(sent.map(r=>r.requested_by===id?(r.user_low===id?r.user_high:r.user_low):r.requested_by));
    const mapProfiles=async(list,items,selectId)=>Promise.all(items.map(async r=>{const uid=selectId(r),p=list.find(x=>x.id===uid);return p?{requestId:r.id,...(await friendView(p)),createdAt:r.created_at}:null}));
    return {friends,incoming:(await mapProfiles(incomingProfiles,incoming,r=>r.requested_by)).filter(Boolean),sent:(await mapProfiles(sentProfiles,sent,r=>r.user_low===id?r.user_high:r.user_low)).filter(Boolean)};
  }
  async function touchPresence(id){
    if(!enabled)return;
    await db('friend_presence?on_conflict=user_id',{method:'POST',body:{user_id:id,last_seen:new Date(clock()).toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
  }
  async function canUse(id,key){if(!shopEnabled)return true;return (await shopState(id)).owned.includes(key)}
  function publicProfile(p){return p?{...p,progress:levelProgress(p.total_xp),avatar:avatars.find(a=>a.key===p.avatar_key)?.art||null}:null}
  function rate(req){const now=clock(),key=req.ip;let r=limits.get(key);if(!r||r.until<now){r={count:0,until:now+60000};limits.set(key,r)}if(limits.size>5000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);return ++r.count<=60}
  function route(fn,{mutation=false,anonymous=false}={}){return async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!enabled)return res.status(503).json({error:'ระบบสมาชิกยังไม่เปิดให้บริการ'});
    if(!rate(req))return res.status(429).json({error:'ลองใหม่อีกสักครู่นะ'});
    if(mutation&&normalizeOrigin(req.headers.origin)!==origin)return res.status(403).json({error:'คำขอไม่ถูกต้อง'});
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
    app.get('/api/account/shop',route(async(req,res,user)=>res.json(await shopState(user.id))));
    app.post('/api/account/buy',route(async(req,res,user)=>{
      if(!shopEnabled)return res.status(503).json({error:'ร้านค้ายังไม่เปิดให้บริการ'});
      if(typeof req.body?.characterKey!=='string')return res.status(400).json({error:'เลือกตัวละคร'});
      const result=await db('rpc/buy_character',{method:'POST',body:{p_user_id:user.id,p_character_key:req.body.characterKey}});
      if(!result.ok)return res.status(400).json(result);
      res.json(await shopState(user.id));
    },{mutation:true}));
    app.get('/api/account/me',route(async(req,res,user)=>res.json({profile:publicProfile(await profile(user.id))})));
    app.get('/api/friends',route(async(req,res,user)=>res.json(await friendData(user.id))));
    app.get('/api/friends/search',route(async(req,res,user)=>{
      const q=String(req.query.q||'').trim();
      if(!q||q.length>64)return res.status(400).json({error:'พิมพ์ชื่อในเกมหรือ Player ID ก่อนค้นหา'});
      let rows=[];
      if(UUID_RE.test(q)){if(q.toLowerCase()!==user.id.toLowerCase())rows=await db('profiles?select=id,display_name,avatar_key&id=eq.'+encodeURIComponent(q)+'&limit=1')}
      else {
        if(q.length<2||q.length>18||!/^[\p{L}\p{N} _.\-]+$/u.test(q))return res.status(400).json({error:'ค้นหาด้วยชื่อในเกมอย่างน้อย 2 ตัวอักษร'});
        rows=await db('profiles?select=id,display_name,avatar_key&display_name=ilike.*'+encodeURIComponent(q)+'*&id=neq.'+encodeURIComponent(user.id)+'&order=display_name.asc&limit=10');
      }
      res.json({results:await Promise.all(rows.map(friendView))});
    }));
    app.post('/api/friends/requests',route(async(req,res,user)=>{
      const target=String(req.body?.userId||'').toLowerCase();if(!UUID_RE.test(target))return res.status(400).json({error:'รหัสผู้เล่นไม่ถูกต้อง'});
      if(target===user.id)return res.status(400).json({error:'เพิ่มตัวเองเป็นเพื่อนไม่ได้'});
      if(!(await profile(target)))return res.status(404).json({error:'ไม่พบผู้เล่นนี้'});
      const existing=(await friendRows(user.id)).find(r=>r.user_low===target||r.user_high===target);
      if(existing){if(existing.status==='accepted')return res.status(409).json({error:'เป็นเพื่อนกันอยู่แล้ว'});return res.status(409).json({error:existing.requested_by===user.id?'ส่งคำขอไปแล้ว':'เพื่อนคนนี้ส่งคำขอมาแล้ว ให้กดรับคำขอ'});}
      const [user_low,user_high]=user.id.toLowerCase()<target.toLowerCase()?[user.id,target]:[target,user.id];
      try{await db('friendships',{method:'POST',body:{user_low,user_high,requested_by:user.id,status:'pending'},prefer:'return=minimal'});}
      catch{const raced=(await friendRows(user.id)).find(r=>r.user_low===target||r.user_high===target);if(raced)return res.status(409).json({error:raced.status==='accepted'?'เป็นเพื่อนกันอยู่แล้ว':raced.requested_by===user.id?'ส่งคำขอไปแล้ว':'เพื่อนคนนี้ส่งคำขอมาแล้ว ให้กดรับคำขอ'});throw Error('Friend request could not be saved')}
      res.status(201).json({ok:true});
    },{mutation:true}));
    app.post('/api/friends/requests/:id/accept',route(async(req,res,user)=>{
      if(!UUID_RE.test(req.params.id))return res.status(400).json({error:'คำขอไม่ถูกต้อง'});
      const rows=await db('friendships?select='+friendFields+'&id=eq.'+encodeURIComponent(req.params.id)+'&limit=1'),item=rows[0];
      if(!item||item.status!=='pending'||item.requested_by===user.id||![item.user_low,item.user_high].includes(user.id))return res.status(404).json({error:'ไม่พบคำขอเพื่อนนี้'});
      await db('friendships?id=eq.'+encodeURIComponent(item.id),{method:'PATCH',body:{status:'accepted',accepted_at:new Date(clock()).toISOString()},prefer:'return=minimal'});
      res.json({ok:true});
    },{mutation:true}));
    app.delete('/api/friends/requests/:id',route(async(req,res,user)=>{
      if(!UUID_RE.test(req.params.id))return res.status(400).json({error:'คำขอไม่ถูกต้อง'});
      const rows=await db('friendships?select='+friendFields+'&id=eq.'+encodeURIComponent(req.params.id)+'&limit=1'),item=rows[0];
      if(!item||item.status!=='pending'||![item.user_low,item.user_high].includes(user.id))return res.status(404).json({error:'ไม่พบคำขอนี้'});
      await db('friendships?id=eq.'+encodeURIComponent(item.id),{method:'DELETE'});
      res.json({ok:true});
    },{mutation:true}));
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
      // Same-origin Socket.IO polling GETs are allowed to omit Origin. The
      // session cookie and Supabase getUser() below remain the authentication
      // source of truth; reject only an explicitly different Origin.
      const requestOrigin=normalizeOrigin(socket.handshake.headers.origin);
      if(requestOrigin&&requestOrigin!==origin)return next(Error('AUTH_REQUIRED'));
      try{const user=await identity({headers:socket.handshake.headers});if(!user)return next(Error('AUTH_REQUIRED'));const p=await profile(user.id);if(!p)return next(Error('PROFILE_REQUIRED'));socket.data.account=publicProfile(p);socket.data.accountUser=user;next()}catch{next(Error('ACCOUNT_UNAVAILABLE'))}
    });
    io.on('connection',socket=>{
      const id=socket.data.account.id,old=sockets.get(id);sockets.set(id,socket);
      if(old&&old!==socket){old.emit('accountReplaced');old.disconnect(true)}
      void touchPresence(id).catch(()=>{});
      const presenceTimer=setInterval(()=>{if(sockets.get(id)===socket)void touchPresence(id).catch(()=>{})},30000);presenceTimer.unref();
      let checked=clock();socket.use(async(_packet,next)=>{
        if(sockets.get(id)!==socket)return next(Error('SESSION_REPLACED'));
        if(clock()-checked<60000)return next();
        try{const {data,error}=await socket.data.accountUser.auth.auth.getUser();if(error||data.user?.id!==id){socket.emit('accountExpired');socket.disconnect(true);return}checked=clock();next()}catch{socket.emit('accountExpired');socket.disconnect(true)}
      });
      socket.on('disconnect',()=>{clearInterval(presenceTimer);if(sockets.get(id)===socket)sockets.delete(id)});
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
  return {enabled,shopEnabled,shopState,canUse,install,installSockets,record,profile,publicProfile,flush,pending,close(){clearInterval(timer)},client,identity};
}
module.exports={createAccounts,PROFILE_FIELDS};
