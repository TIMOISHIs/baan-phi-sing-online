/* v1.18.2 action/status artwork; preserve the live buttons and status values. */
(()=>{
  const root='/assets/ui1182/';
  const actions=[['tradeBtn','01_trade','148x114','แลกเปลี่ยน',1],['ritualBtn','02_ritual','148x114','ทำพิธี',2],['skillBtn','03_skill','148x114','สกิลพิเศษ',3],['endBtn','04_end_turn','148x80','จบเทิร์น',null]];
  for(const [id,file,size,label,cost] of actions){
    const button=document.getElementById(id);if(!button)continue;
    button.classList.add('painted-action');
    button.setAttribute('aria-label',cost===null?label:`${label} · ${cost} ธูป`);
    button.title=button.getAttribute('aria-label');
    for(const state of ['default','hover','pressed','disabled']){
      const src=`${root}actions/${file}_${state}_${size}.png`;
      button.style.setProperty(`--art-${state}`,`url("${src}")`);
      const preload=new Image();preload.src=src;
    }
    button.replaceChildren();
    const art=document.createElement('span');art.className='painted-action-face';art.setAttribute('aria-hidden','true');
    if(cost!==null){const badge=document.createElement('span');badge.className='painted-incense-cost';badge.textContent=`${cost} ธูป`;art.append(badge);}
    button.append(art);
  }
  for(const [id,file] of [['hp','hp'],['score','money'],['sanity','sanity'],['actions','incense'],['supportScore','support']]){
    const value=document.getElementById(id),stat=value?.closest('.hud-stat');if(!stat)continue;
    stat.querySelectorAll('svg,.painted-status-icon').forEach(icon=>icon.remove());
    const image=document.createElement('img');image.src=`${root}status/status-${file}.png`;image.alt='';image.width=32;image.height=32;image.draggable=false;image.className='painted-status-icon';
    stat.prepend(image);stat.classList.add('painted-status');
  }
  // A remote-help skill can be free when the existing game rules grant cat help.
  function updateSkillCost(){
    const b=document.getElementById('skillBtn');if(!b)return;
    const free=typeof state!=='undefined'&&typeof mine!=='undefined'&&typeof myId==='function'&&mine?.char?.skillType==='remote_help'&&state?.game?.catHelp?.playerId===myId();
    const cost=free?'ฟรี':'3 ธูป';b.querySelector('.painted-incense-cost').textContent=cost;b.setAttribute('aria-label',`สกิลพิเศษ · ${cost}`);b.title=b.getAttribute('aria-label');
  }
  const previous=window.renderDashboard;
  if(previous)window.renderDashboard=function(...args){const result=previous.apply(this,args);updateSkillCost();return result;};
  updateSkillCost();
  const version=document.querySelector('.bps-brand small');if(version)version.textContent='v1.18.3';
})();
