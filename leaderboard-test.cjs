'use strict';
const assert=require('node:assert/strict');
const {createLeaderboard}=require('./lib/leaderboard.cjs');
(async()=>{
 let calls=0,now=0,fail=false;
 const rows=[{user_id:'a',score:12},{user_id:'a',score:8},{user_id:'b',score:12},{user_id:'c',score:-2}];
 const board=createLeaderboard({clock:()=>now,avatars:[],db:async q=>{if(q.startsWith('profiles'))return [];calls++;if(fail)throw Error('offline');return rows;}});
 let r=await board('c');assert.deepEqual(r.entries.map(x=>[x.rank,x.score]),[[1,12],[1,12],[3,-2]]);assert.equal(r.mine.isMe,true);assert.equal(r.totalPlayers,3);assert.equal('id' in r.mine,false);
 await board('a');assert.equal(calls,1);now=31000;fail=true;await assert.rejects(board('a'),/offline/);fail=false;await board('a');assert.equal(calls,3);
 const many=Array.from({length:1001},(_,i)=>({user_id:'u'+i,score:1001-i}));let pages=0;
 const paged=createLeaderboard({avatars:[],db:async q=>{if(q.startsWith('profiles'))return [];pages++;const offset=Number(q.match(/offset=(\d+)/)[1]);return many.slice(offset,offset+1000);}});
 r=await paged('u1000');assert.equal(pages,2);assert.equal(r.entries.length,50);assert.equal(r.mine.rank,1001);assert.equal(r.totalPlayers,1001);
 const empty=createLeaderboard({avatars:[],db:async()=>[]});assert.deepEqual((await empty('x')).entries,[]);assert.equal((await empty('x')).mine,null);
 console.log('Leaderboard: best score, ties, negative scores, privacy, cache/error recovery, pagination, own rank outside top 50, empty: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
