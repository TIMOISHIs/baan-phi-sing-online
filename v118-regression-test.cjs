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
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt,applyCurse,finalizeMovementOptions,publicSnapshot,privateSnapshot,startRoom,beginTurn,advanceToNextAlive,recordDice,movementOptions,queueOfficeDiscardPick,canRecoverToHand,setHp,addLog,expireTurn,rescueOptions,emitRoom,balancedRoomMap,roomEscapeProgress,setPlayerPosition,addCurseProgress,resolveGhostCurse,spellMoveOptions};\n`;
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
  room._negativeReaction=null;room._protectionBatches=[];room.game.protectionPending=false;
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




const host=fakeIO.connect('host117');host.trigger('createRoom',{name:'ติม',sessionToken:'host117abcdefgh'});
const room=roomFor(host),clients=[host];
for(let i=1;i<6;i++){const c=fakeIO.connect('guest117-'+i);c.trigger('joinRoom',{code:room.code,name:'เพื่อน '+i,sessionToken:'guest117abcdef'+i});clients.push(c)}
room.players.forEach((p,i)=>p.characterKey=T.CHARS[i].key);
T.startRoom(room,T.GHOSTS[0]);let g=room.game;const p=room.players[0],friend=room.players[1];
const safe=()=>({...T.ROOMS.find(r=>r.type==='ปลอดภัย'),fear:1,capacity:null});
function reset(id='CURSE_EVEN'){
 room.phase='game';room.trade=null;
 room.players.forEach((x,i)=>{Object.assign(x,{hp:x.char.hp,pos:i?8:4,amu:[],sac:[],equip:[],skipTurns:0,freeSpecialExit:false,skipSpecialStartEffect:false,roomEscapeStacks:null});});
 Object.assign(g,{turn:0,actions:3,rolled:false,moved:false,rescue:null,mustMove:false,moveOptional:false,sanityDecision:false,pendingRoomEffect:null,pendingRitual:null,curse:0,curseResolving:false,curseDiscardQueue:[],catHelp:null,turnDeadline:Date.now()+120000,timeoutAnnounced:false,sanity:null,sanityBase:null,moveFear:null,movementRange:0,moveDistances:{},escapeAttempts:0});
 g.turnSerial=(g.turnSerial||0)+1;g.rooms=Array.from({length:9},safe);g.bossIndex=8;
 g.ghost={...T.GHOSTS[0],curseRule:{kind:'totalEquals',value:99}};
 g.rooms[4]={...T.ROOMS.find(r=>r.id===id)};
 g.escapeRequired=!!g.rooms[4].escapeRule;g.escapeRule=g.rooms[4].escapeRule||null;
 room._negativeReaction=null;room._protectionBatches=[];room.game.protectionPending=false;
}
function withDice(a,b,fn){const old=Math.random,values=[(a-.5)/6,(b-.5)/6];Math.random=()=>values.shift()??.2;try{return fn()}finally{Math.random=old}}
const escape=(a,b)=>withDice(a,b,()=>host.trigger('escapeRoom'));
const count=()=>T.roomEscapeProgress(room,p)?.count||0;

function card(id,owner=p){const c=T.uidCard(T.AMULETS.find(c=>c.id===id));owner.amu.push(c);return c;}
function cast(c){host.trigger('castSpell',{uid:c.uid});}
function choose(index){host.trigger('resolveRoomEffect',{uid:index});}
function reply(owner,use=true){const sock=clients[room.players.indexOf(owner)],pending=g.pendingRoomEffect;sock.trigger('resolveRoomEffect',{uid:use?pending.options[0].uid:'pass',pendingId:pending.id});}
reset('HALL');p.pos=0;g.rooms[0].fear=99;g.bossIndex=2;g.ghost.fear=6;g.rooms[1].fear=1;g.sanity=6;g.movementRange=6;
let opts=T.movementOptions(room,p);assert.ok(opts.legal.includes(1));assert.ok(!opts.legal.includes(2));
g.rooms[1].fear=3;assert.ok(!T.movementOptions(room,p).legal.includes(2));g.sanity=9;assert.equal(T.movementOptions(room,p).costs[2],9);
reset('HALL');p.pos=0;g.rooms[1].fear=5;g.rooms[2].fear=1;g.sanity=4;g.movementRange=4;
opts=T.movementOptions(room,p);assert.deepEqual(opts.paths[2],[0,3,4,5,2]);assert.equal(opts.costs[2],4);
g.movementRange=3;assert.ok(!T.movementOptions(room,p).legal.includes(2));
g.movementRange=4;g.rolled=true;T.finalizeMovementOptions(room,p);host.trigger('move',{index:2});assert.equal(p.pos,2);assert.equal(g.sanity,0);
host.trigger('move',{index:5});assert.equal(p.pos,2);
// Pass each special room, charge every entered Fear, and stop only at destination.
for(const type of ['กับดัก','คำสาป','บอส']){
 reset('HALL');p.pos=0;g.rooms.forEach(r=>r.fear=99);g.rooms[1].fear=2;g.rooms[1].type=type;g.rooms[2].fear=3;
 g.bossIndex=type==='บอส'?1:8;g.ghost.fear=2;g.sanity=5;g.movementRange=2;g.rolled=true;
 assert.deepEqual(T.movementOptions(room,p).paths[2],[0,1,2]);assert.equal(T.movementOptions(room,p).costs[2],5);
 g.sanity=4;assert.ok(!T.movementOptions(room,p).legal.includes(2));g.sanity=5;
 T.finalizeMovementOptions(room,p);host.trigger('move',{index:2});assert.equal(p.pos,2);assert.equal(g.sanity,0);assert.equal(g.escapeRequired,false);assert.equal(g.rescue,null);
}
// Independent exhaustive oracle tests routes, not implementation details.
let seed=118;function rand(n){seed=(1664525*seed+1013904223)>>>0;return seed%n;}
for(let run=0;run<250;run++){
 reset('HALL');p.pos=rand(9);g.bossIndex=rand(9);g.ghost.fear=rand(7);g.sanity=rand(13);g.movementRange=1+rand(8);
 for(let i=0;i<9;i++){g.rooms[i].fear=rand(5);g.rooms[i].type=rand(5)===0?'กับดัก':'ปลอดภัย';}
 const best={};function walk(pos,path,cost){
  if(path.length>g.movementRange)return;
  for(let j=0;j<9;j++){
   if(Math.abs(Math.floor(j/3)-Math.floor(pos/3))+Math.abs(j%3-pos%3)!==1||path.includes(j))continue;
   const next=cost+T.roomAt(room,j).fear;if(next>g.sanity)continue;best[j]=Math.min(best[j]??Infinity,next);walk(j,[...path,j],next);
  }
 }
 walk(p.pos,[p.pos],0);const actual=T.movementOptions(room,p);assert.deepEqual(actual.legal.slice().sort(),Object.keys(best).map(Number).sort());
 for(const index of actual.legal)assert.equal(actual.costs[index],best[index]);
}
for(const c of T.AMULETS.filter(c=>c.type==='spell'))assert.equal(c.condition,undefined);
reset('HALL');p.pos=0;let travel=card('S02');cast(travel);assert.equal(g.pendingRoomEffect,null);assert.equal(g.actions,3);
g.rolled=true;g.moved=true;g.sanity=0;const diceSeq=g.diceSeq,lastDice=g.lastDice;cast(travel);assert.equal(g.actions,2);assert.equal(g.pendingRoomEffect.options.length,8);
choose(4);travel=card('S05');cast(travel);assert.deepEqual(g.pendingRoomEffect.options.map(x=>x.index),[0,2,6,8]);choose(0);
assert.equal(g.actions,1);assert.equal(g.sanity,0);assert.equal(g.diceSeq,diceSeq);assert.equal(g.lastDice,lastDice);
cast(card('S06'));assert.equal(g.actions,0);assert.equal(g.turn,0);choose(4);assert.equal(p.pos,4);assert.equal(g.turn,1);
for(const type of ['กับดัก','คำสาป','พิธีกรรม']){
 reset('HALL');p.pos=8;g.bossIndex=type==='พิธีกรรม'?4:7;g.rolled=true;g.rooms[4].type=type;g.rooms[4].capacity=1;friend.pos=4;
 cast(card('S05'));assert.deepEqual(g.pendingRoomEffect.options.map(x=>x.index),type==='พิธีกรรม'?[0,4]:[0]);choose(0);assert.equal(p.pos,0);
}
for(const special of ['TRAP_LOW','CURSE_EVEN'])for(const id of ['S02','S05','S06']){
 reset(special);g.rolled=true;const c=card(id);cast(c);assert.equal(g.actions,3);assert.equal(g.pendingRoomEffect,null);assert.ok(p.amu.includes(c));
}
reset('HALL');g.rolled=true;cast(card('S02'));g.rooms[0].capacity=1;friend.pos=0;choose(0);assert.equal(p.pos,4);choose(3);assert.equal(p.pos,3);
for(const id of ['TRAP_LOW','CURSE_EVEN']){reset('HALL');g.rolled=true;g.rooms[3]={...T.ROOMS.find(x=>x.id===id)};cast(card('S02'));choose(3);assert.equal(p.pos,3);cast(card('S02'));assert.equal(g.actions,2);}
for(const [id,good,bad]of [['S03','TRAP_LOW','CURSE_EVEN'],['S09','TRAP_HIGH','CURSE_ODD'],['S07','CURSE_EVEN','TRAP_LOW'],['S08','CURSE_ODD','TRAP_HIGH']]){
 reset(bad);cast(card(id));assert.equal(g.actions,3);assert.equal(g.rescue,null);
 reset(good);const beforeSeq=g.diceSeq,c=card(id);cast(c);assert.equal(g.actions,2);assert.equal(g.rescue.phase,'move');assert.equal(g.diceSeq,beforeSeq);
 assert.ok(g.amuDiscard.some(x=>x.uid===c.uid));g.rooms[3].fear=99;host.trigger('rescueMove',{index:3});assert.equal(p.pos,3);
}
reset('HALL');card('S01',friend);const hp0=p.hp,hp1=friend.hp,event=T.AMULETS.find(c=>c.id==='V06');
T.applyEventCard(room,p,event);assert.equal(g.pendingRoomEffect.playerId,friend.id);const eventSeq=g.diceSeq;g.actions=0;reply(friend);
assert.equal(p.hp,hp0-2);assert.equal(friend.hp,hp1);assert.equal(g.diceSeq,eventSeq);
reset('HALL');card('S01');card('S01',friend);T.applyEventCard(room,p,event);const pendingId=g.pendingRoomEffect.id;
reply(p);assert.equal(g.pendingRoomEffect.playerId,friend.id);reply(friend,false);assert.equal(p.hp,p.char.hp);assert.equal(friend.hp,friend.char.hp-2);
host.trigger('resolveRoomEffect',{uid:'pass',pendingId});assert.equal(p.hp,p.char.hp);
reset('HALL');card('S04');T.applyEventCard(room,p,event);assert.equal(g.pendingRoomEffect,null);assert.equal(p.amu.length,1);
reset('HALL');card('S01');T.applyEventCard(room,p,T.AMULETS.find(c=>c.id==='V08'));assert.equal(g.pendingRoomEffect,null);assert.equal(p.amu.length,1);
reset('HALL');g.ghost={...T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi')};card('S04',friend);card('S01');T.addCurseProgress(room,6);
assert.equal(g.pendingRoomEffect.playerId,friend.id);const protectedHp=friend.hp;reply(friend);
assert.equal(friend.hp,protectedHp);assert.equal(p.hp,p.char.hp-2);assert.equal(g.curse,0);assert.equal(g.protectionPending,false);
T.addCurseProgress(room,6);assert.equal(friend.hp,protectedHp-2);
for(const ghost of T.GHOSTS){
 reset('HALL');g.ghost={...ghost};friend.pos=1;card('S04',friend);card('H01',friend);friend.sac=[T.uidCard(T.SACRIFICES[0])];friend.equip=[{uid:'weapon',id:'E01',type:'equip'}];friend.score=5;
 T.addCurseProgress(room,6);reply(friend);assert.equal(friend.hp,friend.char.hp,ghost.id);assert.equal(friend.pos,1,ghost.id);assert.equal(friend.score,5,ghost.id);assert.equal(friend.sac.length,1);assert.equal(friend.equip.length,1);
 assert.equal(friend.amu.length,1);assert.ok(!g.curseDiscardQueue.some(x=>x.playerId===friend.id));
}
reset('HALL');card('S04');card('S03');T.applyGhostCounter(room,p,'green');assert.equal(g.pendingRoomEffect,null);assert.equal(p.amu.length,2);
reset('HALL');g.ghost={...T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi')};card('S04',friend);T.addCurseProgress(room,6);g.turnDeadline=Date.now()-1;T.expireTurn(room);
assert.notEqual(g.pendingRoomEffect?.type,'negativeReaction');assert.equal(friend.amu[0].id,'S04');assert.equal(g.protectionPending,false);
// A burst already in flight must queue behind another decision, not overwrite it.
reset('HALL');g.ghost={...T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi')};card('S01');card('S04',friend);
const deferred=[];global.setTimeout=fn=>{deferred.push(fn);return 1;};T.addCurseProgress(room,6);
T.applyEventCard(room,p,event);const eventPending=g.pendingRoomEffect.id;deferred.shift()();global.setTimeout=fn=>{fn();return 1;};assert.equal(g.pendingRoomEffect.id,eventPending);
reply(p);assert.equal(g.pendingRoomEffect.playerId,friend.id);reply(friend);assert.equal(g.protectionPending,false);assert.equal(g.curse,0);
reset('HALL');card('S04',friend);T.addCurseProgress(room,6);g.pendingRitual={playerId:p.id,id:'ritual-held'};
host.trigger('resolveRitual',{modifier:0});assert.equal(g.pendingRitual.id,'ritual-held');reply(friend);g.pendingRitual=null;
Module._load=origLoad;global.setTimeout=origTimeout;global.setInterval=origInterval;
console.log('V1.18 SERVER PASS: 250 route-oracle maps; travel, capacity, escape types, free personal Event/Curse reactions, all 9 ghosts, repeated burst, timeout and queued decisions');

