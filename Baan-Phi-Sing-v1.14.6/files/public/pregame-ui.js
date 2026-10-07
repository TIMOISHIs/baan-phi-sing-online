/* Cosmetic icons; existing buttons keep their original listeners and API behavior. */
(()=>{
 const paths={shop:'M2 3h3l3 13h11l3-10H6M8 20a1 1 0 1 0 2 0 1 1 0 0 0-2 0ZM17 20a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z',bag:'M5 8h14l2 13H3L5 8Zm3 0V6a4 4 0 0 1 8 0v2',person:'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0ZM4 21v-3a8 8 0 0 1 16 0v3',friends:'M3 21v-3a6 6 0 0 1 12 0v3M6 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0ZM17 3a3 3 0 0 1 0 6M18 12a5 5 0 0 1 4 5v4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',book:'M3 3h7l2 2 2-2h7v17h-7l-2 2-2-2H3V3Zm9 2v17',stats:'M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14'};
 const ids={shopBtn:'shop',bagBtn:'bag',charactersBtn:'person',friendsBtn:'friends',roomFriendsBtn:'friends',lobbySoundBtn:'settings',roomSoundBtn:'settings',lobbyRulesBtn:'book',lobbyHelpBtn:'book',lobbyStatsBtn:'stats',roomStatsBtn:'stats'};
 for(const [id,key]of Object.entries(ids)){
  const b=document.getElementById(id);if(!b)continue;
  b.querySelector('span[aria-hidden="true"]')?.remove();
  for(const n of b.childNodes)if(n.nodeType===Node.TEXT_NODE)n.textContent=n.textContent.replace(/[♜♟♧⚙▤🎒]/gu,'').trim();
  const icon=document.createElement('span');icon.className='pregame-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="${paths[key]}"/></svg>`;b.prepend(icon);
 }
 const panel=document.getElementById('friendsDialog');
 const sync=()=>{for(const id of ['friendsBtn','roomFriendsBtn']){const b=document.getElementById(id);b?.setAttribute('aria-controls','friendsDialog');b?.setAttribute('aria-expanded',String(panel.open));}};
 new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['open']});sync();
 const screens=['home','lobby'].map(id=>document.getElementById(id));
 const closeOutside=()=>{if(panel.open&&!screens.some(s=>s.classList.contains('active'))){panel.close();document.body.classList.remove('friends-drawer-open')}};
 for(const s of screens)new MutationObserver(closeOutside).observe(s,{attributes:true,attributeFilter:['class']});
})();

(()=> {
 const slider=document.getElementById('gameFontSize'),out=document.getElementById('gameFontValue');
 function apply(value){const n=Number(value),v=Number.isFinite(n)?Math.max(80,Math.min(140,n)):100;slider.value=v;out.value=v+'%';document.documentElement.style.setProperty('--board-font-scale',v/100);try{localStorage.setItem('bps-board-font-size',v)}catch{}}
 let saved=100;try{saved=localStorage.getItem('bps-board-font-size')||100}catch{}apply(saved);
 slider.addEventListener('input',()=>apply(slider.value));document.getElementById('resetGameFont').onclick=()=>apply(100);
 document.getElementById('lobbyLogoutBtn').onclick=()=>document.getElementById('accountLogout').click();
 const panel=document.getElementById('friendsDialog');
 for(const [screen,target] of [['home','friendsBtn'],['lobby','roomFriendsBtn']]){
  const tab=document.createElement('button');tab.className='friend-edge-toggle';tab.type='button';tab.setAttribute('aria-controls','friendsDialog');document.getElementById(screen).append(tab);
  const sync=()=>{tab.textContent=panel.open?'›':'‹';tab.setAttribute('aria-label',panel.open?'ปิดแถบเพื่อน':'เปิดแถบเพื่อน');tab.setAttribute('aria-expanded',String(panel.open))};
  tab.onclick=()=>document.getElementById(target).click();new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['open']});sync();
 }
})();
