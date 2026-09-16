const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('public/app.js','utf8'),events=[];
const ctx={window:{matchMedia:()=>({matches:false})},state:{phase:'game'},myId:()=> 'me',enqueueCardReveal:e=>{events.push(e);vm.runInContext('rememberReveal(testEvent)',Object.assign(ctx,{testEvent:e}))},document:{querySelectorAll:()=>[]},console};vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('const movingSeats='),src.indexOf('let diceTimer=')),ctx);
const run=s=>vm.runInContext(s,ctx);
// Health is based on required ritual slots, with excess/wrong colors ignored.
ctx.g={ghost:{need:{green:2,blue:1}},bossDone:{green:1,blue:0,black:9}};assert.equal(run('ghostHealth(g).percent'),67);
ctx.g.bossDone={green:99,blue:1};assert.equal(run('ghostHealth(g).remaining'),0);ctx.g.ghost.need={};assert.equal(run('ghostHealth(g).percent'),0);
// A revealed draw and private snapshot must not produce two reveals. Recovered cards do.
ctx.testEvent={card:{uid:'drawn',type:'equip'},reason:'draw',playerId:'me'};run('rememberReveal(testEvent)');
ctx.before={amu:[{uid:'old'}],sac:[]};ctx.after={amu:[{uid:'old'},{uid:'drawn'},{uid:'recovered'}],sac:[{uid:'offering'}]};run('queueGainedCards(before,after)');assert.deepEqual(events.map(e=>e.card.uid),['recovered','offering']);
run('queueGainedCards(before,after)');assert.equal(events.length,2);
let cancelled=0,removed=0;ctx.motion={cancel(){cancelled++},remove(){removed++}};run('motionObjects.add(motion);movingSeats.add(1);resetPresentationMotion()');assert.equal(cancelled,1);assert.equal(removed,1);assert.equal(run('pendingHandCards.size+movingSeats.size+seenRevealCards.size'),0);
// Honor reduced-motion preference and tolerate offscreen/unmounted layout.
ctx.window.matchMedia=()=>({matches:true});assert.equal(run('reducedMotion()'),true);assert.equal(run('centerOf(null)'),null);
console.log('V1.9.0 CLIENT: PASS (health math, draw deduplication, selection gains, cancellation, reduced motion)');
