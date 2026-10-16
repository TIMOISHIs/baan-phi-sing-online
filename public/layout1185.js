/* Presentation only: move the existing controls without replacing their handlers. */
(()=>{
  const game=document.getElementById('game');
  const shell=game?.querySelector('.bps-board-shell');
  const rail=game?.querySelector('.bps-action-rail');
  const deck=document.getElementById('drawAmu');
  if(!shell||!rail||!deck)return;
  const area=document.createElement('div');
  area.className='bps-board-area';
  shell.before(area);area.append(shell,rail);
  game.classList.add('floating-actions');
  // Read alignment after layout; resizing the board or opening the bag resyncs it.
  let frame=0;
  function align(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      if(!area.getBoundingClientRect().width)return;
      const a=area.getBoundingClientRect(),d=deck.getBoundingClientRect();
      area.style.setProperty('--action-top',Math.max(12,d.top-a.top)+'px');
    });
  }
  const observer=new ResizeObserver(align);
  for(const node of [area,shell,deck])observer.observe(node);
  window.addEventListener('resize',align,{passive:true});
  align();
  const version=game.querySelector('.bps-brand small');if(version)version.textContent='v1.18.6';
})();
