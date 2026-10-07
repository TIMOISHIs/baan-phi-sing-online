'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/public/index.html','utf8');
async function main(){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://game.example'}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.toast=()=>{};w.resetLocalRoom=()=>{};w.socket={connected:false,on(){},connect(){this.connected=true},disconnect(){this.connected=false}};
 w.roomKey='room';w.openModal=()=>{};w.show=()=>{};
 const mine='8dc3c20e-228c-45bd-a6d8-5acfd13644d1',peer='4ac6a7a5-3c8e-4a0f-8d90-cc66cb741826';let friends=[],requests=[];
 w.fetch=async(url,opts={})=>{
  const method=opts.method||'GET';let data={},status=200;
  if(url.endsWith('/api/account/config'))data={enabled:true,avatars:[{key:'mali',name:'Mali',art:'/mali.png'}]};
  else if(url.endsWith('/api/account/me'))data={profile:{id:mine,display_name:'Tim',avatar_key:'mali',avatar:'/mali.png',progress:{level:2,current:20,required:100,remaining:80},games_played:1,wins:0}};
  else if(url.endsWith('/api/account/current-room'))data={code:null};
  else if(url.endsWith('/api/friends/search?q=Tim'))data={results:[{id:peer,displayName:'Tim Friend',avatar:'/friend.png'}]};
  else if(url.endsWith('/api/friends/requests')&&method==='POST'){requests.push(peer);status=201;data={ok:true}}
  else if(url.endsWith('/api/friends'))data={friends,incoming:[],sent:requests.map(id=>({id,requestId:'10000000-0000-4000-8000-000000000001',displayName:'Tim Friend',avatar:'/friend.png'}))};
  return{ok:status>=200&&status<300,status,json:async()=>data};
 };
 w.eval(fs.readFileSync(__dirname+'/public/shop.js','utf8'));await new Promise(r=>setTimeout(r,10));
 const ordered=[...d.querySelectorAll('.lobby-nav button')].map(x=>x.id);assert.deepEqual(ordered,['shopBtn','bagBtn','charactersBtn','friendsBtn'],'Lobby shortcut order is shop, bag, characters, friends');
 assert.match(fs.readFileSync(__dirname+'/public/styles.css','utf8'),/\.lobby-footer \.lobby-nav\{display:none/,'shop/bag/character/friend shortcuts remain hidden on login');
 w.eval(fs.readFileSync(__dirname+'/public/accounts.js','utf8'));await new Promise(r=>setTimeout(r,20));
 d.querySelector('#friendsBtn').click();await new Promise(r=>setTimeout(r,20));assert.equal(d.querySelector('#friendsDialog').open,true);
 d.querySelector('#friendSearchInput').value='Tim';d.querySelector('#friendSearchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert.equal(d.querySelector('#friendSearchResults .friend-details b').textContent,'Tim Friend');
 d.querySelector('#friendSearchResults .friend-actions button').click();await new Promise(r=>setTimeout(r,20));assert.equal(requests.length,1);assert.match(d.querySelector('#friendSent').textContent,/Tim Friend/);
 assert.equal(d.querySelector('#friendCount').textContent,'0');assert.match(d.querySelector('.friend-card').textContent,/คำขอ/);
 dom.window.close();console.log('PASS: Lobby friend shortcut, hidden unauthenticated navigation, search and request feedback');
}
main().catch(e=>{console.error(e);process.exitCode=1});
