const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/public/app.js','utf8');
function fn(name){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);assert(a>=0,name);return source.slice(a,b<0?undefined:b)}
class Element{
 constructor(){this.children=[];this.style={};this.dataset={};this.classes=new Set(['hidden']);this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};this.textContent='';}
 set innerHTML(s){this.html=s;this.children=[]}get innerHTML(){return this.html||''}
 appendChild(x){this.children.push(x)}setAttribute(k,v){this[k]=v}querySelector(){return new Element()}focus(){}
}
let now=0,serial=0;const tasks=new Map(),elements=new Map(),sent=[];
function $(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)}
function tick(ms){const end=now+ms;while(true){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].f()}now=end}
const c={console,$,state:{phase:'game',game:{}},mine:{amu:[]},myId:()=> 'p1',isMyTurn:()=>true,
 document:{createElement:()=>new Element(),body:new Element()},socket:{emit:(event,data)=>sent.push({event,data})},
 setTimeout:(f,ms=0)=>{const id=++serial;tasks.set(id,{at:now+ms,f});return id},clearTimeout:id=>tasks.delete(id),clearInterval(){},
 serverClock:{now:()=>100},diceAnimating:false,diceTimer:null,diceAnimTimer:null,diceSettleTimer:null,escapeSuccessTimer:null,escapePresentationActive:false,pendingEscapeFx:null,
 queuedState:null,queuedPrivateState:null,queuedHpEvents:[],rollRequestPending:false,ritualRollSelection:null,
 movingSeats:new Set(),turnTransitionActive:false,eventRevealOpen:false,cardRevealBusy:false,
 hideRollFocus(){},playDiceRollSound(){},playDiceTick(){},render(){},settleDie:(el,v)=>{el.dataset.value=String(v)},buildDie(){},
 flushDiceQueues(){c.diceAnimating=false},ensureAudio(){},closeModal(){c.closed=true},escapeHtml:String,artMarkup:()=>'<img>',
 lastRoomEffectId:null,openModal:(title,box,options)=>c.modal={title,box,options},
 cardRevealQueue:[],cardRevealTimer:null,cardRevealClosing:false,cardRevealPreviousFocus:null,
 renderAmuletFace:()=>'<img>',conditionLabel:()=>'',startCardFlight(){},playCardFlipSound(){},finishCardFlight(){},recoverMandatoryDecision(){},updateRollFocus(){}};
vm.createContext(c);
vm.runInContext(['isBoardMovement','boardMovePending','selectBoardDestination','showEscapeSuccessFx','showDiceFx','showNextCardReveal','closeCardReveal','renderPendingRoomEffect'].map(fn).join('\n'),c);
// Settled faces are visible for 1.5s, followed by success for 1.5s; clicks stay locked.
c.showDiceFx({kind:'escape',a:2,b:4,total:6,at:100});c.showEscapeSuccessFx({});
tick(2100);assert.equal($('#dieA').dataset.value,'2');assert.equal($('#dieB').dataset.value,'4');assert(c.diceAnimating);assert($('#escapeSuccessFx').classes.has('hidden'));
tick(1499);assert(c.diceAnimating);tick(1);assert(!c.diceAnimating);assert($('#diceFx').classes.has('hidden'));assert(!$('#escapeSuccessFx').classes.has('hidden'));assert(c.escapePresentationActive);
tick(1499);assert(c.escapePresentationActive);tick(1);assert(!c.escapePresentationActive);assert($('#escapeSuccessFx').classes.has('hidden'));
// A failed escape still shows the result, without a success overlay or a stuck lock.
c.showDiceFx({kind:'escape',a:1,b:3,total:4,at:100});tick(3600);assert(!c.diceAnimating);assert(!c.escapePresentationActive);
for(const type of ['spellMoveAny','spellMoveDiagonal','eventFreeCurseMove','eventMoveTwo']){
 c.state.game.pendingRoomEffect={id:type,type,playerId:'p1',options:[{index:4}]};
 sent.length=0;c.selectBoardDestination(3);assert.equal(sent.length,0);
 for(const lock of ['diceAnimating','escapePresentationActive','cardRevealBusy','eventRevealOpen','turnTransitionActive']){c[lock]=true;c.selectBoardDestination(4);assert.equal(sent.length,0,lock);c[lock]=false}
 c.state.game.curseResolving=true;c.selectBoardDestination(4);assert.equal(sent.length,0);c.state.game.curseResolving=false;
 c.selectBoardDestination(4);assert.equal(sent.length,1);assert.equal(sent[0].event,'resolveRoomEffect');assert.equal(sent[0].data.uid,4);assert.equal(sent[0].data.pendingId,type);
 c.state.game.pendingRoomEffect.playerId='p2';c.selectBoardDestination(4);assert.equal(sent.length,1,'spectator cannot move');
 c.closed=false;c.renderPendingRoomEffect(c.state.game.pendingRoomEffect);assert(c.closed);assert(!c.modal,'movement never opens a modal');
}
// Two equivalent cards in hand still render one card and exactly two choices.
c.renderPendingRoomEffect({id:'protect',type:'negativeReaction',options:[{uid:'one',art:'one.png'},{uid:'two',art:'two.png'}]});
assert.equal(c.modal.title,'มีการ์ดป้องกัน');assert.equal(c.modal.box.children.length,3);assert.equal(c.modal.box.children[1].textContent,'ต้องการใช้');assert.equal(c.modal.box.children[2].textContent,'ไม่ใช้');c.modal.box.children[1].onclick();assert.equal(sent.at(-1).data.uid,'one');c.modal.box.children[2].onclick();assert.equal(sent.at(-1).data.uid,'pass');
// Used and drawn cards obey separate hold times and the same 500ms exit.
c.state.game.pendingRoomEffect=null;
for(const [reason,hold] of [['play',2000],['spell',2000],['reaction-spell',2000],['draw',2200],['gain',880]]){
 c.cardRevealQueue.push({zone:'amulet',reason,card:{name:'test'}});c.showNextCardReveal();tick(hold-1);assert(!c.cardRevealClosing,reason);tick(1);assert(c.cardRevealClosing,reason);tick(499);assert(c.cardRevealBusy);tick(1);assert(!c.cardRevealBusy);
}
c.cardRevealQueue.push({zone:'amulet',reason:'draw',card:{type:'event'}});c.showNextCardReveal();tick(10000);assert(c.eventRevealOpen);assert(c.cardRevealBusy);c.closeCardReveal();tick(499);assert(c.cardRevealBusy);tick(1);assert(!c.cardRevealBusy);
console.log('V1.18.1 CLIENT PASS: exact dice/success timeline, failed escape, board choices/locks/ownership, single protection card, use/draw/Event durations');
