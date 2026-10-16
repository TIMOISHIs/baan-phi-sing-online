/* Approved Lobby / Room artwork; keep original controls and event listeners. */
(()=>{
  const home=document.getElementById('home'),actions=home?.querySelector('.night-main-actions');
  if(!actions)return;
  function artButton(button,file,label){
    button.classList.add('mock-art-button');button.setAttribute('aria-label',label);button.title=label;
    const image=document.createElement('img');image.src='/assets/mockup1165/'+file;image.alt='';image.draggable=false;
    button.replaceChildren(image);
  }
  artButton(actions.querySelector('.create'),'create-room.png','สร้างห้อง');
  artButton(actions.querySelector('.join'),'join-room.png','เข้าห้องเพื่อน');
  artButton(document.getElementById('openCharacterBtn'),'character-select.png','เลือกตัวละคร');
  artButton(document.getElementById('openPlaytestBtn'),'playtest-settings.png','Playtest Settings');
  artButton(document.getElementById('startBtn'),'start-game.png','เริ่มเกม');

  const secondary=document.createElement('div');secondary.className='mock-card-actions';
  const mock=document.createElement('button');mock.type='button';mock.id='cardCollectionMockBtn';
  const all=document.createElement('button');all.type='button';all.id='allAmuletCardsBtn';
  // Honor the supplied filenames: see-all-card opens all cards; -1 is only a mockup.
  artButton(mock,'see-all-card-1.png','สมุดสะสม (ตัวอย่าง)');
  artButton(all,'see-all-card.png','จัดการการ์ด · ดู Amulet ทั้งหมด');
  secondary.append(mock,all);home.append(secondary);
  mock.onclick=()=>openModal('สมุดสะสม','ส่วนนี้เป็นตัวอย่าง ยังไม่เปิดใช้งาน');

  const dialog=document.createElement('dialog');dialog.id='amuletLibrary';dialog.className='amulet-library';
  dialog.setAttribute('aria-labelledby','amuletLibraryTitle');
  dialog.innerHTML='<div class="amulet-library-shell"><header><div><small>AMULET</small><h2 id="amuletLibraryTitle">การ์ด Amulet ทั้งหมด</h2><p>เลือกหมวดหรือแตะการ์ดเพื่อขยายอ่าน</p></div><button type="button" class="library-close" aria-label="ปิดหน้าดูการ์ด">×</button></header><nav aria-label="หมวดการ์ด" class="library-tabs"></nav><div class="library-grid" role="region" aria-label="รายการการ์ด"></div></div>';
  document.body.append(dialog);dialog.querySelector('.library-close').onclick=()=>dialog.close();
  const detail=document.createElement('dialog');detail.className='amulet-reader';detail.setAttribute('aria-label','อ่านการ์ด Amulet');
  detail.innerHTML='<header><b></b><button type="button" class="library-close" aria-label="กลับไปรายการการ์ด">×</button></header><img alt=""><footer><button type="button" data-step="-1">‹ ใบก่อน</button><span></span><button type="button" data-step="1">ใบถัดไป ›</button></footer>';
  document.body.append(detail);detail.querySelector('.library-close').onclick=()=>detail.close();
  let cards=null,visible=[],selected=0,loading=null;
  const groupNames={E:'สวมใส่',S:'คาถาอาคม',H:'ช่วยเหลือ',M:'เรียกสติ',V:'เหตุการณ์'};
  function displayCard(index){
    selected=(index+visible.length)%visible.length;const card=visible[selected],img=detail.querySelector('img');
    img.src=card.art;img.alt=[card.id,card.name,card.desc,card.condition?.label].filter(Boolean).join(' · ');
    detail.querySelector('header b').textContent=card.id+' · '+card.name;
    detail.querySelector('footer span').textContent=`${selected+1} / ${visible.length}`;
  }
  detail.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>displayCard(selected+Number(b.dataset.step)));
  detail.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();displayCard(selected+(e.key==='ArrowLeft'?-1:1));}});
  function draw(group='all'){
    const tabs=dialog.querySelector('.library-tabs'),grid=dialog.querySelector('.library-grid');tabs.replaceChildren();grid.replaceChildren();
    for(const [key,name]of [['all','ทั้งหมด'],...Object.entries(groupNames)]){
      const count=cards.filter(c=>key==='all'||c.id.startsWith(key)).length,b=document.createElement('button');b.type='button';
      b.textContent=`${name} ${count}`;b.setAttribute('aria-pressed',String(key===group));b.onclick=()=>draw(key);tabs.append(b);
    }
    visible=cards.filter(c=>group==='all'||c.id.startsWith(group));
    visible.forEach((card,index)=>{
      const b=document.createElement('button');b.type='button';b.className='library-card';b.setAttribute('aria-label',`ขยาย ${card.id} ${card.name}`);
      const img=document.createElement('img');img.src=card.art;img.alt=card.name;img.loading='lazy';img.decoding='async';img.draggable=false;
      const label=document.createElement('span');label.textContent=card.id+' · '+card.name;b.append(img,label);b.onclick=()=>{displayCard(index);detail.showModal();};grid.append(b);
    });grid.scrollTop=0;
  }
  function status(message,retry=false){const grid=dialog.querySelector('.library-grid');grid.replaceChildren();const p=document.createElement('p');p.className='library-status';p.textContent=message;grid.append(p);if(retry){const b=document.createElement('button');b.textContent='ลองโหลดอีกครั้ง';b.onclick=load;grid.append(b);}}
  async function load(){
    if(cards){draw();return;}if(loading)return loading;
    status('กำลังเปิดการ์ด…');
    loading=(async()=>{try{
      const response=await fetch('/api/cards/amulets');if(!response.ok)throw Error('โหลดการ์ดไม่สำเร็จ');
      const data=await response.json();if(!Array.isArray(data.cards)||!data.cards.length)throw Error('ยังไม่พบข้อมูลการ์ด');
      // Spell faces use versioned PNG filenames; other Amulet faces use WebP.
      if(data.cards.some(c=>!/^\/assets\/amulets\/faces\/[A-Z]\d+(?:-v\d+)?\.(?:webp|png)$/i.test(c.art)))throw Error('ไม่พบไฟล์ภาพการ์ด Amulet บางใบ กรุณาติดตั้งแพตช์อาร์ต Amulet ให้ครบก่อน');
      cards=data.cards;draw();
    }catch(e){status(e.message||'โหลดการ์ดไม่สำเร็จ',true);}finally{loading=null;}})();return loading;
  }
  all.onclick=()=>{dialog.showModal();load();};
  // Close read-only overlays if the player leaves the Lobby by another control.
  new MutationObserver(()=>{if(!home.classList.contains('active')){detail.close();dialog.close();}}).observe(home,{attributes:true,attributeFilter:['class']});
  for(const d of [dialog,detail])d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
  const version=document.querySelector('.bps-brand small');if(version)version.textContent='v1.16.5';
})();
