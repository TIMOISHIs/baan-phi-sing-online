'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/public/app.js','utf8');
const library=fs.readFileSync(__dirname+'/public/mockup1165.js','utf8');
function fn(name){const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+1);assert(a>=0,name);return source.slice(a,b<0?undefined:b)}
class Element{constructor(){this.children=[];this.style={};this.textContent='';this.className='';this.type='';}append(...x){this.children.push(...x)}click(){this.clicked=true;this.onclick?.()}}
const sent=[],skill=new Element(),elements={skillBtn:skill};
const c={state:{code:'ROOM'},myId:()=> 'p1',isMyTurn:()=>true,myMandatoryDecision:()=>null,
 lastKraiTurnPrompt:null,
 document:{createElement:()=>new Element(),getElementById:id=>elements[id]},socket:{emit:(event,data)=>sent.push({event,data})},
 openModal:(title,box)=>{c.modal={title,box};return true},closeModal(){c.closed=true}};
vm.createContext(c);vm.runInContext(fn('maybePromptKraiRevive'),c);
c.maybePromptKraiRevive({turnSerial:9},{},true);
assert.equal(c.modal.title,'พ่อไกร · เลือกการกระทำ');assert.match(c.modal.box.children[0].textContent,/ใช้สกิลไหม/);
c.modal.box.children[1].click();assert.equal(skill.clicked,true,'Use button delegates to the real Skill button');
c.closed=false;c.modal.box.children[2].click();const ending=sent.pop();assert.equal(ending.event,'endTurn');assert.equal(ending.data,undefined);
c.modal=null;c.maybePromptKraiRevive({turnSerial:9},{},true);assert.equal(c.modal,null,'one prompt per turn');
c.isMyTurn=()=>false;c.maybePromptKraiRevive({turnSerial:10},{},true);assert.equal(c.modal,null,'never prompt another player');
const facePattern=/^\/assets\/amulets\/faces\/[A-Z]\d+(?:-v\d+)?\.(?:webp|png)$/i;
const faces=require('./public/assets/amulets/faces/manifest.json');
for(const face of Object.values(faces))assert(facePattern.test('/assets/amulets/faces/'+face.file),face.file);
assert.match(library,/\(\?:-v\\d\+\)\?\\\.\(\?:webp\|png\)/,'Lobby library accepts versioned PNG spell art');
console.log('V1.18.3 CLIENT PASS: Father Krai prompt actions/deduplication and Amulet face filename validation');
