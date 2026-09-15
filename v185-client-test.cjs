const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('public/app.js','utf8');
class Element{
  constructor(){this.classes=new Set();this.classList={add:(...s)=>s.forEach(x=>this.classes.add(x)),remove:(...s)=>s.forEach(x=>this.classes.delete(x)),contains:s=>this.classes.has(s),toggle:(s,v)=>{if(v??!this.classes.has(s))this.classes.add(s);else this.classes.delete(s)}}}
  children=[];dataset={};style={};isConnected=true;textContent='';innerHTML='';
  appendChild(c){this.children.push(c)}
  querySelector(s){return element(s)}
  querySelectorAll(){return []}
  addEventListener(){}
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
run(source.slice(source.indexOf('let diceTimer='),source.indexOf('function showDiceFx(')));
run(`enqueueCardReveal({zone:'amulet',card:{type:'event',name:'Event test',desc:'Read at your own pace'}})`);
advance(60000);assert.equal(element('#cardRevealFx').classList.contains('hidden'),false);assert.equal(element('#cardRevealClose').classList.contains('hidden'),false);
run(`enqueueCardReveal({zone:'amulet',card:{type:'equip',name:'Next card'}})`);assert.equal(element('#cardRevealName').textContent,'Event test');
element('#cardRevealClose').onclick();advance(280);assert.equal(element('#cardRevealName').textContent,'Next card');advance(2800);advance(280);assert.equal(element('#cardRevealFx').classList.contains('hidden'),true);
run(`enqueueCardReveal({zone:'amulet',card:{type:'event',name:'Reset test'}});resetCardReveals()`);assert.equal(element('#cardRevealFx').classList.contains('hidden'),true);
// Public state may arrive before private hand. The new incoming card must still be selectable.
run(source.slice(source.indexOf('let lastRoomEffectId='),source.indexOf('function renderPendingRitual(')));
const choices=[...ctx.mine.amu,{uid:'new',name:'NEW CARD',desc:'NEW RULE'}];ctx.pending={id:'overflow-test',type:'discardAmuletOverflow',count:1,newUid:'new',playerId:'p1',options:choices};
run('renderPendingRoomEffect(pending)');assert.equal(ctx.modal.children.filter(c=>c.className?.includes('overflow-choice')).length,6);assert.ok(ctx.modal.children.some(c=>c.innerHTML.includes('NEW CARD')&&c.innerHTML.includes('ใบที่เพิ่งจั่ว')));
// Settings clamp values, preserve mute and update actual audio gains.
run(source.slice(source.indexOf('const storedVolume='),source.indexOf('let ambientTrack=')));
run('let ambientVolume=.24,ambientEnabled=true,audioCtx={currentTime:0},masterGain={gain:{setTargetAtTime(v){this.value=v}}},sfxMaster={gain:{setTargetAtTime(v){this.value=v}}},ambientMaster={gain:{setTargetAtTime(v){this.value=v}}};function ensureAudio(){};function updateAmbientUI(){syncSoundSettings()};function toggleAmbient(){}');
run(source.slice(source.indexOf('function setAmbientVolume('),source.indexOf('function setAmbientTrack(')));
run(`setSoundVolume('master',250);setSoundVolume('sfx',0);setSoundVolume('music',175)`);
assert.equal(run('masterGain.gain.value'),2.5);assert.equal(run('sfxMaster.gain.value'),0);assert.equal(run('ambientMaster.gain.value'),1.75);assert.equal(storage.get('bpsSfxVolV185'),'0');assert.equal(element('#masterVolumeValue').textContent,'250%');
run(`setSoundVolume('master',999)`);assert.equal(run('masterGain.gain.value'),3);
console.log('V1.8.5 CLIENT REGRESSION: PASS (manual Event close, queue, stale-hand overflow, audio gain/mute)');
