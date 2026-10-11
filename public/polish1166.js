/* Appearance only: keep the original buttons, tooltips, and listeners. */
(()=>{
 const names=['announcement','events','notifications','mail','settings','logout'];
 document.querySelectorAll('#home>.night-topbar .rpg-quick,#lobby .night-topbar .rpg-quick').forEach(nav=>{
  [...nav.children].forEach((button,i)=>{
   if(!names[i])return;
   const image=document.createElement('img');image.src='/assets/polish1166/icons/'+names[i]+'.png';
   image.className='painted-hud-icon';image.alt='';image.draggable=false;image.setAttribute('aria-hidden','true');
   // An unavailable image leaves the old SVG usable instead of an empty control.
   image.addEventListener('load',()=>button.classList.add('has-painted-icon'),{once:true});
   button.append(image);
  });
 });
 const pause=()=>document.body.classList.toggle('lobby-animation-paused',document.hidden);
 document.addEventListener('visibilitychange',pause);pause();
 const version=document.querySelector('.bps-brand small');if(version)version.textContent='v1.16.6';
})();
