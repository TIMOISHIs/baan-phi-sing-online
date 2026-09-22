(function(root){
  function createClock(monotonic=()=>performance.now()){
    let epoch=null,anchor=0,best=Infinity;
    return {observe(now,rtt=0,probe=false){if(!Number.isFinite(now)||now<=0||(!probe&&best!==Infinity)||(probe&&rtt>best))return;if(probe)best=rtt;epoch=now+Math.max(0,rtt)/2;anchor=monotonic()},now(){return epoch===null?null:epoch+monotonic()-anchor},reset(){epoch=null;best=Infinity},countdown(deadline){return Math.max(0,Math.min(5,Math.ceil((deadline-(this.now()??deadline-5000))/1000)))}};
  }
  function createDiceGate(){let match=null,last=0;return {accept(e,now){if(!e||!Number.isInteger(e.seq)||e.seq<1||![e.a,e.b].every(n=>Number.isInteger(n)&&n>=1&&n<=6))return false;if(e.matchId!==match){match=e.matchId;last=0}if(e.seq<=last)return false;last=e.seq;return !e.at||now==null||now-e.at<3700}}}
  const api={createClock,createDiceGate};if(typeof module!=='undefined')module.exports=api;root.GameSync=api;
})(typeof window!=='undefined'?window:globalThis);
