/* Cosmetic icons; existing buttons keep their original listeners and API behavior. */
(()=>{
 const paths={shop:'M3 10h18L19 3H5l-2 7Zm2 0v11h14V10M9 21v-7h6v7',bag:'M5 8h14l2 13H3L5 8Zm3 0V6a4 4 0 0 1 8 0v2',person:'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0ZM4 21v-3a8 8 0 0 1 16 0v3',friends:'M3 21v-3a6 6 0 0 1 12 0v3M6 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0ZM17 3a3 3 0 0 1 0 6M18 12a5 5 0 0 1 4 5v4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',book:'M3 3h7l2 2 2-2h7v17h-7l-2 2-2-2H3V3Zm9 2v17',stats:'M4 21V11h4v10M10 21V3h4v18M16 21V7h4v14'};
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
