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
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt,applyCurse,finalizeMovementOptions,publicSnapshot,privateSnapshot,startRoom,beginTurn,advanceToNextAlive,recordDice,movementOptions,queueOfficeDiscardPick,canRecoverToHand,setHp,addLog,expireTurn,rescueOptions,emitRoom,balancedRoomMap,roomEscapeProgress,setPlayerPosition};\n`;
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
 room._negativeReaction=null;
}
function withDice(a,b,fn){const old=Math.random,values=[(a-.5)/6,(b-.5)/6];Math.random=()=>values.shift()??.2;try{return fn()}finally{Math.random=old}}
const escape=(a,b)=>withDice(a,b,()=>host.trigger('escapeRoom'));
const count=()=>T.roomEscapeProgress(room,p)?.count||0;

// Every board reserves the ghost's boss position without overwriting the quota.
const oldRandom=Math.random;let seed=117;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
const variants={curse:new Set(),trap:new Set(),farm:new Set(),positions:new Set()};
for(let boss=0;boss<9;boss++)for(let n=0;n<200;n++){
 const map=T.balancedRoomMap(boss);assert.equal(map.length,9);assert.equal(map[boss].id,'BOSS');
 const nonBoss=map.filter(r=>!r.boss);assert.equal(new Set(nonBoss.map(r=>r.id)).size,8);
 for(const [type,num] of [['ปลอดภัย',3],['ลึกลับน่าค้นหา',3],['กับดัก',1],['คำสาป',1]])assert.equal(nonBoss.filter(r=>r.type===type).length,num);
 variants.curse.add(nonBoss.find(r=>r.type==='คำสาป').id);variants.trap.add(nonBoss.find(r=>r.type==='กับดัก').id);
 variants.farm.add(nonBoss.filter(r=>r.sac).map(r=>r.id).sort().join(','));variants.positions.add(map.map(r=>r.id).join(','));
}
Math.random=oldRandom;assert.equal(variants.curse.size,2);assert.equal(variants.trap.size,2);assert.equal(variants.farm.size,10);assert.ok(variants.positions.size>100);
for(const ghost of T.GHOSTS){T.startRoom(room,ghost);const snap=T.publicSnapshot(room);assert.equal(snap.game.rooms.filter(r=>r.boss).length,1);assert.equal(snap.game.bossIndex,ghost.position);assert.equal(T.roomAt(room,ghost.position).fear,ghost.fear)}
assert.equal(T.ROOMS.length,12);
g=room.game;

// Current room fear no longer enters the base roll; destination gates remain.
reset('HALL');g.rooms[4].fear=99;p.equip=[{fear:1},{fear:2}];p.amu=[];
withDice(2,3,()=>host.trigger('roll'));assert.equal(g.moveFear,3);assert.equal(g.sanityBase,2);assert.ok(g.legal.includes(3));
reset('HALL');g.rooms[4].fear=99;g.rooms[3].fear=5;g.rooms[1].capacity=1;friend.pos=1;
withDice(2,2,()=>host.trigger('roll'));assert.equal(g.sanity,4);assert.ok(!g.legal.includes(3));assert.ok(!g.legal.includes(1));assert.ok(g.legal.includes(5));
reset('HALL');g.rooms[5].type='กับดัก';g.movementRange=4;g.sanity=99;const opts=T.movementOptions(room,p);assert.ok(opts.legal.includes(5));assert.ok(!opts.paths[2]?.includes(5),'paths stop in a special room');

// Each matching die is exactly one stack, for all 36 possible pairs.
for(const id of ['CURSE_ODD','CURSE_EVEN'])for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
 reset(id);escape(a,b);const parity=id==='CURSE_ODD'?1:0,expected=[a,b].filter(n=>n%2===parity).length;
 assert.equal(count(),expected);assert.equal(g.actions,2);assert.equal(!!g.rescue,expected===2);
 assert.equal(g.escapeRequired,expected!==2);
}
reset();escape(6,1);assert.equal(count(),1,'a face of six still gives only one stack');
reset();escape(2,3);assert.equal(count(),1);assert.deepEqual(p.roomEscapeStacks.faces,[2]);
escape(6,1);assert.equal(count(),2);assert.deepEqual(p.roomEscapeStacks.faces,[2,6]);assert.equal(g.actions,1);assert.equal(g.rescue.phase,'move');assert.equal(g.rescue.dice,null);
const diceSeq=g.diceSeq,turnSerial=g.turnSerial;host.trigger('roll');host.trigger('rescueRoll');assert.equal(g.diceSeq,diceSeq);
clients[1].trigger('rescueMove',{index:3});host.trigger('rescueMove',{index:0});assert.equal(p.pos,4);
g.rooms[3].fear=99;p.equip=[{fear:99}];host.trigger('rescueMove',{index:3});assert.equal(p.pos,3);assert.equal(g.actions,1);assert.equal(g.turnSerial,turnSerial);
assert.deepEqual(g.lastMove.path,[4,3]);assert.equal(p.roomEscapeStacks,null);assert.equal(g.moved,true);assert.equal(g.rolled,true);
host.trigger('rescueMove',{index:5});assert.equal(p.pos,3,'stale duplicate exit cannot move again');
T.setPlayerPosition(room,p,4);assert.equal(count(),0,'re-entering starts a fresh stack counter');
reset('CURSE_ODD');escape(1,2);escape(3,4);assert.equal(count(),2);
reset();escape(2,2);assert.equal(count(),2,'equal faces each count');

// Stack ownership, reconnect payload and turn boundaries.
reset();g.actions=1;escape(2,3);assert.equal(g.turn,1);assert.equal(count(),1);
g.turn=0;T.beginTurn(room);assert.equal(g.actions,3);assert.equal(count(),1);assert.equal(g.escapeRequired,true);
const publicProgress=T.publicSnapshot(room);assert.equal(publicProgress.game.roomEscapeProgress.count,1);assert.equal(publicProgress.players[0].roomEscapeProgress.count,1);
assert.equal(publicProgress.players[1].roomEscapeProgress,null);assert.deepEqual(publicProgress.game.roomEscapeProgress.faces,[2]);
escape(6,1);assert.equal(g.rescue.playerId,p.id);
reset();g.actions=1;const serial=g.turnSerial;escape(2,4);assert.equal(g.actions,0);assert.equal(g.turnSerial,serial);assert.ok(g.rescue,'last incense must wait for the exit choice');
host.trigger('rescueMove',{index:3});assert.equal(g.turnSerial,serial+1);assert.equal(g.turn,1);

// Trap thresholds are unchanged and success always opens a one-cell exit.
for(const [id,a,b,pass] of [['TRAP_LOW',2,3,true],['TRAP_LOW',3,3,false],['TRAP_HIGH',3,3,true],['TRAP_HIGH',2,3,false]]){
 reset(id);escape(a,b);assert.equal(!!g.rescue,pass);assert.equal(count(),0);
}
reset('TRAP_LOW');const before=p.hp;T.beginTurn(room);assert.equal(p.hp,before-1,'trap start damage remains');
reset();p.sac=[T.uidCard(T.SACRIFICES[0])];T.beginTurn(room);assert.equal(g.pendingRoomEffect.type,'discardSacrifice','curse start discard remains');
host.trigger('resolveRoomEffect',{uids:[p.sac[0].uid]});assert.equal(p.sac.length,0);

// Exit choices recheck capacity and never extend to a second room.
reset();g.rooms[3].capacity=1;friend.pos=3;escape(2,4);assert.ok(!T.rescueOptions(room).legal.includes(3));
host.trigger('rescueMove',{index:3});assert.equal(p.pos,4);host.trigger('rescueMove',{index:1});assert.equal(p.pos,1);
reset();escape(2,4);g.curseResolving=true;host.trigger('rescueMove',{index:3});assert.equal(p.pos,4);g.curseResolving=false;host.trigger('rescueMove',{index:3});assert.equal(p.pos,3);
reset();escape(2,4);g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.notEqual(p.pos,4);assert.equal(g.turn,1);assert.equal(p.roomEscapeStacks,null);

// Existing escape cards and remote rescue share the same no-roll rule.
reset();T.applyEventCard(room,p,T.AMULETS.find(c=>c.id==='V10'));assert.equal(g.rescue.phase,'move');assert.equal(g.actions,3);
host.trigger('rescueMove',{index:3});assert.equal(p.pos,3);assert.equal(g.actions,3);
reset('HALL');T.applyEventCard(room,p,T.AMULETS.find(c=>c.id==='V10'));assert.equal(g.rescue,null);
reset();p.amu=[T.uidCard(T.AMULETS.find(c=>c.id==='S07'))];const spellUid=p.amu[0].uid;
withDice(2,3,()=>host.trigger('castSpell',{uid:spellUid}));assert.equal(g.rescue.phase,'move');assert.equal(g.actions,2);
const spellDiceSeq=g.diceSeq;host.trigger('rescueMove',{index:3});assert.equal(p.pos,3);assert.equal(g.diceSeq,spellDiceSeq);
reset();p.char=T.CHARS.find(c=>c.key==='mor-tham');friend.pos=4;host.trigger('skill',{targetId:friend.id});
assert.equal(g.actions,0);assert.equal(g.rescue.playerId,friend.id);assert.equal(g.rescue.phase,'move');const rescueSeq=g.diceSeq;
clients[1].trigger('rescueRoll');assert.equal(g.diceSeq,rescueSeq);host.trigger('rescueMove',{index:3});assert.equal(friend.pos,4);
clients[1].trigger('rescueMove',{index:3});assert.equal(friend.pos,3);assert.equal(g.turn,1);assert.equal(g.actions,3);assert.equal(g.diceSeq,rescueSeq);

// A forced move invalidates stacks and any old exit interaction.
reset();escape(2,3);T.setPlayerPosition(room,p,3);assert.equal(p.roomEscapeStacks,null);T.setPlayerPosition(room,p,4);assert.equal(count(),0);
reset();escape(2,4);T.setPlayerPosition(room,p,3);assert.equal(g.rescue,null);host.trigger('rescueMove',{index:1});assert.equal(p.pos,3);

// If capacity temporarily blocks every neighbor, retain the earned exit without charging another roll.
reset();for(const [n,index]of [1,3,5,7].entries()){g.rooms[index].capacity=1;room.players[n+1].pos=index}
escape(2,4);assert.equal(g.rescue,null);assert.equal(p.freeSpecialExit,true);const heldHp=p.hp;
T.beginTurn(room);assert.equal(p.hp,heldHp);assert.equal(g.escapeRequired,false);assert.equal(p.freeSpecialExit,true);
room.players[1].pos=8;T.beginTurn(room);assert.deepEqual(T.rescueOptions(room).legal,[1]);const heldSeq=g.diceSeq;
host.trigger('rescueMove',{index:1});assert.equal(p.pos,1);assert.equal(g.diceSeq,heldSeq);assert.equal(p.roomEscapeStacks,null);

Module._load=origLoad;global.setTimeout=origTimeout;global.setInterval=origInterval;
console.log('V1.17.0 SERVER PASS: 1800 balanced maps, movement Fear, all 72 curse rolls, persistent stacks, traps, last-incense/timeout/capacity, cards and remote exits');
