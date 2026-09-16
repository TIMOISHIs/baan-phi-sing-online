const fs=require('fs');
const path=require('path');
const Module=require('module');
const assert=require('assert');

const root=__dirname;
let fakeIO=null;
class FakeSocket{
  constructor(id,io){this.id=id;this.io=io;this.data={};this.handlers=new Map();this.received=[];this.rooms=new Set();}
  on(ev,fn){this.handlers.set(ev,fn);}
  emit(ev,payload){this.received.push({ev,payload});}
  join(code){this.rooms.add(code);}
  leave(code){this.rooms.delete(code);}
  trigger(ev,payload={}){const fn=this.handlers.get(ev);if(!fn)throw new Error(`no handler ${ev}`);return fn(payload);}
  last(ev){for(let i=this.received.length-1;i>=0;i--)if(this.received[i].ev===ev)return this.received[i].payload;return null;}
}
class FakeServer{
  constructor(){fakeIO=this;this.handlers=new Map();this.sockets=[];}
  on(ev,fn){this.handlers.set(ev,fn);}
  connect(id){const s=new FakeSocket(id,this);this.sockets.push(s);const fn=this.handlers.get('connection');if(!fn)throw new Error('connection handler missing');fn(s);return s;}
  to(target){return {emit:(ev,payload)=>{for(const s of this.sockets){if(s.id===target||s.rooms.has(target))s.emit(ev,payload);}}};}
}
const fakeExpress=function(){return {use(){},get(){}}};
fakeExpress.static=()=>()=>{};
const fakeHttp={createServer:()=>({listen(){}})};

const origLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='express')return fakeExpress;
  if(request==='socket.io')return {Server:FakeServer};
  if(request==='http')return fakeHttp;
  return origLoad.call(this,request,parent,isMain);
};
const origTimeout=global.setTimeout,origInterval=global.setInterval;
global.setTimeout=(fn)=>{fn();return 1};
global.setInterval=()=>({unref(){}});

const filename=path.join(root,'server.js');
let src=fs.readFileSync(filename,'utf8');
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt,applyCurse,finalizeMovementOptions,publicSnapshot,movementOptions,queueOfficeDiscardPick,canRecoverToHand,setHp,addLog};\n`;
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(root);mod._compile(src,filename);
const T=mod.exports.__test;

function state(sock){return sock.last('state')}
function priv(sock){return sock.last('privateState')}
function error(sock){return sock.last('errorMessage')}
function roomFor(sock){return T.rooms.get(state(sock).code)}
function player(room,sock){return room.players.find(p=>p.socketId===sock.id)}
function setActive(room,p){room.game.turn=room.players.indexOf(p);}
function cleanTurn(room,p){
  setActive(room,p);room.phase='game';p.hp=Math.max(1,p.hp||1);
  Object.assign(room.game,{actions:3,rolled:false,moved:true,mustMove:false,moveOptional:false,legal:[],escapeRequired:false,escapeRule:null,pendingRoomEffect:null,pendingRitual:null,sanityDecision:false,traded:false,sacDrawn:false});
  room._negativeReaction=null;
}
function takeCard(room,id){
  for(const zone of ['amuDeck','amuDiscard']){
    const a=room.game[zone]||[];const i=a.findIndex(c=>c.id===id);if(i>=0)return a.splice(i,1)[0];
  }
  for(const p of room.players){const i=(p.amu||[]).findIndex(c=>c.id===id);if(i>=0)return p.amu.splice(i,1)[0];}
  return T.uidCard(T.AMULETS.find(c=>c.id===id));
}
function takeSac(room,color='green'){
  const i=room.game.sacDeck.findIndex(c=>c.color===color);if(i>=0)return room.game.sacDeck.splice(i,1)[0];
  return T.uidCard(T.SACRIFICES.find(c=>c.color===color));
}

// Lobby + uniqueness + ghost one-shot + game setup.
const host=fakeIO.connect('host');
host.trigger('createRoom',{name:'ติม',sessionToken:'token_host_123456'});
const code=state(host).code;
const guest=fakeIO.connect('guest');
guest.trigger('joinRoom',{code,name:'เพื่อน',sessionToken:'token_guest_12345'});
host.trigger('selectCharacter',{key:'por-krai'});host.trigger('confirmCharacter');host.trigger('setReady',{ready:true});
guest.trigger('selectCharacter',{key:'por-krai'});
assert.match(error(guest)||'',/ถูกยืนยัน|ถูกผู้เล่นอื่น/);
guest.trigger('selectCharacter',{key:'temple-dog'});guest.trigger('confirmCharacter');guest.trigger('setReady',{ready:true});
host.trigger('startGame');assert.equal(state(host).phase,'ghostSelect');
host.trigger('randomGhost');assert.equal(state(host).phase,'game');
let room=T.rooms.get(code),hp=player(room,host),gp=player(room,guest),g=room.game;
assert.equal(room.players.length,2);assert.equal(g.sacDeck.length,54);assert.equal(g.amuDeck.length,57);assert.equal(hp.amu.length,3);assert.equal(gp.amu.length,3);assert.equal(g.turn,room.players.indexOf(hp));
assert.equal(T.AMULETS.length,63);assert.equal(T.SACRIFICES.length,54);assert.equal(T.GHOSTS.length,9);assert.equal(T.CHARS.length,8);assert.equal(T.ROOMS.length,12);



function prepare(){
 cleanTurn(room,hp);room.trade=null;hp.char=T.CHARS.find(c=>c.key==='por-krai');hp.hp=10;hp.amu=[];hp.equip=[];hp.pos=0;
 gp.hp=7;gp.pos=8;g.bossIndex=8;g.ghost=T.GHOSTS[0];g.curse=0;g.curseResolving=false;
 g.rooms=Array.from({length:9},()=>({...T.ROOMS.find(r=>r.type==='ปลอดภัย'),fear:1,capacity:null,effectId:null}));g.amuDiscard=[];g.amuDeck=[];
}
const make=type=>T.uidCard(T.AMULETS.find(c=>c.type===type));
// Only Por Krai has a third slot, both in metadata and authoritative handlers.
assert.equal(T.CHARS.find(c=>c.key==='por-krai').slots,3);
for(const character of T.CHARS.filter(c=>c.key!=='por-krai')){
 prepare();hp.char=character;assert.equal(character.slots,2);hp.equip=[make('equip'),make('equip')];hp.amu=[make('equip')];
 host.trigger('equip',{uid:hp.amu[0].uid});assert.equal(hp.equip.length,2);assert.equal(g.actions,3);
}
// Events are omitted from recovery and forged event selection cannot resolve/replay it.
prepare();const event=make('event'),helper=make('heal_self');g.amuDiscard=[event,helper];
T.queueOfficeDiscardPick(room,hp,{force:true});assert.equal(g.pendingRoomEffect.options.length,1);assert.equal(g.pendingRoomEffect.options[0].uid,helper.uid);
const pendingId=g.pendingRoomEffect.id;host.trigger('resolveRoomEffect',{uid:event.uid});assert.equal(g.pendingRoomEffect.id,pendingId);assert.equal(g.amuDiscard.length,2);assert.equal(hp.amu.length,0);
host.trigger('resolveRoomEffect',{uid:helper.uid});assert.equal(hp.amu[0].uid,helper.uid);assert.equal(g.amuDiscard[0].uid,event.uid);
prepare();g.amuDiscard=[make('event')];assert.equal(T.queueOfficeDiscardPick(room,hp,{force:true}),false);assert.equal(g.pendingRoomEffect,null);
// Recovery into full hand preserves all six choices, including returned card.
prepare();hp.amu=Array.from({length:5},()=>make('heal_self'));const recovered=make('equip');g.amuDiscard=[recovered];T.queueOfficeDiscardPick(room,hp,{force:true});host.trigger('resolveRoomEffect',{uid:recovered.uid});
assert.equal(g.pendingRoomEffect.type,'discardAmuletOverflow');assert.equal(g.pendingRoomEffect.options.length,6);host.trigger('resolveRoomEffect',{uid:recovered.uid});assert.equal(hp.amu.length,5);assert.ok(g.amuDiscard.some(c=>c.uid===recovered.uid));
// Preview before confirmation is read-only and updates after sanity adjustments.
prepare();Object.assign(g,{rolled:true,moved:false,sanityDecision:true,movementRange:3,sanity:1,sanityBase:1,sanityBonus:0,legal:[]});g.rooms[1].fear=2;
const before=JSON.stringify({moved:g.moved,mustMove:g.mustMove,optional:g.moveOptional,decision:g.sanityDecision,legal:g.legal});
const low=T.publicSnapshot(room).game.movementPreview;assert.ok(!low.legal.includes(1));assert.ok(low.legal.includes(3));
assert.equal(JSON.stringify({moved:g.moved,mustMove:g.mustMove,optional:g.moveOptional,decision:g.sanityDecision,legal:g.legal}),before);
host.trigger('move',{index:3});assert.equal(hp.pos,0);assert.equal(g.sanityDecision,true);
const positive=T.AMULETS.find(c=>c.type==='sanity'&&(c.sanityChoices||[]).some(n=>n>0)),san=T.uidCard(positive);hp.amu=[san,T.uidCard(positive)];const delta=positive.sanityChoices.find(n=>n>0);
host.trigger('useSanity',{uid:san.uid,delta});const higher=T.publicSnapshot(room).game.movementPreview;assert.ok(higher.legal.includes(1));assert.equal(g.sanityDecision,true);
host.trigger('finishSanityDecision');assert.deepEqual(g.legal,higher.legal);assert.equal(g.sanityDecision,false);host.trigger('move',{index:1});assert.equal(hp.pos,1);
// Public log exposes exact HP changes/cause and rule text, never hand identities or tokens.
prepare();const privateCard=make('equip');hp.amu=[privateCard];T.addLog(room,'เริ่มทดสอบ');T.setHp(room,hp,7,'ผลคำสาปทดสอบ');
const log=room.log.at(-1);assert.match(log.text,/HP 10 → 7/);assert.equal(log.details.reason,'ผลคำสาปทดสอบ');assert.ok(log.details.changes.some(c=>c.field==='HP'&&c.before===10&&c.after===7));
assert.ok(!JSON.stringify(log).includes(privateCard.uid));assert.ok(!JSON.stringify(log).includes(hp.token));
const named=T.AMULETS.find(c=>c.type==='event');T.addLog(room,`จั่ว Event: ${named.name}`);assert.ok(room.log.at(-1).details.cards.some(c=>c.name===named.name));
const saved=JSON.stringify(log);hp.hp=2;assert.equal(JSON.stringify(log),saved);
for(let i=0;i<150;i++)T.addLog(room,`test ${i}`);assert.equal(room.log.length,120);assert.equal(new Set(room.log.map(x=>x.id)).size,120);
global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
console.log('V1.8.6 SERVER REGRESSION: PASS (event recovery, slots, live movement preview, detailed private-safe logs)');
