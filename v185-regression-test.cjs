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
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt,applyCurse,finalizeMovementOptions,publicSnapshot};\n`;
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


// Exercise real socket handlers and deferred curse resolution without waiting in real time.
const deferred=[];global.setTimeout=(fn,ms)=>{if(ms===2700){deferred.push(fn);return 1}fn();return 1};
function reset(){
  cleanTurn(room,hp);room.trade=null;room.settings.forcedMovement=true;
  hp.char=T.CHARS.find(c=>c.key==='por-krai');hp.hp=10;hp.amu=[];hp.equip=[];hp.pos=0;hp.score=5;
  gp.hp=7;gp.equip=[];gp.pos=0;gp.score=5;
  g.rooms=Array.from({length:9},()=>({...T.ROOMS.find(r=>r.type==='ปลอดภัย'),fear:0,capacity:null,effectId:null}));g.bossIndex=8;
  Object.assign(g,{curse:0,curseWarned:false,curseResolving:false,curseResolveAt:null,amuDeck:[],amuDiscard:[],movementRange:0,moveDistances:{},sanity:20});
  g.ghost=T.GHOSTS[0];deferred.length=0;
}
function card(type='equip'){return T.uidCard(T.AMULETS.find(c=>c.type===type))}
// All three character slots usable, fourth rejected without spending incense.
reset();hp.equip=[card(),card()];const third=card();hp.amu=[third];host.trigger('equip',{uid:third.uid});assert.equal(hp.equip.length,3);assert.equal(g.actions,2);
const fourth=card();hp.amu.push(fourth);host.trigger('equip',{uid:fourth.uid});assert.equal(hp.equip.length,3);assert.equal(g.actions,2);
// Animal slot limit stays at two.
reset();hp.char=T.CHARS.find(c=>c.key==='temple-dog');hp.equip=[card(),card()];hp.amu=[card()];host.trigger('equip',{uid:hp.amu[0].uid});assert.equal(hp.equip.length,2);assert.equal(g.actions,3);
// Bathroom free equip respects third slot.
reset();hp.equip=[card(),card()];g.rooms[0].effectId='equip_free';g.amuDeck=[card()];host.trigger('drawAmulet');assert.equal(hp.equip.length,3);assert.equal(g.actions,2);
// Full hand includes the sixth card in options and permits discarding it.
reset();hp.amu=Array.from({length:5},()=>card('heal_self'));const incoming=card();g.amuDeck=[incoming];host.trigger('drawAmulet');
assert.equal(hp.amu.length,6);assert.equal(g.pendingRoomEffect.options.length,6);assert.ok(g.pendingRoomEffect.options.some(c=>c.uid===incoming.uid));
host.trigger('resolveRoomEffect',{uid:incoming.uid});assert.equal(hp.amu.length,5);assert.ok(g.amuDiscard.some(c=>c.uid===incoming.uid));assert.equal(g.pendingRoomEffect,null);
// Unequip charges exactly one and returns same UID; full hand allows keeping returned equipment.
reset();const worn=card();hp.equip=[worn];hp.amu=Array.from({length:5},()=>card('heal_self'));const old=hp.amu[0].uid;g.actions=1;
host.trigger('unequip',{uid:worn.uid});assert.equal(g.actions,0);assert.equal(g.turn,room.players.indexOf(hp));assert.equal(hp.equip.length,0);assert.equal(hp.amu.length,6);
assert.ok(g.pendingRoomEffect.options.some(c=>c.uid===worn.uid));host.trigger('resolveRoomEffect',{uid:old});assert.equal(hp.amu.length,5);assert.ok(hp.amu.some(c=>c.uid===worn.uid));
reset();hp.equip=[card()];const one=hp.equip[0];host.trigger('unequip',{uid:one.uid});assert.equal(hp.amu[0].uid,one.uid);assert.equal(g.actions,2);
// Zero incense cannot remove equipment.
reset();hp.equip=[card()];g.actions=0;host.trigger('unequip',{uid:hp.equip[0].uid});assert.equal(hp.equip.length,1);
// Reach multi-room destinations by orthogonal path within raw dice range.
reset();g.moved=false;g.movementRange=2;T.finalizeMovementOptions(room,hp);assert.ok(g.legal.includes(2));assert.ok(g.legal.includes(4));assert.ok(!g.legal.includes(5));assert.equal(g.moveDistances[2],2);
host.trigger('move',{index:2});assert.equal(hp.pos,2);assert.equal(g.moved,true);const pos=hp.pos;host.trigger('move',{index:5});assert.equal(hp.pos,pos);
// Fear and occupied capacity block paths; cannot tunnel through traps.
reset();g.movementRange=2;g.sanity=1;g.rooms[1].fear=9;T.finalizeMovementOptions(room,hp);assert.ok(!g.legal.includes(2));
reset();g.movementRange=2;g.rooms[1].capacity=1;gp.pos=1;T.finalizeMovementOptions(room,hp);assert.ok(!g.legal.includes(1));assert.ok(!g.legal.includes(2));
reset();g.movementRange=2;g.rooms[1].type='กับดัก';T.finalizeMovementOptions(room,hp);assert.ok(g.legal.includes(1));assert.ok(!g.legal.includes(2));
// A real move roll captures the raw dice range (not Fear-adjusted sanity).
reset();g.moved=false;g.rooms[0].fear=2;const oldRandom=Math.random;Math.random=()=>0.2;host.trigger('roll');Math.random=oldRandom;assert.equal(g.movementRange,4);assert.equal(g.sanity,2);assert.ok(g.legal.includes(5));
// Each ghost reaches warning once and burst once; no early effect at 1..5.
for(const ghost of T.GHOSTS){
  reset();g.ghost=ghost;
  const rule=ghost.curseTrigger;let d;
  if(rule.kind==='totalEquals')d={a:Math.min(6,rule.value-1),b:rule.value-Math.min(6,rule.value-1),total:rule.value};
  else if(rule.kind==='dieIncludes')d={a:rule.values[0],b:3,total:rule.values[0]+3};
  else d={a:3,b:3,total:6};
  const eventsBefore=host.received.filter(e=>e.ev==='curseFx').length;
  for(let i=1;i<=5;i++){T.applyCurse(room,d);assert.equal(g.curse,i,ghost.id);assert.equal(hp.hp,10);assert.equal(hp.score,5);assert.equal(hp.pos,0)}
  const warn=host.received.filter(e=>e.ev==='curseFx').slice(eventsBefore);assert.equal(warn.length,1);assert.equal(warn[0].payload.phase,'warning');
  T.applyCurse(room,d);assert.equal(g.curse,6);assert.equal(g.curseResolving,true);assert.equal(deferred.length,1);assert.equal(T.publicSnapshot(room).game.curseResolving,true);
  const handBefore=hp.amu.length;host.trigger('drawAmulet');assert.equal(hp.amu.length,handBefore);const turn=g.turn;host.trigger('endTurn');assert.equal(g.turn,turn);
  T.applyCurse(room,d);assert.equal(deferred.length,1);deferred.shift()();assert.equal(g.curse,0);assert.equal(g.curseResolving,false);
  if(['ghost-occult-master','ghost-headless','ghost-pob-jaothi','ghost-pregnant','ghost-widow'].includes(ghost.id))assert.equal(hp.hp,9,ghost.id);
  if(['ghost-treasure-guard','ghost-kumarn'].includes(ghost.id))assert.equal(hp.score,4,ghost.id);
  if(['ghost-oil-pillar','ghost-wanderer'].includes(ghost.id))assert.notEqual(hp.pos,0,ghost.id);
  for(let i=0;i<3;i++)T.applyCurse(room,d);
  assert.equal(host.received.filter(e=>e.ev==='curseFx').slice(eventsBefore).filter(e=>e.payload.phase==='warning').length,2);
}
// Old delayed callback must not affect a replacement game.
reset();g.curse=5;T.applyCurse(room,{a:4,b:4,total:8});const saved=g;room.game={...g,curse:2};deferred.shift()();assert.equal(room.game.curse,2);room.game=saved;
global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
console.log('V1.8.5 SERVER REGRESSION: PASS (equipment, overflow, movement, all 9 curses)');
