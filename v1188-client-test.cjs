'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const app=fs.readFileSync('public/app.js','utf8'),audio=fs.readFileSync('public/audio1188.js','utf8');
const dom=new JSDOM('<body></body>'),w=dom.window;
const start=app.indexOf('function offeringPicker('),end=app.indexOf('$("#ritualBtn").onclick',start);
const ctx={document:w.document};vm.createContext(ctx);vm.runInContext(app.slice(start,end),ctx);
let selected=null;const cards=[{uid:'one',name:'ใบหนึ่ง',color:'green',art:'/one.png',boss:2},{uid:'two',name:'ใบสอง',color:'green',art:'/two.png',boss:3},{uid:'three',name:'ใบสาม',color:'black'}];
const grid=ctx.offeringPicker(cards,{need:{green:2,black:1},dice:{green:{label:'≥ 5'}}},{green:1,black:1},c=>selected=c.uid);
assert.equal(grid.querySelectorAll('button').length,3);assert.equal(grid.querySelectorAll('img').length,2);
grid.children[1].click();assert.equal(selected,'two','Select exact card uid, including duplicate colours');grid.children[2].click();assert.equal(selected,'two','Completed colour cannot be selected');
assert.match(ctx.offeringPicker([],{},{}).textContent,/ยังไม่มี/);dom.window.close();
let rejectPlay,stopped=0,mediaSources=0,tones=0,fetches=0;
class Audio {constructor(){this.paused=true}play(){this.paused=false;return new Promise((resolve,reject)=>rejectPlay=reject)}pause(){this.paused=true}removeAttribute(){this.src=''}load(){}}
const bus={};const sound={state:'running',createMediaElementSource(){mediaSources++;return {connect(target){assert.equal(target,bus)}}},decodeAudioData:async()=>({}),createBufferSource:()=>({connect(){return this},start(){},disconnect(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}})};
const c={Audio,console,Map,performance:{now:()=>100},document:{addEventListener(){}},ensureAudio:()=>sound,ambientMaster:bus,sfxMaster:{},ambientEnabled:true,ambientTrack:'darkest_child',masterVolume:1,sfxVolume:1,toast(){},stopAmbient(){stopped++;c.ambientEnabled=false},tone(){tones++},fetch:async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}}};vm.createContext(c);vm.runInContext(audio,c);
(async()=>{
 c.startRecordedTrack('darkest_child');const staleReject=rejectPlay;c.stopRecordedTrack();c.ambientTrack='myst_moor';c.startRecordedTrack('myst_moor');staleReject(Error('aborted'));await Promise.resolve();assert.equal(stopped,0,'Old rejected play cannot stop the new track');assert.equal(mediaSources,1,'One reusable player and source only');
 c.stopRecordedTrack();assert(vm.runInContext('recordedPlayer.paused',c));assert.equal(vm.runInContext('recordedPlayer.src',c),'');
 c.ambientEnabled=true;c.startRecordedTrack('myst_moor');rejectPlay(Error('network'));await Promise.resolve();assert.equal(stopped,1,'Current load failure stops music cleanly');
 c.sfxVolume=0;c.playUISound();assert.equal(tones,0,'SFX mute is respected');assert.equal(fetches,3,'Sounds load once, not on every click');
 c.sfxVolume=1;c.performance.now=()=>300;c.playUISound();assert.equal(tones,1,'SFX works while music is off');
 assert.equal(c.ambientEnabled,false);console.log('V1.18.8 PASS: offering art/exact UID/disabled colours; single audio source; stale playback cancellation; load failure; independent SFX mute');
})().catch(e=>{console.error(e);process.exitCode=1});
