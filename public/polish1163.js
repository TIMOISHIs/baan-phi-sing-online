/* Move existing controls; keep original listeners and live currency text. */
(()=>{
 const home=document.getElementById('home'),quick=home?.querySelector('.rpg-quick');if(!quick)return;
 const paths={settings:'M9 2h6l1 4 4 1 2 5-3 3v4l-5 3-3-3H7l-3-5 2-3V7l3-1V2ZM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z',exit:'M10 3H3v18h7M8 12h14M16 6l6 6-6 6'};
 for(const [id,label,key]of [['lobbySoundBtn','ตั้งค่า','settings'],['lobbyLogoutBtn','ออกจากระบบ','exit']]){
  const button=document.getElementById(id);if(!button)continue;
  button.setAttribute('aria-label',label);button.dataset.tip=label;button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="${paths[key]}"/></svg>`;quick.append(button);
 }
 const v=document.querySelector('.bps-brand small');if(v)v.textContent='v1.16.3';
})();
