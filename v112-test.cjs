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
src += `\nmodule.exports.__test={rooms,AMULETS,SACRIFICES,ROOMS,CHARS,GHOSTS,uidCard,drawAmuletFromDeck,applyGhostCounter,applyEventCard,roomAt,applyCurse,finalizeMovementOptions,publicSnapshot,privateSnapshot,startRoom,beginTurn,advanceToNextAlive,recordDice,movementOptions,queueOfficeDiscardPick,canRecoverToHand,setHp,addLog};\n`;
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


const host=fakeIO.connect('host');host.trigger('createRoom',{name:'ติม',allowDuplicateCharacters:true,sessionToken:'hosttest112abcd'});const room=roomFor(host),clients=[host];
for(let i=1;i<6;i++){const s=fakeIO.connect('guest'+i);s.trigger('joinRoom',{code:room.code,name:'เพื่อน '+i,sessionToken:'guesttest112abcd'+i});clients.push(s)}
room.players.forEach((p,i)=>p.characterKey=T.CHARS[i].key);T.startRoom(room,T.GHOSTS[0]);const g=room.game;
assert.equal(g.round,1);for(let i=0;i<5;i++){T.advanceToNextAlive(room);assert.equal(g.round,1)}T.advanceToNextAlive(room);assert.equal(g.round,2);
room.players[1].skipTurns=1;room.players[2].hp=0;room.players[2].char={...room.players[2].char,skillType:'none'};for(let i=0;i<5;i++)T.advanceToNextAlive(room);assert.ok(g.round>=3);room.players.forEach(p=>{p.hp=p.char.hp;p.skipTurns=0});
const p=room.players[0],t=room.players[1],a=clients[0],b=clients[1];cleanTurn(room,p);p.pos=t.pos=4;p.score=t.score=5;
a.trigger('tradeOffer',{toId:t.id,giveScore:1});assert.ok(room.trade);assert.equal(g.actions,3);b.trigger('tradeReject');assert.equal(g.actions,3);
g.traded=false;a.trigger('tradeOffer',{toId:t.id,giveScore:1});b.trigger('tradeAccept',{});assert.equal(g.actions,2);assert.equal(p.score,4);b.trigger('tradeAccept',{});assert.equal(g.actions,2);
g.traded=false;g.actions=0;a.trigger('tradeOffer',{toId:t.id,giveScore:1});assert.equal(room.trade,null);g.actions=3;a.trigger('tradeOffer',{toId:t.id});assert.equal(room.trade,null);
a.trigger('tradeOffer',{toId:t.id,askCardCount:2});const uid=t.amu[0].uid;b.trigger('tradeAccept',{returnUids:[uid,uid]});assert.equal(g.actions,3);assert.ok(room.trade);room.trade=null;
cleanTurn(room,p);g.actions=1;a.trigger('tradeOffer',{toId:t.id,giveScore:1});b.trigger('tradeAccept',{});assert.notEqual(room.players[g.turn].id,p.id);
cleanTurn(room,p);g.moved=false;g.rolled=false;a.trigger('roll');assert.equal(g.actions,3);const e=a.last('diceFx');assert.ok(e.at);for(const c of clients)assert.deepEqual(c.last('diceFx'),e);assert.deepEqual(T.publicSnapshot(room).game.lastDiceEvent,e);
let serverNow;a.trigger('clockSync',v=>serverNow=v.serverNow);assert.ok(serverNow>0);g.amuDiscard=[T.uidCard(T.AMULETS[0])];assert.equal(T.publicSnapshot(room).game.amuletDiscard.length,1);assert.equal(T.publicSnapshot(room).game.amuDeck,undefined);assert.equal(T.publicSnapshot(room).players[0].amu,undefined);
const {createClock,createDiceGate}=require('./public/game-sync.js');let mono=100;const c=createClock(()=>mono);c.observe(100000);assert.equal(c.countdown(105000),5);mono+=1000;assert.equal(c.countdown(105000),4);mono+=4000;assert.equal(c.countdown(105000),0);assert.equal(c.countdown(999999),5);c.observe(110000,100,true);assert.equal(c.now(),110050);c.observe(9999);assert.equal(c.now(),110050);
const gate=createDiceGate();assert.ok(gate.accept(e,e.at));assert.equal(gate.accept(e,e.at),false);assert.equal(gate.accept({...e,seq:e.seq+1},e.at+4000),false);assert.ok(gate.accept({...e,seq:1,matchId:'new'},e.at));
cleanTurn(room,p);g.lastDiceEvent=null;g.diceSeq=0;g.startedAt=Date.now()-126000;g.round=2;
const fixture={state:T.publicSnapshot(room),mine:T.privateSnapshot(room,p.socketId)};if(process.env.BPS_FIXTURE_PATH)fs.writeFileSync(process.env.BPS_FIXTURE_PATH,JSON.stringify(fixture));
global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
const {JSDOM}=require('jsdom'),vm=require('vm'),dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://game.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,sent=[];w.io=()=>({on(){},emit:(...args)=>sent.push(args),connect(){}});w.matchMedia=()=>({matches:false});w.localStorage.setItem('bpsSeenTutorialV10','1');w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
for(const f of ['game-sync.js','app.js','dashboard.js'])vm.runInContext(fs.readFileSync('public/'+f,'utf8'),dom.getInternalVMContext());w.fixture=fixture;vm.runInContext('serverClock.observe(fixture.state.serverNow);mine=fixture.mine;state=fixture.state;turnTransitionActive=false;render()',dom.getInternalVMContext());
const q=s=>w.document.querySelector(s);assert.equal(q('#playerList').children.length,6);assert.equal(q('.bps-search'),null);assert.equal(q('.bps-action-grid').children.length,4);assert.equal(q('#drawAmu').parentElement.className,'bps-decks');q('#rollBtn').click();assert.equal(sent.at(-1)[0],'roll');q('#storyTab').click();assert.equal(q('#storyTab').getAttribute('aria-selected'),'true');assert.equal(q('#sacHand').parentElement.className,'bps-offering-zone');q('#discardBtn').click();assert.equal(q('#discardDialog').open,true);assert.equal(q('#escapeBtn').classList.contains('roll-legacy'),false);const ids=[...w.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(ids.length,new Set(ids).size);assert.equal(q('.bps-log').open,false);assert.equal(q('.bps-rules').open,false);assert.equal(q('#sacHand').children.length,7);const localName=q('#personalName').textContent;vm.runInContext('state.game.turn=1;state.players.forEach((p,i)=>p.isTurn=i===1);mine.char={...mine.char,slots:2};render()',dom.getInternalVMContext());assert.equal(q('#personalName').textContent,localName);assert.equal(q('#equip').children.length,2);assert.equal(q('#actions').textContent,'—');assert.equal(q('#drawAmu').disabled,true);vm.runInContext('mine.char={...mine.char,slots:3};renderPrivate()',dom.getInternalVMContext());assert.equal(q('#equip').children.length,3);dom.window.close();
console.log('V1.12.0 PASS: six-client dice, time/rounds, discard privacy, trade AP, free movement and dashboard controls');
