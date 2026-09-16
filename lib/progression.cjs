'use strict';
function levelProgress(total){
  let remaining=Math.max(0,Math.floor(Number(total)||0)),level=1,required=100;
  while(remaining>=required){remaining-=required;level++;required=200+50*(level-1)}
  return {level,current:remaining,required,remaining:required-remaining,total:Math.max(0,Math.floor(Number(total)||0))};
}
function awards(rows,defeat=false){
  return rows.map(p=>{
    const above=rows.filter(x=>x.total>p.total).length,rank=above+1;
    return {...p,rank,xp:50+(defeat?0:20*Math.max(0,rows.length-rank))};
  });
}
function validName(value){return typeof value==='string'&&/^[\p{L}\p{M}\p{N} _.-]{2,18}$/u.test(value.trim())}
module.exports={levelProgress,awards,validName};
