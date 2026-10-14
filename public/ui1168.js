(()=>{
 const q=s=>document.querySelector(s),footer=q('#gameInventory');
 const zone=footer.querySelector('.bps-offering-zone'),label=document.createElement('div');label.className='inventory-label';label.append(zone.querySelector('h3'),zone.querySelector('.hand-title'));zone.prepend(label);
 const hand=footer.querySelector('.amulet-dock-head');hand.classList.add('inventory-label');hand.querySelector('span').textContent='การ์ดในมือ';
 footer.querySelectorAll('.bps-equip-zone>h3,.bps-status-zone>h3').forEach(e=>e.classList.add('inventory-label'));
 for(const [id,name]of [['shopBtn','shop'],['bagBtn','bag'],['charactersBtn','character'],['friendsBtn','friends']]){
  const b=q('#'+id),slot=b.querySelector('.pregame-icon'),img=document.createElement('img');img.src='/assets/ui1168/'+name+'.png';img.alt='';img.className='cozy-menu-icon';img.draggable=false;slot.replaceChildren(img);b.classList.add('cozy-menu-button');
 }
 const d=document.createElement('dialog');d.id='leaderboardDialog';d.setAttribute('aria-labelledby','leaderboardTitle');
 d.innerHTML='<header><div><small>บันทึกแห่งคืนต้องสาป</small><h2 id="leaderboardTitle">อันดับผู้เล่น</h2></div><button class="antique-button" aria-label="ปิดอันดับผู้เล่น">×</button></header><p class="ranking-sub">คะแนนสูงสุดที่เคยทำได้ต่อเกม · คะแนนเท่ากันได้อันดับเดียวกัน</p><div class="ranking-content" aria-live="polite"></div><footer>เฉพาะเกมที่เล่นจบและบันทึกในระบบบัญชี · อัปเดตภายในประมาณ 30 วินาที</footer>';
 document.body.append(d);d.querySelector('button').onclick=()=>d.close();const content=d.querySelector('.ranking-content');let busy=false;
 function row(r){const el=document.createElement('div');el.className='ranking-row'+(r.isMe?' is-me':'');const rank=document.createElement('b'),img=document.createElement('img'),name=document.createElement('span'),score=document.createElement('strong');rank.textContent=r.rank;img.alt='';if(r.avatar)img.src=r.avatar;else img.hidden=true;name.textContent=r.displayName+(r.isMe?' (คุณ)':'');score.textContent=Number(r.score).toLocaleString('th-TH');el.append(rank,img,name,score);return el}
 async function load(){if(busy)return;busy=true;content.textContent='กำลังอ่านคะแนนจากเซิร์ฟเวอร์…';try{
  const res=await fetch('/api/account/leaderboard',{credentials:'same-origin'}),data=await res.json();if(!res.ok)throw Error(data.error||'โหลดอันดับไม่ได้');if(!Array.isArray(data.entries))throw Error('ข้อมูลไม่พร้อม');content.replaceChildren();
  if(data.entries.length){const head=document.createElement('div');head.className='ranking-columns';head.innerHTML='<span>อันดับ</span><span>ผู้เล่น</span><span>คะแนนสูงสุด</span>';const list=document.createElement('div');list.className='ranking-list';data.entries.forEach(r=>list.append(row(r)));content.append(head,list)}else{const p=document.createElement('p');p.textContent='ยังไม่มีคะแนนที่บันทึกไว้ เล่นจบเกมด้วยบัญชีเพื่อเริ่มจัดอันดับ';content.append(p)}
  const own=document.createElement('section');own.className='ranking-own';const title=document.createElement('b');title.textContent='อันดับของคุณ';own.append(title);if(data.mine)own.append(row(data.mine));else{const p=document.createElement('p');p.textContent='ยังไม่มีอันดับ · ต้องมีผลเกมที่บันทึกสำเร็จก่อน';own.append(p)}content.append(own);
 }catch(e){content.textContent=e.message;const retry=document.createElement('button');retry.className='antique-button';retry.textContent='ลองใหม่';retry.onclick=load;content.append(document.createElement('br'),retry)}finally{busy=false}}
 q('#lobbyStatsBtn').textContent='อันดับผู้เล่น';q('#lobbyStatsBtn').onclick=()=>{if(!d.open)d.showModal();load()};q('.bps-brand small').textContent='v1.17.1';
})();
