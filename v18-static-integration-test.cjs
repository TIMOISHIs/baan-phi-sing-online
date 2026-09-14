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
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt};\n`;
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

// Discard pile reshuffles only when draw deck is empty.
const recycled=hp.amu.pop();g.amuDeck=[];g.amuDiscard=[recycled];const redrawn=T.drawAmuletFromDeck(room);assert.equal(redrawn.uid,recycled.uid);assert.equal(g.amuDiscard.length,0);assert.equal(g.amuDeck.length,0);

// Sanity choose-minus works and card goes to discard.
cleanTurn(room,hp);g.rolled=true;g.moved=false;g.sanityDecision=true;g.sanityBase=3;g.sanity=3;g.actions=2;
const sanity=takeCard(room,'M06');hp.amu.push(sanity);const disc0=g.amuDiscard.length;host.trigger('useSanity',{uid:sanity.uid,delta:-1});assert.equal(g.sanity,2);assert.ok(g.amuDiscard.length>=disc0+1);

// Event เหยยย: next seat rolls only for event; beneficiary gains result.
cleanTurn(room,hp);hp.score=0;const evMoney=takeCard(room,'V07');g.amuDeck.unshift(evMoney);host.trigger('drawAmulet');assert.equal(g.pendingRoomEffect?.type,'eventRollMoney');assert.equal(g.pendingRoomEffect?.playerId,gp.id);const beforeMoney=hp.score;guest.trigger('resolveRoomEffect',{});assert.ok(hp.score>=beforeMoney+2&&hp.score<=beforeMoney+12);assert.equal(g.pendingRoomEffect,null);

// Reactive protect-all prompt: negative Event is canceled on successful spell roll.
cleanTurn(room,hp);hp.hp=hp.char.hp;gp.hp=gp.char.hp;const protect=takeCard(room,'S01');hp.amu.push(protect);const bad=takeCard(room,'V06');g.amuDeck.unshift(bad);
const oldRandom=Math.random;Math.random=()=>0.01;host.trigger('drawAmulet');assert.equal(g.pendingRoomEffect?.type,'negativeReaction');assert.ok(g.pendingRoomEffect.options.some(o=>o.uid===protect.uid));const h0=hp.hp,gg0=gp.hp;host.trigger('resolveRoomEffect',{uid:protect.uid});assert.equal(hp.hp,h0);assert.equal(gp.hp,gg0);assert.equal(g.pendingRoomEffect,null);Math.random=oldRandom;

// Reactive ghost protection works on failed-counter source.
cleanTurn(room,hp);const protectGhost=takeCard(room,'S03');hp.amu.push(protectGhost);room.game.ghost=T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi');const hpBefore=hp.hp;T.applyGhostCounter(room,hp,'green');assert.equal(g.pendingRoomEffect?.type,'negativeReaction');Math.random=()=>0.01;host.trigger('resolveRoomEffect',{uid:protectGhost.uid});Math.random=oldRandom;assert.equal(hp.hp,hpBefore);

// Event เพล้ง: when drawer is in curse, choose an adjacent exit immediately.
cleanTurn(room,hp);let curseIndex=[0,1,2,3,4,5,6,7,8].find(i=>i!==g.bossIndex);g.rooms[curseIndex]={...T.ROOMS.find(r=>r.type==='คำสาป')};hp.pos=curseIndex;const evExit=takeCard(room,'V10');g.amuDeck.unshift(evExit);host.trigger('drawAmulet');assert.equal(g.pendingRoomEffect?.type,'eventFreeCurseMove');const dest=g.pendingRoomEffect.options[0].index;host.trigger('resolveRoomEffect',{uid:dest});assert.equal(hp.pos,dest);assert.equal(g.pendingRoomEffect,null);

// หมาวัด: top 4 shown, choose 2, remaining cards stay at top in original relative order.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='temple-dog');hp.amu=[];while(g.amuDeck.length<6)g.amuDeck.push(T.uidCard(T.AMULETS.find(c=>c.type!=='event')));const top4=g.amuDeck.slice(0,4);host.trigger('skill',{side:'top'});assert.equal(g.pendingRoomEffect?.type,'skillPeekChoose');assert.equal(g.pendingRoomEffect.options.length,4);const chosen=[top4[0].uid,top4[2].uid];host.trigger('resolveRoomEffect',{uids:chosen});assert.ok(hp.amu.some(c=>c.uid===chosen[0])&&hp.amu.some(c=>c.uid===chosen[1]));assert.equal(g.amuDeck[0].uid,top4[1].uid);assert.equal(g.amuDeck[1].uid,top4[3].uid);

// ห้องทำงาน: drawing Event opens discard retrieval; chosen card enters hand.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='por-krai');hp.amu=[];const officeIndex=[0,1,2,3,4,5,6,7,8].find(i=>i!==g.bossIndex);g.rooms[officeIndex]={...T.ROOMS.find(r=>r.effectId==='event_pick_discard')};hp.pos=officeIndex;const helper=takeCard(room,'H01');g.amuDiscard=[helper];const noop=takeCard(room,'V11');g.amuDeck.unshift(noop);host.trigger('drawAmulet');assert.equal(g.pendingRoomEffect?.type,'officePickDiscard');assert.ok(g.pendingRoomEffect.options.some(o=>o.uid===helper.uid));host.trigger('resolveRoomEffect',{uid:helper.uid});assert.ok(hp.amu.some(c=>c.uid===helper.uid));

// Event ยันต์ปลิวติดหน้า: heal happens when ritual starts (success not required yet).
cleanTurn(room,hp);hp.pos=g.bossIndex;hp.hp=4;gp.hp=3;g.ritualHealAllCharges=1;const sac=takeSac(room,'green');hp.sac=[sac];Math.random=()=>0.4;host.trigger('ritual',{uid:sac.uid});Math.random=oldRandom;assert.equal(g.ritualHealAllCharges,0);assert.equal(hp.hp,Math.min(hp.char.hp,6));assert.equal(gp.hp,Math.min(gp.char.hp,5));assert.ok(g.pendingRitual);
// Resolve ritual to clear state.
host.trigger('resolveRitual',{modifier:0});

// Mor Tham cleans friend's next special-room start penalty.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='mor-tham');g.actions=3;const trapIndex=[0,1,2,3,4,5,6,7,8].find(i=>i!==g.bossIndex&&i!==hp.pos);g.rooms[trapIndex]={...T.ROOMS.find(r=>r.type==='กับดัก')};gp.pos=trapIndex;gp.hp=Math.max(3,gp.hp);const guestHpBefore=gp.hp;host.trigger('skill',{targetId:gp.id});assert.equal(gp.hp,guestHpBefore);assert.equal(room.game.turn,room.players.indexOf(gp));assert.equal(room.game.escapeRequired,false);

console.log('V1.8 STATIC INTEGRATION: PASS');
console.log(JSON.stringify({cards:{amulet:T.AMULETS.length,sacrifice:T.SACRIFICES.length,ghosts:T.GHOSTS.length,characters:T.CHARS.length,rooms:T.ROOMS.length},roomCode:code},null,2));

global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
