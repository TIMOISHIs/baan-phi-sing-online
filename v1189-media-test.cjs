'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const js=fs.readFileSync('public/login169.js','utf8'),css=fs.readFileSync('public/login169.css','utf8'),sfx=fs.readFileSync('public/audio1188.js','utf8');
assert.match(js,/login169\/background\.mp4/);assert.match(js,/lobby169\/background\.mp4/);assert.match(js,/video\.loop=true/);assert.match(js,/video\.muted=true/);assert.match(js,/video\.playsInline=true/);
assert.match(js,/addBackground\('loginBackgroundVideo'/);assert.match(js,/addBackground\('lobbyBackgroundVideo'/);
assert.match(js,/()=>!document\.body\.classList\.contains\('has-account'\)/,'original moving Login background remains on Login');
assert.match(js,/()=>document\.body\.classList\.contains\('has-account'\)/,'new moving background is assigned to Lobby');
assert.match(css,/body:not\(\.has-account\) #home\.active>#loginBackgroundVideo/);assert.match(css,/body\.has-account #home\.active>#lobbyBackgroundVideo/);
const login=fs.readFileSync('public/assets/login169/background.mp4'),lobby=fs.readFileSync('public/assets/lobby169/background.mp4');
for(const [p,b] of [['Login',login],['Lobby',lobby]]){assert.equal(b.toString('ascii',4,8),'ftyp',p+' background must be MP4');assert.ok(b.length<5_000_000,p+' background should stay optimized')}
assert.notEqual(crypto.createHash('sha256').update(login).digest('hex'),crypto.createHash('sha256').update(lobby).digest('hex'),'Login and Lobby must keep separate videos');
assert.match(sfx,/if\(document\.querySelector\('#game\.active'\)&&kind==='click'\)return/,'suppress only generic click SFX during play');
console.log('V1.18.9 MEDIA PASS: original Login video retained; new silent looping Lobby video; generic gameplay clicks muted only');
