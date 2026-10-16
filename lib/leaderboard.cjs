'use strict';
function createLeaderboard({db,avatars,clock=Date.now}){
 let cache=null,expires=0,pending=null;
 async function read(){
  const totals=new Map();let offset=0;
  for(;;){
   const rows=await db('match_results?select=user_id,score&order=score.desc,user_id.asc,match_id.asc&limit=1000&offset='+offset);
   if(!Array.isArray(rows))throw Error('Invalid ranking data');
   for(const r of rows){if(!Number.isSafeInteger(r.score)||typeof r.user_id!=='string')throw Error('Invalid score');const total=(totals.get(r.user_id)||0)+r.score;if(!Number.isSafeInteger(total))throw Error('Invalid cumulative score');totals.set(r.user_id,total)}
   offset+=rows.length;if(rows.length<1000)break;if(offset>=250000)throw Error('Ranking aggregation limit reached');
  }
  let rank=0,previous=null;
  cache=[...totals].map(([id,score])=>({id,score})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).map((r,i)=>{if(r.score!==previous)rank=i+1;previous=r.score;return {...r,rank}});expires=clock()+30000;return cache;
 }
 const getLeaderboard=async userId=>{
  if(!cache||clock()>=expires){if(!pending)pending=read().finally(()=>pending=null);await pending}
  const mine=cache.find(r=>r.id===userId),top=cache.slice(0,50),ids=[...new Set([...top.map(r=>r.id),...(mine?[mine.id]:[])])];
  const profiles=ids.length?await db('profiles?select=id,display_name,avatar_key&id=in.('+ids.map(encodeURIComponent).join(',')+')'):[];
  const view=r=>{const p=profiles.find(p=>p.id===r.id);return {rank:r.rank,score:r.score,displayName:p?.display_name||'ผู้เล่น',avatar:avatars.find(a=>a.key===p?.avatar_key)?.art||null,isMe:r.id===userId}};
  return {entries:top.map(view),mine:mine?view(mine):null,totalPlayers:cache.length,updatedAt:new Date(expires-30000).toISOString()};
 };
 getLeaderboard.invalidate=()=>{cache=null;expires=0};
 return getLeaderboard;
}
module.exports={createLeaderboard};
