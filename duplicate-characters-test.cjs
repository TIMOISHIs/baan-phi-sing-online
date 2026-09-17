'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let io;
class Socket {constructor(id){this.id=id;this.data={};this.handlers={};this.events=[]}on(k,f){this.handlers[k]=f}emit(k,v){this.events.push([k,v])}join(){}leave(){}send(k,v={}){this.handlers[k](v)}}
class IO {constructor(){io=this;this.handlers={}}on(k,f){this.handlers[k]=f}to(){return{emit(){}}}}
const app={use(){},get(){}};const express=()=>app;express.static=()=>{};
const sandbox={require(name){if(name==='express')return express;if(name==='http')return{createServer:()=>({listen(){}})};if(name==='socket.io')return{Server:IO};if(name==='./lib/accounts.cjs')return{createAccounts:()=>({enabled:false,install(){},installSockets(){}})};return require(name)},console,process:{env:{}},__dirname,Buffer,setInterval:()=>({unref(){}}),setTimeout:()=>({unref(){}}),clearTimeout(){},module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(__dirname+'/server.js','utf8')+'\nmodule.exports={rooms};',sandbox);
const connect=id=>{const s=new Socket(id);io.handlers.connection(s);return s};
const host=connect('host');host.send('createRoom',{name:'Host',sessionToken:'host-token'});
const room=[...sandbox.module.exports.rooms.values()][0];
assert.equal(room.settings.allowDuplicateCharacters,true);
host.send('selectCharacter',{key:'mae-mali'});host.send('confirmCharacter');
for(let i=1;i<6;i++){const s=connect('p'+i);s.send('joinRoom',{code:room.code,name:'Friend'+i,sessionToken:'token-'+i});s.send('selectCharacter',{key:'mae-mali'});s.send('confirmCharacter');s.send('setReady',{ready:true})}
assert.equal(room.players.length,6);assert.ok(room.players.every(p=>p.characterConfirmed&&p.characterKey==='mae-mali'));
host.send('updateSettings',{key:'allowDuplicateCharacters',value:false});assert.equal(room.settings.allowDuplicateCharacters,true,'cannot silently invalidate existing confirmed choices');
host.send('setReady',{ready:true});host.send('startGame');assert.equal(room.phase,'ghostSelect');
const other=connect('other');other.send('createRoom',{name:'Other',sessionToken:'other-token',allowDuplicateCharacters:false});const unique=[...sandbox.module.exports.rooms.values()].find(r=>r!==room);
other.send('selectCharacter',{key:'doctor'});other.send('confirmCharacter');const friend=connect('last');friend.send('joinRoom',{code:unique.code,name:'Last',sessionToken:'last-token'});friend.send('selectCharacter',{key:'doctor'});assert.equal(unique.players[1].characterPreviewKey,null);
friend.send('updateSettings',{key:'allowDuplicateCharacters',value:true});assert.equal(unique.settings.allowDuplicateCharacters,false,'only host changes settings');
const html=fs.readFileSync(__dirname+'/public/index.html','utf8');assert.equal((html.match(/id="startBtn"/g)||[]).length,1);assert.ok(html.indexOf('id="startBtn"')<html.indexOf('id="lobbyPlayers"'));
console.log('Six-player duplicate selection, unique mode, host permissions and top start button passed');
