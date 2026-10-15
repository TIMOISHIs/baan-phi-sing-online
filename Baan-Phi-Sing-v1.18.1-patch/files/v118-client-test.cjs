const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'public/app.js'),'utf8');
function fn(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);assert.ok(start>=0);return source.slice(start,end<0?undefined:end);}
class Element{constructor(){this.children=[];this.innerHTML='';this.textContent='';}appendChild(c){this.children.push(c);}set innerHTML(s){this._html=s;this.children=[]}get innerHTML(){return this._html}}
const sent=[],ctx={state:{game:{rolled:false,moved:false,actions:3,rooms:[{type:'ปลอดภัย'}]}},mine:{char:{},amu:[]},mePublic:()=>({pos:0}),isMyTurn:()=>true,eventRevealOpen:false,turnTransitionActive:false,diceAnimating:false,movingSeats:new Set(),lastRoomEffectId:null,
 document:{createElement:()=>new Element()},socket:{emit:(event,data)=>sent.push({event,data})},ensureAudio(){},closeModal(){},artMarkup:()=>'',escapeHtml:s=>String(s),conditionLabel:()=>'',openModal:(title,box,options)=>ctx.modal={title,box,options}};
vm.createContext(ctx);vm.runInContext(fn('isBoardMovement')+'\n'+fn('canUseAmulet')+'\n'+fn('renderPendingRoomEffect'),ctx);
const spell=spellEffect=>({type:'spell',spellEffect});
for(const effect of ['go_anywhere','diagonal_move']){
 ctx.state.game.rolled=false;assert.equal(ctx.canUseAmulet(spell(effect)),false);ctx.state.game.rolled=true;assert.equal(ctx.canUseAmulet(spell(effect)),true);
 ctx.state.game.moved=true;assert.equal(ctx.canUseAmulet(spell(effect)),true);
 for(const type of ['กับดัก','คำสาป']){ctx.state.game.rooms[0].type=type;assert.equal(ctx.canUseAmulet(spell(effect)),false);}
 ctx.state.game.rooms[0].type='ปลอดภัย';ctx.state.game.actions=0;assert.equal(ctx.canUseAmulet(spell(effect)),false);ctx.state.game.actions=3;
}
for(const [effect,type]of [['escape_trap','กับดัก'],['escape_curse','คำสาป']]){
 ctx.state.game.rolled=false;ctx.state.game.rooms[0].type=type;assert.equal(ctx.canUseAmulet(spell(effect)),true);
 ctx.state.game.rooms[0].type='ปลอดภัย';assert.equal(ctx.canUseAmulet(spell(effect)),false);
}
for(const effect of ['protect_event','protect_curse'])assert.equal(ctx.canUseAmulet(spell(effect)),false);
ctx.isMyTurn=()=>false;ctx.state.game.actions=0;
ctx.renderPendingRoomEffect({id:'reaction-1',type:'negativeReaction',reason:'Curse',options:[{uid:'s04',name:'อยู่ยงคงกระพัน',effect:'ป้องกัน Curse'}]});
assert.equal(ctx.modal.title,'มีการ์ดป้องกัน');assert.ok(ctx.modal.options.mandatory);
const button=ctx.modal.box.children.find(x=>x.className==='primary protection-use');assert.equal(button.textContent,'ต้องการใช้');button.onclick();
assert.deepEqual(JSON.parse(JSON.stringify(sent.pop())),{event:'resolveRoomEffect',data:{uid:'s04',pendingId:'reaction-1'}});
ctx.modal.box.children.at(-1).onclick();assert.equal(sent.at(-1).data.uid,'pass');
assert.ok(source.includes('if(g.pendingRitual&&!g.pendingRoomEffect&&!g.protectionPending)'));
const manifest=require('./public/assets/amulets/faces/manifest.json'),crypto=require('crypto');
for(let n=1;n<=9;n++){const id='S0'+n,m=manifest[id],bytes=fs.readFileSync(path.join(__dirname,'public/assets/amulets/faces',m.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),m.sourceSha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
assert.ok(manifest.S04.source.endsWith('S03-1.png'));
console.log('V1.18 CLIENT/ART PASS: availability, free out-of-turn reactions, scoped replies, all 9 original PNG hashes and S04 mapping');
