/* v1.15: presentation helpers. Rules and authoritative movement stay on the server. */
(()=>{
 const q=s=>document.querySelector(s);
 const rail=q('.bps-action-rail');
 q('.bps-table').append(rail);
 q('#rollBtn').hidden=true;
 const notice=document.createElement('div');
 notice.id='myTurnNotice';notice.className='my-turn-notice hidden';
 notice.setAttribute('role','status');notice.innerHTML='<b>ถึงเทิร์นคุณแล้ว</b><small>ขยับเมาส์ แตะหน้าจอ หรือกดแป้นพิมพ์เพื่อเล่น</small>';
 document.body.append(notice);
 let seenTurn=null,seenMatch=null,acknowledged=false;
 function acknowledge(){if(!notice.classList.contains('hidden')){acknowledged=true;notice.classList.add('hidden')}}
 for(const event of ['pointermove','pointerdown','keydown'])document.addEventListener(event,acknowledge,{passive:true});
 const previous=window.renderDashboard;
 window.renderDashboard=()=>{
  previous?.();
  if(state?.phase!=='game'){notice.classList.add('hidden');return}
  const g=state.game,match=g.matchId||g.startedAt||state.code;
  if(seenMatch!==match){
   seenMatch=match;seenTurn=null;
   q('#game').classList.add('bag-open');
   const toggle=q('.bps-bag-toggle');toggle.setAttribute('aria-expanded','true');toggle.querySelector('b').textContent='⌄';
  }
  const key=String(match)+':'+g.turnSerial+':'+g.turnStartedAt+':'+activePlayer()?.id;
  if(seenTurn!==key){seenTurn=key;acknowledged=false}
  const mineNow=isMyTurn();
  notice.classList.toggle('hidden',!mineNow||acknowledged||document.hidden||turnTransitionActive||eventRevealOpen);
 };
 new MutationObserver(()=>{if(!q('#game').classList.contains('active'))notice.classList.add('hidden')}).observe(q('#game'),{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(state?.phase==='game')window.renderDashboard()});
})();
