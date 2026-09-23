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
host.trigger('createRoom',{name:'ติม',allowDuplicateCharacters:false,sessionToken:'token_host_123456'});
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
const sanity=takeCard(room,'M06');hp.amu.push(sanity);const disc0=g.amuDiscard.length;host.trigger('useSanity',{uid:sanity.uid,delta:2});assert.equal(g.sanity,5);assert.ok(g.amuDiscard.length>=disc0+1);

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
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='mor-tham');g.actions=3;const trapIndex=[0,1,2,3,4,5,6,7,8].find(i=>i!==g.bossIndex&&i!==hp.pos);g.rooms[trapIndex]={...T.ROOMS.find(r=>r.type==='กับดัก')};gp.pos=trapIndex;gp.hp=Math.max(3,gp.hp);const guestHpBefore=gp.hp;host.trigger('skill',{targetId:gp.id});assert.equal(gp.hp,guestHpBefore);assert.equal(room.game.turn,room.players.indexOf(hp));assert.equal(g.rescue.playerId,gp.id);guest.trigger("rescueRoll");const exit=state(guest).game.rescue.legal[0];guest.trigger("rescueMove",{index:exit});assert.equal(gp.pos,exit);assert.equal(room.game.turn,room.players.indexOf(gp));


// ---------- Extended V1.8 regression ----------

// Lobby supports 6 players; 7th is rejected.
const h2=fakeIO.connect('h2');h2.trigger('createRoom',{name:'H2',sessionToken:'token_h2_123456789'});const code2=state(h2).code;
const gs=[];for(let i=0;i<5;i++){const x=fakeIO.connect(`g${i+2}`);x.trigger('joinRoom',{code:code2,name:`G${i+2}`,sessionToken:`token_guest_${i}_123456`});gs.push(x)}
assert.equal(T.rooms.get(code2).players.length,6);
const seventh=fakeIO.connect('seventh');seventh.trigger('joinRoom',{code:code2,name:'TooMany',sessionToken:'token_seventh_123456'});assert.match(error(seventh)||'',/สูงสุด 6 คน/);

// พ่อไกร: HP 0 can spend all 3 incense to revive self to HP 3.
setActive(room,hp);hp.char=T.CHARS.find(c=>c.key==='por-krai');hp.hp=0;Object.assign(g,{actions:3,rolled:true,moved:true,mustMove:false,moveOptional:false,pendingRoomEffect:null,pendingRitual:null,sanityDecision:false,escapeRequired:false});
host.trigger('skill',{});assert.equal(hp.hp,2);

// แม่มะลิ: draw up to 5, stop on first Event and resolve it.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='mae-mali');hp.amu=[];
const mali1=takeCard(room,'H01'),mali2=takeCard(room,'M01'),maliEvent=takeCard(room,'V11');g.amuDeck.unshift(mali1,mali2,maliEvent);
host.trigger('skill',{});assert.ok(hp.amu.some(c=>c.uid===mali1.uid));assert.ok(hp.amu.some(c=>c.uid===mali2.uid));assert.ok(!hp.amu.some(c=>c.uid===maliEvent.uid));assert.ok(g.amuDiscard.some(c=>c.uid===maliEvent.uid));

// หมอสาว: all living friends +1 anywhere, self -3.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='doctor');hp.hp=8;gp.hp=3;gp.pos=(hp.pos+1)%9;const dh=hp.hp,dg=gp.hp;room.trade={id:'hold',fromId:'x',toId:'y',giveScore:0,askScore:0,askCardCount:0,giveCards:[]};host.trigger('skill',{});room.trade=null;assert.equal(hp.hp,dh-2);assert.equal(gp.hp,Math.min(gp.char.hp,dg+1));

// เด็กเนิร์ด: warp to a living friend and pay HP 2.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='nerd');hp.hp=7;gp.hp=Math.max(1,gp.hp);gp.pos=(hp.pos+4)%9;const nerdHp=hp.hp;host.trigger('skill',{targetId:gp.id});assert.equal(hp.pos,gp.pos);assert.equal(hp.hp,nerdHp-2);

// หมอผีดำ: ritual from anywhere, then HP -3 after resolution.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='black-shaman');hp.hp=8;room.game.ghost=T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi');hp.pos=(g.bossIndex+1)%9;const remoteSac=takeSac(room,'green');hp.sac=[remoteSac];
Math.random=()=>0.01;host.trigger('skill',{uid:remoteSac.uid});assert.ok(g.pendingRitual?.remoteSkill);const blackHpBefore=hp.hp;host.trigger('resolveRitual',{modifier:0});Math.random=oldRandom;assert.equal(hp.hp,blackHpBefore-3);

// แมวจร: remote Help only, across rooms.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='stray-cat');hp.amu=[];gp.hp=2;gp.pos=(hp.pos+5)%9;const catHelp=takeCard(room,'H01');hp.amu.push(catHelp);room.trade={id:'hold',fromId:'x',toId:'y',giveScore:0,askScore:0,askCardCount:0,giveCards:[]};host.trigger('skill',{uid:catHelp.uid,targetId:gp.id});room.trade=null;assert.equal(gp.hp,3);assert.ok(g.amuDiscard.some(c=>c.uid===catHelp.uid));

// Spell: go anywhere success creates destination choice and bypasses normal movement.
cleanTurn(room,hp);hp.char=T.CHARS.find(c=>c.key==='por-krai');hp.amu=[];g.rolled=false;g.moved=false;const goAny=takeCard(room,'S02');hp.amu.push(goAny);Math.random=()=>0.99;host.trigger('castSpell',{uid:goAny.uid});Math.random=oldRandom;assert.equal(g.pendingRoomEffect?.type,'spellMoveAny');const anyDest=g.pendingRoomEffect.options[0].index;host.trigger('resolveRoomEffect',{uid:anyDest});assert.equal(hp.pos,anyDest);assert.equal(g.moved,true);

// Spell: diagonal move success offers only diagonal destinations.
cleanTurn(room,hp);hp.amu=[];hp.pos=4;g.rolled=false;g.moved=false;const diag=takeCard(room,'S05');hp.amu.push(diag);Math.random=()=>0.01;host.trigger('castSpell',{uid:diag.uid});Math.random=oldRandom;assert.equal(g.pendingRoomEffect?.type,'spellMoveDiagonal');assert.ok(g.pendingRoomEffect.options.every(o=>[0,2,6,8].includes(o.index)));const diagDest=g.pendingRoomEffect.options[0].index;host.trigger('resolveRoomEffect',{uid:diagDest});assert.equal(hp.pos,diagDest);

// Spell: escape curse/trap immediately on success.
cleanTurn(room,hp);hp.amu=[];g.escapeRequired=true;g.escapeRule={kind:'sumGE',value:6,label:'6+'};const esc=takeCard(room,'S07');hp.amu.push(esc);Math.random=()=>0.01;host.trigger('castSpell',{uid:esc.uid});Math.random=oldRandom;assert.equal(g.escapeRequired,false);assert.ok(g.amuDiscard.some(c=>c.uid===esc.uid));

// Ward equipment absorbs one ghost attack, then goes to discard.
cleanTurn(room,hp);hp.amu=[];hp.equip=[];room.game.ghost=T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi');const ward=takeCard(room,'E04');hp.equip.push(ward);const wardHp=hp.hp;T.applyGhostCounter(room,hp,'green');assert.equal(hp.hp,wardHp);assert.ok(!hp.equip.some(c=>c.uid===ward.uid));assert.ok(g.amuDiscard.some(c=>c.uid===ward.uid));

// Attack equipment breaks when ritual fails.
cleanTurn(room,hp);hp.equip=[];hp.amu=[];hp.pos=g.bossIndex;room.game.ghost=T.GHOSTS.find(x=>x.id==='ghost-pob-jaothi');const weapon=takeCard(room,'E01');hp.equip.push(weapon);const failSac=takeSac(room,'green');hp.sac=[failSac];Math.random=()=>0.99;host.trigger('ritual',{uid:failSac.uid});host.trigger('resolveRitual',{modifier:0});Math.random=oldRandom;assert.ok(!hp.equip.some(c=>c.uid===weapon.uid));assert.ok(g.amuDiscard.some(c=>c.uid===weapon.uid));

// Event V08: every living player in same room gets money 5.
cleanTurn(room,hp);hp.score=0;gp.score=0;gp.hp=Math.max(1,gp.hp);gp.pos=hp.pos;const rich=takeCard(room,'V08');g.amuDeck.unshift(rich);host.trigger('drawAmulet');assert.equal(hp.score,5);assert.equal(gp.score,5);

// Event V12: choose any dead player and revive to HP 1.
cleanTurn(room,hp);gp.hp=0;const reviveEv=takeCard(room,'V12');g.amuDeck.unshift(reviveEv);host.trigger('drawAmulet');assert.equal(g.pendingRoomEffect?.type,'eventReviveAny');host.trigger('resolveRoomEffect',{uid:gp.id});assert.equal(gp.hp,1);

// Office effect still queues after an Event that first needs a reaction resolution.
cleanTurn(room,hp);hp.amu=[];const officeIdx=[0,1,2,3,4,5,6,7,8].find(i=>i!==g.bossIndex);g.rooms[officeIdx]={...T.ROOMS.find(r=>r.effectId==='event_pick_discard')};hp.pos=officeIdx;
const officeProtect=takeCard(room,'S01');hp.amu.push(officeProtect);const officeHelper=takeCard(room,'H02');g.amuDiscard=[officeHelper];const officeBad=takeCard(room,'V02');g.amuDeck.unshift(officeBad);host.trigger('drawAmulet');assert.equal(g.pendingRoomEffect?.type,'negativeReaction');host.trigger('resolveRoomEffect',{uid:'pass'});assert.equal(g.pendingRoomEffect?.type,'officePickDiscard');assert.ok(g.pendingRoomEffect.options.some(o=>o.uid===officeHelper.uid));host.trigger('resolveRoomEffect',{uid:officeHelper.uid});assert.ok(hp.amu.some(c=>c.uid===officeHelper.uid));

console.log('V1.8 EXTENDED REGRESSION: PASS');

console.log('V1.8 STATIC INTEGRATION: PASS');
console.log(JSON.stringify({cards:{amulet:T.AMULETS.length,sacrifice:T.SACRIFICES.length,ghosts:T.GHOSTS.length,characters:T.CHARS.length,rooms:T.ROOMS.length},roomCode:code},null,2));

global.setTimeout=origTimeout;global.setInterval=origInterval;Module._load=origLoad;
