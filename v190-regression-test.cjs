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

// V1.9.0 paths are server-authoritative, orthogonal, and stop at special rooms.
prepare();g.sanity=20;g.movementRange=4;
let options=T.movementOptions(room,hp);
for(const [dest,path] of Object.entries(options.paths)){
 assert.equal(path[0],hp.pos);assert.equal(path.at(-1),Number(dest));
 for(let i=1;i<path.length;i++)assert.equal(Math.abs(Math.floor(path[i]/3)-Math.floor(path[i-1]/3))+Math.abs(path[i]%3-path[i-1]%3),1);
 if(Number(dest)!==hp.pos)assert.equal(path.length-1,options.distances[dest]);
}
g.rooms[1].type='กับดัก';g.rooms[3].fear=99;options=T.movementOptions(room,hp);assert.deepEqual(options.legal,[1]);
g.rooms[1].type='ปลอดภัย';g.rooms[3].fear=1;T.finalizeMovementOptions(room,hp);host.trigger('move',{index:4});assert.equal(hp.pos,4);assert.equal(g.lastMove.playerId,hp.id);assert.equal(g.lastMove.path[0],0);assert.equal(g.lastMove.path.at(-1),4);assert.deepEqual(T.publicSnapshot(room).game.lastMove,g.lastMove);
assert.ok(host.last('ghostReveal').ghost.art,'ghost reveal must include artwork');
for(const ghost of T.GHOSTS)assert.ok(ghost.art);
global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
console.log('V1.9.0 SERVER: PASS (orthogonal authoritative paths, blocked routes, movement snapshot, ghost artwork)');
