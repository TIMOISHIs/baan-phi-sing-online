/* Presentation only. Original account, room and shop handlers remain attached. */
(()=>{
 const home=document.getElementById('home');if(!home)return;
 const paths={
 house:'M2 11 12 2l10 9M4 10h16M6 10v11h12V10M10 21v-6h4v6M8 8l4-3 4 3M3 21h18',
 people:'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 5 5v3',
 announcement:'M3 10h5l11-6v16L8 14H3v-4ZM8 14l2 7H6l-2-7M22 9v6',
 calendar:'M4 5h16v16H4V5ZM8 2v6M16 2v6M4 10h16M8 14h1M14 14h1M8 17h1M14 17h1',
 bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4M12 2v2',
 mail:'M2 5h20v14H2V5ZM2 6l10 8L22 6',
 exit:'M10 3H3v18h7M8 12h14M16 6l6 6-6 6',
 bag:'M4 8h16l1 13H3L4 8ZM8 8V6a4 4 0 0 1 8 0v2M9 13h6M12 11v6',
 shop:'M2 3h3l3 13h11l3-10H6M9 10h9M12 6v10M8 20h2M17 20h2',
 person:'M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 21v-3a8 8 0 0 1 16 0v3M8 16l4 3 4-3'};
 const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[k]}"/></svg>`;
 const quick=document.createElement('nav');quick.className='rpg-quick';quick.setAttribute('aria-label','เมนูตัวอย่าง');
 for(const [key,label]of [['announcement','ประกาศ'],['calendar','กิจกรรม'],['bell','แจ้งเตือน'],['mail','จดหมาย']]){
  const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label+' (ตัวอย่าง UI)');b.dataset.tip=label+' · ตัวอย่าง';b.innerHTML=icon(key);
  b.onclick=()=>{const p=document.createElement('p');p.textContent='ส่วนนี้เป็นตัวอย่างหน้าตา UI เท่านั้น ยังไม่มีระบบ'+label+'ในแพตช์นี้';openModal(label,p);};quick.append(b);
 }home.append(quick);
 const news=document.createElement('aside');news.className='rpg-news';news.setAttribute('aria-label','ตัวอย่างแบนเนอร์ข่าวสาร');news.innerHTML=icon('house')+'<div><small>ตัวอย่างพื้นที่ประกาศ</small><h2>ข่าวสาร</h2><p>ติดตามเรื่องราวคืนต้องสาป</p></div><span class="rpg-news-tag">UI PREVIEW</span>';home.append(news);
 for(const [kind,label,key]of [['create','สร้างห้อง','house'],['join','เข้าห้องเพื่อน','people']]){const b=home.querySelector('.night-main-button.'+kind);if(b)b.innerHTML=icon(key)+`<span>${label}</span><i aria-hidden="true">›</i>`;}
 for(const [id,key]of [['shopBtn','shop'],['bagBtn','bag'],['charactersBtn','person'],['friendsBtn','people'],['lobbyLogoutBtn','exit']]){
  const b=document.getElementById(id);if(!b)continue;let span=b.querySelector('.pregame-icon');if(!span){span=document.createElement('span');span.className='pregame-icon';b.prepend(span);}span.innerHTML=icon(key);
 }
 const panel=home.querySelector('#accountProfile'),details=panel?.querySelector('details');
 if(panel&&details){panel.title='เปิดรายละเอียดโปรไฟล์';panel.addEventListener('click',e=>{if(!document.body.classList.contains('has-account')||e.target.closest('details,button,a,input,img'))return;details.open=!details.open;});}
 const version=document.querySelector('.bps-brand small');if(version)version.textContent='v1.16.2';
})();
