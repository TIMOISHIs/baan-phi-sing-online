'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const express=require('express');
const {createAccounts}=require('./lib/accounts.cjs');
const IDS={a:'8dc3c20e-228c-45bd-a6d8-5acfd13644d1',b:'4ac6a7a5-3c8e-4a0f-8d90-cc66cb741826',c:'7efb3902-0749-43c9-8f04-1150b2c65ce5'};
const profiles=[{id:IDS.a,display_name:'Mina Star',avatar_key:'mali'},{id:IDS.b,display_name:'Tim Player',avatar_key:'nerd'},{id:IDS.c,display_name:'Tim Friend',avatar_key:'doctor'}];
let friendships=[],presence=[],now=Date.now();
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data}}
async function fakeDb(url,options={}){
 const u=new URL(url),table=u.pathname.split('/').pop(),p=u.searchParams,method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
 if(table==='profiles'&&method==='GET'){
  let out=[...profiles];const id=p.get('id')||'';
  if(id.startsWith('eq.'))out=out.filter(x=>x.id===id.slice(3));else if(id.startsWith('neq.'))out=out.filter(x=>x.id!==id.slice(4));else if(id.startsWith('in.')){const ids=id.slice(4).replace(/^\(|\)$/g,'').split(',');out=out.filter(x=>ids.includes(x.id))}
  const name=p.get('display_name')||'';if(name.startsWith('ilike.')){const term=name.slice(7).replace(/^\*|\*$/g,'').toLowerCase();out=out.filter(x=>x.display_name.toLowerCase().includes(term))}
  return response(out.slice(0,Number(p.get('limit')||100)));
 }
 if(table==='friendships'){
  if(method==='GET'){
   let out=[...friendships];for(const key of ['user_low','user_high','id']){const value=p.get(key)||'';if(value.startsWith('eq.'))out=out.filter(x=>x[key]===value.slice(3))}
   return response(out);
  }
  if(method==='POST'){
   if(friendships.some(x=>x.user_low===body.user_low&&x.user_high===body.user_high))return response({message:'duplicate'},409);
   const row={id:cryptoId(),...body,created_at:new Date(now).toISOString(),accepted_at:null};friendships.push(row);return response(options.headers?.Prefer?.includes('return=representation')?[row]:null,201);
  }
  if(method==='PATCH'){
   const id=(p.get('id')||'').slice(3),row=friendships.find(x=>x.id===id);if(!row)return response([],200);Object.assign(row,body);return response([row]);
  }
  if(method==='DELETE'){const id=(p.get('id')||'').slice(3);friendships=friendships.filter(x=>x.id!==id);return response(null,204)}
 }
 if(table==='friend_presence'){
  if(method==='POST'){const old=presence.find(x=>x.user_id===body.user_id);if(old)old.last_seen=body.last_seen;else presence.push(body);return response(null,204)}
  let out=[...presence],ids=(p.get('user_id')||'').slice(4).replace(/^\(|\)$/g,'').split(',');out=out.filter(x=>ids.includes(x.user_id));return response(out);
 }
 return response({error:'unhandled '+method+' '+table},404);
}
function cryptoId(){return require('node:crypto').randomUUID()}
function accountFactory(){return createAccounts({env:{ACCOUNTS_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SECRET_KEY:'secret',APP_URL:'https://game.example',DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'friends-test-'))},avatars:profiles.map(p=>({key:p.avatar_key,name:p.display_name,art:'/avatar.png'})),fetchImpl:fakeDb,clock:()=>now,clientFactory:(_url,_key,opts)=>({auth:{getUser:async()=>{const cookie=opts.cookies.getAll().find(c=>c.name==='test-user')?.value;return cookie&&IDS[cookie]?{data:{user:{id:IDS[cookie],identities:[{provider:'google'}]}},error:null}:{data:{user:null},error:{message:'missing'}}},signOut:async()=>({error:null})}})});}
async function main(){
 const app=express(),accounts=accountFactory();accounts.install(app,express);const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(user,route,{method='GET',body}={}){return fetch(base+route,{method,headers:{cookie:user?'test-user='+user:'','origin':'https://game.example',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})}
 try{
  assert.equal((await call(null,'/api/friends')).status,401,'friend endpoints require Google login');
  let r=await call('a','/api/friends/search?q=Tim');assert.equal(r.status,200);let data=await r.json();assert.equal(data.results.length,2);assert(!data.results.some(x=>x.id===IDS.a));
  r=await call('a','/api/friends/search?q='+IDS.b);assert.equal(r.status,200);data=await r.json();assert.equal(data.results.length,1);assert.equal(data.results[0].id,IDS.b);
  r=await call('a','/api/friends/search?q='+IDS.a);assert.equal((await r.json()).results.length,0,'player cannot find themselves by ID');
  r=await call('a','/api/friends/requests',{method:'POST',body:{userId:IDS.a}});assert.equal(r.status,400,'cannot add self');
  r=await call('a','/api/friends/requests',{method:'POST',body:{userId:IDS.b}});assert.equal(r.status,201,'request can be created');
  r=await call('a','/api/friends/requests',{method:'POST',body:{userId:IDS.b}});assert.equal(r.status,409,'duplicate request is rejected');
  let d=await(await call('b','/api/friends')).json();assert.equal(d.incoming.length,1);assert.equal(d.incoming[0].displayName,'Mina Star');
  r=await call('b',`/api/friends/requests/${d.incoming[0].requestId}/accept`,{method:'POST'});assert.equal(r.status,200,'recipient can accept');
  d=await(await call('a','/api/friends')).json();assert.equal(d.friends.length,1);assert.equal(d.friends[0].displayName,'Tim Player');assert.equal(d.sent.length,0);
  let blocked=await call('c',`/api/friends/requests/${d.friends[0].id}/accept`,{method:'POST'});assert.equal(blocked.status,404,'unrelated account cannot accept');
  const io={middlewares:[],use(fn){this.middlewares.push(fn)},on(event,fn){if(event==='connection')this.connection=fn}};accounts.installSockets(io);
  const socket={handshake:{headers:{origin:'https://game.example',cookie:'test-user=b'}},data:{},emit(){},disconnect(){},use(){},on(_event,fn){this.disconnected=fn}};
  await new Promise((resolve,reject)=>io.middlewares[0](socket,e=>e?reject(e):resolve()));io.connection(socket);await new Promise(r=>setTimeout(r,20));
  d=await(await call('a','/api/friends')).json();assert.equal(d.friends[0].online,true,'presence heartbeat marks the friend online');
  now+=100000;d=await(await call('a','/api/friends')).json();assert.equal(d.friends[0].online,false,'stale presence is reported offline');
  socket.disconnected();accounts.close();console.log('PASS: authenticated friend search, request, accept, privacy and online presence');
 }finally{accounts.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
