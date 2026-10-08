/* Authenticated home only. Keep room creation/join forms and their handlers. */
(()=>{
 const q=s=>document.querySelector(s),home=q('#home'),grid=q('#home .join-grid');
 const logo=document.createElement('div');logo.className='night-logo';logo.innerHTML='<img src="/assets/lobby116/logo.png" alt="คืนต้องสาป"><p>หลอนพร้อมกันทุกคืน</p>';home.append(logo);
 const figure=document.createElement('figure');figure.className='night-character';figure.innerHTML='<img alt="ตัวละครโปรไฟล์ของคุณ"><figcaption>ตัวละครโปรไฟล์</figcaption>';home.append(figure);
 const actions=document.createElement('div');actions.className='night-main-actions';home.append(actions);
 const dialogs=[];
 for(const [id,label,kind]of [['createForm','สร้างห้อง','create'],['joinForm','เข้าห้องเพื่อน','join']]){
  const form=q('#'+id),dialog=document.createElement('dialog');dialog.className='night-room-dialog';dialog.setAttribute('aria-label',label);dialog.innerHTML='<button type="button" class="night-close" aria-label="ปิด">×</button>';document.body.append(dialog);dialog.firstElementChild.onclick=()=>dialog.close();
  const b=document.createElement('button');b.type='button';b.className='night-main-button '+kind;b.textContent=label;b.onclick=()=>dialog.showModal();actions.append(b);dialogs.push({dialog,form});
 }
 let signed=null;
 function sync(){const active=document.body.classList.contains('has-account');if(signed!==active){signed=active;for(const {dialog,form}of dialogs){dialog.close();(active?dialog:grid).append(form)}}if(!home.classList.contains('active'))dialogs.forEach(x=>x.dialog.close());const original=q('#accountProfile [data-account-avatar]');if(original?.getAttribute('src'))figure.querySelector('img').src=original.src;}
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});new MutationObserver(sync).observe(home,{attributes:true,attributeFilter:['class']});new MutationObserver(sync).observe(q('#accountProfile [data-account-avatar]'),{attributes:true,attributeFilter:['src']});sync();
 q('#accountProfile>img').style.cursor='pointer';q('#accountProfile>img').onclick=()=>q('#accountEdit').click();
 async function api(url,body){const r=await fetch(url,{credentials:'same-origin',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'เชื่อมต่อไม่ได้');return d;}
 q('#charactersBtn').onclick=async()=>{
  try{
   const [shop,account]=await Promise.all([api('/api/account/shop'),api('/api/account/me')]);if(!account.profile){toast('เข้าสู่ระบบก่อนเลือกโปรไฟล์');return}
   if(!shop.enabled){q('#accountEdit').click();return}
   const box=document.createElement('div');box.className='night-character-grid';
   for(const c of shop.catalog){const owned=shop.owned.includes(c.key),card=document.createElement('article'),img=document.createElement('img'),name=document.createElement('h3'),b=document.createElement('button');img.src=c.art;img.alt=c.name;name.textContent=c.name;b.textContent=!owned?'ยังไม่ปลดล็อก':c.key===account.profile.avatar_key?'ใช้อยู่':'ใช้เป็นโปรไฟล์';b.disabled=!owned||c.key===account.profile.avatar_key;
    b.onclick=async()=>{b.disabled=true;try{await api('/api/account/profile',{displayName:account.profile.display_name,avatarKey:c.key});await window.refreshAccountProfile();closeModal();toast('เปลี่ยนตัวละครโปรไฟล์แล้ว')}catch(e){toast(e.message);b.disabled=false}};
    card.append(img,name,b);box.append(card);
   }openModal('เลือกตัวละครโปรไฟล์',box);
  }catch(e){toast(e.message)}
 };
 document.title='คืนต้องสาป — หลอนพร้อมกันทุกคืน';const v=q('.bps-brand small');if(v)v.textContent='v1.16.0';
})();
