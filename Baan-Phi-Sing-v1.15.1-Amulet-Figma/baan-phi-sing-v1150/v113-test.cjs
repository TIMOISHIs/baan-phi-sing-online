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
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt,applyCurse,finalizeMovementOptions,publicSnapshot,privateSnapshot,startRoom,beginTurn,advanceToNextAlive,recordDice,movementOptions,queueOfficeDiscardPick,canRecoverToHand,setHp,addLog,expireTurn,rescueOptions,emitRoom};\n`;
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



const host=fakeIO.connect('host');host.trigger('createRoom',{name:'ติม',sessionToken:'host113abcdefgh'});const room=roomFor(host),clients=[host];
for(let i=1;i<6;i++){const c=fakeIO.connect('guest'+i);c.trigger('joinRoom',{code:room.code,name:'เพื่อน '+i,sessionToken:'guest113abcdef'+i});clients.push(c)}
room.players.forEach((p,i)=>p.characterKey=T.CHARS[i].key);T.startRoom(room,T.GHOSTS[0]);const g=room.game,p=room.players[0],friend=room.players[1];
function reset(){room.phase='game';room.trade=null;room.players.forEach(x=>{x.hp=x.char.hp;x.pos=4;x.amu=[];x.sac=[];x.equip=[];x.skipTurns=0;x._deferredOfficePick=false});p.char=T.CHARS.find(x=>x.key==='mor-tham');Object.assign(g,{turn:0,actions:3,rolled:false,moved:false,rescue:null,mustMove:false,moveOptional:false,sanityDecision:false,pendingRoomEffect:null,pendingRitual:null,curse:0,curseResolving:false,curseDiscardQueue:[],catHelp:null,turnDeadline:Date.now()+120000,timeoutAnnounced:false});g.turnSerial=(g.turnSerial||0)+1;g.rooms=Array.from({length:9},()=>({...T.ROOMS.find(r=>r.type==='ปลอดภัย'),fear:10,capacity:null}));g.rooms[4]={...T.ROOMS.find(r=>r.type==='กับดัก'),fear:12};g.bossIndex=8;}
const random=Math.random;Math.random=()=>0;
reset();const serial=g.turnSerial;host.trigger('skill',{targetId:friend.id});assert.equal(g.actions,0);assert.equal(g.turn,0);assert.equal(g.rescue.playerId,friend.id);
host.trigger('rescueRoll');assert.equal(g.rescue.phase,'roll','caster cannot roll for friend');clients[2].trigger('rescueMove',{index:1});assert.equal(friend.pos,4);
clients[1].trigger('drawAmulet');assert.equal(friend.amu.length,0);clients[1].trigger('rescueRoll');assert.equal(g.rescue.sanity,0);assert.deepEqual([...T.rescueOptions(room).legal].sort(),[1,3,5,7]);
clients[1].trigger('rescueMove',{index:0});assert.equal(friend.pos,4,'diagonal denied');clients[1].trigger('rescueMove',{index:1});assert.equal(friend.pos,1);assert.equal(g.rescue,null);assert.equal(g.turn,1);assert.equal(g.actions,3,'friend gets their full normal turn');assert.equal(g.turnSerial,serial+1);clients[1].trigger('rescueMove',{index:3});assert.equal(friend.pos,1);
reset();host.trigger('skill',{targetId:p.id});host.trigger('rescueRoll');host.trigger('rescueMove',{index:3});assert.equal(p.pos,3);assert.equal(g.turn,1);
reset();friend.pos=0;const oldSupport=p.supportScore;host.trigger('skill',{targetId:friend.id});assert.equal(g.rescue,null);assert.equal(g.actions,3);assert.equal(p.supportScore,oldSupport);
reset();host.trigger('skill',{targetId:friend.id});friend.socketId=null;g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.notEqual(friend.pos,4);assert.equal(g.turn,1);friend.socketId=clients[1].id;
reset();const t=g.turnDeadline=Date.now();T.expireTurn(room,t-1);assert.equal(g.turn,0);T.expireTurn(room,t);assert.equal(g.turn,1);const newSerial=g.turnSerial;T.expireTurn(room,t);assert.equal(g.turnSerial,newSerial,'no double advance');assert.equal(g.turnDeadline-g.turnStartedAt,120000);
reset();g.curseResolving=true;g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.equal(g.turn,0);g.curseResolving=false;T.expireTurn(room);assert.equal(g.turn,1);
reset();p.amu=Array.from({length:7},()=>T.uidCard(T.AMULETS.find(c=>c.type==='heal_self')));g.pendingRoomEffect={id:'overflow',type:'discardAmuletOverflow',playerId:p.id,count:2};room.trade={id:'trade'};g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.equal(p.amu.length,5);assert.equal(room.trade,null);assert.equal(g.pendingRoomEffect,null);assert.equal(g.turn,1);
reset();p.sac=[takeSac(room)];g.pendingRoomEffect={id:'discard',type:'discardSacrifice',playerId:p.id,count:1};g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.equal(p.sac.length,0);assert.equal(g.turn,1);
reset();p.pos=8;g.rooms[8].boss=true;g.moved=true;g.rolled=true;p.sac=[takeSac(room)];host.trigger('ritual',{uid:p.sac[0].uid});assert.ok(g.pendingRitual);g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.equal(g.pendingRitual,null);assert.equal(p.sac.length,0);assert.equal(g.turn,1);
reset();g.sanity=99;g.movementRange=2;g.mustMove=true;T.finalizeMovementOptions(room,p);g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.notEqual(p.pos,4);assert.equal(g.turn,1);
reset();host.trigger('skill',{targetId:friend.id});g.turnDeadline=Date.now()-1;T.expireTurn(room);assert.notEqual(friend.pos,4);assert.equal(g.turn,1);
if(process.env.BPS_FIXTURE_PATH){reset();p.char=T.CHARS.find(c=>c.key==='por-krai');p.hp=7;p.sac=Array.from({length:5},()=>takeSac(room,'pink'));p.amu=Array.from({length:5},(_,i)=>T.uidCard(T.AMULETS.filter(c=>c.type!=='event')[i]));p.equip=[T.uidCard(T.AMULETS.find(c=>c.type==='equip'))];g.actions=3;g.moved=true;g.rolled=true;g.rooms=JSON.parse(JSON.stringify(T.ROOMS.slice(0,9)));g.rooms[8]={...g.rooms[8],boss:true,type:'พิธีกรรม'};p.pos=0;g.startedAt=Date.now()-265000;fs.writeFileSync(process.env.BPS_FIXTURE_PATH,JSON.stringify({state:T.publicSnapshot(room),mine:T.privateSnapshot(room,p.socketId)}))}
Math.random=random;global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
console.log('V1.13.0 SERVER PASS: forced rescue, identity, no extra AP, guaranteed adjacent exit, disconnected target, deadline boundary, pending effects/ritual, curse wait, no double advance');
