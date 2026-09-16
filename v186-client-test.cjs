const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('public/app.js','utf8');
class Element{
  constructor(){this.classes=new Set();this.classList={add:(...s)=>s.forEach(x=>this.classes.add(x)),remove:(...s)=>s.forEach(x=>this.classes.delete(x)),contains:s=>this.classes.has(s),toggle:(s,v)=>{if(v??!this.classes.has(s))this.classes.add(s);else this.classes.delete(s)}}}
  children=[];dataset={};style={};isConnected=true;textContent='';innerHTML='';
  appendChild(c){this.children.push(c)}
  querySelector(s){return element(s)}
  querySelectorAll(){return []}
  addEventListener(){}
  replaceChildren(...c){this.children=c}
  showModal(){this.open=true}
  close(){this.open=false}
  setAttribute(k,v){this[k]=v}
  focus(){ctx.document.activeElement=this}
}
const elements=new Map(),element=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s)};
let clock=0,next=1;const timers=new Map(),storage=new Map();
const ctx={console,Math,Number,String,Set,JSON,document:{querySelector:element,createElement:()=>new Element(),activeElement:null},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
 setTimeout:(fn,ms)=>{const id=next++;timers.set(id,{fn,at:clock+ms});return id},clearTimeout:id=>timers.delete(id),
 render(){},recoverMandatoryDecision(){},updateRollFocus(){},hideRollFocus(){},playCardFlipSound(){},artMarkup:()=>'',socket:{emit(){}},closeModal(){},toast(){},openModal:(title,box)=>ctx.modal=box,
 mine:{amu:Array.from({length:5},(_,i)=>({uid:`old-${i}`,name:`old-${i}`}))},myId:()=> 'p1'};
ctx.$=element;vm.createContext(ctx);
const run=s=>vm.runInContext(s,ctx);
function advance(ms){clock+=ms;for(let limit=0;limit<50;limit++){const due=[...timers].find(([,t])=>t.at<=clock);if(!due)return;timers.delete(due[0]);due[1].fn()}throw Error('timer loop')}

run(source.slice(source.indexOf('const DIE_ROTATIONS='),source.indexOf('function showRitualFx(')));
ctx.rollRequestPending=false;ctx.ritualRollSelection=null;ctx.diceAnimating=false;ctx.queuedState=null;ctx.queuedPrivateState=null;ctx.queuedHpEvents=[];
ctx.diceTimer=null;ctx.diceAnimTimer=null;ctx.clearInterval=()=>{};ctx.playDiceRollSound=()=>{};ctx.playDiceTick=()=>{};ctx.flushDiceQueues=()=>ctx.flushed=true;
run('buildDie($("#dieA"))');assert.equal((element('#dieA').innerHTML.match(/class="die-face /g)||[]).length,6);assert.equal((element('#dieA').innerHTML.match(/die-pip on/g)||[]).length,21);
// All six final orientations present the requested face to the viewer.
const normals={1:[0,0,1],2:[1,0,0],3:[0,-1,0],4:[0,1,0],5:[-1,0,0],6:[0,0,-1]};
for(let value=1;value<=6;value++){
 run(`settleDie($("#dieA"),${value})`);const angles=element('#dieA').style.transform.match(/-?\d+/g).map(Number),[rx,ry]=angles.map(x=>x*Math.PI/180),[x,y,z]=normals[value];
 const zAfterY=-Math.sin(ry)*x+Math.cos(ry)*z,zAfterX=Math.sin(rx)*y+Math.cos(rx)*zAfterY;assert.ok(zAfterX>.99);
 assert.equal(element('#dieA').dataset.value,String(value));
}
run('showDiceFx({a:2,b:5,total:7,kind:"move",playerName:"Test"})');advance(2100);assert.equal(element('#dieA').dataset.value,'2');assert.equal(element('#dieB').dataset.value,'5');assert.equal(element('#diceFxTotal').textContent,'รวม 7');assert.equal(ctx.flushed,true);
advance(1600);assert.equal(element('#diceFx').classList.contains('hidden'),true);
// Text-only log details cannot interpret a player's text as markup.
run(source.slice(source.indexOf('function openLogDetail('),source.indexOf('function pawnMarkup(')));
ctx.entry={at:Date.now(),text:'<img src=x onerror=alert(1)>',details:{reason:'Curse',changes:[{player:'A',field:'HP',before:10,after:7}],cards:[]}};run('openLogDetail(entry)');ctx.modal=element('#logDetailBody').children[0];assert.ok(ctx.modal.children.some(x=>x.textContent===ctx.entry.text));assert.ok(ctx.modal.children.every(x=>!x.innerHTML));
// Each new music choice stays on one beat timer; stopping cancels it and disconnects buses.
const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>({gain:param(),frequency:param(),connect(){return this},disconnect(){this.disconnected=true},start(){},stop(){}});
ctx.audio={sampleRate:8000,currentTime:0,createGain:node,createBiquadFilter:node,createOscillator:node,createBufferSource:node,createBuffer:(channels,len)=>({getChannelData:()=>new Float32Array(len)})};ctx.ensureAudio=()=>ctx.audio;ctx.tone=()=>{};
run('let ambientMaster={},ambientEnabled=true,ambientTrack="",trackNodes=[],trackTimers=[];');
run(source.slice(source.indexOf('function clearTrack('),source.indexOf('function makeNoiseSource(')));
run(source.slice(source.indexOf('const LOFI_TRACKS='),source.indexOf('function startSelectedTrack(')));
for(const key of ['lofi_midnight','lofi_lantern','lofi_rain']){
 run(`ambientTrack="${key}";startLofiTrack(ambientTrack)`);for(let i=0;i<100;i++)advance(300);
 assert.equal(run('trackTimers.length'),1);assert.equal(run('trackNodes.length'),2);run('clearTrack()');assert.equal(run('trackTimers.length'),0);assert.equal(run('trackNodes.length'),0);
}
console.log('V1.8.6 CLIENT REGRESSION: PASS (3D faces/server result, log text safety, all 3 music timer lifecycles)');
