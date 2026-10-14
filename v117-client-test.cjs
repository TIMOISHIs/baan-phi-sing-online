const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('public/app.js','utf8'),styles=fs.readFileSync('public/styles.css','utf8'),ui1168=fs.readFileSync('public/ui1168.css','utf8'),server=fs.readFileSync('server.js','utf8');
const makeElement=()=>({style:{},classes:new Set(),classList:{toggle(name,on){on?this.owner.classes.add(name):this.owner.classes.delete(name)}}});
const elements=new Map();function $(id){if(!elements.has(id)){const e=makeElement();e.classList.owner=e;elements.set(id,e)}return elements.get(id)}
const ctx={console,$,g:{},state:{settings:{forcedMovement:true}},mp:{dead:false},mine:{char:{}},isMyTurn:()=>true,myId:()=> 'p1',eventRevealOpen:false,turnTransitionActive:false,diceAnimating:false,movingSeats:new Set()};
vm.createContext(ctx);
const status=source.slice(source.indexOf('function roomEscapeStatus('),source.indexOf('let lastPendingRitualId='));
vm.runInContext(status,ctx);
ctx.g={escapeRule:{label:'สะสมเลขคู่'},roomEscapeProgress:{count:1,required:2,faces:[6]}};
assert.ok(vm.runInContext('roomEscapeStatus(g)',ctx).includes('1/2'));assert.ok(vm.runInContext('roomEscapeStatus(g)',ctx).includes('6'));
ctx.g={escapeRule:{label:'ทอย 5-'}};assert.equal(vm.runInContext('roomEscapeStatus(g)',ctx),'ทอย 5-');
const controls=source.slice(source.indexOf('const pendingMine='),source.indexOf('$("#escapeBtn").style.display'));
function renderControls(){vm.runInContext('{'+controls+'}',ctx)}
ctx.g={moveOptional:true,movementPreview:{legal:[]}};renderControls();assert.equal($('#stayBtn').style.display,'inline-block');assert.equal($('#stayBtn').disabled,false);assert.ok($('#stayBtn').classes.has('stay-attention'));
ctx.isMyTurn=()=>false;renderControls();assert.equal($('#stayBtn').disabled,true);assert.ok(!$('#stayBtn').classes.has('stay-attention'));
ctx.isMyTurn=()=>true;ctx.g={sanityDecision:true,movementPreview:{legal:[]}};renderControls();assert.ok($('#stayBtn').classes.has('stay-attention'));
ctx.g.movementPreview.legal=[3];renderControls();assert.equal($('#stayBtn').style.display,'none');assert.ok(!$('#stayBtn').classes.has('stay-attention'));
ctx.state.settings.forcedMovement=false;renderControls();assert.ok($('#stayBtn').classes.has('stay-attention'));
for(const lock of ['diceAnimating','eventRevealOpen','turnTransitionActive']){ctx[lock]=true;renderControls();assert.ok(!$('#stayBtn').classes.has('stay-attention'));ctx[lock]=false}
ctx.g.rescue={playerId:'p1'};renderControls();assert.equal($('#stayBtn').disabled,true);assert.ok(!$('#stayBtn').classes.has('stay-attention'));
assert.match(styles,/@keyframes stay-action-glow/);assert.match(styles,/@media\(prefers-reduced-motion:reduce\)\{#stayBtn\.stay-attention/);
assert.match(source,/\$\("#rollBtn"\)\.disabled=!!g\.rescue/);
assert.match(ui1168,/translateY\(-12px\).*scale\(1\.04\)/);assert.doesNotMatch(ui1168,/translateY\(calc\(-100%/);
assert.match(source,/e\?\.zone==="amulet"&&e\?\.reason==="draw"&&e\?\.playerId!==myId\(\)&&e\?\.card\?\.type!=="event"/);
assert.match(source,/setTimeout\(\(\)=>\{box\.classList\.add\("side-card-out"\).*\},1250\)/s);
assert.match(source,/e\.zone==="amulet"&&e\.reason==="gain"\?880/);assert.match(source,/closeCardReveal\(e\.reason==="gain"\?320:720\)/);
assert.match(source,/if\(diceAnimating\).*showEscapeSuccessFx\(e\),120/s);assert.match(server,/emit\("escapeSuccessFx",\{playerId:p\.id,playerName:p\.name,duration:1500\}\)/);
assert.match(styles,/\.side-card-reveal\{[^}]*pointer-events:none/);assert.match(styles,/\.escape-success-fx\{[^}]*pointer-events:auto/);
console.log('V1.17.1 CLIENT PASS: stable hover, staged escape success, non-blocking remote draws, rapid consecutive draws and 3-card opening pace');
